import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJSON } from "@/lib/authFetch";
import { usePersistProjectId } from "@/lib/projectCtx";

type Proj = { id:string; code?:string; name?:string };

export default function ProjectSelect(){
  const [list,setList]=useState<Proj[]>([]);
  const [loading,setLoading]=useState(true);
  const navigate = useNavigate();

  useEffect(()=>{ (async()=>{
    setLoading(true);
    try{
      // If you have a projects list endpoint, great; otherwise show a helpful message for dev
      const d = await getJSON(`/api/projects/list`); // replace with your actual endpoint if different
      setList(d.items || []);
    }catch{
      setList([]);
    }
    setLoading(false);
  })(); },[]);

  function pick(p:Proj){
    // persist & go to dashboard
    try { localStorage.setItem("kap.projectId", p.id); } catch {}
    navigate(`/projects/${p.id}/dashboard`, { replace:true });
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-3">
      <h1 className="text-xl font-semibold">Select a Project</h1>
      {loading && <div>Loading…</div>}
      {!loading && list.length===0 && (
        <div className="text-sm text-muted-foreground">
          No projects found. In dev, create one in the admin area or seed a demo project.
        </div>
      )}
      <div className="space-y-2">
        {list.map(p=>(
          <button key={p.id} className="brand-btn w-full text-left" onClick={()=>pick(p)}>
            <div className="text-sm font-medium">{p.code || p.name || p.id.slice(0,8)}</div>
            <div className="text-xs text-muted-foreground">{p.id}</div>
          </button>
        ))}
      </div>
    </div>
  );
}