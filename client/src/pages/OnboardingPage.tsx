import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import MemoryPrompt from "@/components/MemoryPrompt";
import { useMemoryPrompts } from "@/hooks/useMemoryPrompts";
import type { MemoryRecommendation } from "@shared/memory";
import { useEffect, useMemo, useState } from "react";

export default function OnboardingPage(){
  const pid = getProjectId();
  const [steps,setSteps]=useState<any[]>([]);
  const [counts,setCounts]=useState<Record<string,{done:number,total:number}>>({});
  const [sel,setSel]=useState<any|null>(null);
  const [msg,setMsg]=useState("");
  const memory = useMemoryPrompts(pid, "onboarding");

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

  async function load(){
    const r = await fetchWithAuth(`/api/onboarding?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); if (!r.ok) { setMsg(j.error||"load failed"); return; }
    setSteps(j.steps||[]);
    const map:any = {}; (j.counts||[]).forEach((c:any)=> map[c.stepId] = { done:c.done, total:c.total });
    setCounts(map);
  }
  useEffect(()=>{ load(); },[]);

  return (
    
      <div className="p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Onboarding</h1>
              <div className="flex items-center gap-2">
                <button className="text-xs px-2 py-1 border rounded" onClick={seed} data-testid="button-seed-steps">Seed 9 Steps</button>
                <TechIntake />
              </div>
            </div>
            <div className="text-xs opacity-70" data-testid="text-message">{msg}</div>
          </div>
          {memorySlot}
        </div>

        {/* Tiles */}
        <div className="grid md:grid-cols-3 gap-3">
          {steps.map(s=>{
            const c = counts[s.id] || { done:0,total:0 }; const pct = c.total? Math.round((c.done*100)/c.total) : 0;
            return (
              <div key={s.id} className={`p-3 border rounded-2xl ${s.status==='done'?'opacity-70':''}`} data-testid={`card-step-${s.key}`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-[11px] opacity-70">{pct}%</div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button className="text-xs px-2 py-1 border rounded" onClick={()=>setSel(s)} data-testid={`button-open-${s.key}`}>Open</button>
                  {s.status!=='done' && <button className="text-xs px-2 py-1 border rounded" onClick={()=>complete(s.id)} data-testid={`button-complete-${s.key}`}>Complete</button>}
                </div>
              </div>
            );
          })}
        </div>

        {sel && <StepDrawer step={sel} onClose={()=>{ setSel(null); load(); }} />}
        <Reflections />
        <MetricsCard />
      </div>
    
  );

  async function seed(){ await fetchWithAuth(`/api/onboarding/seed`, { method:"POST", body: JSON.stringify({ projectId: pid }) }); load(); }
  async function complete(id:string){ await fetchWithAuth(`/api/onboarding/steps/${id}/complete`, { method:"POST", body: JSON.stringify({ projectId: pid }) }); load(); }
}

function StepDrawer({ step, onClose }:{ step:any; onClose:()=>void }){
  const pid = getProjectId();
  const [items,setItems]=useState<any[]>([]);
  const [title,setTitle]=useState("");
  const [owner,setOwner]=useState("");
  const [due,setDue]=useState("");

  async function load(){ const r = await fetchWithAuth(`/api/onboarding/steps/${step.id}/tasks?projectId=${encodeURIComponent(pid!)}`); const j = await r.json(); setItems(j.items||[]); }
  useEffect(()=>{ load(); },[]);

  async function saveTask(){
    if (!title.trim()) return;
    await fetchWithAuth(`/api/onboarding/task/upsert`, { method:"POST", body: JSON.stringify({ projectId: pid, stepId: step.id, title, owner: owner||null, dueAt: due?new Date(due).toISOString():null }) });
    setTitle(""); setOwner(""); setDue(""); load();
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[560px] bg-background border-l p-4 overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-semibold">{step.title}</div>
          <div className="flex items-center gap-2">
            <button className="text-xs px-2 py-1 border rounded" onClick={async()=>{
              await fetchWithAuth(`/api/onboarding/push-to-plan`, { method:"POST", body: JSON.stringify({ projectId: pid, stepId: step.id }) });
              alert("Pushed tasks to active Plan.");
            }} data-testid="button-push-to-plan">Push to Plan</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={onClose} data-testid="button-close-drawer">Close</button>
          </div>
        </div>
        <div className="text-xs opacity-70 mb-2">{step.description||""}</div>

        <div className="p-2 border rounded-2xl">
          <div className="text-sm font-medium mb-1">Add task</div>
          <div className="grid md:grid-cols-3 gap-2">
            <input className="border rounded px-2 py-1 text-sm md:col-span-2" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} data-testid="input-task-title" />
            <input className="border rounded px-2 py-1 text-sm" placeholder="Owner (name/email)" value={owner} onChange={e=>setOwner(e.target.value)} data-testid="input-task-owner" />
            <input type="date" className="border rounded px-2 py-1 text-sm" value={due} onChange={e=>setDue(e.target.value)} data-testid="input-task-due" />
            <button className="text-xs px-2 py-1 border rounded" onClick={saveTask} data-testid="button-add-task">Add</button>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-sm font-medium mb-1">Tasks</div>
          <ul className="space-y-2">
            {items.map((t:any)=>(
              <li key={t.id} className="p-2 border rounded" data-testid={`card-task-${t.id}`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium">{t.title}</div>
                  <span className="text-[11px] opacity-70">{t.owner||"—"} {t.dueAt?`• ${new Date(t.dueAt).toLocaleDateString()}`:""}</span>
                </div>
                <div className="mt-1 text-xs">Status: {t.status}</div>
              </li>
            ))}
            {!items.length && <li className="text-xs opacity-70">No tasks yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TechIntake(){
  const pid = getProjectId();
  const [p,setP]=useState<any>({});
  const [open,setOpen]=useState(false);
  useEffect(()=>{ (async()=>{ const r=await fetchWithAuth(`/api/onboarding/tech?projectId=${encodeURIComponent(pid!)}`); const j=await r.json(); setP(j.profile||{}); })(); },[pid]);
  async function save(){
    await fetchWithAuth(`/api/onboarding/tech`, { method:"POST", body: JSON.stringify({ projectId: pid, ...p }) });
    setOpen(false);
  }
  return (
    <>
      <button className="text-xs px-2 py-1 border rounded" onClick={()=>setOpen(true)} data-testid="button-tech-stack">Tech stack…</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(520px,92vw)] bg-background border rounded-2xl p-4 space-y-2">
            <div className="text-sm font-medium">Technology & Platforms</div>
            <div className="grid md:grid-cols-2 gap-2">
              <label className="text-xs">Productivity</label>
              <select className="border rounded px-2 py-1" value={p.productivity||""} onChange={e=>setP((x:any)=>({...x, productivity:e.target.value}))} data-testid="select-productivity">
                <option value="">(select)</option><option value="microsoft">Microsoft 365</option><option value="google">Google Workspace</option>
              </select>
              <label className="text-xs">Chat</label>
              <select className="border rounded px-2 py-1" value={p.chat||""} onChange={e=>setP((x:any)=>({...x, chat:e.target.value}))} data-testid="select-chat">
                <option value="">(select)</option><option value="slack">Slack</option><option value="teams">Teams</option>
              </select>
              <label className="text-xs">Issues</label>
              <select className="border rounded px-2 py-1" value={p.issues||""} onChange={e=>setP((x:any)=>({...x, issues:e.target.value}))} data-testid="select-issues">
                <option value="">(select)</option><option value="jira">Jira</option><option value="servicenow">ServiceNow</option><option value="none">None</option>
              </select>
              <label className="text-xs">Storage</label>
              <select className="border rounded px-2 py-1" value={p.storage||""} onChange={e=>setP((x:any)=>({...x, storage:e.target.value}))} data-testid="select-storage">
                <option value="">(select)</option><option value="sharepoint">SharePoint</option><option value="drive">Google Drive</option><option value="both">Both</option><option value="none">None</option>
              </select>
              <label className="text-xs">Notes</label>
              <textarea className="border rounded px-2 py-1 md:col-span-1" value={p.notes||""} onChange={e=>setP((x:any)=>({...x, notes:e.target.value}))} data-testid="input-tech-notes"/>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded" onClick={save} data-testid="button-save-tech">Save</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={()=>setOpen(false)} data-testid="button-close-tech">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Reflections(){
  const pid = getProjectId();
  const [items,setItems]=useState<any[]>([]);
  const [txt,setTxt]=useState("");
  useEffect(()=>{ (async()=>{ const r=await fetchWithAuth(`/api/onboarding/reflections?projectId=${encodeURIComponent(pid!)}`); const j=await r.json(); setItems(j.items||[]); })(); },[pid]);
  async function save(){
    if (!txt.trim()) return;
    await fetchWithAuth(`/api/onboarding/reflections`, { method:"POST", body: JSON.stringify({ projectId: pid, content: txt }) });
    setTxt(""); const r=await fetchWithAuth(`/api/onboarding/reflections?projectId=${encodeURIComponent(pid!)}`); const j=await r.json(); setItems(j.items||[]);
  }
  return (
    <div className="p-3 border rounded-2xl">
      <div className="text-sm font-medium mb-2">Mindset Reflections</div>
      <div className="grid md:grid-cols-3 gap-2">
        <textarea className="border rounded px-2 py-1 md:col-span-2" placeholder="What went right / blockers / commitment…" value={txt} onChange={e=>setTxt(e.target.value)} data-testid="input-reflection"/>
        <button className="text-xs px-2 py-1 border rounded" onClick={save} data-testid="button-add-reflection">Add</button>
      </div>
      <ul className="text-xs mt-2 space-y-1 max-h-[40vh] overflow-auto">
        {items.map((r:any)=> <li key={r.id} className="p-2 border rounded" data-testid={`card-reflection-${r.id}`}>{new Date(r.createdAt).toLocaleString()} — {r.content}</li>)}
      </ul>
    </div>
  );
}

function MetricsCard(){
  const pid = getProjectId();
  const [items,setItems]=useState<any[]>([]);
  const [name,setName]=useState(""); 
  const [owner,setOwner]=useState(""); 
  const [target,setTarget]=useState(""); 
  const [current,setCurrent]=useState(""); 
  const [due,setDue]=useState("");

  async function load(){ 
    const r=await fetchWithAuth(`/api/onboarding/metrics?projectId=${encodeURIComponent(pid!)}`); 
    const j=await r.json(); 
    setItems(j.items||[]); 
  }
  useEffect(()=>{ load(); },[pid]);

  async function add(){
    if (!name.trim()) return;
    await fetchWithAuth(`/api/onboarding/metrics/upsert`, { 
      method:"POST", 
      body: JSON.stringify({ 
        projectId: pid, 
        name, 
        owner:owner||null, 
        target:target||null, 
        current:current||null, 
        dueAt: due?new Date(due).toISOString():null 
      }) 
    });
    setName(""); setOwner(""); setTarget(""); setCurrent(""); setDue(""); load();
  }

  return (
    <div className="p-3 border rounded-2xl">
      <div className="text-sm font-medium mb-2">Metrics for Success</div>
      <div className="grid md:grid-cols-5 gap-2">
        <input className="border rounded px-2 py-1" placeholder="Metric name" value={name} onChange={e=>setName(e.target.value)} data-testid="input-metric-name" />
        <input className="border rounded px-2 py-1" placeholder="Owner (name/email)" value={owner} onChange={e=>setOwner(e.target.value)} data-testid="input-metric-owner" />
        <input className="border rounded px-2 py-1" placeholder="Target" value={target} onChange={e=>setTarget(e.target.value)} data-testid="input-metric-target" />
        <input className="border rounded px-2 py-1" placeholder="Current" value={current} onChange={e=>setCurrent(e.target.value)} data-testid="input-metric-current" />
        <input type="date" className="border rounded px-2 py-1" value={due} onChange={e=>setDue(e.target.value)} data-testid="input-metric-due" />
      </div>
      <div className="mt-2"><button className="text-xs px-2 py-1 border rounded" onClick={add} data-testid="button-add-metric">Add</button></div>

      <table className="text-xs w-full mt-2">
        <thead className="bg-slate-900/30">
          <tr>
            <th className="text-left px-2 py-1">Metric</th>
            <th className="text-left px-2 py-1">Owner</th>
            <th className="text-left px-2 py-1">Target</th>
            <th className="text-left px-2 py-1">Current</th>
            <th className="text-left px-2 py-1">Due</th>
            <th className="text-left px-2 py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map(m=>(
            <tr key={m.id} className="border-b border-slate-800" data-testid={`row-metric-${m.id}`}>
              <td className="px-2 py-1">{m.name}</td>
              <td className="px-2 py-1">{m.owner||"—"}</td>
              <td className="px-2 py-1">{m.target||"—"}</td>
              <td className="px-2 py-1">{m.current||"—"}</td>
              <td className="px-2 py-1">{m.dueAt?new Date(m.dueAt).toLocaleDateString():"—"}</td>
              <td className="px-2 py-1">{m.status||"tracking"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <div className="text-xs opacity-70 mt-2">No metrics yet.</div>}
    </div>
  );
}
