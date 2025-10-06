import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";

type Ticket = { id:string; title:string; status:string; priority:string; assignee?:string; externalSystem?:string; externalKey?:string; externalUrl?:string; source?:string; sourceId?:string; escalatedAt?:string };
type SlaPolicy = { id:string; priority:string; firstResponseMins:number; resolutionMins:number };

const STATUSES = ["new","triage","in_progress","waiting","vendor","closed"] as const;
const PRIORITIES = ["low","medium","high","critical"] as const;

export default function TicketsPage(){
  const pid = getProjectId();
  const [items,setItems]=useState<Ticket[]>([]);
  const [q,setQ]=useState(""); const [statusF,setStatusF]=useState("");
  const [page,setPage]=useState(0);
  const limit = 30;
  const [msg,setMsg]=useState("");
  const [mb,setMb]=useState<any|null>(null);
  const [slas,setSlas]=useState<SlaPolicy[]>([]);
  const [showSla,setShowSla]=useState(false);
  
  const defaultForms: Record<string,{fr:number;res:number}> = {};
  PRIORITIES.forEach(p=>{ defaultForms[p]={fr:240,res:2880}; });
  const [slaForms,setSlaForms]=useState<Record<string,{fr:number;res:number}>>(defaultForms);
  const [openThreadId,setOpenThreadId]=useState<string|null>(null);

  async function load(){
    const p = new URLSearchParams({ projectId: pid!, limit:String(limit), offset:String(page*limit) });
    if (statusF) p.set("status", statusF);
    if (q) p.set("q", q);
    const r = await fetchWithAuth(`/api/tickets?${p.toString()}`); const j=await r.json();
    setItems(j.items||[]);
  }
  async function loadMailbox(){ 
    const r=await fetchWithAuth(`/api/tickets/mailbox?projectId=${encodeURIComponent(pid!)}`); 
    const j=await r.json(); 
    setMb(j.items?.[0]||null); 
  }
  async function loadSlas(){
    const r=await fetchWithAuth(`/api/tickets/sla?projectId=${encodeURIComponent(pid!)}`);
    const j=await r.json();
    const policies = j.items||[];
    setSlas(policies);
    const forms: Record<string,{fr:number;res:number}> = {};
    PRIORITIES.forEach(pri=>{
      const existing = policies.find((s:SlaPolicy)=>s.priority===pri);
      forms[pri] = { fr: existing?.firstResponseMins||240, res: existing?.resolutionMins||2880 };
    });
    setSlaForms(forms);
  }
  async function saveSla(priority:string,firstResponseMins:number,resolutionMins:number){
    await fetchWithAuth(`/api/tickets/sla/upsert`, { 
      method:"POST", 
      body: JSON.stringify({ projectId: pid, priority, firstResponseMins, resolutionMins }) 
    });
    loadSlas();
  }
  useEffect(()=>{ setPage(0); },[q,statusF]);
  useEffect(()=>{ load(); loadMailbox(); loadSlas(); },[q,statusF,page]);

  async function save(t:Partial<Ticket>){ await fetchWithAuth(`/api/tickets`, { method:"POST", body: JSON.stringify({ projectId: pid, ...t }) }); load(); }
  async function pushSN(id:string){ const r=await fetchWithAuth(`/api/servicenow/push`, { method:"POST", body: JSON.stringify({ projectId: pid, ticketId:id }) }); setMsg(r.ok?"Pushed":"Push failed"); setTimeout(()=>setMsg(""),800); load(); }
  async function syncSN(id:string){ const r=await fetchWithAuth(`/api/servicenow/sync?projectId=${encodeURIComponent(pid!)}&ticketId=${encodeURIComponent(id)}`); setMsg(r.ok?"Synced":"Sync failed"); setTimeout(()=>setMsg(""),800); load(); }

  const newTitleRef = useRef<HTMLInputElement>(null);
  function add(){ const t = newTitleRef.current?.value||""; if (!t) return; save({ title: t, status:"new" }); if (newTitleRef.current) newTitleRef.current.value=""; }

  const by = (s:string)=> items.filter(i=> i.status===s && (!q || i.title.toLowerCase().includes(q.toLowerCase())));
  
  const open = items.filter(i=>i.status!=="closed").length;
  const overdue = items.filter(i=>i.escalatedAt).length;

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Tickets</h1>
            <div className="text-xs opacity-70 mt-1">Open: {open} • Overdue: {overdue}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs opacity-70">{msg}</div>
            {mb ? (
              <span className="text-xs opacity-70" data-testid="text-mailbox">
                Mailbox: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{mb.address}</code>
              </span>
            ) : (
              <button 
                className="text-xs px-2 py-1 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" 
                onClick={async()=>{
                  const code = prompt("Project code for mailbox","WD-PROJ")||"WD-PROJ";
                  const r = await fetchWithAuth(`/api/tickets/mailbox/rotate`, { 
                    method:"POST", 
                    body: JSON.stringify({ projectId: pid, projectCode: code }) 
                  });
                  if (r.ok) loadMailbox();
                }}
                data-testid="button-create-mailbox"
              >
                Create Mailbox
              </button>
            )}
            <button 
              className="text-xs px-2 py-1 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" 
              onClick={()=>setShowSla(!showSla)}
              data-testid="button-toggle-sla"
            >
              {showSla ? "Hide" : "Show"} SLA Policies
            </button>
            {!showSla && slas.length > 0 && (
              <span className="text-[10px] opacity-60" data-testid="text-sla-summary">
                {slas.map(s=>`${s.priority}(${s.firstResponseMins}/${s.resolutionMins})`).join(", ")}
              </span>
            )}
          </div>
        </div>

        {showSla && (
          <div className="p-4 border rounded-2xl dark:border-slate-700 bg-slate-50 dark:bg-slate-900" data-testid="section-sla-policies">
            <h2 className="text-sm font-semibold mb-3">SLA Policies</h2>
            <div className="grid md:grid-cols-4 gap-3 mb-4">
              {PRIORITIES.map(pri=>(
                <div key={pri} className="p-3 border rounded dark:border-slate-600 bg-white dark:bg-slate-800">
                  <div className="text-xs font-semibold mb-2 uppercase">{pri}</div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] opacity-70">First Response (mins)</label>
                      <input 
                        type="number" 
                        className="w-full border rounded px-2 py-1 text-xs dark:bg-slate-700 dark:border-slate-600" 
                        value={slaForms[pri]?.fr||240} 
                        onChange={e=>setSlaForms({...slaForms, [pri]:{...slaForms[pri], fr:+e.target.value}})}
                        data-testid={`input-sla-first-response-${pri}`}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] opacity-70">Resolution (mins)</label>
                      <input 
                        type="number" 
                        className="w-full border rounded px-2 py-1 text-xs dark:bg-slate-700 dark:border-slate-600" 
                        value={slaForms[pri]?.res||2880} 
                        onChange={e=>setSlaForms({...slaForms, [pri]:{...slaForms[pri], res:+e.target.value}})}
                        data-testid={`input-sla-resolution-${pri}`}
                      />
                    </div>
                    <button 
                      className="w-full text-xs px-2 py-1 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" 
                      onClick={()=>saveSla(pri,slaForms[pri]?.fr||240,slaForms[pri]?.res||2880)}
                      data-testid={`button-save-sla-${pri}`}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600" placeholder="search…" value={q} onChange={e=>setQ(e.target.value)} data-testid="input-search" />
          <select className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600" value={statusF} onChange={e=>setStatusF(e.target.value)} data-testid="select-status-filter">
            <option value="">all</option>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <input ref={newTitleRef} className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600" placeholder="New ticket title" data-testid="input-new-ticket" />
            <button className="text-xs px-2 py-1 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={add} data-testid="button-add-ticket">Add</button>
            <a className="text-xs px-2 py-1 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" href={`/api/tickets/export.csv?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-csv">Export CSV</a>
          </div>
        </div>

        <div className="grid md:grid-cols-6 gap-3">
          {STATUSES.map(s=>(
            <div key={s} className="min-h-[320px] p-2 border rounded-2xl dark:border-slate-700"
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{ const id=e.dataTransfer.getData("text/plain"); if (id) save({ id, status: s }); }}
              data-testid={`column-${s}`}
            >
              <div className="text-xs opacity-70 mb-2">{s.toUpperCase()} ({by(s).length})</div>
              <div className="space-y-2">
                {by(s).map(t=>(
                  <div key={t.id} className="p-2 rounded bg-slate-100 dark:bg-slate-800 cursor-grab" draggable
                    onDragStart={e=>e.dataTransfer.setData("text/plain", t.id)}
                    data-testid={`ticket-card-${t.id}`}
                  >
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-[11px] opacity-70">
                      {t.priority} • {t.assignee || "unassigned"} {t.externalKey ? ` • SN:${t.externalKey}` : ""}
                    </div>
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <button className="text-[11px] px-2 py-0.5 border rounded dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700" onClick={()=>setOpenThreadId(t.id)} data-testid={`button-thread-${t.id}`}>Thread</button>
                      {!t.externalKey && <button className="text-[11px] px-2 py-0.5 border rounded dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700" onClick={()=>pushSN(t.id)} data-testid={`button-push-sn-${t.id}`}>Push SN</button>}
                      {t.externalKey && <>
                        <a className="text-[11px] underline" href={t.externalUrl} target="_blank" rel="noreferrer" data-testid={`link-open-sn-${t.id}`}>Open SN</a>
                        <button className="text-[11px] px-2 py-0.5 border rounded dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700" onClick={()=>syncSN(t.id)} data-testid={`button-sync-sn-${t.id}`}>Sync</button>
                      </>}
                    </div>
                  </div>
                ))}
                {!by(s).length && <div className="text-xs opacity-60">No tickets</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className="text-xs px-2 py-1 border rounded" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} data-testid="button-prev-page">Prev</button>
          <div className="text-xs opacity-70">Page {page+1}</div>
          <button className="text-xs px-2 py-1 border rounded" onClick={()=>setPage(p=>p+1)} data-testid="button-next-page">Next</button>
        </div>
      </div>
      {openThreadId && <TicketThreadDrawer id={openThreadId} onClose={()=>setOpenThreadId(null)} />}
    </AppFrame>
  );
}

function TicketThreadDrawer({ id, onClose }:{ id:string; onClose:()=>void }){
  const pid = getProjectId();
  const [msgs,setMsgs]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [reply,setReply]=useState("");
  const [files,setFiles]=useState<File[]>([]);
  const [noteOpen,setNoteOpen] = useState(false);
  const [noteFiles,setNoteFiles] = useState<File[]>([]);
  const [noteBody,setNoteBody] = useState("");
  const [term,setTerm]=useState("");
  
  const [mentionOpen,setMentionOpen] = useState(false);
  const [mentionItems,setMentionItems] = useState<any[]>([]);
  const [mentionSel,setMentionSel] = useState<{start:number,end:number,token:string}|null>(null);
  
  const [noteMentionOpen,setNoteMentionOpen] = useState(false);
  const [noteMentionItems,setNoteMentionItems] = useState<any[]>([]);
  const [noteMentionSel,setNoteMentionSel] = useState<{start:number,end:number,token:string}|null>(null);
  
  const viewMsgs = term
    ? msgs.filter(m => (m.body||m.text||"").toLowerCase().includes(term.toLowerCase()) || (m.subject||"").toLowerCase().includes(term.toLowerCase()))
    : msgs;

  function findMentionToken(s:string){
    const m = s.lastIndexOf("@");
    if (m < 0) return null;
    const rest = s.slice(m+1);
    const space = rest.search(/\s/);
    const end = space >= 0 ? m+1+space : s.length;
    const token = s.slice(m+1, end);
    if (!token || /\W/.test(token)) return null;
    return { start: m, end, token };
  }
  
  function replaceMention(s:string, sel:{start:number,end:number}, text:string){
    return s.slice(0, sel.start) + "@" + text + " " + s.slice(sel.end);
  }
  
  async function loadMention(q:string){
    const r = await fetchWithAuth(`/api/ma/stakeholders/suggest?projectId=${encodeURIComponent(getProjectId()!)}&q=${encodeURIComponent(q)}&limit=10`);
    const j = await r.json();
    setMentionItems(j.items||[]);
  }
  
  async function loadNoteMention(q:string){
    const r = await fetchWithAuth(`/api/ma/stakeholders/suggest?projectId=${encodeURIComponent(getProjectId()!)}&q=${encodeURIComponent(q)}&limit=10`);
    const j = await r.json();
    setNoteMentionItems(j.items||[]);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement|HTMLDivElement>){
    e.preventDefault();
    const list = Array.from(e.dataTransfer.files || []);
    if (list.length) setFiles(prev=>[...prev, ...list].slice(0,8));
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>){
    const items = e.clipboardData.items;
    const imgFiles: File[] = [];
    for (let i = 0; i < items.length; i++){
      if (items[i].type.indexOf("image") === 0){
        const file = items[i].getAsFile();
        if (file) imgFiles.push(file);
      }
    }
    if (imgFiles.length) setFiles(prev=>[...prev, ...imgFiles].slice(0,8));
  }

  function getSelectedTextIn(el: HTMLElement): string {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return "";
    return sel.toString();
  }
  
  function toQuotedBlock(s: string) {
    const lines = String(s || "").split(/\r?\n/);
    return lines.map(ln => (ln.trim() ? `> ${ln}` : ">")).join("\n");
  }

  function quoteMsg(m: any){
    const txt = m.body || m.text || "";
    const lines = txt.split("\n").map((l:string) => `> ${l}`).join("\n");
    setReply(prev => (prev ? prev + "\n\n" : "") + lines + "\n\n");
  }

  function onGlobalDrop(e: React.DragEvent<HTMLDivElement>){
    e.preventDefault();
    const list = Array.from(e.dataTransfer.files || []);
    if (list.length){ setNoteFiles(prev=>[...prev, ...list].slice(0,16)); setNoteOpen(true); }
  }

  async function load(){
    const r = await fetchWithAuth(`/api/tickets/${id}/thread?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setMsgs(j.thread||[]);
  }
  useEffect(()=>{ load(); },[id]);

  async function send(){
    if (!reply.trim()) return;
    setBusy(true);
    const r = await fetchWithAuth(`/api/tickets/reply/${id}`, { method:"POST", body: JSON.stringify({ projectId: pid, body: reply }) });
    setBusy(false);
    if (r.ok) { setReply(""); load(); }
    else alert("Reply failed");
  }

  function highlight(text:string, term:string){
    if (!term) return text;
    try {
      const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,"ig");
      const parts = String(text||"").split(re);
      return parts.map((p,i)=> i%2 ? <mark key={i} className="bg-yellow-600/50">{p}</mark> : p);
    } catch { return text; }
  }

  function renderBody(text: string, term: string) {
    // Split by lines, wrap those starting with '>' as quote blocks
    const lines = String(text || "").split(/\r?\n/);
    return (
      <div className="message-body whitespace-pre-wrap text-xs">
        {lines.map((ln, i) => {
          if (/^\s*>\s?/.test(ln)) {
            const inner = ln.replace(/^\s*>\s?/, "");
            return (
              <blockquote key={i} className="quote-block pl-3 border-l-4 border-slate-500/60 my-1">
                {highlight(inner, term)}
              </blockquote>
            );
          }
          return <div key={i}>{highlight(ln, term)}</div>;
        })}
      </div>
    );
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "q" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Quote selected text if selection exists; else no-op
        const sel = window.getSelection?.();
        const txt = sel?.toString() || "";
        if (!txt.trim()) return;
        e.preventDefault();
        const quoted = txt.split(/\r?\n/).map(ln => (ln.trim() ? `> ${ln}` : ">")).join("\n");
        setReply(prev => (prev ? prev + "\n\n" : "") + quoted + "\n\n");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50" data-testid="ticket-thread-drawer">
      <style>{`
        .message-body mark { background-color: rgba(255, 229, 143, 0.65); padding: 0 .1rem; border-radius: 2px; }
        .quote-block { background: rgba(148,163,184,0.08); }
      `}</style>
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div 
        className="absolute right-0 top-0 h-full w-[560px] bg-background dark:bg-slate-900 border-l dark:border-slate-700 p-4 overflow-auto"
        onDragOver={(e)=>e.preventDefault()}
        onDrop={onGlobalDrop}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-semibold">Ticket Thread</div>
          <button className="text-xs px-2 py-1 border rounded dark:border-slate-600" onClick={onClose} data-testid="button-close-thread">Close</button>
        </div>

        {/* Search box */}
        <div className="mb-2 flex items-center gap-2">
          <input className="border rounded px-2 py-1 text-sm w-full dark:bg-slate-800 dark:border-slate-600" placeholder="Search in thread…" value={term} onChange={e=>setTerm(e.target.value)} data-testid="input-thread-search" />
          <button className="text-xs px-2 py-1 border rounded dark:border-slate-600" onClick={()=>setTerm("")} disabled={!term} data-testid="button-clear-search">Clear</button>
        </div>

        {/* Add Note form (appears when you drop or click toggle) */}
        <div className="mb-3 p-3 border rounded-2xl bg-slate-900/40 dark:border-slate-700" data-testid="section-add-note">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Add Note (internal)</div>
            <button className="text-[11px] px-2 py-0.5 border rounded dark:border-slate-600" onClick={()=>setNoteOpen(o=>!o)} data-testid="button-toggle-note">{noteOpen?"Hide":"Show"}</button>
          </div>
          {noteOpen && (
            <>
              <textarea className="w-full border rounded px-2 py-1 text-sm h-20 dark:bg-slate-800 dark:border-slate-600"
                placeholder="Optional note (context for the dropped files / @mention)"
                value={noteBody}
                onChange={e=>{
                  const v = e.target.value;
                  setNoteBody(v);
                  const sel = findMentionToken(v);
                  if (sel && sel.token.length >= 1){
                    setNoteMentionSel(sel); setNoteMentionOpen(true); loadNoteMention(sel.token);
                  } else {
                    setNoteMentionOpen(false); setNoteMentionSel(null);
                  }
                }}
                data-testid="textarea-note-body"
              />
              {noteMentionOpen && noteMentionItems.length>0 && (
                <div className="mt-1 max-h-48 overflow-auto border rounded bg-background text-xs dark:bg-slate-800 dark:border-slate-600">
                  {noteMentionItems.map((p:any)=>(
                    <div key={p.id}
                      className="px-2 py-1 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between"
                      onClick={()=>{
                        if (!noteMentionSel) return;
                        const label = `${p.name}${p.email?` (${p.email})`:""}`;
                        setNoteBody(v => replaceMention(v, noteMentionSel!, label));
                        setNoteMentionOpen(false); setNoteMentionSel(null);
                      }}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="opacity-70">{p.email||""}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <input type="file" multiple className="text-xs" onChange={e=>setNoteFiles(prev => [...prev, ...Array.from(e.target.files || [])].slice(0,16))} data-testid="input-note-files"/>
                <div className="text-xs opacity-70">{noteFiles.length ? `${noteFiles.length} file(s) attached` : "Drag & drop files anywhere to attach"}</div>
                <button className="text-xs px-2 py-1 border rounded dark:border-slate-600" onClick={async()=>{
                  const fd = new FormData();
                  fd.append("projectId", pid!);
                  fd.append("body", noteBody||"");
                  noteFiles.forEach(f=>fd.append("files", f));
                  const r = await fetchWithAuth(`/api/tickets/reply/${id}/note`, { method:"POST", body: fd as any });
                  if (r.ok){ setNoteBody(""); setNoteFiles([]); setNoteOpen(false); load(); } else alert("Failed to add note");
                }} data-testid="button-add-note">Add Note</button>
                {!!noteFiles.length && <button className="text-xs px-2 py-1 border rounded dark:border-slate-600" onClick={()=>setNoteFiles([])} data-testid="button-clear-note-files">Clear files</button>}
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          {(viewMsgs||[]).map(m=>{
            const bodyRef = useRef<HTMLPreElement>(null);
            return (
            <div key={m.id} className="p-2 border rounded-2xl dark:border-slate-700 bg-slate-50 dark:bg-slate-800" data-testid={`message-${m.id}`}>
              <div className="text-xs opacity-70 flex items-center justify-between">
                <span>{(m.direction || "in").toUpperCase()} • {new Date(m.createdAt).toLocaleString()}</span>
                <div className="flex items-center gap-2">
                  <span className="opacity-60">{m.fromEmail || ""} → {m.toEmail || ""}</span>
                  <button 
                    className="text-[11px] px-2 py-0.5 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" 
                    onClick={()=>quoteMsg(m)}
                    data-testid={`button-quote-${m.id}`}
                  >
                    Quote
                  </button>
                </div>
              </div>
              {m.subject && <div className="text-sm font-medium mt-1">{m.subject}</div>}
              {m.body && (
                <>
                  <div ref={bodyRef} className="mt-1">{renderBody(m.body || "", term)}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      className="text-[11px] px-2 py-0.5 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={()=>{
                        const el = bodyRef.current as HTMLElement | null;
                        const selection = el ? getSelectedTextIn(el) : "";
                        const toQuote = selection && selection.trim().length ? selection : (m.body || "");
                        const block = toQuotedBlock(toQuote);
                        setReply(prev => (prev ? prev + "\n\n" : "") + block + "\n\n");
                      }}
                      data-testid={`button-quote-selection-${m.id}`}
                    >
                      Quote selection
                    </button>
                  </div>
                </>
              )}

              {!!m.attachments?.length && (
                <div className="mt-2">
                  <div className="text-xs opacity-70 mb-1">Attachments</div>
                  <ul className="text-xs space-y-1">
                    {m.attachments.map((a:any)=>{
                      const href = `/api/tickets/attachments/preview/${a.id}`;
                      const isImg = /^image\//i.test(a.contentType||"") || /\.(png|jpe?g|gif|webp)$/i.test(a.name||"");
                      return (
                        <li key={a.id} className="space-y-1" data-testid={`attachment-${a.id}`}>
                          {isImg ? (
                            <div className="rounded overflow-hidden border dark:border-slate-600">
                              <img src={href} alt={a.name} className="max-h-64 object-contain w-full bg-black/20" data-testid={`img-attachment-${a.id}`} />
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between">
                            <a className="underline truncate" href={`/viewer?url=${encodeURIComponent(href)}`} target="_blank" rel="noreferrer" data-testid={`link-attachment-${a.id}`}>{a.name}</a>
                            <span className="opacity-60">{a.contentType||""}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            );
          })}
          {!msgs?.length && <div className="text-sm opacity-70">No messages yet.</div>}
        </div>

        {/* Reply */}
        <div
          className="mt-4 p-3 border rounded-2xl sticky bottom-0 bg-background dark:bg-slate-900 dark:border-slate-700"
          onDragOver={(e)=>e.preventDefault()}
          onDrop={onDrop}
        >
          <div className="text-sm font-medium mb-1">Reply via email</div>
          <textarea
            className="w-full border rounded px-2 py-1 text-sm h-28 dark:bg-slate-800 dark:border-slate-600"
            placeholder="Type your reply… (paste images / drag & drop / @mention)"
            value={reply}
            onChange={e=>{
              const v = e.target.value;
              setReply(v);
              const sel = findMentionToken(v);
              if (sel && sel.token.length >= 1){
                setMentionSel(sel); setMentionOpen(true); loadMention(sel.token);
              } else {
                setMentionOpen(false); setMentionSel(null);
              }
            }}
            onDragOver={(e)=>e.preventDefault()}
            onDrop={onDrop}
            onPaste={onPaste}
            data-testid="textarea-reply"
          />
          {mentionOpen && mentionItems.length>0 && (
            <div className="mt-1 max-h-48 overflow-auto border rounded bg-background text-xs dark:bg-slate-800 dark:border-slate-600">
              {mentionItems.map((p:any)=>(
                <div key={p.id}
                  className="px-2 py-1 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between"
                  onClick={()=>{
                    if (!mentionSel) return;
                    const label = `${p.name}${p.email?` (${p.email})`:""}`;
                    setReply(v => replaceMention(v, mentionSel!, label));
                    setMentionOpen(false); setMentionSel(null);
                  }}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="opacity-70">{p.email||""}</span>
                </div>
              ))}
            </div>
          )}
          {/* attachments picker */}
          <div className="mt-2 flex items-center gap-2">
            <input type="file" multiple className="text-xs" onChange={e=>setFiles(Array.from(e.target.files||[]))} data-testid="input-file"/>
            <div className="text-xs opacity-70">{files.length ? `${files.length} file(s) attached` : "You can drag & drop files"}</div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="text-xs px-2 py-1 border rounded dark:border-slate-600"
              onClick={async ()=>{
                if (!files.length) { await send(); return; }
                setBusy(true);
                const fd = new FormData();
                fd.append("projectId", pid!);
                fd.append("body", reply||"");
                files.forEach(f=>fd.append("files", f));
                const r = await fetchWithAuth(`/api/tickets/reply/${id}/attach`, { method:"POST", body: fd as any });
                setBusy(false);
                if (r.ok){ setReply(""); setFiles([]); load(); } else alert("Reply failed");
              }}
              disabled={busy}
              data-testid="button-send-reply"
            >
              {busy?"Sending…":"Send"}
            </button>
            <span className="text-[11px] opacity-60">Adds to thread and emails last sender.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
