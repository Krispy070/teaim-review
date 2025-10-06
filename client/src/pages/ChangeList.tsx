import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { getJSON, postJSON } from "@/lib/authFetch";
import PageHeading from "@/components/PageHeading";
import { downloadGET } from "@/lib/download";

const COLS = ["intake","triage","planned","in_progress","testing","deployed","closed"];

function SlaBadge({s}:{s:any}){ if(!s) return null;
  const cls = s.state==="overdue" ? "text-red-500" : s.state==="breach_soon" ? "text-amber-600" : "text-[var(--brand-good)]";
  const txt = s.state==="ok" ? `${s.days_left}d` : `${s.state} ${s.days_left}d`;
  return <span className={`ml-1 ${cls}`}>{txt}</span>;
}

export default function ChangeList(){
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  const [rows,setRows]=useState<any[]>([]);
  const [area,setArea]=useState(""); const [status,setStatus]=useState("");
  const [priority,setPriority]=useState(""); const [assignee,setAssignee]=useState("");
  const [sort,setSort]=useState<"sla"|"due"|"priority">("sla");
  const [sel,setSel]=useState<Record<string,boolean>>({});
  const [tpl,setTpl]=useState<{subject:string,html:string}>({subject:"",html:""});
  const [groups,setGroups]=useState<any[]>([]);

  async function load(){
    const qs = new URLSearchParams({project_id:projectId!, sort});
    if(area) qs.set("area", area); if(status) qs.set("status",status); if(priority) qs.set("priority",priority); if(assignee) qs.set("assignee",assignee);
    const d = await getJSON(`/api/changes/list_advanced?${qs.toString()}`); setRows(d.items||[]);
  }
  useEffect(()=>{ load(); },[projectId, area, status, priority, assignee, sort]);
  useEffect(()=>{ (async()=>{ try{ const t=await getJSON(`/api/changes/resend_template?project_id=${projectId}`); setTpl(t||{});}catch{} })(); },[projectId]);
  useEffect(()=>{ (async()=>{ try{
    const g = await getJSON(`/api/changes/nudge_groups?project_id=${projectId}`); setGroups(g.items||[]);
  }catch{} })(); },[projectId]);
  async function saveTpl(){ await postJSON(`/api/changes/resend_template?project_id=${projectId}`, tpl); alert("Template saved"); }

  const anySel = useMemo(()=> Object.values(sel).some(Boolean),[sel]);
  function toggle(id:string){ setSel(s=> ({...s, [id]: !s[id]})); }

  async function bulk(to:string){
    const ids = Object.keys(sel).filter(k=>sel[k]); if(!ids.length) return;
    await postJSON(`/api/changes/bulk_transition?project_id=${projectId}`, { ids, to }); setSel({}); load();
  }
  async function nudge(id:string){ await fetch(`/api/changes/nudge_assignee?id=${id}&project_id=${projectId}`, {method:"POST", credentials:"include"}); }

  const owners = Array.from(new Set(rows.map(r=>(r.assignee||"").trim()).filter(Boolean))).sort();
  const areas = Array.from(new Set(rows.map(r=>(r.area||"").trim()).filter(Boolean))).sort();

  return (
    <div>
      <PageHeading title="Change Requests — List" crumbs={[{label:"Execution"},{label:"Changes"}]} />
      <div className="brand-card p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select className="border rounded p-1" value={area} onChange={e=>setArea(e.target.value)} data-testid="filter-area">
            <option value="">Area (all)</option>{areas.map(a=> <option key={a}>{a}</option>)}
          </select>
          <select className="border rounded p-1" value={status} onChange={e=>setStatus(e.target.value)} data-testid="filter-status">
            <option value="">Status (all)</option>{COLS.map(s=> <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="border rounded p-1" value={priority} onChange={e=>setPriority(e.target.value)} data-testid="filter-priority">
            <option value="">Priority (all)</option>{["low","medium","high","urgent"].map(p=> <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="border rounded p-1" value={assignee} onChange={e=>setAssignee(e.target.value)} data-testid="filter-assignee">
            <option value="">Assignee (all)</option>{owners.map(o=> <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="border rounded p-1" value={sort} onChange={e=>setSort(e.target.value as any)} data-testid="sort-selector">
            <option value="sla">Sort: SLA</option>
            <option value="due">Sort: Due</option>
            <option value="priority">Sort: Priority</option>
          </select>
          <button className="brand-btn text-xs ml-auto" onClick={()=>downloadGET(`/api/changes/export.csv?project_id=${projectId}${area?`&area=${encodeURIComponent(area)}`:""}${status?`&status=${encodeURIComponent(status)}`:""}`, "changes.csv")} data-testid="button-export">Export CSV</button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button className="brand-btn text-xs" disabled={!anySel} onClick={()=>bulk("triage")} data-testid="button-bulk-triage">→ Triage</button>
          <button className="brand-btn text-xs" disabled={!anySel} onClick={()=>bulk("planned")} data-testid="button-bulk-planned">→ Planned</button>
          <button className="brand-btn text-xs" disabled={!anySel} onClick={()=>bulk("in_progress")} data-testid="button-bulk-progress">→ In-Progress</button>
          <button className="brand-btn text-xs" disabled={!anySel} onClick={()=>bulk("testing")} data-testid="button-bulk-testing">→ Testing</button>
          <button className="brand-btn text-xs" disabled={!anySel} onClick={()=>bulk("deployed")} data-testid="button-bulk-deployed">→ Deployed</button>
          <button className="brand-btn text-xs" disabled={!anySel} onClick={()=>bulk("closed")} data-testid="button-bulk-closed">→ Closed</button>
        </div>

        <div className="brand-card p-3">
          <div className="text-xs font-medium mb-1">Bulk Nudge (assignees)</div>
          <div className="grid md:grid-cols-2 gap-2">
            <input className="border rounded p-2 text-sm" placeholder="Subject" value={tpl.subject||""} onChange={e=>setTpl({...tpl,subject:e.target.value})} data-testid="input-template-subject"/>
            <button className="brand-btn text-xs" onClick={saveTpl} data-testid="button-save-template">Save template</button>
          </div>
          <textarea className="border rounded p-2 w-full text-sm mt-1" rows={2} placeholder="HTML ({{TITLE}}, {{DUE}}, {{PRIO}})" value={tpl.html||""} onChange={e=>setTpl({...tpl,html:e.target.value})} data-testid="textarea-template-html"/>
          <div className="mt-2 flex gap-2">
            <button className="brand-btn text-xs" disabled={!anySel} onClick={async()=>{
              const ids = Object.keys(sel).filter(k=>sel[k]); 
              await fetch(`/api/changes/nudge_assignee_bulk?project_id=${projectId}`, {
                method:"POST", credentials:"include", headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ ids, subject: tpl.subject, html: tpl.html, min_hours_between: 12 })
              }); alert("Nudges sent (throttled)");
            }} data-testid="button-bulk-nudge">Nudge selected</button>

            <div className="mt-2 flex gap-2">
              <button className="brand-btn text-xs" disabled={!anySel} onClick={async()=>{
                const ids = Object.keys(sel).filter(k=>sel[k]);
                await fetch(`/api/changes/schedule_nudge_bulk?project_id=${projectId}`, {
                  method:"POST", credentials:"include", headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({ ids, at_local: "09:00" })
                }); alert("Scheduled for 9am tomorrow");
              }} data-testid="button-schedule-selected">Schedule 9am (selected)</button>

              <select className="border rounded p-1 text-xs" onChange={async e=>{
                const name = e.target.value; if(!name) return;
                const grp = groups.find(x=>x.name===name); if(!grp) return;
                await fetch(`/api/changes/schedule_nudge_bulk?project_id=${projectId}`, {
                  method:"POST", credentials:"include", headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({ ids: grp.val?.ids || [], subject: grp.val?.subject, html: grp.val?.html, at_local:"09:00" })
                }); alert("Scheduled group for 9am");
              }} data-testid="select-schedule-group">
                <option value="">Schedule saved group…</option>
                {groups.map((g:any)=> <option key={g.name} value={g.name}>{g.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr>
              <th className="p-1"><input type="checkbox" onChange={e=> setSel(Object.fromEntries(rows.map(r=> [r.id, e.target.checked]))) } data-testid="checkbox-select-all" /></th>
              <th className="text-left p-1">Title</th>
              <th className="text-left p-1">Area</th>
              <th className="text-left p-1">Assignee</th>
              <th className="text-left p-1">Priority</th>
              <th className="text-left p-1">Due</th>
              <th className="text-left p-1">SLA</th>
              <th className="p-1"></th>
            </tr></thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.id} data-testid={`row-change-${r.id}`}>
                  <td className="p-1"><input type="checkbox" checked={!!sel[r.id]} onChange={()=>toggle(r.id)} data-testid={`checkbox-${r.id}`} /></td>
                  <td className="p-1" data-testid={`text-title-${r.id}`}>{r.title}</td>
                  <td className="p-1" data-testid={`text-area-${r.id}`}>{r.area||"—"}</td>
                  <td className="p-1">
                    <input className="border rounded p-1 w-[140px]" defaultValue={r.assignee||""}
                           onBlur={e=> fetch(`/api/changes/update_small?id=${r.id}&project_id=${projectId}&assignee=${encodeURIComponent(e.target.value)}`, {method:"POST",credentials:"include"}) }
                           data-testid={`input-assignee-${r.id}`} />
                  </td>
                  <td className="p-1" data-testid={`text-priority-${r.id}`}>{r.priority||"—"}</td>
                  <td className="p-1">
                    <input type="date" className="border rounded p-1" defaultValue={r.due_date||""}
                           onBlur={e=> fetch(`/api/changes/update_small?id=${r.id}&project_id=${projectId}&due_date=${encodeURIComponent(e.target.value)}`, {method:"POST",credentials:"include"}) }
                           data-testid={`input-due-${r.id}`} />
                  </td>
                  <td className="p-1" data-testid={`sla-badge-${r.id}`}><SlaBadge s={r.sla}/></td>
                  <td className="p-1"><button className="text-xs underline" onClick={()=>nudge(r.id)} data-testid={`button-nudge-${r.id}`}>Nudge</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td className="p-2 text-xs text-muted-foreground" colSpan={8} data-testid="text-empty">No changes found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}