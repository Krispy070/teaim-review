import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useRef, useState } from "react";

type Issue = { id:string; integrationId?:string; ref?:string; status:string; priority?:string; field?:string; title:string; description?:string; notes?:string; createdAt:string };
const STATUSES = ["open","in_progress","blocked","closed"] as const;

export default function IssuesBoard(){
  const pid = getProjectId();
  const [items, setItems] = useState<Issue[]>([]);
  const [ints, setInts]   = useState<any[]>([]);
  const [flt, setFlt]     = useState<{integrationId?:string; status?:string}>({});
  const [page,setPage]=useState(0); const limit=20;
  const [msg, setMsg]     = useState("");

  async function load(){
    const p = new URLSearchParams({ projectId: pid!, limit:String(limit), offset:String(page*limit) });
    if (flt.integrationId) p.set("integrationId", flt.integrationId);
    if (flt.status)        p.set("status", flt.status);
    const [i, s] = await Promise.all([
      fetchWithAuth(`/api/ma/issues?${p.toString()}`).then(r=>r.json()),
      fetchWithAuth(`/api/ma/integrations/summary?projectId=${encodeURIComponent(pid!)}`).then(r=>r.json())
    ]);
    setItems(i.items||[]); setInts(s.items||[]);
  }
  useEffect(()=>{ setPage(0); },[flt.integrationId, flt.status]);
  useEffect(()=>{ if(pid) load(); },[pid, flt.integrationId, flt.status, page]);

  async function move(id:string, status:string){
    const r = await fetchWithAuth(`/api/ma/issues/${id}/move?projectId=${encodeURIComponent(pid!)}`, { method:"POST", body: JSON.stringify({ status }) });
    setMsg(r.ok?"Moved":"Move failed"); setTimeout(()=>setMsg(""),800); load();
  }
  async function save(issue:Partial<Issue>){
    if (!issue.title) return;
    const body = { projectId: pid, ...issue };
    const url = `/api/ma/issues${issue.id?"/"+issue.id:""}?projectId=${encodeURIComponent(pid!)}`;
    const r = await fetchWithAuth(url, { method: issue.id?"PATCH":"POST", body: JSON.stringify(body) });
    setMsg(r.ok?"Saved":"Save failed"); setTimeout(()=>setMsg(""),800); load();
  }
  async function del(id:string){
    if (!confirm("Delete issue?")) return;
    await fetchWithAuth(`/api/ma/issues/${id}?projectId=${encodeURIComponent(pid!)}`, { method:"DELETE" }); load();
  }

  const by = (s:string)=> items.filter(i=> i.status===s && (!flt.integrationId || i.integrationId===flt.integrationId));
  const intName = (id?:string)=> ints.find((x:any)=>x.id===id)?.name || "—";

  const newRef = useRef<HTMLInputElement>(null);
  const newTitle = useRef<HTMLInputElement>(null);
  const newInt = useRef<HTMLSelectElement>(null);

  function submitNew(){
    save({ integrationId: newInt.current?.value || undefined, ref: newRef.current?.value || undefined, title: newTitle.current?.value || "" });
    if (newRef.current) newRef.current.value=""; if (newTitle.current) newTitle.current.value="";
  }

  return (
    
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-issues">Integration Issues</h1>
          <div className="text-xs opacity-70" data-testid="text-message">{msg}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select className="border rounded px-2 py-1 text-sm" value={flt.integrationId||""} onChange={e=>setFlt(f=>({...f, integrationId: e.target.value || undefined}))} data-testid="select-filter-integration">
            <option value="">All integrations</option>
            {ints.map((i:any)=><option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm" value={flt.status||""} onChange={e=>setFlt(f=>({...f, status: e.target.value || undefined}))} data-testid="select-filter-status">
            <option value="">All statuses</option>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <a className="text-xs px-2 py-1 border rounded" href={`/api/ma/issues/export.csv?projectId=${encodeURIComponent(getProjectId()!)}${flt.integrationId?`&integrationId=${encodeURIComponent(flt.integrationId)}`:""}${flt.status?`&status=${encodeURIComponent(flt.status)}`:""}`} data-testid="link-export-csv">
              Export CSV
            </a>
            <select ref={newInt} className="border rounded px-2 py-1 text-sm" data-testid="select-new-integration">
              <option value="">(no integration)</option>
              {ints.map((i:any)=><option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input ref={newRef} className="border rounded px-2 py-1 text-sm" placeholder="Ref (#123)" data-testid="input-new-ref" />
            <input ref={newTitle} className="border rounded px-2 py-1 text-sm" placeholder="New issue title" data-testid="input-new-title" />
            <button className="text-xs px-2 py-1 border rounded" onClick={submitNew} data-testid="button-add-issue">Add</button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          {STATUSES.map(s=>(
            <div key={s}
              className="min-h-[340px] p-2 border rounded-2xl"
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{ const id = e.dataTransfer.getData("text/plain"); if (id) move(id, s); }}
              data-testid={`column-${s}`}
            >
              <div className="text-xs opacity-70 mb-2">{s.toUpperCase()} ({by(s).length})</div>
              <div className="space-y-2">
                {by(s).map(i=>(
                  <div key={i.id}
                       draggable
                       onDragStart={e=>e.dataTransfer.setData("text/plain", i.id)}
                       className="p-2 rounded-lg bg-slate-800 cursor-grab"
                       data-testid={`issue-card-${i.id}`}
                  >
                    <div className="text-xs opacity-70 flex items-center justify-between">
                      <span data-testid={`issue-ref-${i.id}`}>{i.ref || "—"}</span>
                      <span title="Integration" className="opacity-60" data-testid={`issue-integration-${i.id}`}>{intName(i.integrationId)}</span>
                    </div>
                    <div className="text-sm font-medium" data-testid={`issue-title-${i.id}`}>{i.title}</div>
                    {i.field && <div className="text-[11px] opacity-70 mt-0.5" data-testid={`issue-field-${i.id}`}>Field: {i.field}</div>}
                    {i.priority && <div className="text-[11px] opacity-70" data-testid={`issue-priority-${i.id}`}>Priority: {i.priority}</div>}
                    <div className="mt-2 flex items-center gap-1">
                      <button className="text-[11px] px-2 py-0.5 border rounded" onClick={async()=>{
                        const title = prompt("Title", i.title) || i.title;
                        const field = prompt("Field", i.field||"") || i.field;
                        const priority = prompt("Priority (low|med|high|critical)", i.priority||"") || i.priority;
                        await save({ id:i.id, title, field, priority });
                      }} data-testid={`button-edit-${i.id}`}>Edit</button>
                      <button className="text-[11px] px-2 py-0.5 border rounded" onClick={()=>del(i.id)} data-testid={`button-delete-${i.id}`}>Delete</button>
                    </div>
                    <IssueArtifacts issueId={i.id} />
                  </div>
                ))}
                {!by(s).length && <div className="text-xs opacity-60">No issues</div>}
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
    
  );
}

function IssueArtifacts({ issueId }:{ issueId:string }){
  const pid = getProjectId();
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<any[]>([]);
  const [url,setUrl]=useState(""); const [label,setLabel]=useState("");

  async function load(){
    const r = await fetchWithAuth(`/api/ma/issues/${issueId}/artifacts?projectId=${pid}`); const j = await r.json();
    setItems(j.items||[]);
  }
  useEffect(()=>{ if(open) load(); },[open]);

  async function add(){
    if (!url) return;
    await fetchWithAuth(`/api/ma/issues/${issueId}/artifacts`, { method:"POST", body: JSON.stringify({ projectId: pid, url, label }) });
    setUrl(""); setLabel(""); load();
  }
  async function del(id:string){
    await fetchWithAuth(`/api/ma/issues/${issueId}/artifacts/${id}?projectId=${pid}`, { method:"DELETE" }); load();
  }

  return (
    <div className="mt-2" data-testid={`artifacts-${issueId}`}>
      <button className="text-[11px] underline" onClick={()=>setOpen(o=>!o)} data-testid={`button-toggle-artifacts-${issueId}`}>{open?"Hide":"Artifacts"}</button>
      {open && (
        <div className="mt-1 p-2 border rounded" data-testid={`artifacts-panel-${issueId}`}>
          <div className="flex items-center gap-1">
            <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="https://artifact/url" value={url} onChange={e=>setUrl(e.target.value)} data-testid={`input-artifact-url-${issueId}`} />
            <input className="border rounded px-2 py-1 text-xs" placeholder="label" value={label} onChange={e=>setLabel(e.target.value)} data-testid={`input-artifact-label-${issueId}`} />
            <button className="text-[11px] px-2 py-1 border rounded" onClick={add} data-testid={`button-add-artifact-${issueId}`}>Add</button>
          </div>
          <ul className="mt-2 space-y-1">
            {items.map(a=>(
              <li key={a.id} className="text-[11px] flex items-center justify-between" data-testid={`artifact-${a.id}`}>
                <a className="underline truncate" href={a.url} target="_blank" rel="noreferrer" data-testid={`link-artifact-${a.id}`}>{a.label||a.url}</a>
                <button className="text-[11px] px-2 py-0.5 border rounded" onClick={()=>del(a.id)} data-testid={`button-remove-artifact-${a.id}`}>Remove</button>
              </li>
            ))}
            {!items.length && <li className="opacity-60 text-[11px]" data-testid={`text-no-artifacts-${issueId}`}>No artifacts</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
