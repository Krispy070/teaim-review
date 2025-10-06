import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getJSON, postJSON } from "@/lib/authFetch";
import PageHeading from "@/components/PageHeading";

export default function AdminAreaOwners(){
  const { projectId } = useParams();
  const [areas,setAreas]=useState<string[]>([]);
  const [members,setMembers]=useState<{user_id:string,email?:string}[]>([]);
  const [admins,setAdmins]=useState<Record<string,string[]>>({});

  useEffect(()=>{ (async()=>{
    try{ const a = await getJSON(`/api/areas/list?project_id=${projectId}`); setAreas(a.items||[]); }catch{}
    try{ const m = await getJSON(`/api/members/all?project_id=${projectId}`); setMembers((m.items||[]).map((x:any)=>({user_id:x.user_id, email:x.email})) ); }catch{}
    try{ const ad = await getJSON(`/api/areas/admins?project_id=${projectId}`); 
      const map:Record<string,string[]> = {}; (ad.items||[]).forEach((r:any)=>{ map[r.area]=[...(map[r.area]||[]), r.user_id]; }); setAdmins(map);
    }catch{}
  })(); },[projectId]);

  function isAdmin(area:string, uid:string){ return !!(admins[area]||[]).includes(uid); }
  async function toggle(area:string, uid:string){
    const on = isAdmin(area,uid);
    const url = on? `/api/areas/admins/remove?project_id=${projectId}&area=${encodeURIComponent(area)}&user_id=${encodeURIComponent(uid)}`
                  : `/api/areas/admins/add?project_id=${projectId}`;
    const body = on? {} : { area, user_id: uid };
    await fetch(url, { method:"POST", credentials:"include", headers:{'Content-Type':'application/json'}, body: on? null : JSON.stringify(body)});
    setAdmins(a=> ({...a, [area]: on? (a[area]||[]).filter(x=>x!==uid) : Array.from(new Set([...(a[area]||[]), uid])) }));
  }

  return (
    <div>
      <PageHeading title="Area Owners" crumbs={[{label:"Team"},{label:"Area Owners"}]} />
      <div className="space-y-3">
        {areas.map(a=>(
          <div key={a} className="brand-card p-3">
            <div className="text-sm font-medium mb-1">{a}</div>
            <div className="grid md:grid-cols-4 gap-2">
              {members.map(m=>(
                <label key={m.user_id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={isAdmin(a, m.user_id)} onChange={()=>toggle(a,m.user_id)} data-testid={`checkbox-${a}-${m.user_id}`} />
                  <span>{m.email || m.user_id}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {!areas.length && <div className="text-muted-foreground">No areas found.</div>}
      </div>
    </div>
  );
}