import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useState } from "react";

export default function ProjectSetupPage(){
  const pid = getProjectId();
  const [pbs, setPbs] = useState<any[]>([]);
  const [cadences, setCadences] = useState<any[]>([]);
  const [modules, setModules] = useState<string[]>(["HCM","Payroll","FIN"]);
  const [playbook, setPlaybook] = useState<string>("");
  const [company, setCompany] = useState("");
  const [goLive, setGoLive] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(()=>{ (async()=>{
    const r = await fetchWithAuth(`/api/projects/wizard/presets?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json();
    setPbs(j.playbooks||[]);
    setCadences(j.defaults?.cadences||[]);
    setModules(j.defaults?.modules||["HCM","Payroll","FIN"]);
  })(); },[pid]);

  function toggleMod(m:string){ setModules(s => s.includes(m) ? s.filter(x=>x!==m) : [...s,m]); }
  function addCad(){ setCadences(s=>[...s, { name:"", frequency:"weekly", dayOfWeek:3, timeUtc:"17:00" }]); }

  async function apply(){
    const body = {
      projectId: pid,
      company: company || undefined,
      goLiveDate: goLive || undefined,
      modules,
      cadences,
      playbookTemplateId: playbook || null,
      seedTraining: true
    };
    const r = await fetchWithAuth(`/api/projects/wizard/apply`, { method:"POST", body: JSON.stringify(body) });
    const j = await r.json();
    setMsg(r.ok ? `Seeded: ${JSON.stringify(j.results)}` : `Failed: ${j.error||"unknown"}`);
    setTimeout(()=>setMsg(""), 3000);
  }

  return (
      <div className="p-6 space-y-4 max-w-3xl">
        <h1 className="text-2xl font-semibold" data-testid="heading-wizard">Project Setup</h1>
        <div className="text-xs opacity-70">{msg}</div>

        <div className="p-4 border rounded-2xl space-y-2">
          <div className="font-medium">Company & Go-Live</div>
          <input 
            className="w-full border rounded px-3 py-2" 
            placeholder="Company (optional)" 
            value={company} 
            onChange={e=>setCompany(e.target.value)}
            data-testid="input-company"
          />
          <input 
            className="w-full border rounded px-3 py-2" 
            type="date" 
            value={goLive} 
            onChange={e=>setGoLive(e.target.value)}
            data-testid="input-golive"
          />
          <div className="text-[11px] opacity-60">Releases will be seeded around Go-Live (Demo, Payroll Parallel, Go-Live).</div>
        </div>

        <div className="p-4 border rounded-2xl space-y-2">
          <div className="font-medium">Modules</div>
          <div className="flex items-center gap-2 text-sm">
            {["HCM","Payroll","FIN"].map(m=>(
              <label key={m} className="flex items-center gap-1">
                <input 
                  type="checkbox" 
                  checked={modules.includes(m)} 
                  onChange={()=>toggleMod(m)}
                  data-testid={`checkbox-module-${m.toLowerCase()}`}
                /> {m}
              </label>
            ))}
          </div>
        </div>

        <div className="p-4 border rounded-2xl space-y-2">
          <div className="font-medium">Playbook Template</div>
          <select 
            className="border rounded px-3 py-2" 
            value={playbook} 
            onChange={e=>setPlaybook(e.target.value)}
            data-testid="select-playbook"
          >
            <option value="">(none)</option>
            {pbs.map((p:any)=> <option key={p.id} value={p.id}>{p.name} [{p.domain} {p.version}]</option>)}
          </select>
        </div>

        <div className="p-4 border rounded-2xl space-y-2">
          <div className="font-medium">Cadences</div>
          {cadences.map((c:any, i:number)=>(
            <div key={i} className="grid md:grid-cols-5 gap-2">
              <input 
                className="border rounded px-2 py-1 md:col-span-2" 
                placeholder="Name" 
                value={c.name} 
                onChange={e=>setCadences(s=>s.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                data-testid={`input-cadence-name-${i}`}
              />
              <select 
                className="border rounded px-2 py-1" 
                value={c.frequency} 
                onChange={e=>setCadences(s=>s.map((x,j)=>j===i?{...x,frequency:e.target.value}:x))}
                data-testid={`select-cadence-frequency-${i}`}
              >
                <option value="weekly">weekly</option>
                <option value="biweekly">biweekly</option>
                <option value="monthly">monthly</option>
              </select>
              <select 
                className="border rounded px-2 py-1" 
                value={c.dayOfWeek} 
                onChange={e=>setCadences(s=>s.map((x,j)=>j===i?{...x,dayOfWeek:Number(e.target.value)}:x))}
                data-testid={`select-cadence-dow-${i}`}
              >
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,di)=><option key={d} value={di}>{d}</option>)}
              </select>
              <input 
                className="border rounded px-2 py-1" 
                value={c.timeUtc} 
                onChange={e=>setCadences(s=>s.map((x,j)=>j===i?{...x,timeUtc:e.target.value}:x))}
                data-testid={`input-cadence-time-${i}`}
              />
            </div>
          ))}
          <button 
            className="text-xs px-2 py-1 border rounded-lg" 
            onClick={addCad}
            data-testid="button-add-cadence"
          >
            Add cadence
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            className="px-3 py-2 border rounded-lg" 
            onClick={apply}
            data-testid="button-apply"
          >
            Apply Setup
          </button>
        </div>
      </div>
  );
}
