type Toast = { id:string; type:"info"|"success"|"warn"|"error"; message:string; timeout?:number };
let subs: ((t:Toast[])=>void)[] = [];
let buf: Toast[] = [];

function emit(){ subs.forEach(fn=>fn(buf)); }
export function subscribeToasts(fn:(t:Toast[])=>void){ subs.push(fn); fn(buf); return ()=>{ subs = subs.filter(x=>x!==fn); }; }
export function pushToast(t: Omit<Toast,"id">){ const id = Math.random().toString(36).slice(2); buf = [...buf, { id, ...t }]; emit(); if (t.timeout!==0){ setTimeout(()=> dismissToast(id), t.timeout ?? 4000); } }
export function dismissToast(id:string){ buf = buf.filter(x=>x.id!==id); emit(); }
