import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getJSON } from "@/lib/authFetch";
import PageHeading from "@/components/PageHeading";

export default function OwnerDashboard(){
  const [location, setLocation] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  const [areas,setAreas]=useState<string[]>([]); const [mine,setMine]=useState<string[]>([]);
  const [crs,setCrs]=useState<any[]>([]);

  useEffect(()=>{ (async()=>{
    try{
      const al = await getJSON(`/api/areas/list?project_id=${projectId}`); setAreas(al.items||[]);
      const ad = await getJSON(`/api/areas/admins?project_id=${projectId}`);
      const map:Record<string,string[]> = {}; (ad.items||[]).forEach((r:any)=>{ map[r.area]=[...(map[r.area]||[]), r.user_id] });
      const me = (await getJSON(`/api/me`)).user_id || ""; // if you have /api/me; otherwise use dev header
      setMine(Object.keys(map).filter(a=> (map[a]||[]).includes(me)));
      const s = await getJSON(`/api/changes/list_advanced?project_id=${projectId}&sort=sla`);
      setCrs((s.items||[]).filter((x:any)=> mine.includes(x.area||"")));
    }catch{}
  })(); },[projectId]);

  return (
    <div>
      <PageHeading title="My Areas" crumbs={[{label:"Team"},{label:"Owner Dashboard"}]} />
      <div className="grid md:grid-cols-3 gap-3">
        {mine.map(a=>(
          <button key={a} className="brand-card p-3 text-left bg-white/5" onClick={()=>setLocation(`/projects/${projectId}/workstreams/${encodeURIComponent(a)}`)} data-testid={`area-card-${a}`}>
            <div className="text-sm font-medium" data-testid={`area-name-${a}`}>{a}</div>
            <div className="text-xs text-muted-foreground">Click to manage</div>
          </button>
        ))}
        {!mine.length && <div className="brand-card p-3 text-xs text-muted-foreground" data-testid="text-no-areas">No owned areas.</div>}
      </div>
      <div className="brand-card p-3 mt-3">
        <div className="text-sm font-medium mb-1">CRs in my areas (SLA order)</div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr><th className="text-left p-1">Title</th><th className="text-left p-1">Area</th><th className="text-left p-1">Assignee</th><th className="text-left p-1">Due</th></tr></thead>
            <tbody>
              {crs.map((r:any)=> <tr key={r.id} data-testid={`cr-row-${r.id}`}><td className="p-1" data-testid={`cr-title-${r.id}`}>{r.title}</td><td className="p-1" data-testid={`cr-area-${r.id}`}>{r.area}</td><td className="p-1" data-testid={`cr-assignee-${r.id}`}>{r.assignee||"—"}</td><td className="p-1" data-testid={`cr-due-${r.id}`}>{r.due_date||"—"}</td></tr>)}
              {!crs.length && <tr><td colSpan={4} className="p-2 text-muted-foreground" data-testid="text-no-crs">Nothing pending.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}