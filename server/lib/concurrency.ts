type Waiter = { resolve: (value: ()=>void)=>void };

const counters = new Map<string, number>();
const queues   = new Map<string, Waiter[]>();

function getInflight(key:string){ return counters.get(key) || 0; }
function setInflight(key:string, n:number){ counters.set(key, n); }

export async function acquire(key:string, limit:number): Promise<()=>void> {
  limit = Math.max(1, limit);
  if (getInflight(key) < limit) {
    setInflight(key, getInflight(key)+1);
    return () => release(key);
  }
  return new Promise<()=>void>((resolve)=>{
    const q = queues.get(key) || [];
    q.push({ resolve });
    queues.set(key, q);
  }).then((releaseFn)=> {
    setInflight(key, getInflight(key)+1);
    return releaseFn;
  });
}

function release(key:string){
  const n = Math.max(0, getInflight(key) - 1);
  setInflight(key, n);
  const q = queues.get(key) || [];
  const w = q.shift();
  if (w) {
    queues.set(key, q);
    setTimeout(()=> w.resolve(()=> release(key)), 0);
  }
}
