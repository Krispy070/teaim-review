import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getJSON, postJSON } from "@/lib/authFetch";
import PageHeading from "@/components/PageHeading";
import WatcherPicker from "@/components/WatcherPicker";

const COLS = ["intake","triage","planned","in_progress","testing","deployed","closed"];

function SlaBadge({s}:{s:any}){
  if (!s || !s.state || s.state==="none") return null;
  const cls = s.state==="overdue" ? "text-red-500" : s.state==="breach_soon" ? "text-amber-600" : "text-[var(--brand-good)]";
  return <span className={`ml-1 ${cls}`}>({s.days_left}d)</span>;
}


export default function ChangeKanban(){
  const { projectId } = useParams();
  const [items,setItems]=useState<any[]>([]);
  async function load(){
    const d = await getJSON(`/api/changes/sla?project_id=${projectId}`);
    setItems(d.items||[]);
  }
  useEffect(()=>{ load(); },[projectId]);

  async function move(id:string, to:string){ await postJSON(`/api/changes/transition?id=${id}&to=${to}&project_id=${projectId}`,{}); load(); }

  return (
    <div>
      <PageHeading title="Change Requests — Kanban" crumbs={[{label:"Execution"},{label:"Changes"}]}
        actions={[
          <button key="sla-alerts" className="brand-btn text-xs" onClick={async()=>{ await fetch(`/api/changes/sla_alerts?project_id=${projectId}`, {method:"POST",credentials:"include"}); alert("SLA alerts processed"); }}>
            Run SLA alerts
          </button>
        ]}
      />
      <div className="grid md:grid-cols-6 gap-3">
        {COLS.map(c=>(
          <div key={c} className="brand-card p-2 min-h-[240px]" data-testid={`kanban-column-${c}`}>
            <div className="text-xs font-medium mb-2 uppercase">{c.replace("_"," ")}</div>
            <div className="space-y-2">
              {items.filter(i=>(i.status||"intake")===c).map(i=>(
                <div key={i.id} className="border rounded p-2 text-xs bg-white/5" data-testid={`cr-card-${i.id}`}>
                  <div className="font-medium">{i.title} <SlaBadge s={i.sla}/></div>
                  <div className="text-muted-foreground">Area: {i.area||"—"} · P: {i.priority} · R: {i.risk} · Due: {i.due_date||"—"}</div>
                  <div className="mt-1">
                    <WatcherPicker projectId={projectId!} changeId={i.id} initial={i.watchers||[]} />
                  </div>
                  <div className="mt-1 flex gap-1">
                    <input className="border rounded p-1 w-[120px]" defaultValue={i.assignee||""}
                           onBlur={e=> fetch(`/api/changes/update_small?id=${i.id}&project_id=${projectId}&assignee=${encodeURIComponent(e.target.value)}`, {method:"POST",credentials:"include"}) }
                           data-testid={`input-assignee-${i.id}`} />
                    <input type="date" className="border rounded p-1" defaultValue={i.due_date||""}
                           onBlur={e=> fetch(`/api/changes/update_small?id=${i.id}&project_id=${projectId}&due_date=${encodeURIComponent(e.target.value)}`, {method:"POST",credentials:"include"}) }
                           data-testid={`input-due-${i.id}`} />
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {COLS.filter(x=>x!==c).slice(0,3).map(x=>
                      <button 
                        key={x} 
                        className="brand-btn text-[11px]" 
                        onClick={()=>move(i.id,x)}
                        data-testid={`button-move-${x}`}
                      >
                        {x.replace("_"," ")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!items.some(i=>(i.status||"intake")===c) && <div className="text-xs text-muted-foreground">Empty</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}