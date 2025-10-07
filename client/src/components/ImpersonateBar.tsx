import { useEffect, useState } from "react";

export default function ImpersonateBar(){
  const [enabled,setEnabled] = useState<boolean>(false);
  const [user,setUser] = useState(""); const [org,setOrg]=useState(""); const [role,setRole]=useState("member");

  useEffect(()=>{ try {
    const o = JSON.parse(localStorage.getItem("kap.devAuth") || "null");
    if (o) { setEnabled(!!o.dev); setUser(o.user||""); setOrg(o.org||""); setRole(o.role||"member"); }
  } catch {} },[]);

  function save(){
    localStorage.setItem("kap.devAuth", JSON.stringify({ dev:true, user, org, role }));
    location.reload();
  }
  function clear(){
    localStorage.removeItem("kap.devAuth"); location.reload();
  }

  if (import.meta.env.VITE_DEV_AUTH !== "1") return null;

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[80] bg-black text-white text-xs px-3 py-2 flex items-center gap-2" data-testid="impersonate-bar">
      <span className="opacity-70">Impersonate (dev)</span>
      <input className="bg-white text-black px-1 py-0.5 rounded" placeholder="user-uuid" value={user} onChange={e=>setUser(e.target.value)} data-testid="input-user" />
      <input className="bg-white text-black px-1 py-0.5 rounded" placeholder="org-uuid" value={org} onChange={e=>setOrg(e.target.value)} data-testid="input-org" />
      <select className="bg-white text-black px-1 py-0.5 rounded" value={role} onChange={e=>setRole(e.target.value)} data-testid="select-role">
        {["owner","admin","pm","lead","member","guest"].map(r=><option key={r} value={r}>{r}</option>)}
      </select>
      <button className="px-2 py-1 bg-white text-black rounded hover:bg-gray-200" onClick={save} data-testid="button-apply">Apply</button>
      {enabled && <button className="px-2 py-1 border rounded hover:bg-gray-800" onClick={clear} data-testid="button-clear">Clear</button>}
    </div>
  );
}