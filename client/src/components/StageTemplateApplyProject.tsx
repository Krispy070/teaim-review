import { useEffect, useMemo, useState } from "react";
import { getJSON, postJSON } from "@/lib/authFetch";

export default function StageTemplateApplyProject({ projectId, stages, onClose }:{
  projectId:string; stages:{id:string; title:string; area?:string; start_date?:string; end_date?:string}[]; onClose:()=>void
}){
  const [templates,setTemplates]=useState<any[]>([]);
  const [tplKey,setTplKey]=useState<string>("");
  const [base,setBase]=useState<string>("");
  const [areas,setAreas]=useState<string[]>([]);
  const [rails,setRails]=useState<{min_days:number;max_days:number}>({min_days:1,max_days:365});

  useEffect(()=>{ (async()=>{
    try{ const t = await getJSON(`/stages/templates/org`); setTemplates(t.items||[]); }catch{ setTemplates([]); }
    try{ const r = await getJSON(`/api/stages/guardrails?project_id=${projectId}`); setRails(r); }catch{}
  })(); },[projectId]);

  const targets = useMemo(()=>{
    if (!areas.length) return stages;
    return stages.filter(s=> areas.includes(s.area||"(Unassigned)"));
  },[areas, stages]);

  const preview = useMemo(()=>{
    const t = templates.find((x:any)=>x.key===tplKey);
    if (!t || !base) return [];
    const map:Record<string,{start_offset_weeks?:number;duration_weeks?:number}> = {};
    (t.stages||[]).forEach((s:any)=> { if (s.title) map[s.title] = { start_offset_weeks:s.start_offset_weeks||0, duration_weeks:s.duration_weeks||2 }; });
    const baseDate = new Date(base+"T00:00:00");
    function addDays(d:Date,n:number){ const c=new Date(d); c.setDate(c.getDate()+n); return c.toISOString().slice(0,10) }
    const diffDays = (a?:string,b?:string)=> (a&&b)? Math.round((+new Date(b+"T00:00:00") - +new Date(a+"T00:00:00"))/86400000) : null;
    return targets.map(s=>{
      const m = map[s.title||""]; if (!m) return {...s, new_start:s.start_date, new_end:s.end_date, delta:null, will_update:false};
      const start = addDays(baseDate, (m.start_offset_weeks||0)*7);
      let days = Math.max(rails.min_days, Math.min(rails.max_days, (m.duration_weeks||2)*7));
      const end = addDays(new Date(start+"T00:00:00"), days);
      const delta = (diffDays(s.start_date, s.end_date) ?? 0) - (diffDays(start, end) ?? 0);
      return {...s, new_start:start, new_end:end, delta, will_update:(s.start_date!==start || s.end_date!==end)};
    });
  },[templates, tplKey, base, targets, rails]);

  async function apply(){
    const changes:any = {};
    preview.forEach((p:any)=> { if (p.will_update) changes[p.id] = { start_date: p.new_start, end_date: p.new_end }; });
    await postJSON(`/api/stages/apply_template?project_id=${projectId}`, {
      area: areas.join(",") || "(ALL)", template_key: tplKey, baseline: base, changes
    });
    alert("Applied template to project"); onClose();
  }

  const areasAll = Array.from(new Set(stages.map(s=> s.area || "(Unassigned)"))).sort();

  return (
    <div className="fixed inset-0 bg-black/40 z-[200]" onClick={onClose}>
      <div className="mx-auto mt-[6vh] w-[980px] max-w-[97%] teaim-modal"
           onClick={e=>e.stopPropagation()}>
        <div className="p-3 border-b border-[var(--brand-card-border)] text-sm font-medium">Apply Template to Project (Preview)</div>
        <div className="p-3 space-y-2 max-h-[75vh] overflow-auto">
          <div className="flex items-center gap-2">
            <select className="teaim-input text-sm" value={tplKey} onChange={e=>setTplKey(e.target.value)}
                    data-testid="select-template">
              <option value="">Pick template…</option>
              {templates.map((t:any)=> <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <label className="text-xs">Baseline</label>
            <input type="date" className="teaim-input text-sm" value={base} onChange={e=>setBase(e.target.value)}
                   data-testid="input-baseline-date" />
            <div className="text-xs text-muted-foreground">Guardrails: {rails.min_days}-{rails.max_days} days</div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {areasAll.map(a=>(
              <label key={a} className="flex items-center gap-1">
                <input type="checkbox" checked={areas.includes(a)} 
                       onChange={e=> setAreas(x=> e.target.checked? [...x, a] : x.filter(z=>z!==a)) }
                       data-testid={`checkbox-area-${a}`} />
                {a}
              </label>
            ))}
          </div>
          <div className="brand-card">
            <table className="w-full text-sm">
              <thead><tr><th className="text-left p-1">Area</th><th className="text-left p-1">Title</th><th className="text-left p-1">Current</th><th className="text-left p-1">New</th><th className="text-left p-1">Δ days</th><th className="text-left p-1">Update?</th></tr></thead>
              <tbody>
                {preview.map((p:any)=>(
                  <tr key={p.id} data-testid={`row-stage-${p.id}`} className="border-b border-[var(--brand-card-border)] last:border-0">
                    <td className="p-1">{p.area||"—"}</td>
                    <td className="p-1">{p.title}</td>
                    <td className="p-1">{p.start_date||"—"} → {p.end_date||"—"}</td>
                    <td className="p-1">{p.new_start||"—"} → {p.new_end||"—"}</td>
                    <td className={`p-1 ${p.delta>0?'text-red-500':p.delta<0?'text-[var(--brand-good)]':'text-muted-foreground'}`}>
                      {p.delta>0?`+${p.delta}`: p.delta}
                    </td>
                    <td className="p-1">{p.will_update? "✓": "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="p-3 border-t border-[var(--brand-card-border)] flex justify-end gap-2">
          <button className="brand-btn text-xs" onClick={onClose} data-testid="button-cancel">Cancel</button>
          <button className="brand-btn text-xs swoosh" onClick={apply}
                  disabled={!preview.some((p:any)=>p.will_update)}
                  data-testid="button-apply-template">Apply</button>
        </div>
      </div>
    </div>
  );
}