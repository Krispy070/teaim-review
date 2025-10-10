import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { ensureProjectPath } from "@/lib/project";
import MemoryPrompt from "@/components/MemoryPrompt";
import { useMemoryPrompts } from "@/hooks/useMemoryPrompts";
import type { MemoryRecommendation } from "@shared/memory";
import { useEffect, useMemo, useRef, useState } from "react";

function badge(value:number, label:string, tone:"ok"|"warn"|"err"="ok"){
  const cls = tone==="ok" ? "border-emerald-600 text-emerald-300"
           : tone==="warn" ? "border-amber-600 text-amber-300"
                           : "border-red-600 text-red-300";
  return <span className={`text-[11px] px-1.5 py-0.5 border rounded-full ${cls}`}>{label}: {value}</span>;
}

export default function ReleaseManagerPage(){
  const pid = getProjectId();
  const [items,setItems]=useState<any[]>([]);
  const [msg,setMsg]=useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [code,setCode]=useState("R1");
  const [year,setYear]=useState<number>(new Date().getUTCFullYear());
  const [open,setOpen]=useState<any|null>(null);
  const [sum,setSum]=useState<any|null>(null);
  const [hist,setHist]=useState<any[]>([]);
  const [selMod,setSelMod]=useState<string>("");
  const [sumCache,setSumCache]=useState<Record<string, any>>({});
  const [decisionNotes,setDecisionNotes]=useState("");
  const [meEmail,setMeEmail]=useState<string>("");
  const memory = useMemoryPrompts(pid, "release");

  const memorySlot = useMemo(() => {
    if (!memory.featureEnabled || !memory.prompts.length) return null;
    return (
      <div className="flex w-full flex-col gap-3 lg:max-w-xs">
        {memory.prompts.map((prompt: MemoryRecommendation) => (
          <MemoryPrompt
            key={prompt.id}
            title={prompt.title}
            text={prompt.text}
            confidence={prompt.confidence ?? undefined}
            onApply={() => memory.applyPrompt(prompt)}
            onDismiss={() => memory.dismissPrompt(prompt)}
          />
        ))}
      </div>
    );
  }, [memory.applyPrompt, memory.dismissPrompt, memory.featureEnabled, memory.prompts]);

  async function loadSummary(relId:string){
    if (sumCache[relId]) return sumCache[relId];
    const r = await fetchWithAuth(`/api/releases/${relId}/tests/summary?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json();
    if (r.ok){
      setSumCache(c=>({ ...c, [relId]: j }));
      return j;
    } else {
      alert(j.error||"Failed loading summary");
      return null;
    }
  }

  async function load(){
    const r=await fetchWithAuth(`/api/release-manager?projectId=${encodeURIComponent(pid!)}`); const j=await r.json();
    if (r.ok) { setItems(j.items||[]); setMsg(""); } else setMsg(j.error||"load failed");
  }
  useEffect(()=>{ load(); },[]);

  useEffect(()=>{ (async()=>{
    try{ const r=await fetchWithAuth(`/api/me`); const j=await r.json(); if (r.ok){ setMeEmail(j.email||""); } }catch{}
  })(); },[]); 

  async function importExcel(){
    const f = fileRef.current?.files?.[0]; if (!f){ setMsg("Pick an Excel file"); return; }
    const fd = new FormData(); fd.append("file", f);
    fd.append("projectId", pid!); fd.append("code", code); fd.append("year", String(year));
    const r=await fetchWithAuth(`/api/release-manager/import`, { method:"POST", body: fd as any }); const j=await r.json();
    if (r.ok) { alert(`Imported ${j.changes} changes`); load(); fileRef.current!.value=""; } else setMsg(j.error||"import failed");
  }

  async function openRelease(rel:any){
    const s = await fetchWithAuth(`/api/releases/${rel.id}/tests/summary?projectId=${encodeURIComponent(pid!)}`); const sj = await s.json();
    const h = await fetchWithAuth(`/api/releases/${rel.id}/signoff/history?projectId=${encodeURIComponent(pid!)}`); const hj = await h.json();
    setOpen(rel); setSum(sj); setHist(hj.items||[]); setSelMod("");
  }

  return (
    
      <div className="p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Releases (R1/R2)</h1>
              <div className="flex items-center gap-2">
                <select className="border rounded px-2 py-1 text-sm" value={code} onChange={e=>setCode(e.target.value)} data-testid="select-release-code">
                  <option value="R1">R1</option><option value="R2">R2</option><option value="hotfix">hotfix</option>
                </select>
                <input type="number" className="border rounded px-2 py-1 text-sm w-24" value={year} onChange={e=>setYear(Number(e.target.value||year))} data-testid="input-release-year"/>
                <input type="file" ref={fileRef} accept=".xlsx,.xls" className="text-xs" data-testid="input-file"/>
                <button className="text-xs px-2 py-1 border rounded" onClick={importExcel} data-testid="button-import">Import</button>
              </div>
            </div>
            <div className="text-xs opacity-70" data-testid="text-message">{msg}</div>
          </div>
          {memorySlot}
        </div>

        <div className="space-y-2">
          {items.map(r=>(
            <div key={r.id} className="p-3 border rounded-2xl" data-testid={`card-release-${r.id}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{r.code} {r.year} — {r.title||"Release"} <span className="text-[11px] opacity-70">({r.status})</span></div>
                <div className="flex items-center gap-2">
                  <button className="text-xs px-2 py-1 border rounded" onClick={()=>openRelease(r)} data-testid={`button-open-${r.id}`}>Open</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const ok = confirm("Analyze impact now?"); if(!ok) return;
                    const rr = await fetchWithAuth(`/api/release-manager/${r.id}/analyze`, { method:"POST", body: JSON.stringify({ projectId: pid }) }); const jj=await rr.json();
                    if (rr.ok) alert(`Updated ${jj.updated} change(s)`); else alert(jj.error||"analyze failed");
                    load();
                  }} data-testid={`button-analyze-${r.id}`}>Analyze</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const rr = await fetchWithAuth(`/api/release-manager/${r.id}/testpack`, { method:"POST", body: JSON.stringify({ projectId: pid }) }); const jj=await rr.json();
                    if (rr.ok) alert(`Created ${jj.created} test(s)`); else alert(jj.error||"test pack failed");
                    load();
                  }} data-testid={`button-testpack-${r.id}`}>Generate tests</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const transcript = prompt("Paste transcript text:","");
                    if (!transcript) return;
                    const rr = await fetchWithAuth(`/api/release-manager/${r.id}/transcript-to-tests`, { method:"POST", body: JSON.stringify({ projectId: pid, transcript }) }); const jj=await rr.json();
                    if (rr.ok) alert(`Extracted ${jj.created} test(s) from transcript`); else alert(jj.error||"extraction failed");
                    load();
                  }} data-testid={`button-transcript-tests-${r.id}`}>Transcript → Tests</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const when = prompt("Review date (YYYY-MM-DD)",""); const link = prompt("Meeting link (optional)","");
                    const wISO = when ? new Date(when).toISOString() : null;
                    const rr = await fetchWithAuth(`/api/release-manager/${r.id}/review`, { method:"POST", body: JSON.stringify({ projectId: pid, whenISO: wISO, link }) }); const jj=await rr.json();
                    if (rr.ok) alert("Review scheduled.\n\nBrief:\n"+jj.brief); else alert(jj.error||"review failed");
                    load();
                  }} data-testid={`button-review-${r.id}`}>Schedule review</button>
                </div>
              </div>

              {/* Inline summary chips (lazy) */}
              <div className="text-[11px] opacity-90 mt-1" id={`req-${r.id}`}>
                {!sumCache[r.id] ? (
                  <button className="text-[11px] px-2 py-0.5 border rounded"
                    onClick={async()=>{
                      const s = await loadSummary(r.id);
                      if (!s) return;
                    }} data-testid={`button-load-modules-${r.id}`}>
                    Load modules
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Gate chip */}
                    {sumCache[r.id].gate?.ready
                      ? <span className="px-1.5 py-0.5 border rounded-full border-emerald-600 text-emerald-300" data-testid={`chip-gate-ready-${r.id}`}>Req {sumCache[r.id].gate.passed}/{sumCache[r.id].gate.required} ✓</span>
                      : <span className="px-1.5 py-0.5 border rounded-full border-amber-600 text-amber-300" data-testid={`chip-gate-pending-${r.id}`}>Req {sumCache[r.id].gate.passed}/{sumCache[r.id].gate.required}</span>}
                    {/* Per-module quick filters */}
                    {sumCache[r.id].modules?.slice(0,12).map((m:any)=>(
                      <a key={m.module||"Custom"}
                         className="px-1.5 py-0.5 border rounded hover:bg-slate-800"
                         title={`✓${m.passed||0} ✗${m.failed||0} ⛔${m.blocked||0} …${m.in_progress||0} • Req ${m.req_passed||0}/${m.req_total||0}`}
                         href={ensureProjectPath(`/releases/${r.id}/tests?module=${encodeURIComponent(m.module||"Custom")}`)}
                         data-testid={`link-module-${r.id}-${m.module||"Custom"}`}>
                        {m.module || "Custom"} ({m.passed||0}/{m.total||0})
                      </a>
                    ))}
                    {sumCache[r.id].modules?.length>12 && <span className="opacity-60" data-testid={`text-more-modules-${r.id}`}>+{sumCache[r.id].modules.length-12} more</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!items.length && <div className="text-xs opacity-70">No releases yet.</div>}
        </div>

        {/* Release Drawer */}
        {open && sum && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60" onClick={()=>{ setOpen(null); setSum(null); setHist([]); }} />
            <div className="absolute right-0 top-0 h-full w-[620px] bg-background border-l p-4 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-semibold">Release {open.code} {open.year}</div>
                <button className="text-xs px-2 py-1 border rounded" onClick={()=>{ setOpen(null); setSum(null); setHist([]); }} data-testid="button-close-drawer">Close</button>
              </div>

              {/* Gate chip */}
              <div className="mb-2">
                {sum.gate?.ready
                  ? <span className="text-[12px] px-2 py-1 border rounded border-emerald-600 text-emerald-300">✅ Gate ready — required {sum.gate.passed}/{sum.gate.required}</span>
                  : <span className="text-[12px] px-2 py-1 border rounded border-amber-600 text-amber-300">⏳ Required {sum.gate?.passed || 0}/{sum.gate?.required || 0}</span>}
              </div>

              {/* Module filter */}
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs">Filter module</label>
                <select className="border rounded px-2 py-1 text-sm" value={selMod} onChange={e=>setSelMod(e.target.value)} data-testid="select-module-filter">
                  <option value="">(all)</option>
                  {sum.modules?.map((m:any)=> <option key={m.module} value={m.module}>{m.module || "Custom"}</option>)}
                </select>
                {!!selMod && (
                  <a className="text-xs px-2 py-1 border rounded"
                     href={ensureProjectPath(`/releases/${open.id}/tests?module=${encodeURIComponent(selMod)}`)} data-testid="link-filtered-tests">
                     Open tests (filtered)
                  </a>
                )}
              </div>

              {/* Module cards */}
              <div className="flex flex-wrap gap-2 mb-3">
                {sum.modules?.filter((m:any)=> !selMod || m.module===selMod).map((m:any)=> {
                  const tone = m.failed>0 ? "err" : m.blocked>0 ? "warn" : "ok";
                  return (
                    <div key={m.module} className="px-2 py-1 border rounded">
                      <div className="text-xs font-medium mb-1">{m.module || "Custom"}</div>
                      <div className="flex gap-1 flex-wrap">
                        {badge(m.passed,"✓", "ok")}
                        {badge(m.failed,"✗", m.failed>0?"err":"ok")}
                        {badge(m.blocked,"⛔", m.blocked>0?"warn":"ok")}
                        {badge(m.in_progress,"…", "warn")}
                        <span className="text-[11px] px-1.5 py-0.5 border rounded-full border-slate-600">
                          Req {m.req_passed||0}/{m.req_total||0}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {!sum.modules?.length && <div className="text-xs opacity-70">No tests yet.</div>}
              </div>

              {/* Sign-off panel */}
              <div className="p-2 border rounded-2xl mb-3">
                <div className="text-sm font-medium mb-1">Sign-off</div>
                <textarea className="w-full border rounded px-2 py-1 text-sm h-16"
                          placeholder="(optional) notes / rationale"
                          value={decisionNotes} onChange={e=>setDecisionNotes(e.target.value)} data-testid="textarea-signoff-notes" />
                <div className="mt-2 flex items-center gap-2">
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const rr = await fetchWithAuth(`/api/releases/${open.id}/signoff/start`, { method:"POST", body: JSON.stringify({ projectId: pid }) });
                    if (rr.ok) { alert("Sign-off started"); openRelease(open); }
                  }} data-testid="button-start-signoff">Start</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const rr = await fetchWithAuth(`/api/releases/${open.id}/signoff/decide`, {
                      method:"POST", body: JSON.stringify({ projectId: pid, approve:true, decidedBy: meEmail, notes: decisionNotes })
                    });
                    const j=await rr.json();
                    if (rr.ok) { alert("Approved"); setDecisionNotes(""); openRelease(open); } else alert(j.error||"Failed");
                  }} data-testid="button-approve">Approve</button>
                  <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
                    const notes = decisionNotes || prompt("Rejection reason","") || "";
                    const rr = await fetchWithAuth(`/api/releases/${open.id}/signoff/decide`, {
                      method:"POST", body: JSON.stringify({ projectId: pid, approve:false, decidedBy: meEmail, notes })
                    });
                    const j=await rr.json();
                    if (rr.ok) { alert("Rejected"); setDecisionNotes(""); openRelease(open); } else alert(j.error||"Failed");
                  }} data-testid="button-reject">Reject</button>
                </div>
              </div>

              {/* Other actions */}
              <div className="flex items-center gap-2 mb-3">
                <a className="text-xs px-2 py-1 border rounded" href={`/api/releases/${open.id}/report.csv?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-report">Export report</a>
                <a className="text-xs px-2 py-1 border rounded" href={ensureProjectPath(`/releases/${open.id}/tests`)} data-testid="link-open-tests">Open tests</a>
                <a className="text-xs px-2 py-1 border rounded" target="_blank" rel="noreferrer"
                   href={`/api/releases/${open.id}/summary.html?projectId=${encodeURIComponent(pid!)}&print=1`} data-testid="link-print-summary">
                  Print summary
                </a>
              </div>

              {/* Sign-off history */}
              <div className="p-2 border rounded-2xl">
                <div className="text-sm font-medium mb-1">Sign-off history</div>
                <ul className="text-xs space-y-1">
                  {hist.map((h:any)=>(
                    <li key={h.id} className="border rounded px-2 py-1">
                      {new Date(h.createdAt).toLocaleString()} — {h.status}
                      {h.decidedBy ? ` • by ${h.decidedBy}` : ""} {h.notes?` — ${h.notes}`:""}
                    </li>
                  ))}
                  {!hist.length && <li className="opacity-70">No history yet.</li>}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    
  );
}
