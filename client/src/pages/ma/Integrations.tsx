import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId } from "@/lib/project";
import { authFetch } from "@/lib/authFetch";
import { useEffect, useState, useRef } from "react";
import { useUserRole, canEdit } from "@/lib/role";

type Item = {
  id:string; name:string; sourceSystem:string; targetSystem:string; status:string;
  owner?:string; environment?:string; testStatus?:string; cutoverStart?:string; cutoverEnd?:string;
  runbookUrl?:string; notes?:string; dependsOn?:string[];
};

type Summary = {
  counts: { status:string; n:number }[];
  edges: { from:string; to:string }[];
  items: Item[];
};

export default function MAIntegrations() {
  const pid = getProjectId();
  const userRole = useUserRole();
  const readonly = !canEdit(userRole);
  const [tab, setTab] = useState<"grid"|"kanban"|"graph">("grid");
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Summary| null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [detailId, setDetailId] = useState<string|null>(null);

  async function loadGrid(){
    const r = await authFetch(`/api/ma/integrations/grid?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setItems(j.items||[]);
  }
  async function loadSummary(){
    const r = await authFetch(`/api/ma/integrations/summary?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setSummary(j);
  }
  useEffect(()=>{ if(pid){ loadGrid(); loadSummary(); } },[pid]);

  async function patch(id:string, body:Partial<Item>){
    const r = await authFetch(`/api/ma/integrations/${id}`, { 
      method:"PATCH", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body) 
    });
    if (!r.ok) setStatusMsg("Save failed"); else setStatusMsg("Saved");
    setTimeout(()=>setStatusMsg(""), 800);
    loadGrid(); loadSummary();
  }

  function reload(){
    loadGrid(); loadSummary();
  }

  return (
    <AppFrame sidebar={<SidebarV2/>}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <div className="flex items-center gap-2">
            <TabBtn cur={tab} val="grid" set={setTab} />
            <TabBtn cur={tab} val="kanban" set={setTab} />
            <TabBtn cur={tab} val="graph" set={setTab} />
          </div>
        </div>
        <div className="text-xs opacity-70">{statusMsg}</div>

        {tab==="grid" && <Grid items={items} onPatch={patch} onDetail={setDetailId} readonly={readonly} />}
        {tab==="kanban" && <Kanban items={items} onPatch={patch} onDetail={setDetailId} readonly={readonly} />}
        {tab==="graph" && summary && <Graph summary={summary} />}
      </div>
      <DetailDrawer id={detailId} onClose={()=>setDetailId(null)} allItems={items} onPatched={reload} readonly={readonly} />
    </AppFrame>
  );
}

function TabBtn({cur,val,set}:{cur:any,val:any,set:any}) {
  const active = cur===val;
  return (
    <button 
      className={`text-xs px-2 py-1 rounded-lg border ${active?"bg-slate-800":""}`} 
      onClick={()=>set(val)}
      data-testid={`tab-${val}`}
    >
      {String(val).toUpperCase()}
    </button>
  );
}

function Grid({items,onPatch,onDetail,readonly=false}:{items:Item[]; onPatch:(id:string,b:Partial<Item>)=>void; onDetail:(id:string)=>void; readonly?:boolean}){
  const cols: (keyof Item)[] = ["name","sourceSystem","targetSystem","status","owner","environment","testStatus","cutoverStart","cutoverEnd","runbookUrl","notes"];
  const render = (it:Item, k:keyof Item) => {
    const v = it[k] ?? "";
    const type = (k==="cutoverStart"||k==="cutoverEnd") ? "date" : "text";
    const val = (():string=>{
      if(type==="date" && v) return String(v).slice(0,10);
      return String(v);
    })();
    return (
      <input
        className="w-full bg-transparent border-b border-transparent focus:border-slate-500 px-1 py-0.5 text-sm disabled:opacity-60"
        type={type}
        defaultValue={val}
        disabled={readonly}
        onBlur={e=>{
          if(readonly) return;
          const newV = e.target.value;
          if(newV===val) return;
          const payload:any = {}; payload[k] = (type==="date" && newV) ? new Date(newV).toISOString() : newV;
          onPatch(it.id, payload);
        }}
        data-testid={`input-${it.id}-${String(k)}`}
      />
    );
  };
  return (
    <div className="overflow-auto">
      <table className="min-w-[900px] w-full text-sm border-separate border-spacing-y-1">
        <thead>
          <tr className="text-xs opacity-70">
            <th className="text-left px-2 py-1"></th>
            {cols.map(c => <th key={c} className="text-left px-2 py-1">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map(it=>(
            <tr key={it.id} className="bg-slate-900/40 border rounded-xl" data-testid={`row-${it.id}`}>
              <td className="px-2 py-1">
                <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>onDetail(it.id)} data-testid={`button-detail-${it.id}`}>Details</button>
              </td>
              {cols.map(c => <td key={c} className="px-2 py-1">{render(it, c)}</td>)}
            </tr>
          ))}
          {!items.length && <tr><td className="opacity-70 text-sm px-2 py-2" colSpan={12}>No integrations yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const STATUSES = ["planned","building","testing","ready"] as const;

function Kanban({items,onPatch,onDetail,readonly=false}:{items:Item[]; onPatch:(id:string,b:Partial<Item>)=>void; onDetail:(id:string)=>void; readonly?:boolean}){
  const by = (s:string)=> items.filter(i=> (i.status||"planned")===s);
  function handleDrop(e:React.DragEvent<HTMLDivElement>, status:string){
    if(readonly) return;
    const id = e.dataTransfer.getData("text/plain");
    onPatch(id, { status });
  }
  return (
    <div className="grid md:grid-cols-4 gap-3">
      {STATUSES.map(s=>(
        <div key={s}
          className="min-h-[300px] p-2 border rounded-2xl"
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>handleDrop(e,s)}
          data-testid={`column-${s}`}
        >
          <div className="text-xs opacity-70 mb-2">{s.toUpperCase()} ({by(s).length})</div>
          <div className="space-y-2">
            {by(s).map(i=>(
              <div key={i.id}
                   draggable={!readonly}
                   onDragStart={e=>!readonly && e.dataTransfer.setData("text/plain", i.id)}
                   onDoubleClick={()=>onDetail(i.id)}
                   className={`p-2 rounded-lg bg-slate-800 ${readonly ? 'cursor-default' : 'cursor-grab'}`}
                   data-testid={`card-${i.id}`}
              >
                <div className="text-sm font-medium truncate">{i.name}</div>
                <div className="text-[11px] opacity-70">{i.sourceSystem} → {i.targetSystem}</div>
                {i.owner && <div className="text-[11px] opacity-70">Owner: {i.owner}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Graph({summary}:{summary:Summary}){
  const items = summary.items||[];
  const edges = summary.edges||[];
  const cols: string[] = [...STATUSES];
  const colX = (idx:number)=> 100 + idx*220;
  const rowY = (row:number)=> 60 + row*70;
  const positions = new Map<string,{x:number,y:number}>();
  
  const normalizeStatus = (s: string) => {
    const normalized = (s || "planned").toLowerCase();
    return STATUSES.includes(normalized as any) ? normalized : "planned";
  };

  const otherItems: Item[] = [];
  cols.forEach((s,ci)=>{
    const inCol = items.filter(i=> normalizeStatus(i.status)===s);
    inCol.forEach((it,ri)=> positions.set(it.id,{x:colX(ci), y:rowY(ri)}));
  });

  const unknownStatuses = new Set(items.map(i=>i.status).filter(s=>!STATUSES.includes((s||"planned") as any)));
  if(unknownStatuses.size > 0){
    cols.push("other");
    const otherCol = items.filter(i=>unknownStatuses.has(i.status));
    otherCol.forEach((it,ri)=> positions.set(it.id,{x:colX(cols.length-1), y:rowY(ri)}));
  }

  const w = colX(cols.length-1) + 150;
  const maxRowsPerCol = Math.max(...cols.map((s,ci)=>{
    if(s==="other") return items.filter(i=>unknownStatuses.has(i.status)).length;
    return items.filter(i=>normalizeStatus(i.status)===s).length;
  }));
  const h = Math.max(400, rowY(maxRowsPerCol));

  return (
    <div className="overflow-auto border rounded-2xl">
      <svg width={w} height={h}>
        {cols.map((s,ci)=>(
          <text key={s} x={colX(ci)} y={20} fontSize="12" fill="#aaa">{String(s).toUpperCase()}</text>
        ))}
        {edges.map((e,i)=>{
          const a = positions.get(e.from); const b = positions.get(e.to);
          if (!a || !b) return null;
          return <line key={i} x1={a.x+90} y1={a.y+20} x2={b.x-90} y2={b.y+20} stroke="#5b91ff" strokeWidth="1.5" markerEnd="url(#arrow)" />;
        })}
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#5b91ff" />
          </marker>
        </defs>
        {items.map(it=>{
          const p = positions.get(it.id);
          if (!p) return null;
          return (
            <g key={it.id}>
              <rect x={p.x-90} y={p.y} width={180} height={48} rx={10} ry={10} fill="#1f2937" stroke="#374151" />
              <text x={p.x} y={p.y+18} textAnchor="middle" fontSize="12" fill="#e5e7eb">{it.name}</text>
              <text x={p.x} y={p.y+34} textAnchor="middle" fontSize="10" fill="#9ca3af">{it.sourceSystem} → {it.targetSystem}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DetailDrawer({id, onClose, allItems, onPatched, readonly=false}:{id:string|null; onClose:()=>void; allItems:Item[]; onPatched:()=>void; readonly?:boolean}){
  const [data,setData] = useState<any>(null);
  const [loading,setLoading] = useState(false);
  
  useEffect(()=>{ (async()=>{
    if(!id) return;
    setLoading(true);
    const r = await authFetch(`/api/ma/integrations/${id}`);
    const j = await r.json(); setData(j); setLoading(false);
  })(); },[id]);
  
  if(!id) return null;
  const it: Item|undefined = data?.item;
  const tests: any[] = data?.tests||[];
  const rev: any[] = data?.reverseDeps||[];
  const nameMap = new Map(allItems.map(i=>[i.id,i.name]));

  async function savePatch(body:any){
    await authFetch(`/api/ma/integrations/${id}`, { 
      method:"PATCH", 
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body) 
    });
    await onPatched();
    const r = await authFetch(`/api/ma/integrations/${id}`); 
    const j=await r.json(); setData(j);
  }
  
  async function addTest(){
    const environment = (document.getElementById("t_env") as HTMLInputElement)?.value || "test";
    const status = (document.getElementById("t_status") as HTMLSelectElement)?.value || "in_progress";
    const notes = (document.getElementById("t_notes") as HTMLTextAreaElement)?.value || "";
    const link = (document.getElementById("t_link") as HTMLInputElement)?.value || "";
    await authFetch(`/api/ma/integrations/${id}/test-runs`, { 
      method:"POST",
      headers:{"Content-Type":"application/json"}, 
      body: JSON.stringify({ environment, status, notes, link }) 
    });
    const r = await authFetch(`/api/ma/integrations/${id}`); 
    const j=await r.json(); setData(j);
    (document.getElementById("t_env") as HTMLInputElement).value = "test";
    (document.getElementById("t_status") as HTMLSelectElement).value = "in_progress";
    (document.getElementById("t_notes") as HTMLTextAreaElement).value = "";
    (document.getElementById("t_link") as HTMLInputElement).value = "";
  }

  function dependsText() {
    const ids: string[] = it?.dependsOn || [];
    return ids.map(i=>nameMap.get(i)||i).join(", ");
  }
  
  async function saveDepends() {
    const raw = (document.getElementById("dep_edit") as HTMLInputElement)?.value || "";
    const names = raw.split(",").map(s=>s.trim()).filter(Boolean);
    const ids: string[] = [];
    names.forEach(n=>{
      const hit = allItems.find(i=>i.name.toLowerCase()===n.toLowerCase());
      if (hit && hit.id !== id) ids.push(hit.id);
    });
    await savePatch({ dependsOn: ids });
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="absolute right-0 top-0 h-full w-[520px] bg-background border-l p-4 overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-semibold">Integration Details</div>
          <button className="text-xs px-2 py-1 border rounded-lg" onClick={onClose} data-testid="button-close-drawer">Close</button>
        </div>
        {loading && <div className="text-sm opacity-70">Loading…</div>}
        {!loading && !it && <div className="text-sm opacity-70">Not found</div>}
        {!loading && it && (
          <>
            <div className="space-y-2">
              <Field label="Name" value={it.name} onSave={v=>savePatch({name:v})} />
              <Field label="Source" value={it.sourceSystem} onSave={v=>savePatch({sourceSystem:v})} />
              <Field label="Target" value={it.targetSystem} onSave={v=>savePatch({targetSystem:v})} />
              <Field label="Status" value={it.status} onSave={v=>savePatch({status:v})} />
              <Field label="Owner" value={it.owner||""} onSave={v=>savePatch({owner:v||null})} />
              <Field label="Environment" value={it.environment||""} onSave={v=>savePatch({environment:v||null})} />
              <Field label="Test Status" value={it.testStatus||""} onSave={v=>savePatch({testStatus:v||null})} />
              <Field label="Runbook URL" value={it.runbookUrl||""} onSave={v=>savePatch({runbookUrl:v||null})} />
              <Field label="Notes" value={it.notes||""} onSave={v=>savePatch({notes:v||null})} multiline />
            </div>

            <div className="mt-4 p-3 border rounded-2xl">
              <div className="text-sm font-medium mb-1">Dependencies</div>
              <DependsPicker
                allItems={allItems.filter(x=>x.id!==id)}
                valueIds={(it?.dependsOn||[]) as string[]}
                onChange={async (ids)=>{ await savePatch({ dependsOn: ids }); }}
              />
              {!!(rev?.length) && <div className="text-xs opacity-70 mt-2">Required by: {rev.map((r:any)=>r.name).join(", ")}</div>}
            </div>

            <div className="mt-4 p-3 border rounded-2xl">
              <div className="text-sm font-medium mb-2">Test Runs</div>
              <ul className="space-y-2">
                {tests.map(t=>(
                  <li key={t.id} className="text-sm p-2 border rounded-lg" data-testid={`test-${t.id}`}>
                    <div className="flex items-center justify-between">
                      <div>{t.environment} • {t.status}</div>
                      <div className="text-xs opacity-70">{new Date(t.executedAt).toLocaleString()}</div>
                    </div>
                    {t.notes && <div className="text-xs mt-1">{t.notes}</div>}
                    {t.link && <a className="text-xs underline" href={t.link} target="_blank" rel="noreferrer">artifact</a>}
                  </li>
                ))}
                {!tests.length && <li className="text-xs opacity-70">No test runs yet.</li>}
              </ul>

              <div className="mt-2 grid md:grid-cols-2 gap-2">
                <input id="t_env" className="border rounded px-2 py-1 text-sm" placeholder="environment (test/stage/prod)" defaultValue="test" data-testid="input-test-environment" />
                <select id="t_status" className="border rounded px-2 py-1 text-sm" defaultValue="in_progress" data-testid="select-test-status">
                  <option value="in_progress">in_progress</option>
                  <option value="pass">pass</option>
                  <option value="fail">fail</option>
                  <option value="blocked">blocked</option>
                </select>
                <input id="t_link" className="border rounded px-2 py-1 text-sm md:col-span-2" placeholder="artifact URL" data-testid="input-test-link" />
                <textarea id="t_notes" className="border rounded px-2 py-1 text-sm md:col-span-2" placeholder="notes" data-testid="textarea-test-notes"></textarea>
              </div>
              <div className="mt-2">
                <button className="text-xs px-2 py-1 border rounded-lg" onClick={addTest} data-testid="button-add-test">Add Test Run</button>
              </div>
            </div>

            <SpecsPanel integrationId={id} />
            
            <div className="mt-4 p-3 border rounded-2xl">
              <div className="text-sm font-medium mb-2">Integration Adapter</div>
              <div className="grid md:grid-cols-2 gap-2">
                <div>
                  <div className="text-xs opacity-70 mb-1">Adapter Type</div>
                  <select 
                    defaultValue={((it as any).adapterType)||""} 
                    onChange={e=>savePatch({ adapterType: e.target.value||null })} 
                    className="w-full border rounded px-2 py-1 bg-transparent text-sm"
                    data-testid="select-adapter-type"
                  >
                    <option value="">(none)</option>
                    <option value="http_get">HTTP GET</option>
                    <option value="http_post">HTTP POST</option>
                    <option value="sftp_pull">SFTP Pull</option>
                    <option value="sftp_push">SFTP Push</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs opacity-70 mb-1">Adapter Config (JSON)</div>
                  <textarea 
                    className="w-full border rounded px-2 py-1 text-xs font-mono h-24"
                    defaultValue={JSON.stringify(((it as any).adapterConfig)||{}, null, 2)}
                    onBlur={e=>{ 
                      try { 
                        const v=JSON.parse(e.target.value||"{}"); 
                        savePatch({ adapterConfig: v }); 
                      } catch(err) {
                        console.error("Invalid JSON:", err);
                      } 
                    }}
                    data-testid="textarea-adapter-config"
                  />
                  <div className="text-[11px] opacity-60 mt-1">
                    For HTTP: {`{ "httpUrl": "...", "headers": {...}, "bodyTemplate": {...} }`} • SFTP: {`{ "host": "...", "user": "...", "path": "/", "port": 22 }`} (or set SFTP_* secrets)
                  </div>
                </div>
              </div>
            </div>

            <RunsPanel integrationId={id} integration={it} onRefresh={()=>{ const r = authFetch(`/api/ma/integrations/${id}`); r.then(res=>res.json()).then(j=>setData(j)); }} />
          </>
        )}
      </div>
    </div>
  );
}

function Field({label,value,onSave,multiline=false}:{label:string; value:string; onSave:(v:string)=>void; multiline?:boolean}){
  const [v,setV] = useState(value||"");
  useEffect(()=>setV(value||""),[value]);
  return (
    <div>
      <div className="text-xs opacity-70">{label}</div>
      {multiline ? (
        <textarea className="w-full border rounded px-2 py-1 text-sm" value={v} onChange={e=>setV(e.target.value)} onBlur={()=>onSave(v)} data-testid={`field-${label.toLowerCase().replace(/\s/g,'-')}`} />
      ) : (
        <input className="w-full border rounded px-2 py-1 text-sm" value={v} onChange={e=>setV(e.target.value)} onBlur={()=>onSave(v)} data-testid={`field-${label.toLowerCase().replace(/\s/g,'-')}`} />
      )}
    </div>
  );
}

function DependsPicker({allItems,valueIds,onChange}:{allItems:Item[]; valueIds:string[]; onChange:(ids:string[])=>void}){
  const [q,setQ] = useState("");
  const [ids,setIds] = useState<string[]>(valueIds||[]);
  useEffect(()=>setIds(valueIds||[]),[valueIds]);

  const options = allItems
    .filter(i=> i.name.toLowerCase().includes(q.toLowerCase()) || (i.sourceSystem+" "+i.targetSystem).toLowerCase().includes(q.toLowerCase()))
    .slice(0,50);

  function toggle(id:string){
    setIds(s=>{
      const has = s.includes(id);
      const next = has ? s.filter(x=>x!==id) : [...s,id];
      onChange(next);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {ids.map(id=>{
          const it = allItems.find(i=>i.id===id);
          return it ? (
            <span key={id} className="text-xs px-2 py-1 rounded-full bg-slate-800 border" data-testid={`chip-${id}`}>
              {it.name}
              <button className="ml-1 opacity-60" onClick={()=>toggle(id)} data-testid={`button-remove-${id}`}>×</button>
            </span>
          ) : null;
        })}
      </div>
      <input className="w-full border rounded px-2 py-1 text-sm mb-2" placeholder="Search integration…" value={q} onChange={e=>setQ(e.target.value)} data-testid="input-search-deps" />
      <ul className="max-h-48 overflow-auto border rounded">
        {options.map(o=>(
          <li key={o.id} className="px-2 py-1 text-sm flex items-center justify-between hover:bg-slate-800/50 cursor-pointer" onClick={()=>toggle(o.id)} data-testid={`option-${o.id}`}>
            <span className="truncate">{o.name}</span>
            <input type="checkbox" checked={ids.includes(o.id)} readOnly />
          </li>
        ))}
        {!options.length && <li className="px-2 py-2 text-xs opacity-70">No matches.</li>}
      </ul>
    </div>
  );
}

function SpecsPanel({ integrationId }: { integrationId: string }) {
  const pid = getProjectId();
  const [specs, setSpecs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; content: string; filename: string } | null>(null);

  async function loadSpecs() {
    if (!integrationId || !pid) return;
    const r = await authFetch(`/api/ma/integrations/specs/${encodeURIComponent(integrationId)}/list?projectId=${encodeURIComponent(pid!)}`);
    if (r.ok) {
      const j = await r.json();
      setSpecs(j.items || []);
    }
  }

  useEffect(() => {
    loadSpecs();
  }, [integrationId, pid]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pid) return;

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", pid);
    fd.append("integrationId", integrationId);

    const r = await authFetch(`/api/ma/integrations/specs/${encodeURIComponent(integrationId)}/upload`, {
      method: "POST",
      body: fd
    });

    setUploading(false);
    if (r.ok) {
      loadSpecs();
      e.target.value = "";
    }
  }

  async function handlePreview(spec: any) {
    const r = await authFetch(`/api/ma/integrations/specs/${spec.id}/preview?projectId=${encodeURIComponent(pid!)}`);
    if (r.ok) {
      const j = await r.json();
      setPreview({ id: spec.id, content: j.content || "", filename: spec.filename });
    }
  }

  async function handleDelete(specId: string) {
    if (!confirm("Delete this spec?")) return;
    const r = await authFetch(`/api/ma/integrations/specs/${specId}?projectId=${encodeURIComponent(pid!)}`, {
      method: "DELETE"
    });
    if (r.ok) {
      loadSpecs();
      if (preview?.id === specId) setPreview(null);
    }
  }

  return (
    <div className="mt-4 p-3 border rounded-2xl">
      <div className="text-sm font-medium mb-2">Integration Specifications</div>

      <ul className="space-y-2">
        {specs.map(s => (
          <li key={s.id} className="text-sm p-2 border rounded-lg flex items-center justify-between" data-testid={`spec-${s.id}`}>
            <div className="truncate flex-1">
              <div className="font-medium">{s.filename}</div>
              <div className="text-xs opacity-70">{new Date(s.uploadedAt).toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded-lg" onClick={() => handlePreview(s)} data-testid={`button-preview-${s.id}`}>Preview</button>
              <button className="text-xs px-2 py-1 border rounded-lg text-red-400" onClick={() => handleDelete(s.id)} data-testid={`button-delete-${s.id}`}>Delete</button>
            </div>
          </li>
        ))}
        {!specs.length && <li className="text-xs opacity-70">No specifications uploaded yet.</li>}
      </ul>

      <div className="mt-2">
        <label className="text-xs px-2 py-1 border rounded-lg cursor-pointer inline-block" data-testid="button-upload-spec">
          {uploading ? "Uploading..." : "Upload Spec (PDF/DOCX)"}
          <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPreview(null)}></div>
          <div className="absolute inset-4 bg-background border rounded-2xl p-4 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">{preview.filename}</div>
              <button className="text-xs px-2 py-1 border rounded-lg" onClick={() => setPreview(null)} data-testid="button-close-preview">Close</button>
            </div>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap" data-testid="preview-content">{preview.content}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunsPanel({ integrationId, integration, onRefresh }: { integrationId: string; integration: Item; onRefresh:()=>void }) {
  const pid = getProjectId();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page,setPage]=useState(0); const limit=20;
  const [schedCron, setSchedCron] = useState((integration as any).scheduleCron || "");
  const [schedTz, setSchedTz] = useState((integration as any).timezone || "");
  const [slaTarget, setSlaTarget] = useState((integration as any).slaTarget || "");
  const [saveMsg, setSaveMsg] = useState("");
  const [openArtifactsId, setOpenArtifactsId] = useState<string|null>(null);

  async function loadRuns() {
    if (!integrationId || !pid) return;
    setLoading(true);
    const p = new URLSearchParams({ projectId: pid!, integrationId, limit:String(limit), offset:String(page*limit) });
    const r = await authFetch(`/api/ma/runs?${p.toString()}`);
    if (r.ok) {
      const j = await r.json();
      setRuns(j.items || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRuns();
  }, [integrationId, pid, page]);

  async function saveSchedule() {
    if (!pid || !integrationId) return;
    const body: any = { 
      scheduleCron: schedCron.trim() || null, 
      timezone: schedTz.trim() || null, 
      slaTarget: slaTarget.trim() || null 
    };
    const r = await authFetch(`/api/ma/integrations/${integrationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (r.ok) {
      setSaveMsg("✓ Saved");
      setTimeout(() => setSaveMsg(""), 2000);
      onRefresh();
      loadRuns();
    } else {
      setSaveMsg("✗ Failed");
      setTimeout(() => setSaveMsg(""), 2000);
    }
  }

  async function markRun(runId: string, status: string) {
    const r = await authFetch(`/api/ma/runs/${runId}/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, projectId: pid })
    });
    if (r.ok) loadRuns();
  }

  async function triggerRun() {
    if (!pid || !integrationId) return;
    const r = await authFetch(`/api/ma/runs/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: pid, integrationId })
    });
    if (r.ok) {
      alert("Run queued successfully.");
      loadRuns();
    } else {
      alert("Failed to queue run.");
    }
  }

  const statusColor = (s: string) => {
    if (s === "success") return "text-green-400";
    if (s === "failed") return "text-red-400";
    if (s === "missed") return "text-orange-400";
    if (s === "running") return "text-blue-400";
    return "text-muted-foreground";
  };

  return (
    <div className="mt-4 p-3 border rounded-2xl">
      <div className="text-sm font-medium mb-2">Scheduled Runs</div>

      <div className="mb-3 space-y-2">
        <div>
          <div className="text-xs opacity-70 mb-1">Schedule (cron expression)</div>
          <input 
            className="w-full border rounded px-2 py-1 text-sm" 
            placeholder="0 2 * * * (daily at 2am)" 
            defaultValue={(integration as any).scheduleCron || ""}
            onChange={e => setSchedCron(e.target.value)}
            data-testid="input-schedule-cron"
          />
        </div>
        <div>
          <div className="text-xs opacity-70 mb-1">Timezone</div>
          <input 
            className="w-full border rounded px-2 py-1 text-sm" 
            placeholder="America/New_York" 
            defaultValue={(integration as any).timezone || ""}
            onChange={e => setSchedTz(e.target.value)}
            data-testid="input-schedule-tz"
          />
        </div>
        <div>
          <div className="text-xs opacity-70 mb-1">SLA Target</div>
          <input 
            className="w-full border rounded px-2 py-1 text-sm" 
            placeholder="10m (minutes after planned)" 
            defaultValue={(integration as any).slaTarget || ""}
            onChange={e => setSlaTarget(e.target.value)}
            data-testid="input-sla-target"
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="text-xs px-2 py-1 border rounded-lg" 
            onClick={saveSchedule}
            data-testid="button-save-schedule"
          >
            Save Schedule
          </button>
          <button 
            className="text-xs px-2 py-1 border rounded-lg bg-blue-600 text-white" 
            onClick={triggerRun}
            data-testid="button-trigger-run"
          >
            Run Now
          </button>
          {saveMsg && <span className="text-xs opacity-70">{saveMsg}</span>}
        </div>
      </div>

      {loading && <div className="text-xs opacity-70">Loading...</div>}
      <ul className="space-y-2">
        {runs.map(r => (
          <li key={r.id} className="text-sm p-2 border rounded-lg" data-testid={`run-${r.id}`}>
            <div className="flex items-center justify-between">
              <div className={statusColor(r.status)}>
                {r.status.toUpperCase()}
              </div>
              <div className="text-xs opacity-70">
                {r.plannedAt && `Planned: ${new Date(r.plannedAt).toLocaleString()}`}
              </div>
            </div>
            {r.startedAt && <div className="text-xs opacity-70 mt-1">Started: {new Date(r.startedAt).toLocaleString()}</div>}
            {r.finishedAt && <div className="text-xs opacity-70 mt-1">Finished: {new Date(r.finishedAt).toLocaleString()}</div>}
            {r.durationMs && <div className="text-xs opacity-70 mt-1">Duration: {(r.durationMs / 1000).toFixed(1)}s</div>}
            {r.note && <div className="text-xs mt-1">{r.note}</div>}
            {r.status === "planned" && (
              <div className="mt-2 flex gap-2">
                <button className="text-xs px-2 py-1 border rounded-lg" onClick={() => markRun(r.id, "running")} data-testid={`button-start-${r.id}`}>Start</button>
                <button className="text-xs px-2 py-1 border rounded-lg text-green-400" onClick={() => markRun(r.id, "success")} data-testid={`button-success-${r.id}`}>Mark Success</button>
                <button className="text-xs px-2 py-1 border rounded-lg text-red-400" onClick={() => markRun(r.id, "failed")} data-testid={`button-fail-${r.id}`}>Mark Failed</button>
              </div>
            )}
            <div className="mt-2">
              <button 
                className="text-xs px-2 py-1 border rounded-lg" 
                onClick={() => setOpenArtifactsId(openArtifactsId === r.id ? null : r.id)}
                data-testid={`button-artifacts-${r.id}`}
              >
                {openArtifactsId === r.id ? "Hide" : "Show"} Artifacts
              </button>
            </div>
            {openArtifactsId === r.id && <RunArtifacts runId={r.id} />}
          </li>
        ))}
        {!runs.length && !loading && <li className="text-xs opacity-70">No scheduled runs yet.</li>}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <button className="text-xs px-2 py-1 border rounded" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} data-testid="button-prev-page">Prev</button>
        <div className="text-xs opacity-70">Page {page+1}</div>
        <button className="text-xs px-2 py-1 border rounded" onClick={()=>setPage(p=>p+1)} data-testid="button-next-page">Next</button>
      </div>
    </div>
  );
}

function RunArtifacts({ runId }: { runId: string }) {
  const pid = getProjectId();
  const [items, setItems] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await authFetch(`/api/ma/runs/artifacts/${runId}/list`);
    const j = await r.json();
    setItems(j.items || []);
  }

  useEffect(() => {
    load();
  }, [runId]);

  async function addFile() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("projectId", pid!);
    await authFetch(`/api/ma/runs/artifacts/${runId}/upload`, { method: "POST", body: fd });
    if (fileRef.current) fileRef.current.value = "";
    load();
  }

  async function addUrl() {
    const url = prompt("Artifact URL") || "";
    if (!url) return;
    await authFetch(`/api/ma/runs/artifacts/${runId}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: pid, url })
    });
    load();
  }

  async function del(id: string) {
    await authFetch(`/api/ma/runs/artifacts/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-2 border rounded mt-2" data-testid={`artifacts-panel-${runId}`}>
      <div className="flex items-center gap-2 mb-2">
        <input ref={fileRef} type="file" className="text-xs" data-testid="input-artifact-file" />
        <button className="text-xs px-2 py-1 border rounded" onClick={addFile} data-testid="button-upload-artifact">
          Upload
        </button>
        <button className="text-xs px-2 py-1 border rounded" onClick={addUrl} data-testid="button-add-url-artifact">
          Add URL
        </button>
      </div>
      <ul className="space-y-1 text-xs">
        {items.map((a: any) => (
          <li key={a.id} className="flex items-center justify-between" data-testid={`artifact-${a.id}`}>
            <a
              className="underline truncate flex-1"
              href={`/api/ma/runs/artifacts/preview/${a.id}`}
              target="_blank"
              rel="noreferrer"
              data-testid={`link-artifact-${a.id}`}
            >
              {a.name || a.url}
            </a>
            <button
              className="px-2 py-0.5 border rounded ml-2"
              onClick={() => del(a.id)}
              data-testid={`button-remove-artifact-${a.id}`}
            >
              Remove
            </button>
          </li>
        ))}
        {!items.length && <li className="opacity-60">No artifacts</li>}
      </ul>
    </div>
  );
}
