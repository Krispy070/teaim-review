import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON } from "@/lib/authFetch";
import { downloadGET } from "@/lib/download";

const DEFAULT_AREAS = ["HCM","Payroll","Financials","Time","Integrations","Security","Reporting","Cutover"];

export default function SignoffRequestModal({
  projectId, stageId, stageTitle, stageArea, onClose
}:{
  projectId: string; stageId: string; stageTitle?: string; stageArea?: string; onClose: ()=>void
}){
  const [members,setMembers]=useState<{user_id:string;email:string;role?:string;can_sign_all?:boolean;sign_areas?:string[]}[]>([]);
  const [signers,setSigners]=useState<typeof members>([]);
  const [q,setQ]=useState(""); const [areas,setAreas]=useState<string[]>(stageArea?[stageArea]:[]);
  const [picked,setPicked]=useState<string[]>([]);
  const [cc,setCc]=useState(""); const [ccAllLeads,setCcAllLeads]=useState(false); const [ccAllPMs,setCcAllPMs]=useState(false);
  const [docLink,setDocLink]=useState(""); const [autoAttachLast,setAutoAttachLast]=useState(true);
  const [msg,setMsg]=useState(""); const [busy,setBusy]=useState(false); const [pending,setPending]=useState(0);
  const [pendingList,setPendingList]=useState<{token:string; signer_email:string; created_at:string; expires_at?:string; expiring_soon?:boolean; hours_left?:number}[]>([]);
  const [expiry,setExpiry]=useState<number>(120);
  const [selTok,setSelTok]=useState<Record<string,boolean>>({});
  const anySel = Object.values(selTok).some(Boolean);
  const [qTok,setQTok]=useState(""); const [domain,setDomain]=useState("");
  const [page,setPage]=useState(1);
  const [pageSize] = useState(50);
  const [total,setTotal]=useState(0);
  const [autoAttachStage,setAutoAttachStage]=useState(true);
  const [useStageDefault,setUseStageDefault]=useState(true);
  const [applyDefaultsOnOpen,setApplyDefaultsOnOpen]=useState(true); const [saveAsDefault,setSaveAsDefault]=useState(false);
  const [presetName,setPresetName]=useState(""); const [presets,setPresets]=useState<{name:string;areas:string[];message?:string;docLink?:string}[]>([]);
  const inputRef = useRef<HTMLInputElement|null>(null);

  // Aging heat-map color coding function
  function ageClass(hoursLeft?:number|null){
    if (hoursLeft==null) return "";
    if (hoursLeft < 12) return "text-red-500 font-medium";
    if (hoursLeft < 24) return "text-orange-500";
    if (hoursLeft < 48) return "text-yellow-600";
    return "text-muted-foreground";
  }

  // Build domain chips from members list
  const domains = useMemo(()=>{
    const set = new Set<string>();
    (members||[]).forEach(m=>{
      const em = (m.email||""); const at=em.indexOf("@"); if (at>0) set.add(em.slice(at+1));
    });
    return Array.from(set).sort().slice(0,8);
  },[members]);

  const storeStage = `kap.stageReq.${projectId}.${stageId}`;
  const storeProj  = `kap.signoff.ccPresets.${projectId}`;
  const storePres  = `kap.signoff.stagePresets.${projectId}`; // [{name,areas,message,docLink}]
  const storeTpl = `kap.signoff.resendTpl.${projectId}`;
  const [tplSubj,setTplSubj]=useState("[Reminder] Sign-off request pending");
  const [tplHtml,setTplHtml]=useState("<p>Please sign: {{LINK}}</p>");

  useEffect(()=>{ inputRef.current?.focus(); },[]);

  // load members, signers, pending count, last artifact, defaults
  useEffect(()=>{ (async()=>{
    try{
      const m = await getJSON(`/api/members/all?project_id=${projectId}`); setMembers(m.items||[]);
      const d = await getJSON(`/api/members/signers?project_id=${projectId}${stageArea?`&area=${encodeURIComponent(stageArea)}`:""}`); setSigners(d.items||[]);
    }catch{ setMembers([]); setSigners([]); }
    try{
      const p = await getJSON(`/api/signoff/pending_count?project_id=${projectId}&stage_id=${stageId}`); setPending(p.count||0);
      const pList = await getJSON(`/api/signoff/pending_list?project_id=${projectId}&stage_id=${stageId}`);
      setPendingList(pList.items||[]);
    }catch{ setPending(0); setPendingList([]); }
    try{
      if (useStageDefault){
        const d = await getJSON(`/api/stages/doc_default?project_id=${projectId}&stage_id=${stageId}`);
        if (d?.url && !docLink) setDocLink(d.url);
      }
    }catch{}
    try{
      if (autoAttachStage){
        const a = await getJSON(`/api/artifacts/by_stage?project_id=${projectId}&stage_id=${stageId}`);
        if (a?.url && !docLink) setDocLink(a.url);
      }
    }catch{}
    try{
      const proj = JSON.parse(localStorage.getItem(storeProj) || "{}");
      if (proj.ccAllLeads) setCcAllLeads(true);
      if (proj.ccAllPMs) setCcAllPMs(true);
    }catch{}
    try{
      const stage = JSON.parse(localStorage.getItem(storeStage) || "{}");
      if (applyDefaultsOnOpen){
        if (stage.areas) setAreas(stage.areas);
        if (stage.message) setMsg(stage.message);
        if (stage.docLink) setDocLink(stage.docLink);
        if (stage.cc) setCc(stage.cc);
        if (stage.emails) setPicked(stage.emails);
        if (stage.ccAllLeads !== undefined) setCcAllLeads(stage.ccAllLeads);
        if (stage.ccAllPMs !== undefined) setCcAllPMs(stage.ccAllPMs);
      }
    }catch{}
    try{
      setPresets(JSON.parse(localStorage.getItem(storePres) || "[]"));
    }catch{ setPresets([]); }
    try{
      const t = JSON.parse(localStorage.getItem(storeTpl) || "{}");
      if (t.subj) setTplSubj(t.subj); if (t.html) setTplHtml(t.html);
    }catch{}
  })(); },[projectId, stageId, stageArea, autoAttachStage, useStageDefault, applyDefaultsOnOpen]);

  // Auto-save CC preferences when they change
  useEffect(()=>{ saveCCPreferences(); },[ccAllLeads, ccAllPMs]);

  // Load pending with search/pagination
  useEffect(()=>{ loadPending(); /* eslint-disable-next-line */}, [projectId, stageId, page, qTok, domain]);

  const hits = useMemo(()=>{
    const allowedByArea = (p:any)=> p.can_sign_all || areas.length===0 || areas.some(a => (p.sign_areas||[]).includes(a));
    const pool = members.map(m=>{
      const s = signers.find(x=>x.user_id===m.user_id);
      const allowed = (m.can_sign_all || areas.length===0 || (m.sign_areas||[]).some(a=>areas.includes(a)));
      return {...m, allowed};
    });
    const qq = q.toLowerCase();
    return pool.filter(p=>{
      const matchQ = !qq || (p.email||"").toLowerCase().includes(qq) || (p.role||"").toLowerCase().includes(qq);
      const matchArea = allowedByArea(p);
      return matchQ && matchArea;
    }).sort((a,b)=> (a.allowed===b.allowed) ? ((a.role||"").localeCompare(b.role||"")) : (a.allowed? -1 : 1));
  },[members, signers, q, areas]);

  function toggle(email:string){
    setPicked(p => p.includes(email) ? p.filter(x=>x!==email) : [...p, email]);
  }

  function toggleTok(t:string){ setSelTok(s=> ({...s, [t]: !s[t]})); }
  function setAll(b:boolean){ const n:Record<string,boolean>={}; pendingList.forEach(p=>{n[p.token]=b}); setSelTok(n); }
  // Save CC preferences to localStorage when they change
  function saveCCPreferences(){
    const saved = JSON.parse(localStorage.getItem(storeProj) || "{}");
    localStorage.setItem(storeProj, JSON.stringify({...saved, ccAllLeads, ccAllPMs}));
  }
  function toggleArea(a:string){ setAreas(prev => prev.includes(a) ? prev.filter(x=>x!==a) : [...prev, a]); }

  function savePreset(){
    if (!presetName.trim()) return alert("Preset name required");
    const nxt = [...presets.filter(p=>p.name!==presetName.trim()), {name:presetName.trim(), areas, message:msg, docLink}];
    setPresets(nxt); localStorage.setItem(storePres, JSON.stringify(nxt));
    alert("Preset saved");
  }
  function applyPresetNamed(n:string){
    const p = presets.find(x=>x.name===n); if (!p) return;
    setAreas(p.areas||[]); setMsg(p.message||""); setDocLink(p.docLink||"");
  }

  async function saveStageDefault(){
    if (!docLink.trim()) return alert("Provide a URL first");
    try{
      const res = await fetch(`/api/stages/doc_default?project_id=${projectId}&stage_id=${stageId}`, {
        method:"POST", credentials:"include",
        headers:{'Content-Type':'application/json'}, body: JSON.stringify({url:docLink.trim()})
      });
      const result = await res.json();
      if (result.ok) {
        alert("Stage default saved");
      } else {
        alert("Failed to save stage default. Please try again.");
      }
    }catch{
      alert("Error saving stage default. Please try again.");
    }
  }

  function saveTpl(){ localStorage.setItem(storeTpl, JSON.stringify({subj: tplSubj, html: tplHtml})); alert("Template saved"); }

  async function loadPending(){
    const qs = new URLSearchParams({ project_id: projectId, stage_id: stageId, page:String(page), page_size:String(pageSize) });
    if (qTok.trim()) qs.set("q", qTok.trim());
    if (domain.trim()) qs.set("domain", domain.trim());
    const d = await getJSON(`/api/signoff/pending_list?${qs.toString()}`);
    setPendingList(d.items||[]); setTotal(d.total||0);
  }

  async function refreshPendingData(){
    try{
      await loadPending();
      const pCount = await getJSON(`/api/signoff/pending_count?project_id=${projectId}&stage_id=${stageId}`);
      setPending(pCount.count||0);
    }catch{}
  }

  async function send(){
    if (!picked.length) return alert("Pick at least one recipient");
    const ccList = cc.split(",").map(x=>x.trim()).filter(Boolean);
    setBusy(true);
    try{
      await fetch(`/api/stages/request_signoff_batch?project_id=${projectId}`, {
        method:"POST", credentials:"include", headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          stage_id: stageId, emails: picked, cc: ccList,
          cc_all_leads: ccAllLeads, cc_all_pms: ccAllPMs,
          title: stageTitle, area: areas[0] || stageArea || "", message: msg, doc_link: docLink
        })
      });
      if (saveAsDefault){
        localStorage.setItem(storeStage, JSON.stringify({ emails:picked, cc, areas, message:msg, docLink, ccAllLeads, ccAllPMs }));
      }
      alert(`Request sent to ${picked.length} recipient(s)`); onClose();
    }catch(e:any){ alert(String(e?.message||e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[200]" onClick={onClose}>
      <div className="mx-auto mt-[8vh] w-[800px] max-w-[96%] bg-white dark:bg-neutral-900 rounded shadow-xl border"
           onClick={e=>e.stopPropagation()}>
        <div className="p-3 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Request Sign-Off</div>
            <div className="text-xs text-muted-foreground">{stageTitle}{stageArea?` • ${stageArea}`:""}</div>
          </div>
          <div className="text-xs text-muted-foreground">Tokens pending: <b>{pending}</b></div>
        </div>
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input ref={inputRef} className="border rounded p-2 w-full text-sm" placeholder="Search recipients (email or role)…"
                   value={q} onChange={e=>setQ(e.target.value)} />
            <div className="flex items-center gap-2">
              {DEFAULT_AREAS.map(a=>(
                <button key={a} className={`brand-btn text-[11px] ${areas.includes(a)?'pulse-once':''}`} onClick={()=>toggleArea(a)}>{a}</button>
              ))}
              <button className="brand-btn text-[11px]" onClick={()=>setAreas([])}>All</button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={ccAllLeads} onChange={e=>setCcAllLeads(e.target.checked)}/> CC all Leads</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={ccAllPMs} onChange={e=>setCcAllPMs(e.target.checked)}/> CC all PMs</label>
            <label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={applyDefaultsOnOpen} onChange={e=>setApplyDefaultsOnOpen(e.target.checked)}/> Apply defaults on open</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={saveAsDefault} onChange={e=>setSaveAsDefault(e.target.checked)}/> Save as default</label>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <input className="border rounded p-2 text-sm flex-1" placeholder="Additional CC emails (comma separated)" value={cc} onChange={e=>setCc(e.target.value)} />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <input className="border rounded p-2 text-sm flex-1" placeholder="Optional document link (reference URL)" value={docLink} onChange={e=>setDocLink(e.target.value)} />
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={useStageDefault} onChange={e=>setUseStageDefault(e.target.checked)} /> Use stage default
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={autoAttachStage} onChange={e=>setAutoAttachStage(e.target.checked)} /> Auto-attach last stage doc
            </label>
            <button className="brand-btn text-[11px]" onClick={saveStageDefault}>Save stage default</button>
          </div>

          {(pendingList.length>0 || total>0) && (
            <div className="border rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium">Pending requests ({total})</div>
                <div className="flex items-center gap-2">
                  <button className="brand-btn text-[11px]" onClick={()=>setAll(true)}>Select all</button>
                  <button className="brand-btn text-[11px]" onClick={()=>setAll(false)}>Clear</button>
                  <label className="text-[11px]">Expiry (hr)</label>
                  <input className="border rounded p-1 text-[11px] w-[64px]" type="number" value={expiry} onChange={e=>setExpiry(parseInt(e.target.value||'120',10))}/>
                  <button className="brand-btn text-[11px]" disabled={!anySel} onClick={async()=>{
                    const tokens = Object.keys(selTok).filter(k=>selTok[k]);
                    await fetch(`/api/signoff/set_expiry_selected?project_id=${projectId}`, {
                      method:"POST", credentials:"include", headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ tokens, hours: expiry })
                    });
                    alert("Expiry set for selected");
                  }}>Set expiry (selected)</button>
                  <button className="brand-btn text-[11px]" disabled={!anySel} onClick={async()=>{
                    const tokens = Object.keys(selTok).filter(k=>selTok[k]);
                    await fetch(`/api/signoff/remind_selected?project_id=${projectId}`, {
                      method:"POST", credentials:"include", headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ tokens, min_hours_between: 12 })
                    });
                    alert("Reminders sent (throttled)");
                  }}>Remind selected</button>
                  <button className="brand-btn text-[11px]" disabled={!anySel} onClick={async()=>{
                    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
                    const tokens = Object.keys(selTok).filter(k=>selTok[k]);
                    await fetch(`/api/signoff/schedule_reminders?project_id=${projectId}`, {
                      method:"POST", credentials:"include", headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ tokens, at_local: "09:00", timezone: tz, min_hours_between: 12 })
                    });
                    alert("Scheduled for tomorrow 09:00 local");
                  }}>Schedule for 9am tomorrow</button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs mb-1">
                <input className="border rounded p-1 text-xs" placeholder="Search email…" value={qTok} onChange={e=>{setPage(1); setQTok(e.target.value)}} />
                <input className="border rounded p-1 text-xs" placeholder="domain (acme.com)" value={domain} onChange={e=>{setPage(1); setDomain(e.target.value)}} />
                <div className="flex items-center gap-1">
                  {domains.map(d=>(
                    <button key={d} className="brand-btn text-[11px]" onClick={()=>{ setDomain(d); setPage(1); }}>{'@'+d}</button>
                  ))}
                </div>
                <button className="brand-btn text-[11px]" onClick={()=>downloadGET(`/api/signoff/pending_export.csv?project_id=${projectId}&stage_id=${stageId}`, "pending.csv")}>Export CSV</button>
                <button className="brand-btn text-[11px]" onClick={async()=>{
                  await fetch(`/api/signoff/revoke_expired_now?project_id=${projectId}`, {method:"POST", credentials:"include"});
                  loadPending(); alert("Revoked expired tokens");
                }}>Revoke expired</button>
                <div className="ml-auto flex items-center gap-1">
                  <button className="brand-btn text-[11px]" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
                  <span>{page} / {Math.max(1, Math.ceil(total/pageSize))}</span>
                  <button className="brand-btn text-[11px]" disabled={page*pageSize>=total} onClick={()=>setPage(p=>p+1)}>Next</button>
                </div>
              </div>
              <div className="border rounded p-2 mt-2">
                <div className="text-xs font-medium mb-1">Custom resend template</div>
                <div className="grid md:grid-cols-2 gap-2">
                  <input className="border rounded p-2 text-sm" placeholder="Subject" value={tplSubj} onChange={e=>setTplSubj(e.target.value)} />
                  <button className="brand-btn text-xs" onClick={saveTpl}>Save template</button>
                </div>
                <textarea className="border rounded p-2 w-full text-sm mt-1" rows={2} placeholder="HTML ({{LINK}} placeholder)" value={tplHtml} onChange={e=>setTplHtml(e.target.value)} />
                <div className="flex items-center gap-2 mt-1">
                  <button className="brand-btn text-[11px]" disabled={!anySel} onClick={async()=>{
                    const tokens = Object.keys(selTok).filter(k=>selTok[k]);
                    await fetch(`/api/signoff/resend_selected_custom?project_id=${projectId}`, {
                      method:"POST", credentials:"include", headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ tokens, subject: tplSubj, html: tplHtml, min_hours_between: 12 })
                    });
                    alert("Custom reminders sent (throttled)");
                  }}>Resend (template ⟶ selected)</button>
                </div>
              </div>
              <div className="space-y-1 mt-1">
                {pendingList.map(p=>(
                  <div key={p.token} className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!selTok[p.token]} onChange={()=>toggleTok(p.token)} />
                      <span>
                        {p.signer_email} • {new Date(p.created_at).toLocaleString()}
                        <span className={ageClass(p.hours_left)}>
                          {p.expires_at ? ` • exp ${new Date(p.expires_at).toLocaleString()} (~${p.hours_left}h)` : ""}
                        </span>
                      </span>
                    </label>
                    <span className="flex items-center gap-1">
                      <button className="brand-btn text-[11px]" onClick={async()=>{
                        await fetch(`/api/signoff/resend_token?token=${encodeURIComponent(p.token)}`, {method:"POST",credentials:"include"});
                        alert("Resent");
                      }}>Resend</button>
                      <button className="brand-btn text-[11px]" onClick={async()=>{
                        await fetch(`/api/signoff/revoke_token?token=${encodeURIComponent(p.token)}`, {method:"POST",credentials:"include"});
                        setPendingList(prev=>prev.filter(x=>x.token!==p.token));
                        const ns = {...selTok}; delete ns[p.token]; setSelTok(ns);
                      }}>Revoke</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs">
            <input className="border rounded p-2 text-sm flex-1" placeholder="Preset name" value={presetName} onChange={e=>setPresetName(e.target.value)} />
            <button className="brand-btn text-xs" onClick={savePreset}>Save preset</button>
            <select className="border rounded p-2 text-sm" onChange={e=> e.target.value && applyPresetNamed(e.target.value)}>
              <option value="">Apply preset…</option>
              {presets.map(p=> <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>

          <textarea className="border rounded p-2 w-full text-sm" rows={3} placeholder="Optional message…" value={msg} onChange={e=>setMsg(e.target.value)} />

          <div className="max-h-[30vh] overflow-auto border rounded">
            {hits.map(h=>(
              <label key={h.email} className="flex items-center gap-2 px-2 py-1 hover:bg-black/5 dark:hover:bg:white/5">
                <input type="checkbox" checked={picked.includes(h.email)} onChange={()=>toggle(h.email)} />
                <span className="text-sm">{h.email}</span>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {h.role || ""} {h.can_sign_all ? "• signer(all)" : h.sign_areas?.length ? `• signer(${h.sign_areas.join(",")})`:""}
                </span>
              </label>
            ))}
            {!hits.length && <div className="p-2 text-xs text-muted-foreground">No matches</div>}
          </div>
        </div>
        <div className="p-3 border-t flex justify-end gap-2">
          <button className="brand-btn text-xs" onClick={onClose}>Cancel</button>
          <button className="brand-btn text-xs swoosh" onClick={send} disabled={busy || picked.length===0}>
            {busy?"Sending…":`Send (${picked.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}