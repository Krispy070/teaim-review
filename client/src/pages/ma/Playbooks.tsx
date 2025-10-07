import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId, ensureProjectPath } from "@/lib/project";
import { authFetch } from "@/lib/authFetch";
import { useEffect, useState } from "react";

export default function MAPlaybooks() {
  const pid = getProjectId();
  const [pbs,setPbs] = useState<any[]>([]);
  const [sel,setSel] = useState<string>("");
  const [items,setItems] = useState<any[]>([]);
  const [start,setStart] = useState<string>("");

  async function loadPbs(){
    const r = await authFetch(`/api/ma/playbooks?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setPbs(j.items||[]);
    if (j.items?.[0]) { setSel(j.items[0].id); loadItems(j.items[0].id); }
  }
  async function loadItems(id:string){
    const r = await authFetch(`/api/ma/playbooks/${id}/items?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setItems(j.items||[]);
  }
  useEffect(()=>{ if(pid) loadPbs(); },[pid]);

  async function gen(){
    if(!sel) return;
    const body:any = { projectId: pid, playbookId: sel };
    if (start) body.startDate = start;
    const r = await authFetch(`/api/ma/playbooks/bind-actions`, { method:"POST", body: JSON.stringify(body) });
    const j = await r.json();
    alert(r.ok ? `Created ${j.createdItems} items, bound ${j.boundActions} actions` : "Failed");
    loadItems(sel);
  }

  return (
    <AppFrame sidebar={<SidebarV2/>}>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Playbooks</h1>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1" value={sel} onChange={e=>{setSel(e.target.value); loadItems(e.target.value);}}>
            {pbs.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="date" className="border rounded px-2 py-1" value={start} onChange={e=>setStart(e.target.value)} />
          <button className="border rounded px-3 py-1" onClick={gen}>Generate Actions</button>
        </div>

        <ul className="space-y-2">
          {items.map(it=>(
            <li key={it.id} className="p-3 border rounded-2xl text-sm flex items-center justify-between">
              <div>
                <div className="font-medium">{it.title}</div>
                <div className="text-xs opacity-70">{it.section} • {it.owner_role || "unassigned"}{it.due_at?` • due ${new Date(it.due_at).toLocaleDateString()}`:""}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-70">{it.status}</span>
                {it.action_id
                  ? <a className="text-xs underline" href={ensureProjectPath("/insights/actions")}>Open Action</a>
                  : <span className="text-xs opacity-60">not bound</span>
                }
              </div>
            </li>
          ))}
          {!items.length && <li className="opacity-70 text-sm">No items yet — click "Generate Actions".</li>}
        </ul>
      </div>
    </AppFrame>
  );
}
