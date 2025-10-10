import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useState } from "react";
import OriginBadge from "@/components/OriginBadge";

type Phase = { id:string; title:string; description?:string; startsAt?:string; endsAt?:string; status:string; orderIndex:number };
type Item  = { id:string; phaseId?:string; title:string; module?:string; description?:string; status:string; priority:number; originType?:string; originId?:string; orderIndex:number };

export default function RoadmapPage(){
  const pid = getProjectId();
  const [tiles,setTiles]=useState<string[]>([]);
  const [phases,setPhases]=useState<Phase[]>([]);
  const [selPhase,setSelPhase]=useState<string>("");
  const [items,setItems]=useState<Item[]>([]);
  const [q,setQ]=useState("");
  const [selIds,setSelIds]=useState<Record<string,boolean>>({});
  const [prog,setProg]=useState<Record<string,{done:number,total:number}>>({});

  const selectedIds = Object.keys(selIds).filter(id=>selIds[id]);
  const exportUrl = `/api/roadmap/items/export.csv?projectId=${encodeURIComponent(pid!)}${selPhase?`&phaseId=${encodeURIComponent(selPhase)}`:""}${q?`&q=${encodeURIComponent(q)}`:""}`;

  async function loadAll(){
    const p1 = await (await fetchWithAuth(`/api/roadmap/tiles?projectId=${encodeURIComponent(pid!)}`)).json();
    const p2 = await (await fetchWithAuth(`/api/roadmap/phases?projectId=${encodeURIComponent(pid!)}`)).json();
    setTiles(p1.tiles||[]); setPhases(p2.items||[]);
    if (!selPhase && p2.items?.length) setSelPhase(p2.items[0].id);
  }
  async function loadItems(){
    const p = new URLSearchParams({ projectId: pid!, limit:"200", offset:"0" });
    if (selPhase) p.set("phaseId", selPhase);
    if (q) p.set("q", q);
    const r = await fetchWithAuth(`/api/roadmap/items?${p.toString()}`); const j=await r.json();
    setItems(j.items||[]);
  }
  async function loadProg(){
    const r = await fetchWithAuth(`/api/roadmap/phases/progress?projectId=${encodeURIComponent(pid!)}`); const j=await r.json();
    const map: any = {}; (j.items||[]).forEach((x:any)=> map[x.phaseId||"__none"] = { done:x.done, total:x.total });
    setProg(map);
  }

  async function reorderPhases(ids:string[]){
    await fetchWithAuth(`/api/roadmap/phases/reorder`, { method:"POST", body: JSON.stringify({ projectId: pid, ids }) });
    loadAll();
  }
  async function activatePhase(id:string){
    await fetchWithAuth(`/api/roadmap/phases/${id}/activate`, { method:"POST", body: JSON.stringify({ projectId: pid }) });
    loadAll(); loadItems();
  }
  async function completePhase(id:string){
    if (!confirm("Complete this phase?")) return;
    await fetchWithAuth(`/api/roadmap/phases/${id}/complete`, { method:"POST", body: JSON.stringify({ projectId: pid }) });
    loadAll(); loadItems();
  }

  async function bulk(op:any){
    if (!selectedIds.length) return;
    await fetchWithAuth(`/api/roadmap/items/bulk`, { method:"POST", body: JSON.stringify({ projectId: pid, ids: selectedIds, set: op }) });
    setSelIds({}); loadItems();
  }
  async function createTickets(){
    if (!selectedIds.length) return;
    await fetchWithAuth(`/api/roadmap/items/tickets`, { method:"POST", body: JSON.stringify({ projectId: pid, ids: selectedIds }) });
    alert(`Created tickets for ${selectedIds.length} item(s).`);
    setSelIds({}); loadItems();
  }
  
  async function reorderItems(ids:string[]){
    await fetchWithAuth(`/api/roadmap/items/reorder`, { method:"POST", body: JSON.stringify({ projectId: pid, phaseId: selPhase||null, ids }) });
    loadItems();
  }
  async function onMoveToPhase(itemId:string, phaseId:string){
    await fetchWithAuth(`/api/roadmap/items/bulk`, { method:"POST", body: JSON.stringify({ projectId: pid, ids:[itemId], set:{ phaseId } }) });
    loadItems(); loadProg(); loadAll();
  }

  useEffect(()=>{ if(pid) loadAll(); },[pid]);
  useEffect(()=>{ if (pid) loadItems(); },[pid, selPhase, q]);
  useEffect(()=>{ if(pid) loadProg(); },[pid, selPhase, items.length, phases.length]);

  return (
    
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-roadmap">Roadmap</h1>
          <div className="flex items-center gap-2">
            <a className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" href={exportUrl} data-testid="link-export-csv">Export CSV</a>
            <ImportButton onDone={()=>{ loadItems(); loadAll(); }} />
            <GenerateButton onDone={()=>{ loadItems(); loadAll(); }} />
            <AddPhaseButton onDone={()=>loadAll()} />
          </div>
        </div>

        <PhaseStrip
          phases={phases}
          onReorder={reorderPhases}
          onActivate={activatePhase}
          onComplete={completePhase}
          onMoveToPhase={onMoveToPhase}
          prog={prog}
          sel={selPhase}
          setSel={setSelPhase}
        />

        <div className="p-3 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Focus tiles (derived from active phases)</div>
          <div className="flex flex-wrap gap-2">
            {tiles.map(m=>(
              <span key={m} className="px-3 py-1 border rounded-full text-xs" data-testid={`tile-${m.toLowerCase().replace(/\s+/g,'-')}`}>{m}</span>
            ))}
            {!tiles.length && <span className="text-xs opacity-70">No modules yet.</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1 text-sm bg-background" value={selPhase} onChange={e=>setSelPhase(e.target.value)} data-testid="select-phase">
            {phases.map(p=><option key={p.id} value={p.id}>{p.title} {p.status==='done'?'(done)':''}</option>)}
          </select>
          <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={async()=>{
            if (!selPhase) return;
            if (!confirm("Mark this phase as complete and push completed modules to the end?")) return;
            await fetchWithAuth(`/api/roadmap/phases/${selPhase}/complete`, { method:"POST", body: JSON.stringify({ projectId: pid }) });
            loadAll(); loadItems();
          }} data-testid="button-complete-phase">Complete phase</button>
          <input className="border rounded px-2 py-1 text-sm bg-background" placeholder="filter items…" value={q} onChange={e=>setQ(e.target.value)} data-testid="input-filter-items" />
        </div>

        {selectedIds.length > 0 && (
          <div className="p-2 border rounded-2xl flex items-center gap-2 bg-muted/10" data-testid="bulk-toolbar">
            <span className="text-xs">Selected: {selectedIds.length}</span>
            <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>bulk({ status:"in_progress" })} data-testid="button-bulk-in-progress">Set In Progress</button>
            <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>bulk({ status:"done" })} data-testid="button-bulk-done">Mark Done</button>
            <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>{ const p = prompt("Priority (1-99)","40"); if (!p) return; bulk({ priority:Number(p) }); }} data-testid="button-bulk-priority">Set Priority…</button>
            <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>{ const p = prompt("Move to Phase ID",""); if (!p) return; bulk({ phaseId:p }); }} data-testid="button-bulk-move">Move to Phase…</button>
            <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={createTickets} data-testid="button-bulk-tickets">Create Ticket(s)</button>
            <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>setSelIds({})} data-testid="button-bulk-clear">Clear</button>
          </div>
        )}

        <div className="border rounded-2xl overflow-auto">
          <table className="text-sm min-w-[900px] w-full">
            <thead className="bg-slate-900/40 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">Sel</th>
                <th className="text-left px-2 py-1">Title</th>
                <th className="text-left px-2 py-1">Module</th>
                <th className="text-left px-2 py-1">Status</th>
                <th className="text-left px-2 py-1">Priority</th>
                <th className="text-left px-2 py-1">Origin</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it=>(
                <tr key={it.id} className="border-b border-slate-800" data-testid={`row-item-${it.id}`}
                    draggable
                    onDragStart={e=> e.dataTransfer.setData("text/plain", it.id)}
                    onDragOver={e=> e.preventDefault()}
                    onDrop={e=> {
                      e.preventDefault();
                      const srcId = e.dataTransfer.getData("text/plain");
                      if (!srcId || srcId===it.id) return;
                      const idx = items.findIndex(x=>x.id===it.id);
                      const srcIdx = items.findIndex(x=>x.id===srcId);
                      if (srcIdx<0 || idx<0) return;
                      const next = items.slice();
                      const [moved] = next.splice(srcIdx,1);
                      next.splice(idx,0,moved);
                      reorderItems(next.map(x=>x.id));
                    }}
                >
                  <td className="px-2 py-1">
                    <input type="checkbox" checked={!!selIds[it.id]} onChange={e=>setSelIds(s=>({ ...s, [it.id]: e.target.checked }))} data-testid={`checkbox-${it.id}`} />
                  </td>
                  <td className="px-2 py-1">
                    <InlineEdit value={it.title} onSave={v=>updateItem(it.id,{ title:v })} />
                  </td>
                  <td className="px-2 py-1">
                    <InlineSelect value={it.module||""} options={["HCM","Absence","Payroll","Time","Benefits","FIN","Security","Integrations","Custom"]}
                      onSave={v=>updateItem(it.id,{ module:v })} />
                  </td>
                  <td className="px-2 py-1">
                    <InlineSelect value={it.status} options={["backlog","planned","in_progress","done","scoped"]}
                      onSave={v=>updateItem(it.id,{ status:v })} />
                  </td>
                  <td className="px-2 py-1">
                    <InlineNumber value={it.priority} onSave={(v:number)=>updateItem(it.id,{ priority:v })} />
                  </td>
                  <td className="px-2 py-1"><OriginBadge type={it.originType} id={it.originId} /></td>
                </tr>
              ))}
              {!items.length && <tr><td className="px-2 py-2 text-xs opacity-70" colSpan={6}>No items in this phase.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    
  );

  async function updateItem(id:string, body:any){
    await fetchWithAuth(`/api/roadmap/items/upsert`, { method:"POST", body: JSON.stringify({ projectId: pid, id, ...body }) });
    loadItems();
  }
}

function InlineEdit({ value, onSave }:{ value:string; onSave:(v:string)=>void }){
  return <input className="w-full border rounded px-2 py-1 text-sm bg-background" defaultValue={value} onBlur={e=>{ const v=e.target.value; if (v!==value) onSave(v); }} data-testid={`input-edit-${value.slice(0,20)}`} />;
}
function InlineSelect({ value, options, onSave }:{ value:string; options:string[]; onSave:(v:string)=>void }){
  return (
    <select className="border rounded px-2 py-1 text-sm bg-background" defaultValue={value} onChange={e=>onSave(e.target.value)} data-testid={`select-${value}`}>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function InlineNumber({ value, onSave }:{ value:number; onSave:(v:number)=>void }){
  return <input type="number" className="w-24 border rounded px-2 py-1 text-sm bg-background" defaultValue={value} onBlur={e=>{ const v=Number(e.target.value||value); if (v!==value) onSave(v); }} data-testid={`input-priority-${value}`} />;
}

function AddPhaseButton({ onDone }:{ onDone:()=>void }){
  const pid = getProjectId();
  const [open,setOpen]=useState(false);
  const [title,setTitle]=useState("");
  return (
    <>
      <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>setOpen(true)} data-testid="button-add-phase">Add phase</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(520px,92vw)] bg-background border rounded-2xl p-4">
            <div className="text-sm font-medium mb-2">New Phase</div>
            <input className="w-full border rounded px-2 py-1 text-sm bg-background" placeholder="Phase title" value={title} onChange={e=>setTitle(e.target.value)} data-testid="input-phase-title" />
            <div className="mt-3 flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={async()=>{
                if (!title.trim()) return;
                await fetchWithAuth(`/api/roadmap/phases/upsert`, { method:"POST", body: JSON.stringify({ projectId: pid, title }) });
                setOpen(false); setTitle(""); onDone();
              }} data-testid="button-create-phase">Create</button>
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>setOpen(false)} data-testid="button-cancel-phase">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GenerateButton({ onDone }:{ onDone:()=>void }){
  const pid = getProjectId();
  const [open,setOpen]=useState(false);
  const [days,setDays]=useState(14);
  const [phaseId,setPhaseId]=useState<string>("");
  const [phases,setPhases]=useState<Phase[]>([]);

  useEffect(()=>{ (async()=>{
    const r = await fetchWithAuth(`/api/roadmap/phases?projectId=${encodeURIComponent(pid!)}`); const j=await r.json();
    setPhases(j.items||[]);
    setPhaseId(j.items?.[0]?.id||"");
  })(); },[pid]);

  return (
    <>
      <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>setOpen(true)} data-testid="button-generate">Generate from insights…</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(520px,92vw)] bg-background border rounded-2xl p-4">
            <div className="text-sm font-medium mb-2">Generate Roadmap Items</div>
            <div className="grid md:grid-cols-2 gap-2">
              <label className="text-xs">Phase</label>
              <select className="border rounded px-2 py-1 text-sm bg-background" value={phaseId} onChange={e=>setPhaseId(e.target.value)} data-testid="select-generate-phase">
                {phases.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <label className="text-xs">Lookback (days)</label>
              <input type="number" className="border rounded px-2 py-1 text-sm bg-background" value={days} onChange={e=>setDays(Number(e.target.value||14))} data-testid="input-generate-days" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={async()=>{
                await fetchWithAuth(`/api/roadmap/generate`, { method:"POST", body: JSON.stringify({ projectId: pid, intoPhaseId: phaseId, days }) });
                setOpen(false); onDone();
              }} data-testid="button-confirm-generate">Generate</button>
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>setOpen(false)} data-testid="button-cancel-generate">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ImportButton({ onDone }:{ onDone:()=>void }){
  const pid = getProjectId();
  const [open,setOpen]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<any|null>(null);
  const [msg,setMsg]=useState("");

  return (
    <>
      <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>setOpen(true)} data-testid="button-import">Import CSV/XLSX…</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,92vw)] bg-background border rounded-2xl p-4 space-y-2">
            <div className="text-sm font-medium">Import Roadmap Items</div>
            <div className="text-xs opacity-70">
              Columns: <code>Title, Module (opt), Description (opt), Status (opt), Priority (opt), Tags (opt), PhaseTitle (opt), PhaseId (opt), OriginType (opt), OriginId (opt)</code>
            </div>
            <div className="flex items-center gap-2">
              <a className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" href={`/api/roadmap/template.csv`} target="_blank" rel="noreferrer" data-testid="link-template">Download template</a>
              <input type="file" accept=".csv,.xlsx,.xls" className="text-xs" onChange={e=>setFile(e.target.files?.[0]||null)} data-testid="input-file" />
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={dryRun} data-testid="button-dry-run">Dry run</button>
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={commit} disabled={!preview} data-testid="button-commit">Commit</button>
              <div className="text-xs opacity-70">{msg}</div>
            </div>
            {preview && (
              <div className="text-xs p-2 border rounded bg-slate-900/30">
                <div>Preview: items {preview.items}, phases {preview.phasesCreated}</div>
                {preview.errors?.length ? (
                  <details className="mt-1"><summary>Errors</summary>
                    <ul className="list-disc ml-4">{preview.errors.map((e:string,i:number)=><li key={i}>{e}</li>)}</ul>
                  </details>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  async function dryRun(){
    if (!file) { setMsg("Pick a file."); return; }
    const fd = new FormData(); fd.append("file", file); fd.append("projectId", pid!); fd.append("dryRun","true");
    const r = await fetchWithAuth(`/api/roadmap/import`, { method:"POST", body: fd as any });
    const j = await r.json(); if (r.ok){ setPreview(j.preview||null); setMsg(""); } else setMsg(j.error||"failed");
  }
  async function commit(){
    if (!file) { setMsg("Pick a file."); return; }
    const fd = new FormData(); fd.append("file", file); fd.append("projectId", pid!); fd.append("dryRun","false");
    const r = await fetchWithAuth(`/api/roadmap/import`, { method:"POST", body: fd as any });
    const j = await r.json(); if (r.ok){ alert(`Imported ${j.preview?.items||0} item(s)`); setOpen(false); setFile(null); setPreview(null); onDone(); } else setMsg(j.error||"failed");
  }
}

function PhaseStrip({ phases, onReorder, onActivate, onComplete, onMoveToPhase, prog, sel, setSel }:{
  phases:any[]; onReorder:(ids:string[])=>void; onActivate:(id:string)=>void; onComplete:(id:string)=>void; 
  onMoveToPhase:(itemId:string, phaseId:string)=>Promise<void>; prog:Record<string,{done:number,total:number}>; sel:string; setSel:(id:string)=>void;
}){
  const move = (id:string, dir:-1|1)=>{
    const ids = phases.map((p:any)=>p.id);
    const i = ids.indexOf(id); if (i<0) return;
    const j = i + dir; if (j<0 || j>=ids.length) return;
    const next = ids.slice(); const tmp = next[i]; next[i]=next[j]; next[j]=tmp;
    onReorder(next);
  };
  return (
    <div className="p-2 border rounded-2xl flex flex-wrap items-center gap-2" data-testid="phase-strip">
      {phases.map((p:any)=>{
        const pdata = prog[p.id || "__none"];
        const t = pdata?.total||0, d = pdata?.done||0;
        const pct = t ? Math.round((d*100)/t) : 0;
        return (
          <div key={p.id} 
            className={`px-2 py-1 rounded border ${p.id===sel?"border-emerald-500":"border-slate-600"}`} 
            data-testid={`phase-${p.id}`}
            onDragOver={e=>e.preventDefault()}
            onDrop={async e=>{
              const srcId = e.dataTransfer.getData("text/plain");
              if (!srcId) return;
              await onMoveToPhase(srcId, p.id);
            }}
          >
            <button className="text-xs font-medium mr-2" onClick={()=>setSel(p.id)} data-testid={`button-select-phase-${p.id}`}>
              {p.title} {p.status==="active" ? "★" : p.status==="done" ? "✓" : ""}
              <span className="text-[10px] ml-1 opacity-70">{pct}%</span>
            </button>
            <button className="text-[11px] px-1 border rounded mr-1 hover:bg-slate-800/50" onClick={()=>move(p.id,-1)} data-testid={`button-phase-up-${p.id}`}>↑</button>
            <button className="text-[11px] px-1 border rounded mr-1 hover:bg-slate-800/50" onClick={()=>move(p.id, 1)} data-testid={`button-phase-down-${p.id}`}>↓</button>
            {p.status!=="active" && p.status!=="done" && (
              <button className="text-[11px] px-1 border rounded mr-1 hover:bg-slate-800/50" onClick={()=>onActivate(p.id)} data-testid={`button-phase-activate-${p.id}`}>Activate</button>
            )}
            {p.status!=="done" && (
              <button className="text-[11px] px-1 border rounded hover:bg-slate-800/50" onClick={()=>onComplete(p.id)} data-testid={`button-phase-complete-${p.id}`}>Complete</button>
            )}
          </div>
        );
      })}
      {!phases.length && <span className="text-xs opacity-70">No phases yet.</span>}
    </div>
  );
}
