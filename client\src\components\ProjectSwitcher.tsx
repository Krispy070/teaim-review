import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getJSON } from "@/lib/authFetch";

type Proj = { id:string; code?:string; name?:string };

export default function ProjectSwitcher(){
  const { projectId } = useParams();
  const [items,setItems]=useState<Proj[]>([]);
  const [open,setOpen]=useState(false);
  const navigate = useNavigate();

  useEffect(()=>{ (async()=>{
    try{ const d = await getJSON(`/api/projects/list`); setItems(d.items||[]); }catch{ setItems([]); }
  })(); },[]);

  function pick(id:string){
    try { localStorage.setItem("kap.projectId", id); } catch {}
    // go to dashboard for consistency
    navigate(`/projects/${id}/dashboard`);
    setOpen(false);
  }

  const cur = items.find(p=>p.id===projectId);
  const label = cur?.code || cur?.name || (projectId?.slice(0,8) || "Pick project");

  return (
    <div className="relative">
      <button className="brand-btn text-xs" onClick={()=>setOpen(o=>!o)} title="Switch Project">
        {label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[260px] max-h-[260px] overflow-auto border rounded bg-white dark:bg-neutral-900 z-[97]">
          {(items||[]).map(p=>(
            <button key={p.id} onClick={()=>pick(p.id)} className="w-full text-left px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5">
              <div className="text-sm font-medium">{p.code || p.name || p.id.slice(0,8)}</div>
              <div className="text-xs text-muted-foreground">{p.id}</div>
            </button>
          ))}
          {!items.length && <div className="p-2 text-xs text-muted-foreground">No projects found.</div>}
        </div>
      )}
    </div>
  );
}