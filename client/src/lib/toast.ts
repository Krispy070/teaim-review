type Toast = { id: string; type: "info"|"error"|"success"|"warn"; message: string; timeout?: number };
const listeners = new Set<(t:Toast)=>void>();
let list: Toast[] = [];
const subs = new Set<(l:Toast[])=>void>();

export function pushToast(t: Omit<Toast,"id">) {
  const toast: Toast = { id: crypto.randomUUID(), ...t, timeout: t.timeout ?? 4500 };
  listeners.forEach(l => l(toast));
  list.push(toast);
  subs.forEach(s=>s([...list]));
  // Only schedule auto-dismiss if timeout > 0 (timeout: 0 means persistent)
  if (toast.timeout > 0) {
    setTimeout(()=>{ list=list.filter(x=>x.id!==toast.id); subs.forEach(s=>s([...list])); }, toast.timeout);
  }
}

export function onToast(l:(t:Toast)=>void){ listeners.add(l); return ()=>listeners.delete(l); }
export function subscribeToasts(cb:(list:Toast[])=>void){ subs.add(cb); cb([...list]); return ()=>subs.delete(cb); }
export function dismissToast(id:string){ list=list.filter(x=>x.id!==id); subs.forEach(s=>s([...list])); }
