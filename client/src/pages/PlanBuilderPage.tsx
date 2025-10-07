import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId, ensureProjectPath } from "@/lib/project";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import useQueryState from "@/hooks/useQueryState";
import useDebouncedValue from "@/hooks/useDebouncedValue";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type Plan = { id:string; title:string; version:number; is_active:boolean; createdAt:string };
type Task = { id:string; phaseId?:string; title:string; module?:string; owner?:string; startAt?:string; dueAt?:string; status:string; priority:number; orderIndex:number; dependsOn?:string[]; actionId?:string; baselineStart?:string; baselineDue?:string; snoozeUntil?:string; ticketId?:string };

function statusChip(s:string){
  const tone = s==="done" ? "border-emerald-600 text-emerald-300"
             : s==="blocked" ? "border-amber-600 text-amber-300"
             : s==="in_progress" ? "border-indigo-600 text-indigo-300"
             : "border-slate-600 text-slate-300";
  return <span className={`text-[11px] px-1.5 py-0.5 border rounded-full ${tone}`}>{s}</span>;
}

export default function PlanBuilderPage(){
  const pid = getProjectId();
  const [location] = useLocation();
  const [plan,setPlan]=useState<Plan|null>(null);
  const [tasks,setTasks]=useState<Task[]>([]);
  const [msg,setMsg]=useState("");
  const [sel,setSel]=useState<Record<string,boolean>>({});
  const ids = Object.keys(sel).filter(k=>sel[k]);
  const [depTask,setDepTask]=useState<string>("");
  const [depOpen,setDepOpen]=useState(false);
  const [depSel,setDepSel]=useState<Record<string,boolean>>({});
  const [fStatus,setFStatus]=useState<string>("");
  const [fHasTicket,setFHasTicket]=useState<boolean>(false);
  const [q, setQ] = useQueryState("q", "");
  const debouncedQ = useDebouncedValue(q, 350);
  const [mine,setMine]=useState<boolean>(false);
  const [meEmail,setMeEmail]=useState<string>("");
  const [preset,setPreset]=useState<""|"my_soon"|"my_overdue">("");
  const [isAdmin,setIsAdmin]=useState(false);
  const [jPrefs,setJPrefs]=useState<any>(null);
  const [onlyOverdue,setOnlyOverdue]=useState(false);
  const [originType,setOriginType]=useState<string>("");
  const [originId,setOriginId]=useState<string>("");
  const [bulkStatus,setBulkStatus]=useState<"planned"|"in_progress"|"blocked"|"done">("in_progress");
  const [ownerModal,setOwnerModal]=useState<{open:boolean; for:"selected"|"filtered"}>({open:false, for:"selected"});
  const [ownerInput,setOwnerInput]=useState("");
  const [confirm,setConfirm]=useState<{open:boolean; what:"selected"|"filtered"}>({open:false,what:"selected"});

  useEffect(()=>{
    const params = new URLSearchParams(location.split('?')[1] || '');
    if (params.get("ownerMe")==="1") setMine(true);
    if (params.get("overdue")==="1") setOnlyOverdue(true);
    if (params.get("hasTicket")==="1") setFHasTicket(true);
    const s = params.get("status"); if (s) setFStatus(s);
    const ot=params.get("originType")||""; const oi=params.get("originId")||"";
    setOriginType(ot); setOriginId(oi);
  }, []);

  useEffect(()=> { (async()=> {
    try {
      const r = await fetchWithAuth(`/api/plan/prefs?projectId=${encodeURIComponent(pid!)}`); const j = await r.json();
      if (r.ok) {
        setJPrefs(j);
        if (j.userDefault === true) setMine(true);
        else if (j.userDefault === false) setMine(false);
        else if (j.projectDefault === true) setMine(true);
      }
    } catch {}
  })(); }, [pid]);

  function isOverdue(t:any){
    if (!t.dueAt) return false;
    const due = new Date(t.dueAt).getTime();
    return due < Date.now() && (t.status!=="done");
  }
  function isSoon7d(t:any){
    if (!t.dueAt) return false;
    const due = new Date(t.dueAt).getTime();
    const in7 = Date.now() + 7*24*3600*1000;
    return due >= Date.now() && due <= in7 && (t.status!=="done");
  }

  function dueBadge(t:any){
    if (!t?.dueAt) return null;
    const due = new Date(t.dueAt).getTime(); const now = Date.now();
    const d = Math.ceil((due - now)/(24*3600*1000));
    let cls="border-slate-600", txt=`in ${d}d`;
    if (d < 0){ cls="border-red-600 text-red-300"; txt=`${Math.abs(d)}d overdue`; }
    else if (d <= 7){ cls="border-amber-600 text-amber-300"; }
    else { cls="border-emerald-600 text-emerald-300"; }
    return <span className={`text-[11px] px-1.5 py-0.5 border rounded ${cls}`}>{txt}</span>;
  }

  async function load(){
    try {
      const r = await fetch(`/api/plan?projectId=${encodeURIComponent(pid!)}`, { headers: { "Content-Type": "application/json" } });
      const j = await r.json(); 
      if (r.ok){ setPlan(j.plan); setTasks(j.tasks||[]); setMsg(""); } 
      else setMsg(j.error||"load failed");
    } catch (e:any) {
      setMsg(e.message||"load failed");
    }
  }
  useEffect(()=>{ load(); },[]);

  useEffect(()=>{ (async()=>{
    try{ const r=await fetchWithAuth(`/api/me`); const j=await r.json(); if (r.ok){ setMeEmail(j.email||""); setIsAdmin(!!j.isAdmin); } }catch{}
  })(); },[]);

  function varianceDays(cur?:string, base?:string){
    if (!cur || !base) return null;
    const a=new Date(cur).getTime(), b=new Date(base).getTime();
    return Math.round((a-b)/(24*3600*1000));
  }
  function rowClass(t:any){
    const v = varianceDays(t.dueAt, t.baselineDue);
    if (v==null) return "";
    if (v >= 3) return "bg-red-900/20";
    if (v >= 1) return "bg-amber-900/20";
    if (v <= -2) return "bg-emerald-900/15";
    return "";
  }

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-plan-builder">Project Plan</h1>
          <div className="flex items-center gap-2">
            <GeneratePlanButton onCommitted={()=>load()} />
            <button className="text-xs px-2 py-1 border rounded" data-testid="button-save-order" onClick={()=>reorder(tasks.map(t=>t.id))}>Save order</button>
          </div>
        </div>
        <div className="text-xs opacity-70" data-testid="text-message">{msg}</div>

        {!plan ? <div className="text-sm opacity-70" data-testid="text-no-plan">No plan yet. Use Generate to draft one.</div> : null}

        {ids.length>0 && (
          <div className="p-2 border rounded-2xl flex items-center gap-2 bg-muted/10" data-testid="bulk-toolbar">
            <span className="text-xs">Selected: {ids.length}</span>
            <select className="border rounded px-2 py-1 text-xs" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value as any)} data-testid="select-bulk-status">
              <option value="planned">planned</option>
              <option value="in_progress">in_progress</option>
              <option value="blocked">blocked</option>
              <option value="done">done</option>
            </select>
            <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
              if (!plan) return;
              for (const id of ids) {
                await fetchWithAuth(`/api/plan/tasks/upsert`, {
                  method:"POST",
                  body: JSON.stringify({ projectId: pid, planId: plan.id, tasks:[{ id, status: bulkStatus }] })
                });
              }
              setSel({}); load();
            }} data-testid="button-set-status">Set status (selected)</button>
            <button className="text-xs px-2 py-1 border rounded" title="All filtered"
              onClick={async()=>{
                if (!plan) return;
                await fetchWithAuth(`/api/plan/tasks/bulk-by-filter`, {
                  method:"POST",
                  body: JSON.stringify({
                    projectId: pid, planId: plan.id,
                    filter: {
                      ownerContains: mine? meEmail: undefined,
                      status: fStatus||undefined,
                      hasTicket: fHasTicket||undefined,
                      overdue: onlyOverdue||undefined,
                      q: q||undefined
                    },
                    set: { status: bulkStatus }
                  })
                });
                setSel({}); load();
              }} data-testid="button-set-status-filtered">
              Set status (filtered)
            </button>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>{ setOwnerInput(meEmail||""); setOwnerModal({open:true, for:"selected"}); }} data-testid="button-set-owner">
              Set owner…
            </button>
            <button className="text-xs px-2 py-1 border rounded" title="All filtered"
              onClick={()=>{ setOwnerInput(meEmail||""); setOwnerModal({open:true, for:"filtered"}); }} data-testid="button-set-owner-filtered">
              Assign owner (filtered)
            </button>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>shift(+1,true)} data-testid="button-shift-plus-1">Shift +1d (cascade)</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>shift(-1,true)} data-testid="button-shift-minus-1">Shift -1d (cascade)</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={pushActions} data-testid="button-push-actions">Push to Actions</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={pullActions} data-testid="button-pull-actions">Pull from Actions</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={pullTickets} data-testid="button-pull-tickets">Pull from Tickets</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>setBaseline(ids)} data-testid="button-set-baseline">Set baseline</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>clearBaseline(ids)} data-testid="button-clear-baseline">Clear baseline</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
              if (!plan || !ids.length) return;
              await fetchWithAuth(`/api/plan/tasks/set-owner`, { method:"POST", body: JSON.stringify({ projectId: pid, planId: plan.id, ids, owner: meEmail }) });
              setSel({}); load();
            }} data-testid="button-set-owner-me">Set owner = me</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>setConfirm({open:true, what:"selected"})} data-testid="button-mark-done">Mark done</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>setConfirm({open:true, what:"filtered"})} data-testid="button-mark-done-filtered">Mark done (filtered)</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
              if (!plan) return;
              await fetchWithAuth(`/api/plan/tasks/bulk-by-filter`, {
                method:"POST",
                body: JSON.stringify({
                  projectId: pid, planId: plan.id,
                  filter: { ownerContains: mine? meEmail: undefined, status: fStatus||undefined, hasTicket: fHasTicket||undefined, overdue: onlyOverdue||undefined, q: q||undefined },
                  set: { owner: meEmail }
                })
              });
              setSel({}); load();
            }} data-testid="button-assign-owner-filtered">Assign owner to filtered</button>
            <a className="text-xs px-2 py-1 border rounded" href={`/api/plan/export.csv?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-csv">Export CSV</a>
            <a className="text-xs px-2 py-1 border rounded" href={
              `/api/plan/export_view.csv?` + new URLSearchParams({
                projectId: pid!, ...(mine?{ownerContains: meEmail}:{}) , ...(fStatus?{status:fStatus}:{}) , ...(fHasTicket?{hasTicket:"1"}:{}),
                ...(onlyOverdue?{overdue:"1"}:{}), ...(q?{q}:{})
              }).toString()
            } data-testid="link-export-filtered-csv">
              Export filtered CSV
            </a>
            {meEmail && (
              <>
                <a className="text-xs px-2 py-1 border rounded"
                   href={`/api/plan/export.csv?projectId=${encodeURIComponent(pid!)}&owner=${encodeURIComponent(meEmail)}`}
                   data-testid="link-export-my-csv">
                  Export my CSV
                </a>
                <div className="flex items-center gap-1">
                  <a className="text-xs px-2 py-1 border rounded"
                     href={`/api/plan/export_my.csv?projectId=${encodeURIComponent(pid!)}&owner=${encodeURIComponent(meEmail)}&scope=soon&days=7`}
                     data-testid="link-export-my-due-soon">
                    Export my due soon (7d)
                  </a>
                  <button className="text-xs px-2 py-1 border rounded" onClick={()=>{
                    const url = `${window.location.origin}/api/plan/export_my.csv?projectId=${encodeURIComponent(pid!)}&owner=${encodeURIComponent(meEmail)}&scope=soon&days=7`;
                    navigator.clipboard.writeText(url);
                  }} data-testid="button-copy-link-soon">Copy link</button>
                </div>
                <div className="flex items-center gap-1">
                  <a className="text-xs px-2 py-1 border rounded"
                     href={`/api/plan/export_my.csv?projectId=${encodeURIComponent(pid!)}&owner=${encodeURIComponent(meEmail)}&scope=overdue`}
                     data-testid="link-export-my-overdue">
                    Export my overdue
                  </a>
                  <button className="text-xs px-2 py-1 border rounded" onClick={()=>{
                    const url = `${window.location.origin}/api/plan/export_my.csv?projectId=${encodeURIComponent(pid!)}&owner=${encodeURIComponent(meEmail)}&scope=overdue`;
                    navigator.clipboard.writeText(url);
                  }} data-testid="button-copy-link-overdue">Copy link</button>
                </div>
              </>
            )}
            <a className="text-xs px-2 py-1 border rounded" href={`/api/plan/export.ics?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-ics">Export ICS</a>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>setSel({})} data-testid="button-clear-selection">Clear</button>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-1 p-3 border rounded-2xl">
            <div className="text-sm font-medium mb-2">AI Suggestions</div>
            <SuggestFromConversations onApply={(ts)=>apply(ts)} />
          </div>

          <div className="md:col-span-2 p-3 border rounded-2xl">
            <div className="text-sm font-medium mb-2" data-testid="text-tasks-count">Tasks ({tasks.length})</div>
            {jPrefs && jPrefs.userDefault === null && jPrefs.projectDefault === true && (
              <div className="text-[11px] opacity-70 mb-1" data-testid="text-project-default-banner">
                Using project default: <b>owner = me</b>
              </div>
            )}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <input className="border rounded px-2 py-1 text-sm" placeholder="search tasks…" value={q} onChange={e=>setQ(e.target.value)} data-testid="input-search"/>
              <select className="border rounded px-2 py-1 text-sm" value={fStatus} onChange={e=>setFStatus(e.target.value)} data-testid="select-status-filter">
                <option value="">all statuses</option>
                <option value="planned">planned</option>
                <option value="in_progress">in_progress</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
              </select>
              <label className="text-xs flex items-center gap-1" data-testid="label-has-ticket">
                <input type="checkbox" checked={fHasTicket} onChange={e=>setFHasTicket(e.target.checked)} data-testid="checkbox-has-ticket"/>
                has ticket
              </label>
              <label className="text-xs flex items-center gap-1" data-testid="label-mine">
                <input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)} data-testid="checkbox-mine"/>
                only my items
              </label>
              <label className="text-xs flex items-center gap-1" data-testid="label-only-overdue">
                <input type="checkbox" checked={onlyOverdue} onChange={e=>setOnlyOverdue(e.target.checked)} data-testid="checkbox-only-overdue"/>
                only overdue
              </label>
              <button className="text-[11px] px-2 py-0.5 border rounded" onClick={async () => {
                await fetchWithAuth(`/api/plan/prefs`, { method: "POST", body: JSON.stringify({ projectId: pid, userDefault: mine }) });
                alert("Saved as your default");
              }} data-testid="button-save-my-default">Save as my default</button>
              <button className="text-[11px] px-2 py-0.5 border rounded" onClick={async () => {
                await fetchWithAuth(`/api/plan/prefs`, { method: "POST", body: JSON.stringify({ projectId: pid, userDefault: null }) });
                const r = await fetchWithAuth(`/api/plan/prefs?projectId=${encodeURIComponent(pid!)}`); const j = await r.json();
                if (r.ok) { setMine(j.projectDefault === true); }
              }} data-testid="button-use-project-default">Use project default</button>
              <button className={`text-xs px-2 py-1 border rounded ${preset==="my_soon"?"bg-slate-800":""}`}
                onClick={()=>{ setPreset(preset==="my_soon"?"": "my_soon"); setMine(true); }} data-testid="button-preset-my-soon">
                Only my due soon (7d)
              </button>
              <button className={`text-xs px-2 py-1 border rounded ${preset==="my_overdue"?"bg-slate-800":""}`}
                onClick={()=>{ setPreset(preset==="my_overdue"?"":"my_overdue"); setMine(true); }} data-testid="button-preset-my-overdue">
                Only my overdue
              </button>
              <button className="text-xs px-2 py-1 border rounded" onClick={()=>{
                const url = new URL(window.location.origin + ensureProjectPath("/plan"));
                const p = url.searchParams;
                if (mine)        p.set("ownerMe","1");
                if (onlyOverdue) p.set("overdue","1");
                if (fHasTicket)  p.set("hasTicket","1");
                if (fStatus)     p.set("status", fStatus);
                if (q)           p.set("q", q);
                navigator.clipboard.writeText(url.toString());
                alert("Link copied");
              }} data-testid="button-copy-link-view">
                Copy link to this view
              </button>
              <button className="text-xs px-2 py-1 border rounded"
                onClick={()=>{ setPreset(""); setMine(false); setFStatus(""); setFHasTicket(false); setQ(""); }} data-testid="button-clear-presets">
                Clear presets
              </button>
            </div>
            <div className="flex items-center gap-3 text-[11px] opacity-80 mt-1 mb-2">
              <span>Legend:</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-900/15">ahead (≤ −2d)</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-900/20">slip +1…+2d</span>
              <span className="px-1.5 py-0.5 rounded bg-red-900/20">late ≥ +3d</span>
            </div>
            {(originType||originId) && (
              <div className="text-[11px] opacity-80 mb-1">
                Origin filter: {originType||"—"} {originId?`#${originId.slice(0,8)}`:""}
                <button className="ml-2 px-2 py-0.5 border rounded" onClick={()=>{
                  setOriginType(""); setOriginId("");
                  const url = new URL(window.location.href); url.searchParams.delete("originType"); url.searchParams.delete("originId"); history.replaceState(null,"",url.toString());
                }} data-testid="button-clear-origin">Clear</button>
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <label className="text-[11px] flex items-center gap-1">
                <input type="checkbox" onChange={e=>{
                  const checked = e.target.checked;
                  const next:Record<string,boolean> = { ...sel };
                  const filtered = tasks.filter(t=>{
                    if (fStatus && t.status!==fStatus) return false;
                    if (fHasTicket && !t.ticketId) return false;
                    if (mine && meEmail && t.owner && !String(t.owner).toLowerCase().includes(meEmail.toLowerCase())) return false;
                    if (q && !`${t.title} ${t.module||""} ${t.owner||""}`.toLowerCase().includes(q.toLowerCase())) return false;
                    if (preset==="my_soon"   && !isSoon7d(t)) return false;
                    if (preset==="my_overdue"&& !isOverdue(t)) return false;
                    if (onlyOverdue && !isOverdue(t)) return false;
                    if (originType && String((t as any).originType||"")!==originType) return false;
                    if (originId   && String((t as any).originId||"")  !==originId)   return false;
                    return true;
                  });
                  filtered.forEach(t => next[t.id] = checked);
                  setSel(next);
                }} data-testid="checkbox-select-all-filtered"/>
                Select all (filtered)
              </label>
            </div>
            <div className="overflow-auto">
              <table className="text-sm min-w-[900px] w-full" data-testid="table-tasks">
                <thead className="bg-slate-900/40 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Actions</th>
                    <th className="text-left px-2 py-1">Title</th>
                    <th className="text-left px-2 py-1">Module</th>
                    <th className="text-left px-2 py-1">Owner</th>
                    <th className="text-left px-2 py-1">Start</th>
                    <th className="text-left px-2 py-1">Due</th>
                    <th className="text-left px-2 py-1">Δ Start</th>
                    <th className="text-left px-2 py-1">Δ Due</th>
                    <th className="text-left px-2 py-1">Status</th>
                    <th className="text-left px-2 py-1">Priority</th>
                    <th className="text-left px-2 py-1">Snooze</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.filter(t=>{
                    if (fStatus && t.status!==fStatus) return false;
                    if (fHasTicket && !t.ticketId) return false;
                    if (mine && meEmail && t.owner && !String(t.owner).toLowerCase().includes(meEmail.toLowerCase())) return false;
                    if (q && !`${t.title} ${t.module||""} ${t.owner||""}`.toLowerCase().includes(q.toLowerCase())) return false;
                    if (preset==="my_soon"   && !isSoon7d(t)) return false;
                    if (preset==="my_overdue"&& !isOverdue(t)) return false;
                    if (onlyOverdue && !isOverdue(t)) return false;
                    if (originType && String((t as any).originType||"")!==originType) return false;
                    if (originId   && String((t as any).originId||"")  !==originId)   return false;
                    return true;
                  }).map((t,i)=>(
                    <tr key={t.id} className={`border-b border-slate-800 ${rowClass(t)}`} data-testid={`row-task-${t.id}`}
                        draggable
                        onDragStart={e=>e.dataTransfer.setData("text/plain", t.id)}
                        onDragOver={e=>e.preventDefault()}
                        onDrop={e=>{ const src = e.dataTransfer.getData("text/plain"); if (!src || src===t.id) return; const idx = tasks.findIndex(x=>x.id===t.id); const srcIdx = tasks.findIndex(x=>x.id===src); if (idx<0||srcIdx<0) return; const next = tasks.slice(); const [m]=next.splice(srcIdx,1); next.splice(idx,0,m); setTasks(next); }}
                    >
                      <td className="px-2 py-1">
                        <input type="checkbox" checked={!!sel[t.id]} onChange={e=>setSel(s=>({ ...s, [t.id]: e.target.checked }))} data-testid={`checkbox-${t.id}`}/>
                        <span className="ml-2">{statusChip(t.status)}</span>
                        {t.ticketId && <a className="text-[11px] underline ml-2" href={ensureProjectPath(`/tickets`)} title={t.ticketId} data-testid={`link-ticket-${t.id}`}>ticket</a>}
                        {t.owner && <span className="text-[11px] px-1 py-0.5 border rounded ml-2 border-slate-600" data-testid={`chip-owner-${t.id}`}>{t.owner}</span>}
                        <div className="flex items-center gap-1 mt-1">
                          <button className="text-[11px] px-1 py-0.5 border rounded" onClick={()=>openDeps(t.id)} data-testid={`button-deps-${t.id}`}>Deps</button>
                          <button className="text-[11px] px-1 py-0.5 border rounded" onClick={()=>shiftOne(t.id,+1)} data-testid={`button-plus-${t.id}`}>+1d</button>
                          <button className="text-[11px] px-1 py-0.5 border rounded" onClick={()=>shiftOne(t.id,-1)} data-testid={`button-minus-${t.id}`}>-1d</button>
                        </div>
                      </td>
                      <td className="px-2 py-1"><InlineEdit value={t.title} onSave={v=>save({ id:t.id, title:v })} /></td>
                      <td className="px-2 py-1"><InlineSelect value={t.module||""} options={["HCM","Absence","Payroll","Time","Benefits","FIN","Security","Integrations","Custom"]} onSave={v=>save({ id:t.id, module:v })}/></td>
                      <td className="px-2 py-1"><InlineEdit value={t.owner||""} onSave={v=>save({ id:t.id, owner:v })}/></td>
                      <td className="px-2 py-1"><InlineDate value={t.startAt} onSave={v=>save({ id:t.id, startAt:v })}/></td>
                      <td className="px-2 py-1">
                        <InlineDate value={t.dueAt} onSave={v=>save({ id:t.id, dueAt:v })}/>
                        <div className="mt-1 flex items-center gap-1">
                          {dueBadge(t)}
                          {t.dueAt && (
                            <>
                              <button className="text-[10px] px-1 py-0.5 border rounded" onClick={async()=>{
                                await fetchWithAuth(`/api/plan/tasks/${t.id}/bump`, { method:"POST", body: JSON.stringify({ projectId: pid, days: 1 }) });
                                load();
                              }} data-testid={`button-bump1d-${t.id}`}>+1d</button>
                              <button className="text-[10px] px-1 py-0.5 border rounded" onClick={async()=>{
                                await fetchWithAuth(`/api/plan/tasks/${t.id}/bump`, { method:"POST", body: JSON.stringify({ projectId: pid, days: 7 }) });
                                load();
                              }} data-testid={`button-bump7d-${t.id}`}>+7d</button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1">{varianceBadge(t.startAt, t, "start")}</td>
                      <td className="px-2 py-1">{varianceBadge(t.dueAt, t, "due")}</td>
                      <td className="px-2 py-1"><InlineSelect value={t.status} options={["planned","in_progress","blocked","done"]} onSave={v=>save({ id:t.id, status:v })}/></td>
                      <td className="px-2 py-1"><InlineNumber value={t.priority} onSave={v=>save({ id:t.id, priority:v })}/></td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <button className="text-[11px] px-1 py-0.5 border rounded" onClick={()=>snoozeTask(t.id,24)} data-testid={`button-snooze-${t.id}`}>24h</button>
                          {t.snoozeUntil && <button className="text-[11px] px-1 py-0.5 border rounded" onClick={()=>snoozeTask(t.id,0)} data-testid={`button-unsnooze-${t.id}`}>✗</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tasks.filter(t=>{
                    if (fStatus && t.status!==fStatus) return false;
                    if (fHasTicket && !t.ticketId) return false;
                    if (mine && meEmail && t.owner && !String(t.owner).toLowerCase().includes(meEmail.toLowerCase())) return false;
                    if (q && !`${t.title} ${t.module||""} ${t.owner||""}`.toLowerCase().includes(q.toLowerCase())) return false;
                    if (preset==="my_soon"   && !isSoon7d(t)) return false;
                    if (preset==="my_overdue"&& !isOverdue(t)) return false;
                    return true;
                  }).length===0 && <tr><td className="px-2 py-2 text-xs opacity-70" data-testid="text-no-matching-tasks" colSpan={11}>No matching tasks.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <Gantt tasks={tasks} />

        {depOpen && (
          <div className="fixed inset-0 z-50" data-testid="modal-dependencies">
            <div className="absolute inset-0 bg-black/60" onClick={()=>setDepOpen(false)} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,92vw)] max-h-[80vh] overflow-auto bg-background border rounded-2xl p-4">
              <div className="text-sm font-medium mb-2">Dependencies</div>
              <div className="text-xs opacity-70 mb-1">Select tasks that the current task depends on</div>
              <div className="space-y-1 max-h-[50vh] overflow-auto border rounded p-2">
                {tasks.filter(x=>x.id!==depTask).map(x=>(
                  <label key={x.id} className="flex items-center gap-2 text-sm" data-testid={`dep-option-${x.id}`}>
                    <input type="checkbox" checked={!!depSel[x.id]} onChange={e=>setDepSel(s=>({ ...s, [x.id]: e.target.checked }))}/>
                    <span>{x.title}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button className="text-xs px-2 py-1 border rounded" onClick={saveDeps} data-testid="button-save-deps">Save</button>
                <button className="text-xs px-2 py-1 border rounded" onClick={()=>setDepOpen(false)} data-testid="button-cancel-deps">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {ownerModal.open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setOwnerModal({open:false, for:"selected"})}/>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,92vw)] bg-background border rounded-2xl p-4 space-y-2">
            <div className="text-sm font-medium">Set owner {ownerModal.for==="selected"?"for selected":"for filtered"}</div>
            <input className="border rounded px-2 py-1 w-full" placeholder="name or email" value={ownerInput} onChange={e=>setOwnerInput(e.target.value)} data-testid="input-owner-modal"/>
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded" onClick={applyOwner} data-testid="button-apply-owner">Apply</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={()=>setOwnerModal({open:false, for:"selected"})} data-testid="button-cancel-owner">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm.open}
        title="Mark tasks done?"
        message={confirm.what==="selected" ? "Mark selected tasks as done." : "Mark the entire filtered slice as done."}
        confirmText="Mark done"
        onConfirm={async()=>{
          if (!plan) return;
          if (confirm.what==="selected"){
            for (const id of ids) {
              await fetchWithAuth(`/api/plan/tasks/upsert`, { method:"POST", body: JSON.stringify({ projectId: pid, planId: plan.id, tasks:[{ id, status:"done" }] }) });
            }
          } else {
            await fetchWithAuth(`/api/plan/tasks/bulk-by-filter`, {
              method:"POST",
              body: JSON.stringify({
                projectId: pid, planId: plan.id,
                filter: { ownerContains: mine? meEmail: undefined, status: fStatus||undefined, hasTicket: fHasTicket||undefined, overdue: onlyOverdue||undefined, dueWithinDays: undefined, q: q||undefined },
                set: { status: "done" }
              })
            });
          }
          setSel({}); load();
        }}
        onClose={()=>setConfirm({open:false,what:"selected"})}
      />
    </AppFrame>
  );

  async function save(body:any){
    if (!plan) return;
    await apiRequest("POST", `/api/plan/tasks/upsert`, { projectId: pid, planId: plan.id, tasks:[body] });
    load();
  }
  async function apply(ts:any[]){
    if (!plan) return;
    const norm = ts.map(t=>({ title:t.title, module:t.module, owner:t.owner||null, startAt:t.startAt||null, dueAt:t.dueAt||null, status:'planned', priority:50, source:'conversation' }));
    await apiRequest("POST", `/api/plan/tasks/upsert`, { projectId: pid, planId: plan.id, tasks: norm });
    load();
  }
  async function reorder(ids:string[]){
    if (!plan) return;
    await apiRequest("POST", `/api/plan/tasks/reorder`, { projectId: pid, planId: plan.id, ids });
    load();
  }
  async function shift(delta:number, cascade:boolean){
    if (!plan || !ids.length) return;
    for (const id of ids) {
      await fetch(`/api/plan/tasks/shift`, {
        method:"POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, planId: plan.id, fromTaskId: id, deltaDays: delta, cascade })
      });
    }
    setSel({}); load();
  }
  async function applyOwner(){
    const owner = ownerInput?.trim() || null;
    if (!owner){ alert("Enter an owner"); return; }
    if (!plan){ setOwnerModal({open:false, for:"selected"}); return; }

    if (ownerModal.for==="selected"){
      for (const id of ids){
        await fetchWithAuth(`/api/plan/tasks/upsert`, {
          method:"POST", body: JSON.stringify({ projectId: pid, planId: plan.id, tasks:[{ id, owner }] })
        });
      }
    }else{
      await fetchWithAuth(`/api/plan/tasks/bulk-by-filter`, {
        method:"POST", body: JSON.stringify({
          projectId: pid, planId: plan.id,
          filter: { ownerContains: mine? meEmail: undefined, status: fStatus||undefined, hasTicket: fHasTicket||undefined, overdue: onlyOverdue||undefined, q: q||undefined },
          set: { owner }
        })
      });
    }
    setOwnerModal({open:false, for:"selected"}); setOwnerInput(""); setSel({}); load();
  }
  async function shiftOne(taskId:string, delta:number){
    if (!plan) return;
    await fetch(`/api/plan/tasks/shift`, {
      method:"POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: pid, planId: plan.id, fromTaskId: taskId, deltaDays: delta, cascade: false })
    });
    load();
  }
  function openDeps(taskId:string){
    setDepTask(taskId);
    const cur = tasks.find(x=>x.id===taskId)?.dependsOn || [];
    const set:Record<string,boolean> = {};
    cur.forEach((id:string)=> set[id]=true);
    setDepSel(set); setDepOpen(true);
  }
  async function saveDeps(){
    const dependsOn = Object.keys(depSel).filter(k=>depSel[k]);
    await fetch(`/api/plan/tasks/deps`, { method:"POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid, taskId: depTask, dependsOn }) });
    setDepOpen(false); load();
  }
  async function pushActions(){
    if (!plan) return;
    await fetch(`/api/plan/sync/push`, { method:"POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid, planId: plan.id, ids }) });
    setSel({}); load();
  }
  async function pullActions(){
    if (!plan) return;
    await fetch(`/api/plan/sync/pull`, { method:"POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid, planId: plan.id }) });
    load();
  }
  async function pullTickets(){
    if (!plan) return;
    await fetch(`/api/plan/sync/pull-tickets`, { method:"POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid, planId: plan.id }) });
    load();
  }
  async function setBaseline(selIds:string[]){
    if (!plan) return;
    await fetch(`/api/plan/baseline/set`, { method:"POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid, planId: plan.id, ids: selIds.length ? selIds : undefined }) });
    setSel({}); load();
  }
  async function clearBaseline(selIds:string[]){
    if (!plan) return;
    await fetch(`/api/plan/baseline/clear`, { method:"POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid, planId: plan.id, ids: selIds.length ? selIds : undefined }) });
    setSel({}); load();
  }
  async function snoozeTask(id:string, hours:number){
    const until = hours>0 ? new Date(Date.now()+hours*3600*1000).toISOString() : null;
    await fetch(`/api/plan/tasks/snooze`, { method:"POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid, taskId: id, untilISO: until }) });
    load();
  }
  function varianceBadge(cur:string|undefined, t:Task, kind:"start"|"due"="start"){
    const base = kind==="start" ? t.baselineStart : t.baselineDue;
    if (!base || !cur) return <span className="text-[11px] opacity-60">—</span>;
    const a = new Date(cur).getTime(), b = new Date(base).getTime();
    const d = Math.round((a-b)/(24*3600*1000));
    const cls = d===0 ? "border-slate-600 text-slate-300"
              : d>0   ? "border-amber-600 text-amber-300"
                      : "border-emerald-600 text-emerald-300";
    return <span className={`text-[11px] px-1 py-0.5 border rounded ${cls}`}>{d>0?`+${d}`:d}</span>;
  }
}

function InlineEdit({ value, onSave }:{ value:string; onSave:(v:string)=>void }){
  return <input className="w-full border rounded px-2 py-1 text-sm" defaultValue={value} onBlur={e=>{ const v=e.target.value; if (v!==value) onSave(v); }} data-testid="input-inline-edit" />;
}
function InlineSelect({ value, options, onSave }:{ value:string; options:string[]; onSave:(v:string)=>void }){
  return <select className="border rounded px-2 py-1 text-sm" defaultValue={value} onChange={e=>onSave(e.target.value)} data-testid="select-inline">{options.map(o=><option key={o} value={o}>{o}</option>)}</select>;
}
function InlineDate({ value, onSave }:{ value?:string; onSave:(v:string|null)=>void }){
  return <input type="date" className="border rounded px-2 py-1 text-sm" defaultValue={value?String(value).slice(0,10):""} onBlur={e=>onSave(e.target.value?new Date(e.target.value).toISOString():null)} data-testid="input-date" />;
}
function InlineNumber({ value, onSave }:{ value:number; onSave:(v:number)=>void }){
  return <input type="number" className="w-20 border rounded px-2 py-1 text-sm" defaultValue={value} onBlur={e=>onSave(Number(e.target.value||value))} data-testid="input-number" />;
}

function GeneratePlanButton({ onCommitted }:{ onCommitted:()=>void }){
  const pid = getProjectId();
  const [open,setOpen]=useState(false);
  const [gl,setGl]=useState("");
  const [mods,setMods]=useState<string>("HCM, Absence, Payroll");
  const [title,setTitle]=useState("Implementation Plan");
  const [preview,setPreview]=useState<any|null>(null);
  const [busy,setBusy]=useState(false);

  return (
    <>
      <button className="text-xs px-2 py-1 border rounded" data-testid="button-generate-plan" onClick={()=>setOpen(true)}>Generate plan…</button>
      {open && (
        <div className="fixed inset-0 z-50" data-testid="modal-generate-plan">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,94vw)] max-h-[84vh] overflow-auto bg-background border rounded-2xl p-4 space-y-2">
            <div className="text-sm font-medium">AI-draft project plan</div>
            <div className="grid md:grid-cols-3 gap-2">
              <label className="text-xs">Go-Live</label>
              <input type="date" className="border rounded px-2 py-1 md:col-span-2" data-testid="input-golive" value={gl} onChange={e=>setGl(e.target.value)} />
              <label className="text-xs">Modules</label>
              <input className="border rounded px-2 py-1 md:col-span-2" data-testid="input-modules" value={mods} onChange={e=>setMods(e.target.value)} />
              <label className="text-xs">Plan title</label>
              <input className="border rounded px-2 py-1 md:col-span-2" data-testid="input-plan-title" value={title} onChange={e=>setTitle(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded" data-testid="button-draft" disabled={!gl||busy} onClick={draft}>{busy?"…":"Draft"}</button>
              {preview && <button className="text-xs px-2 py-1 border rounded" data-testid="button-commit" onClick={commit}>Commit</button>}
              <button className="text-xs px-2 py-1 border rounded" data-testid="button-close-modal" onClick={()=>setOpen(false)}>Close</button>
            </div>
            {preview && (
              <div className="text-xs p-2 border rounded bg-slate-900/30 max-h-[50vh] overflow-auto" data-testid="text-preview">
                <pre className="whitespace-pre-wrap">{JSON.stringify(preview, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  async function draft(){
    setBusy(true);
    try {
      const r = await apiRequest("POST", `/api/plan/generate`, { projectId: pid, goLiveISO: new Date(gl).toISOString(), modules: mods.split(",").map(s=>s.trim()).filter(Boolean) });
      const j = await r.json();
      setBusy(false);
      setPreview(j.preview||null);
    } catch (e:any) {
      setBusy(false);
      alert(e.message||"draft failed");
    }
  }
  async function commit(){
    if (!preview) return;
    try {
      await apiRequest("POST", `/api/plan/commit`, { projectId: pid, title, preview });
      alert("Plan created"); 
      setOpen(false); 
      setPreview(null); 
      onCommitted();
    } catch (e:any) {
      alert(e.message||"commit failed");
    }
  }
}

function SuggestFromConversations({ onApply }:{ onApply:(ts:any[])=>void }){
  const pid = getProjectId();
  const [lookback,setLookback]=useState(14);
  const [items,setItems]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs">Lookback</label>
        <input type="number" className="border rounded px-2 py-1 w-20" data-testid="input-lookback" value={lookback} onChange={e=>setLookback(Number(e.target.value||14))}/>
        <button className="text-xs px-2 py-1 border rounded" data-testid="button-fetch-suggestions" onClick={load} disabled={busy}>{busy?"…":"Fetch"}</button>
        {items.length>0 && <button className="text-xs px-2 py-1 border rounded" data-testid="button-apply-all" onClick={()=>onApply(items)}>Apply all</button>}
      </div>
      <ul className="space-y-2 max-h-[52vh] overflow-auto" data-testid="list-suggestions">
        {items.map((t:any,i:number)=>(
          <li key={i} className="p-2 border rounded" data-testid={`item-suggestion-${i}`}>
            <div className="text-sm font-medium">{t.title}</div>
            <div className="text-[11px] opacity-70">{t.module||""} {t.owner?`• ${t.owner}`:""} {t.startAt?`• ${new Date(t.startAt).toLocaleDateString()}`:""} → {t.dueAt?new Date(t.dueAt).toLocaleDateString():""}</div>
            <div className="mt-1 flex items-center gap-2">
              <button className="text-[11px] px-2 py-0.5 border rounded" data-testid={`button-apply-${i}`} onClick={()=>onApply([t])}>Apply</button>
            </div>
          </li>
        ))}
        {!items.length && <li className="text-xs opacity-70" data-testid="text-no-suggestions">No suggestions yet.</li>}
      </ul>
    </div>
  );

  async function load(){
    setBusy(true);
    try {
      const r = await fetch(`/api/conversations?projectId=${encodeURIComponent(pid!)}`);
      const j = await r.json();
      setBusy(false);
      if (!r.ok){ alert(j.error||"load conv failed"); return; }

      const cutoff = Date.now() - lookback*24*3600*1000;
      const rows = (j.items||[]).filter((c:any)=> new Date(c.createdAt).getTime() >= cutoff);
      const ts:any[] = [];
      for (const c of rows) {
        const detail = await fetch(`/api/conversations/${c.id}`); 
        const dj = await detail.json();
        const texts = (dj.messages||[]).map((m:any)=>m.text||"").join("\n");
        const hints = texts.split(/\n/).filter((ln:string)=>/\b(configure|build|integrat(e|ion)|convert|test|cutover|security|role|parallel|payroll|absence|benefit|time)\b/i.test(ln)).slice(0,4);
        for (const h of hints) {
          const t = h.replace(/^\W+/,"").trim();
          if (!t) continue;
          ts.push({ title: t, module: inferModule(t), owner: null, startAt: null, dueAt: null, source:"conversation" });
        }
      }
      const seen = new Set<string>(); const uniq = ts.filter(x=> !seen.has(x.title) && seen.add(x.title));
      setItems(uniq.slice(0,50));
    } catch (e:any) {
      setBusy(false);
      alert(e.message||"load conv failed");
    }
  }

  function inferModule(s:string){ const x=s.toLowerCase();
    if (x.includes("payroll")) return "Payroll";
    if (x.includes("absence")||x.includes("leave")) return "Absence";
    if (x.includes("benefit")) return "Benefits";
    if (x.includes("time")) return "Time";
    if (x.includes("security")) return "Security";
    if (x.includes("integration")) return "Integrations";
    if (x.includes("hcm")) return "HCM";
    return "Custom";
  }
}

function Gantt({ tasks }:{ tasks: Task[] }){
  const dated = tasks.filter(t=> t.startAt || t.dueAt);
  if (!dated.length) return null;

  const dates = dated.flatMap(t=>[t.startAt, t.dueAt].filter(Boolean) as string[]);
  const min = new Date(dates.reduce((a,b)=> a<b ? a : b )).getTime();
  const max = new Date(dates.reduce((a,b)=> a>b ? a : b )).getTime();
  const spanDays = Math.max(1, Math.ceil((max - min) / (24*3600*1000)));
  const dayPx = 6;
  const width = spanDays * dayPx + 200;

  const leftOf = (iso?:string)=> {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    return Math.max(0, Math.round(((t - min) / (24*3600*1000)) * dayPx));
  };
  const lenOf = (s?:string, e?:string)=> {
    const st = s ? new Date(s).getTime() : min;
    const en = e ? new Date(e).getTime() : st;
    const days = Math.max(1, Math.ceil((en - st) / (24*3600*1000)));
    return days * dayPx;
  };

  return (
    <div className="p-3 border rounded-2xl" data-testid="gantt-chart">
      <div className="text-sm font-medium mb-2">Gantt (light)</div>
      <div className="overflow-auto border rounded">
        <div style={{ minWidth: width }} className="relative">
          {dated.map((t,i)=>(
            <div key={t.id} className="flex items-center gap-2 h-6" data-testid={`gantt-row-${t.id}`}>
              <div className="w-48 truncate text-xs px-2">{t.title}</div>
              <div className="flex-1 relative h-3">
                <div className="absolute top-0 h-3 bg-indigo-600/70 rounded"
                     style={{ left: leftOf(t.startAt), width: lenOf(t.startAt, t.dueAt) }} />
              </div>
            </div>
          ))}
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(spanDays)].map((_,d)=>
              <div key={d} className="absolute top-0 bottom-0 border-r border-slate-800" style={{ left: d*dayPx+200 }} />
            )}
          </div>
        </div>
      </div>
      <div className="text-[11px] opacity-60 mt-1">Bars reflect start/due dates. Use Shift buttons to adjust quickly; dependencies are respected by cascade shifts.</div>
    </div>
  );
}
