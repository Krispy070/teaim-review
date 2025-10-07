import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";

export default function MAndAHubPage() {
  const pid = getProjectId();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [cohorts, setCoh] = useState<any[]>([]);
  const [events, setEv] = useState<any[]>([]);
  const [openEvent, setOpenEvent] = useState<any | null>(null);
  const [eventDetail, setEventDetail] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [offOpen, setOffOpen] = useState<{ cohort: any; rows: any[] } | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [cohortSum, setCohortSum] = useState<Record<string, {dueSoon: number; overdue: number; total: number; byStatus: any}>>({});
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [qFilter, setQFilter] = useState("");
  const [cohPage, setCohPage] = useState(0);
  const pageSize = 30;
  const [cohMeta, setCohMeta] = useState<{filtered: number; total: number; limit: number; offset: number} | null>(null);
  const [cohSel,setCohSel]=useState<Record<string,boolean>>({});
  const selectedIds = Object.keys(cohSel).filter(k=>cohSel[k]);
  const [offSel,setOffSel]=useState<Record<string,boolean>>({});
  const offIds = Object.keys(offSel).filter(k=>offSel[k]);
  const [fOwner,setFOwner]=useState("");
  const [fStatus,setFStatus]=useState("");
  const [fDue,setFDue]=useState<""|"soon"|"overdue">("");

  useEffect(() => {
    if (offOpen?.cohort?.id) {
      (async () => {
        const r = await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding/summary?projectId=${encodeURIComponent(pid!)}`);
        const j = await r.json();
        if (r.ok) setSummary(j);
      })();
    } else {
      setSummary(null);
    }
  }, [offOpen?.cohort?.id]);

  async function loadAll() {
    const o = await (await fetchWithAuth(`/api/ma/orgs?projectId=${encodeURIComponent(pid!)}`)).json();
    setOrgs(o.items || []);

    const params = new URLSearchParams({
      projectId: pid!,
      limit: String(pageSize),
      offset: String(cohPage * pageSize)
    });
    if (ownerFilter) params.set("owner", ownerFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (qFilter) params.set("q", qFilter);

    const c = await (await fetchWithAuth(`/api/ma/cohorts?${params.toString()}`)).json();
    setCoh(c.items || []);
    setCohMeta(c.meta || null);

    const e = await (await fetchWithAuth(`/api/ma/separations?projectId=${encodeURIComponent(pid!)}`)).json();
    setEv(e.items || []);

    const s = await fetchWithAuth(`/api/ma/cohorts/offboarding/summaries?projectId=${encodeURIComponent(pid!)}`);
    const js = await s.json();
    if (s.ok) {
      const map: Record<string, any> = {};
      (js.items || []).forEach((it: any) => map[it.cohortId] = it);
      setCohortSum(map);
    }
  }
  useEffect(() => { if (pid) loadAll(); }, [pid, ownerFilter, statusFilter, qFilter, cohPage]);

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">M&A Hub</h1>
          <button className="text-xs px-2 py-1 border rounded" onClick={loadAll} data-testid="button-refresh">Refresh</button>
        </div>

        <section className="p-3 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Organizations / Brands</div>
          <div className="grid md:grid-cols-3 gap-2">
            {orgs.map(o => (
              <div key={o.id} className="p-2 border rounded" data-testid={`card-org-${o.id}`}>
                <div className="text-sm font-medium">{o.name} {o.brand ? `• ${o.brand}` : ""}</div>
                <div className="text-[11px] opacity-70">{o.effectiveStart ? new Date(o.effectiveStart).toLocaleDateString() : ""} {o.parentId ? `• child of ${orgs.find(x => x.id === o.parentId)?.name || o.parentId}` : ""}</div>
              </div>
            ))}
            {!orgs.length && <div className="text-xs opacity-70" data-testid="text-no-orgs">No orgs yet.</div>}
          </div>
          <AddOrg onDone={loadAll} />
        </section>

        <section className="p-3 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Cohorts</div>
          <div className="flex items-center gap-2 mb-2">
            <AddCohort onDone={loadAll} />
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="text-xs" data-testid="input-cohort-file" />
            <button className="text-xs px-2 py-1 border rounded" onClick={async () => {
              const cid = prompt("Cohort ID to import into", ""); const f = fileRef.current?.files?.[0];
              if (!cid || !f) return;
              const fd = new FormData(); fd.append("file", f); fd.append("projectId", pid!);
              const r = await fetchWithAuth(`/api/ma/cohorts/${cid}/offboarding/import`, { method: "POST", body: fd as any });
              const j = await r.json(); if (r.ok) { alert(`Upserts: ${j.upserts}`); fileRef.current!.value = ""; } else alert(j.error || "failed");
              loadAll();
            }} data-testid="button-import-offboarding">Import offboarding</button>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input 
              className="border rounded px-2 py-1 text-sm" 
              placeholder="owner contains…" 
              value={ownerFilter} 
              onChange={e => { setCohPage(0); setOwnerFilter(e.target.value); }}
              data-testid="input-filter-owner" 
            />
            <select 
              className="border rounded px-2 py-1 text-sm" 
              value={statusFilter} 
              onChange={e => { setCohPage(0); setStatusFilter(e.target.value); }}
              data-testid="select-filter-status"
            >
              <option value="">all status</option>
              <option value="planned">planned</option>
              <option value="in_progress">in_progress</option>
              <option value="blocked">blocked</option>
              <option value="done">done</option>
            </select>
            <input 
              className="border rounded px-2 py-1 text-sm" 
              placeholder="search name/type/desc…" 
              value={qFilter} 
              onChange={e => { setCohPage(0); setQFilter(e.target.value); }}
              data-testid="input-filter-search" 
            />

            <a 
              className="text-xs px-2 py-1 border rounded ml-auto"
              href={`/api/ma/cohorts/export.csv?${new URLSearchParams({
                projectId: pid!,
                ...(ownerFilter ? {owner: ownerFilter} : {}),
                ...(statusFilter ? {status: statusFilter} : {}),
                ...(qFilter ? {q: qFilter} : {})
              }).toString()}`}
              data-testid="link-export-cohorts"
            >
              Export CSV (filtered)
            </a>
          </div>

          <div className="flex items-center gap-2 text-[11px] opacity-70 mb-2">
            <span>
              {cohMeta ? `${cohMeta.filtered} filtered of ${cohMeta.total}` : "—"}
            </span>
            <button 
              className="px-2 py-0.5 border rounded" 
              disabled={!cohMeta || cohPage === 0} 
              onClick={() => setCohPage(p => Math.max(0, p - 1))}
              data-testid="button-prev-page"
            >
              Prev
            </button>
            <span>Page {cohPage + 1}</span>
            <button 
              className="px-2 py-0.5 border rounded"
              disabled={!cohMeta || (cohMeta.offset + cohMeta.limit) >= cohMeta.filtered}
              onClick={() => setCohPage(p => p + 1)}
              data-testid="button-next-page"
            >
              Next
            </button>
          </div>

          {cohMeta && (
            <div className="flex items-center gap-2 text-[11px] mb-1">
              <label className="flex items-center gap-1">
                <input type="checkbox" onChange={e=>{
                  const checked=e.target.checked; const next={...cohSel};
                  cohorts.forEach(c=> next[c.id]=checked);
                  setCohSel(next);
                }} data-testid="checkbox-select-all-filtered"/>
                Select all (filtered)
              </label>
              {selectedIds.length>0 && <span>Selected: {selectedIds.length}</span>}
              <button className="px-2 py-0.5 border rounded" onClick={async()=>{
                const owner = prompt("Set owner to:",""); if (owner==null) return;
                await fetchWithAuth(`/api/ma/cohorts/bulk-by-filter`, {
                  method:"POST",
                  body: JSON.stringify({
                    projectId: pid,
                    filter: { ownerContains: ownerFilter||undefined, status: statusFilter||undefined, q: qFilter||undefined },
                    set: { owner }
                  })
                });
                setCohSel({}); loadAll();
              }} data-testid="button-assign-owner-filtered">Assign owner to filtered</button>
            </div>
          )}
          
          {selectedIds.length>0 && (
            <div className="p-2 border rounded-2xl flex items-center gap-2 bg-muted/10 mb-2">
              <span className="text-xs">Selected: {selectedIds.length}</span>
              <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                const owner = prompt("New owner (name/email)",""); if (owner==null) return;
                await fetchWithAuth(`/api/ma/cohorts/bulk`, { method:"POST", body: JSON.stringify({ projectId: pid, ids: selectedIds, set: { owner } }) });
                setCohSel({}); loadAll();
              }} data-testid="button-bulk-set-owner">Set owner…</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                await fetchWithAuth(`/api/ma/cohorts/bulk`, { method:"POST", body: JSON.stringify({ projectId: pid, ids: selectedIds, set: { status: "done" } }) });
                setCohSel({}); loadAll();
              }} data-testid="button-bulk-mark-done">Mark done</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={()=>setCohSel({})} data-testid="button-bulk-clear">Clear</button>
            </div>
          )}
          
          <ul className="space-y-2">
            {cohorts.map(c => (
              <li key={c.id} className="p-2 border rounded" data-testid={`item-cohort-${c.id}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center">
                      <input type="checkbox" className="mr-2"
                             checked={!!cohSel[c.id]} onChange={e=>setCohSel(s=>({ ...s, [c.id]: e.target.checked }))}
                             data-testid={`checkbox-cohort-${c.id}`}/>
                      <div><span className="font-medium">{c.name}</span> <span className="text-[11px] opacity-70">({c.type})</span></div>
                    </div>
                    
                    <CohortInlineEdit cohort={c} onSaved={loadAll} />
                    
                    <div className="text-[11px] opacity-90 mt-1">
                      {cohortSum[c.id] ? (
                        <>
                          <span className="px-1.5 py-0.5 border rounded mr-1" data-testid={`chip-total-${c.id}`}>total {cohortSum[c.id].total}</span>
                          <span className="px-1.5 py-0.5 border rounded border-amber-600 text-amber-300 mr-1" data-testid={`chip-due-soon-${c.id}`}>due soon {cohortSum[c.id].dueSoon}</span>
                          <span className="px-1.5 py-0.5 border rounded border-red-600 text-red-300" data-testid={`chip-overdue-${c.id}`}>overdue {cohortSum[c.id].overdue}</span>
                        </>
                      ) : (
                        <span className="skeleton-chip" style={{ width: 120 }} />
                      )}
                    </div>
                  </div>
                <div className="flex items-center gap-2">
                  <a className="text-xs px-2 py-1 border rounded"
                     href={`/api/ma/cohorts/${c.id}/offboarding/template.csv?projectId=${encodeURIComponent(pid!)}`}
                     data-testid={`link-template-${c.id}`}>
                     Template
                  </a>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async () => {
                    const r = await fetchWithAuth(`/api/ma/cohorts/${c.id}/offboarding?projectId=${encodeURIComponent(pid!)}`); const j = await r.json();
                    if (r.ok) { setOffOpen({ cohort: c, rows: j.items || [] }); } else alert(j.error || "failed");
                  }} data-testid={`button-view-${c.id}`}>Manage</button>
                  <a className="text-xs px-2 py-1 border rounded"
                     href={`/api/ma/cohorts/${c.id}/offboarding.csv?projectId=${encodeURIComponent(pid!)}`}
                     data-testid={`link-export-${c.id}`}>
                     Export
                  </a>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const cat = prompt("Channel category (onboarding|plan|release|alerts|announcements)", "plan") || "plan";
                    const lim = prompt("Limit items (1-30)", "30") || "30";
                    const r = await fetchWithAuth(`/api/ma/cohorts/${c.id}/offboarding/post-checklist`, {
                      method:"POST", body: JSON.stringify({ projectId: pid, category: cat, limit: Number(lim) })
                    });
                    const j=await r.json();
                    if (r.ok) alert(`Posted ${j.posted} item(s) to ${cat} channel.`); else alert(j.error||"failed");
                  }} data-testid={`button-post-checklist-${c.id}`}>Post checklist</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async () => {
                    const title = prompt("Separation title", "Divestiture Event"); if (!title) return;
                    const r = await fetchWithAuth(`/api/ma/separations/create`, { method: "POST", body: JSON.stringify({ projectId: pid, cohortId: c.id, title, type: c.type === 'restructure' ? 'restructure' : 'divestiture' }) });
                    const j = await r.json(); if (r.ok) { await fetchWithAuth(`/api/ma/separations/${j.id}/generate`, { method: "POST", body: JSON.stringify({ projectId: pid, pushToPlan: true }) }); loadAll(); alert("Event created & tasks generated."); } else alert(j.error || "failed");
                  }} data-testid={`button-create-separation-${c.id}`}>Create separation event</button>
                </div>
                </div>
              </li>
            ))}
            {!cohorts.length && <li className="text-xs opacity-70" data-testid="text-no-cohorts">No cohorts yet.</li>}
          </ul>
        </section>

        <section className="p-3 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Separation Events</div>
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.id} className="p-2 border rounded flex items-center justify-between" data-testid={`item-event-${e.id}`}>
                <div><span className="font-medium">{e.title}</span> <span className="text-[11px] opacity-70">({e.type})</span> {e.scheduledAt ? `• ${new Date(e.scheduledAt).toLocaleString()}` : ""} • {e.status}</div>
                <div className="flex items-center gap-2">
                  <button className="text-xs px-2 py-1 border rounded" onClick={async () => {
                    const r = await fetchWithAuth(`/api/ma/separations/${e.id}/detail?projectId=${encodeURIComponent(pid!)}`); 
                    const j = await r.json();
                    if (r.ok) { setOpenEvent(e); setEventDetail(j); } else alert(j.error || "load failed");
                  }} data-testid={`button-open-event-${e.id}`}>Open</button>
                  <a className="text-xs px-2 py-1 border rounded" href={`/api/ma/separations/${e.id}/export.zip?projectId=${encodeURIComponent(pid!)}`} data-testid={`link-export-event-${e.id}`}>Export</a>
                </div>
              </li>
            ))}
            {!events.length && <li className="text-xs opacity-70" data-testid="text-no-events">No events yet.</li>}
          </ul>
        </section>

        {/* Event Drawer */}
        {openEvent && eventDetail && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60" onClick={() => { setOpenEvent(null); setEventDetail(null); }} />
            <div className="absolute right-0 top-0 h-full w-[560px] bg-background border-l p-4 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-semibold">{eventDetail.event.title}</div>
                <button className="text-xs px-2 py-1 border rounded" onClick={() => { setOpenEvent(null); setEventDetail(null); }} data-testid="button-close-drawer">Close</button>
              </div>
              <div className="text-xs opacity-70 mb-2">{eventDetail.event.type} • {eventDetail.event.scheduledAt ? new Date(eventDetail.event.scheduledAt).toLocaleString() : "(unscheduled)"} • Cohort: {eventDetail.cohort?.name || "—"}</div>

              <div className="flex items-center gap-2 mb-3">
                <select className="border rounded px-2 py-1 text-sm" defaultValue={eventDetail.event.status} onChange={async e => {
                  await fetchWithAuth(`/api/ma/separations/${eventDetail.event.id}/status`, { method: "POST", body: JSON.stringify({ projectId: pid, status: e.target.value }) });
                  const r = await fetchWithAuth(`/api/ma/separations/${eventDetail.event.id}/detail?projectId=${encodeURIComponent(pid!)}`); 
                  const j = await r.json(); 
                  setEventDetail(j);
                }} data-testid="select-event-status">
                  <option>planned</option>
                  <option>in_progress</option>
                  <option>done</option>
                </select>
                <a className="text-xs px-2 py-1 border rounded" href={`/api/ma/separations/${eventDetail.event.id}/export.zip?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-packet">Export packet</a>
                <button className="text-xs px-2 py-1 border rounded"
                  onClick={async()=>{
                    const cat = prompt("Post to category (onboarding|plan|release|alerts|announcements)", "plan") || "plan";
                    const r = await fetchWithAuth(`/api/ma/separations/${eventDetail.event.id}/post-checklist`, {
                      method:"POST",
                      body: JSON.stringify({ projectId: pid, category: cat })
                    });
                    const j = await r.json();
                    if (r.ok) alert(`Posted ${j.count} task(s) to ${cat} channel.`); else alert(j.error||"failed");
                  }}
                  data-testid="button-post-checklist">
                  Post checklist to channel
                </button>
              </div>

              <TaskEditor eventId={eventDetail.event.id} items={eventDetail.tasks} onChanged={async () => {
                const r = await fetchWithAuth(`/api/ma/separations/${eventDetail.event.id}/detail?projectId=${encodeURIComponent(pid!)}`); 
                const j = await r.json(); 
                setEventDetail(j);
              }} />
            </div>
          </div>
        )}

        {/* Offboarding Drawer */}
        {offOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOffOpen(null)} />
            <div className="absolute right-0 top-0 h-full w-[720px] bg-background border-l p-4 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-semibold">Offboarding — {offOpen.cohort.name}</div>
                <button className="text-xs px-2 py-1 border rounded" onClick={() => setOffOpen(null)} data-testid="button-close-offboarding">Close</button>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <button className="text-xs px-2 py-1 border rounded" onClick={async () => {
                  await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding/post-summary`, {
                    method: "POST", body: JSON.stringify({ projectId: pid, category: "plan" })
                  });
                  alert("Posted summary to channel.");
                }} data-testid="button-post-summary">Post summary</button>

                <a className="text-xs px-2 py-1 border rounded"
                   href={`/api/ma/cohorts/${offOpen.cohort.id}/offboarding.csv?projectId=${encodeURIComponent(pid!)}`}
                   data-testid="link-export-offboarding-csv">
                  Export CSV
                </a>
                <a className="text-xs px-2 py-1 border rounded"
                   href={`/api/ma/cohorts/${offOpen.cohort.id}/offboarding/export_filtered.csv?` + new URLSearchParams({
                     projectId: pid!, ...(fOwner?{owner:fOwner}:{}) , ...(fStatus?{status:fStatus}:{}) , ...(fDue?{due:fDue}:{})
                   }).toString()}
                   data-testid="link-export-offboarding-filtered">
                  Export CSV (filtered)
                </a>
              </div>

              {summary && (
                <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
                  <span className="px-1.5 py-0.5 border rounded" data-testid="chip-planned">planned {summary.byStatus.planned}</span>
                  <span className="px-1.5 py-0.5 border rounded" data-testid="chip-in-progress">in_progress {summary.byStatus.in_progress}</span>
                  <span className="px-1.5 py-0.5 border rounded" data-testid="chip-blocked">blocked {summary.byStatus.blocked}</span>
                  <span className="px-1.5 py-0.5 border rounded" data-testid="chip-done">done {summary.byStatus.done}</span>
                  <span className="px-1.5 py-0.5 border rounded border-amber-600 text-amber-300" data-testid="chip-due-soon">due soon {summary.dueSoon}</span>
                  <span className="px-1.5 py-0.5 border rounded border-red-600 text-red-300" data-testid="chip-overdue">overdue {summary.overdue}</span>
                  <span className="px-1.5 py-0.5 border rounded opacity-70" data-testid="chip-total">total {summary.total}</span>
                </div>
              )}

              {/* Filters row */}
              <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px]">
                <input className="border rounded px-2 py-1" placeholder="owner contains…" value={fOwner} onChange={e=>setFOwner(e.target.value)} data-testid="input-filter-owner-off" />
                <select className="border rounded px-2 py-1" value={fStatus} onChange={e=>setFStatus(e.target.value)} data-testid="select-filter-status-off">
                  <option value="">all status</option><option>planned</option><option>in_progress</option><option>blocked</option><option>done</option>
                </select>
                <select className="border rounded px-2 py-1" value={fDue} onChange={e=>setFDue(e.target.value as any)} data-testid="select-filter-due-off">
                  <option value="">due: all</option><option value="soon">due soon (7d)</option><option value="overdue">overdue</option>
                </select>

                {/* Assign owner to filtered */}
                <button className="px-2 py-0.5 border rounded" onClick={async()=>{
                  const owner = prompt("Set owner to:",""); if (owner==null) return;
                  await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding/bulk-by-filter`, {
                    method:"POST",
                    body: JSON.stringify({
                      projectId: pid,
                      filter: {
                        ownerContains: fOwner || undefined,
                        status: fStatus || undefined,
                        overdue: fDue==="overdue" ? true : undefined,
                        dueWithinDays: fDue==="soon" ? 7 : undefined
                      },
                      set: { owner }
                    })
                  });
                  const rr=await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding?projectId=${encodeURIComponent(pid!)}`); const jj=await rr.json();
                  setOffOpen({ cohort: offOpen.cohort, rows: jj.items||[] });
                }} data-testid="button-assign-owner-filtered">Assign owner to filtered</button>
              </div>

              {offIds.length>0 && (
                <div className="p-2 border rounded-2xl flex items-center gap-2 bg-muted/10 mb-2">
                  <span className="text-xs">Selected: {offIds.length}</span>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const owner = prompt("Set owner to:",""); if (owner==null) return;
                    await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding/bulk`, {
                      method:"POST", body: JSON.stringify({ projectId: pid, ids: offIds, set:{ owner } })
                    });
                    setOffSel({}); const rr=await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding?projectId=${encodeURIComponent(pid!)}`); const jj=await rr.json();
                    setOffOpen({ cohort: offOpen.cohort, rows: jj.items||[] });
                  }} data-testid="button-bulk-set-owner-off">Set owner…</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding/bulk`, {
                      method:"POST", body: JSON.stringify({ projectId: pid, ids: offIds, set:{ status: "done" } })
                    });
                    setOffSel({}); const rr=await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding?projectId=${encodeURIComponent(pid!)}`); const jj=await rr.json();
                    setOffOpen({ cohort: offOpen.cohort, rows: jj.items||[] });
                  }} data-testid="button-bulk-mark-done-off">Mark done</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={()=>setOffSel({})} data-testid="button-bulk-clear-off">Clear</button>
                </div>
              )}

              {/* Select-all checkbox */}
              <div className="flex items-center gap-2 mb-1">
                <label className="text-[11px] flex items-center gap-1">
                  <input type="checkbox" onChange={e=>{
                    const passes = (r:any)=>{
                      if (fOwner && !(String(r.owner||"").toLowerCase().includes(fOwner.toLowerCase()))) return false;
                      if (fStatus && r.status!==fStatus) return false;
                      const due = r.terminateDate || r.lastDay ? new Date(r.terminateDate || r.lastDay).getTime() : null;
                      if (fDue==="soon" && !(due && due>=Date.now() && due <= Date.now()+7*24*3600*1000 && r.status!=="done")) return false;
                      if (fDue==="overdue" && !(due && due<Date.now() && r.status!=="done")) return false;
                      return true;
                    };
                    const vis = offOpen.rows.filter(passes);
                    const checked = e.target.checked;
                    setOffSel(s=>{
                      const next:{[k:string]:boolean}={...s};
                      vis.forEach(r=> next[r.id]=checked);
                      return next;
                    });
                  }} data-testid="checkbox-select-all-filtered"/>
                  Select all (filtered)
                </label>
              </div>

              <div className="border rounded-2xl overflow-auto">
                <table className="text-sm min-w-[1000px] w-full">
                  <thead className="bg-slate-900/40 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1"></th>
                      <th className="text-left px-2 py-1">Ext ID</th>
                      <th className="text-left px-2 py-1">Name</th>
                      <th className="text-left px-2 py-1">Email</th>
                      <th className="text-left px-2 py-1">Org Unit</th>
                      <th className="text-left px-2 py-1">Last day</th>
                      <th className="text-left px-2 py-1">Terminate</th>
                      <th className="text-left px-2 py-1">Owner</th>
                      <th className="text-left px-2 py-1">Status</th>
                      <th className="text-left px-2 py-1">Notes</th>
                      <th className="text-left px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {offOpen.rows.filter((r:any)=>{
                      if (fOwner && !(String(r.owner||"").toLowerCase().includes(fOwner.toLowerCase()))) return false;
                      if (fStatus && r.status!==fStatus) return false;
                      const due = r.terminateDate || r.lastDay ? new Date(r.terminateDate || r.lastDay).getTime() : null;
                      if (fDue==="soon" && !(due && due>=Date.now() && due <= Date.now()+7*24*3600*1000 && r.status!=="done")) return false;
                      if (fDue==="overdue" && !(due && due<Date.now() && r.status!=="done")) return false;
                      return true;
                    }).map((r: any) => (
                      <tr key={r.id} className="border-b border-slate-800">
                        <td className="px-2 py-1">
                          <input type="checkbox" checked={!!offSel[r.id]} onChange={e=>setOffSel(s=>({ ...s, [r.id]: e.target.checked }))} data-testid={`checkbox-off-${r.id}`}/>
                        </td>
                        <OffRow row={r} cohortId={offOpen.cohort.id} onSaved={async () => {
                          const rr = await fetchWithAuth(`/api/ma/cohorts/${offOpen.cohort.id}/offboarding?projectId=${encodeURIComponent(pid!)}`); const jj = await rr.json();
                          setOffOpen({ cohort: offOpen.cohort, rows: jj.items || [] });
                        }} />
                      </tr>
                    ))}
                    {!offOpen.rows.length && <tr><td className="px-2 py-2 text-xs opacity-70" colSpan={11}>No rows yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppFrame>
  );
}

function AddOrg({ onDone }: { onDone: () => void }) {
  const pid = getProjectId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [brand, setBrand] = useState(""); const [parent, setParent] = useState(""); const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  async function save() {
    await fetchWithAuth(`/api/ma/orgs/upsert`, { method: "POST", body: JSON.stringify({ projectId: pid, name, brand: brand || null, parentId: parent || null, effectiveStart: start ? new Date(start).toISOString() : null, effectiveEnd: end ? new Date(end).toISOString() : null }) });
    setOpen(false); setName(""); setBrand(""); setParent(""); setStart(""); setEnd(""); onDone();
  }
  return (
    <>
      <button className="text-xs px-2 py-1 border rounded mt-2" onClick={() => setOpen(true)} data-testid="button-add-org">Add org</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(520px,92vw)] bg-background border rounded-2xl p-4 space-y-2">
            <div className="text-sm font-medium">Add Organization</div>
            <input className="border rounded px-2 py-1 w-full" placeholder="Name" value={name} onChange={e => setName(e.target.value)} data-testid="input-org-name" />
            <input className="border rounded px-2 py-1 w-full" placeholder="Brand (optional)" value={brand} onChange={e => setBrand(e.target.value)} data-testid="input-org-brand" />
            <input className="border rounded px-2 py-1 w-full" placeholder="Parent org ID (optional)" value={parent} onChange={e => setParent(e.target.value)} data-testid="input-org-parent" />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="border rounded px-2 py-1" value={start} onChange={e => setStart(e.target.value)} data-testid="input-org-start" />
              <input type="date" className="border rounded px-2 py-1" value={end} onChange={e => setEnd(e.target.value)} data-testid="input-org-end" />
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded" onClick={save} data-testid="button-save-org">Save</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={() => setOpen(false)} data-testid="button-cancel-org">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddCohort({ onDone }: { onDone: () => void }) {
  const pid = getProjectId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("divestiture");
  const [desc, setDesc] = useState("");

  async function save() {
    await fetchWithAuth(`/api/ma/cohorts/create`, { method: "POST", body: JSON.stringify({ projectId: pid, name, type, description: desc || null }) });
    setOpen(false); setName(""); setType("divestiture"); setDesc(""); onDone();
  }
  return (
    <>
      <button className="text-xs px-2 py-1 border rounded" onClick={() => setOpen(true)} data-testid="button-add-cohort">New cohort…</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(520px,92vw)] bg-background border rounded-2xl p-4 space-y-2">
            <div className="text-sm font-medium">Create Cohort</div>
            <input className="border rounded px-2 py-1 w-full" placeholder="Cohort name" value={name} onChange={e => setName(e.target.value)} data-testid="input-cohort-name" />
            <select className="border rounded px-2 py-1 w-full" value={type} onChange={e => setType(e.target.value)} data-testid="select-cohort-type">
              <option value="divestiture">Divestiture</option>
              <option value="offboarding">Offboarding</option>
              <option value="restructure">Restructure</option>
            </select>
            <textarea className="border rounded px-2 py-1 w-full" placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} data-testid="textarea-cohort-desc" />
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded" onClick={save} data-testid="button-save-cohort">Create</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={() => setOpen(false)} data-testid="button-cancel-cohort">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TaskEditor({ eventId, items, onChanged }: { eventId: string; items: any[]; onChanged: () => void }) {
  const pid = getProjectId();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");

  async function add() {
    if (!title.trim()) return;
    await fetchWithAuth(`/api/ma/separations/${eventId}/task/upsert`, {
      method: "POST",
      body: JSON.stringify({ projectId: pid, title, owner: owner || null, dueAt: due ? new Date(due).toISOString() : null })
    });
    setTitle(""); setOwner(""); setDue(""); onChanged();
  }

  return (
    <div>
      <div className="text-sm font-medium mb-1">Tasks</div>
      <div className="grid md:grid-cols-3 gap-2 mb-2">
        <input className="border rounded px-2 py-1 md:col-span-2" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} data-testid="input-task-title" />
        <input className="border rounded px-2 py-1" placeholder="Owner" value={owner} onChange={e => setOwner(e.target.value)} data-testid="input-task-owner" />
        <input type="date" className="border rounded px-2 py-1" value={due} onChange={e => setDue(e.target.value)} data-testid="input-task-due" />
        <button className="text-xs px-2 py-1 border rounded" onClick={add} data-testid="button-add-task">Add</button>
      </div>
      <ul className="space-y-1">
        {items.map(t => (
          <li key={t.id} className="p-2 border rounded" data-testid={`item-task-${t.id}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm">{t.title}</div>
              <div className="text-[11px] opacity-70">{t.owner || "—"} {t.dueAt ? `• ${new Date(t.dueAt).toLocaleDateString()}` : ""} • {t.status}</div>
            </div>
          </li>
        ))}
        {!items.length && <li className="text-xs opacity-70" data-testid="text-no-tasks">No tasks yet.</li>}
      </ul>
    </div>
  );
}

function CohortInlineEdit({ cohort, onSaved }: { cohort: any; onSaved: () => void }) {
  const pid = getProjectId();
  const [owner, setOwner] = useState(cohort.owner || "");
  const [status, setStatus] = useState(cohort.status || "in_progress");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    const r = await fetchWithAuth(`/api/ma/cohorts/upsert`, {
      method: "POST",
      body: JSON.stringify({ projectId: pid, id: cohort.id, owner: owner || null, status })
    });
    setSaving(false);
    if (r.ok) onSaved(); else alert("Save failed");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] mt-1">
      <label className="opacity-70">Owner</label>
      <input className="border rounded px-2 py-0.5 text-xs w-44" value={owner} onChange={e => setOwner(e.target.value)} onBlur={save} data-testid={`input-cohort-owner-${cohort.id}`} />

      <label className="opacity-70">Status</label>
      <select className="border rounded px-2 py-0.5 text-xs" value={status} onChange={e => setStatus(e.target.value)} onBlur={save} data-testid={`select-cohort-status-${cohort.id}`}>
        <option value="planned">planned</option>
        <option value="in_progress">in_progress</option>
        <option value="blocked">blocked</option>
        <option value="done">done</option>
      </select>

      <button className="px-2 py-0.5 border rounded" onClick={save} disabled={saving} data-testid={`button-save-cohort-${cohort.id}`}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function OffRow({ row, cohortId, onSaved }: { row: any; cohortId: string; onSaved: () => void }) {
  const pid = getProjectId();
  const [owner, setOwner] = useState(row.owner || "");
  const [status, setStatus] = useState(row.status || "planned");
  const [notes, setNotes] = useState(row.notes || "");
  const [last, setLast] = useState(row.lastDay ? String(row.lastDay).slice(0, 10) : "");
  const [term, setTerm] = useState(row.terminateDate ? String(row.terminateDate).slice(0, 10) : "");

  const emoji = status === "done" ? "✅" : status === "blocked" ? "⛔" : status === "in_progress" ? "🔵" : "☐";

  function dueBadge(r:any){
    const dueISO = r.terminateDate || r.lastDay; if (!dueISO) return null;
    const due = new Date(dueISO).getTime(), now = Date.now();
    const d = Math.ceil((due - now)/(24*3600*1000));
    let cls="border-slate-600", txt=`in ${d}d`;
    if (d < 0){ cls="border-red-600 text-red-300"; txt=`${Math.abs(d)}d overdue`; }
    else if (d <= 7){ cls="border-amber-600 text-amber-300"; }
    else { cls="border-emerald-600 text-emerald-300"; }
    return <span className={`text-[11px] px-1.5 py-0.5 border rounded ${cls}`}>{txt}</span>;
  }

  return (
    <>
      <td className="px-2 py-1">{row.externalId || "—"}</td>
      <td className="px-2 py-1">{row.name || "—"}</td>
      <td className="px-2 py-1">{row.email || "—"}</td>
      <td className="px-2 py-1">{row.orgUnit || "—"}</td>
      <td className="px-2 py-1">
        <input type="date" className="border rounded px-2 py-1 text-xs" value={last} onChange={e => setLast(e.target.value)} data-testid={`input-last-day-${row.id}`} />
        {dueBadge(row)}
        <div className="mt-1 flex items-center gap-1">
          <button className="text-[10px] px-1 py-0.5 border rounded" onClick={async()=>{
            await fetchWithAuth(`/api/ma/offboarding/${row.id}/bump`, { method:"POST", body: JSON.stringify({ projectId: pid, days: 1 })});
            onSaved();
          }} data-testid={`button-bump-1d-${row.id}`}>+1d</button>
          <button className="text-[10px] px-1 py-0.5 border rounded" onClick={async()=>{
            await fetchWithAuth(`/api/ma/offboarding/${row.id}/bump`, { method:"POST", body: JSON.stringify({ projectId: pid, days: 7 })});
            onSaved();
          }} data-testid={`button-bump-7d-${row.id}`}>+7d</button>
        </div>
      </td>
      <td className="px-2 py-1"><input type="date" className="border rounded px-2 py-1 text-xs" value={term} onChange={e => setTerm(e.target.value)} data-testid={`input-terminate-${row.id}`} /></td>
      <td className="px-2 py-1"><input className="border rounded px-2 py-1 text-xs w-40" value={owner} onChange={e => setOwner(e.target.value)} data-testid={`input-owner-${row.id}`} /></td>
      <td className="px-2 py-1">
        <select className="border rounded px-2 py-1 text-xs" value={status} onChange={e => setStatus(e.target.value)} data-testid={`select-status-${row.id}`}>
          <option>planned</option><option>in_progress</option><option>blocked</option><option>done</option>
        </select>
        <span className="ml-1">{emoji}</span>
      </td>
      <td className="px-2 py-1"><input className="border rounded px-2 py-1 text-xs w-56" value={notes} onChange={e => setNotes(e.target.value)} data-testid={`input-notes-${row.id}`} /></td>
      <td className="px-2 py-1">
        <button className="text-[11px] px-2 py-0.5 border rounded" onClick={async () => {
          await fetchWithAuth(`/api/ma/cohorts/${cohortId}/offboarding/upsert`, {
            method: "POST",
            body: JSON.stringify({
              projectId: pid, id: row.id,
              owner: owner || null, status, notes: notes || null,
              lastDay: last ? new Date(last).toISOString() : null,
              terminateDate: term ? new Date(term).toISOString() : null
            })
          });
          onSaved();
        }} data-testid={`button-save-${row.id}`}>Save</button>
      </td>
    </>
  );
}
