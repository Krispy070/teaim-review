import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { getProjectId, setProjectId as saveProjectId } from "@/lib/project";

type Proj = { id:string; code?:string; name?:string };

export default function ProjectSwitcher(){
  const [location, setLocation] = useLocation();
  const projectId = getProjectId(); // Use utility to get current project
  const [items,setItems]=useState<Proj[]>([]);
  const [open,setOpen]=useState(false);

  useEffect(()=>{ (async()=>{
    try{ const d = await getJSON(`/api/projects/mine`); setItems(d.items||[]); }catch{ setItems([]); }
  })(); },[]);

  function pick(id:string){
    saveProjectId(id); // Use utility to save project
    // Stay on the same page but swap the project in the URL if possible:
    const path = location.replace(/\/projects\/[0-9a-f\-]{36}/i, `/projects/${id}`);
    if (path !== location) {
      setLocation(path);
    } else {
      setLocation(`/projects/${id}/dashboard`);
    }
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