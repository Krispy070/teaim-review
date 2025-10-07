import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { authFetch } from "@/lib/authFetch";

export default function DueSoonChip({ days=3 }:{ days?: number }){
  const params = useParams<{projectId: string}>();
  const projectId = params.projectId;
  const [n,setN]=useState(0);
  const [items,setItems]=useState<any[]>([]);
  const [open,setOpen]=useState(false);

  async function load(){
    try{
      const response = await authFetch(`/api/actions/soon?project_id=${projectId}&days=${days}`);
      const d = await response.json();
      const arr = d.items || [];
      setN(arr.length); 
      setItems(arr.slice(0,5));
    }catch{ 
      setN(0); 
      setItems([]); 
    }
  }
  useEffect(()=>{ 
    if (projectId) {
      load(); 
      const t=setInterval(load,60000); 
      return ()=>clearInterval(t); 
    }
  },[projectId,days]);

  if (!n) return null;
  return (
    <div className="relative">
      <button 
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-400 text-black text-xs"
        data-testid="chip-due-soon"
        onClick={()=>setOpen(o=>!o)}>
        Due soon: <b>{n}</b>
      </button>
      {open && (
        <div className="absolute z-[70] mt-1 w-[300px] bg-white border rounded shadow p-2">
          {items.map((a:any,i:number)=>(
            <div key={i} className="text-xs border-b last:border-0 py-1">
              <div className="font-medium truncate">{a.title}</div>
              <div className="text-muted-foreground">Owner: {a.owner||"—"} • Due: {a.due_date}</div>
            </div>
          ))}
          <div className="pt-1 text-right">
            <a className="text-xs underline" href={`/projects/${projectId}/actions/kanban`}>Open Kanban</a>
          </div>
        </div>
      )}
    </div>
  );
}