import { useEffect, useMemo, useState } from "react";
import { getJSON, postJSON } from "@/lib/authFetch";

export default function StageTemplateApply({ projectId, stages, area, onClose }:{
  projectId:string; stages:{id:string; title:string; area?:string; start_date?:string; end_date?:string}[]; area?:string; onClose:()=>void
}){
  const [templates,setTemplates]=useState<any[]>([]);
  const [tplKey,setTplKey]=useState<string>("");
  const [base,setBase]=useState<string>("");
  const [rails,setRails]=useState<{min_days:number;max_days:number}>({min_days:1,max_days:365});

  useEffect(()=>{ (async()=>{
    try{ const t = await getJSON(`/stages/templates/org`); setTemplates(t.items||[]); }catch{ setTemplates([]); }
    try{ const r = await getJSON(`/api/stages/guardrails?project_id=${projectId}`); setRails(r); }catch{}
  })(); },[projectId]);

  // Filter stages by area if provided
  const target = useMemo(()=> area ? stages.filter(s=> (s.area||"")===area) : stages, [stages, area]);

  const preview = useMemo(()=>{
    const t = templates.find((x:any)=>x.key===tplKey);
    if (!t || !base) return [];
    // build mapping title -> {start_offset_weeks, duration_weeks}
    const map:Record<string,{start_offset_weeks?:number;duration_weeks?:number}> = {};
    (t.stages||[]).forEach((s:any)=> { if (s.title) map[s.title]={ start_offset_weeks:s.start_offset_weeks||0, duration_weeks:s.duration_weeks||2 } });
    const baseDate = new Date(base+"T00:00:00");
    function addDays(d:Date, n:number){ const c=new Date(d); c.setDate(c.getDate()+n); return c.toISOString().slice(0,10) }
    function diffDays(start?:string, end?:string){ if (!start||!end) return 0; return Math.ceil((new Date(end).getTime()-new Date(start).getTime())/(1000*60*60*24)); }
    return target.map(s=>{
      const m = map[s.title||""]; if (!m) return {...s, new_start:s.start_date, new_end:s.end_date, will_update:false};
      const start = addDays(baseDate, (m.start_offset_weeks||0)*7);
      let days = Math.max(rails.min_days, Math.min(rails.max_days, (m.duration_weeks||2)*7));
      const end = addDays(new Date(start+"T00:00:00"), days);
      return {...s, new_start:start, new_end:end, will_update: (s.start_date!==start || s.end_date!==end)};
    });
  },[templates, tplKey, base, target, rails]);

  async function apply(){
    const changes:any = {};
    preview.forEach((p:any)=> { if (p.will_update) changes[p.id] = { start_date: p.new_start, end_date: p.new_end }; });
    await postJSON(`/api/stages/apply_template?project_id=${projectId}`, {
      area, template_key: tplKey, baseline: base, changes
    });
    alert("Applied template"); onClose();
  }

  async function restore(){
    const r = await getJSON(`/api/stages/restore_last_template?project_id=${projectId}&area=${encodeURIComponent(area||"")}`);
    if (!r?.template_key || !r?.baseline){ alert("No last template saved for this area"); return; }
    setTplKey(r.template_key); setBase(r.baseline);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[200]" onClick={onClose}>
      <div className="mx-auto mt-[8vh] w-[900px] max-w-[96%] teaim-modal" onClick={e=>e.stopPropagation()}>
        <div className="p-3 border-b border-[var(--brand-card-border)] flex items-center justify-between">
          <div className="text-sm font-medium">Apply Template (with Preview)</div>
        </div>
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <select className="teaim-input text-sm" value={tplKey} onChange={e=>setTplKey(e.target.value)}>
              <option value="">Select template…</option>
              {templates.map(t=> <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
            <input type="date" className="teaim-input text-sm" value={base} onChange={e=>setBase(e.target.value)} placeholder="Baseline date" />
            <button className="brand-btn text-xs" onClick={restore}>Restore last template</button>
            <span className="text-xs text-muted-foreground">Guardrails: {rails.min_days}–{rails.max_days} days</span>
          </div>
          {preview.length>0 && (
            <div className="brand-card">
              <div className="p-2 bg-muted text-xs font-medium grid grid-cols-6 gap-2 rounded-t-[inherit]">
                <span>Stage</span><span>Area</span><span>Current Start</span><span>Current End</span><span>New Start</span><span>New End</span>
              </div>
              <div className="max-h-[40vh] overflow-auto">
                {preview.map(p=>{
                  const diffDays = (start?:string, end?:string) => { if (!start||!end) return 0; return Math.ceil((new Date(end).getTime()-new Date(start).getTime())/(1000*60*60*24)); };
                  const dur = (diffDays(p.new_start, p.new_end) || 0);
                  const isViolation = p.will_update && (dur < rails.min_days || dur > rails.max_days);
                  return (
                  <div key={p.id} className={`p-2 text-xs grid grid-cols-6 gap-2 border-b border-[var(--brand-card-border)] ${p.will_update?'bg-[color-mix(in_srgb,var(--brand-card-bg) 88%, #facc1515 12%)]':''}`}>
                    <span className={isViolation ? 'text-red-500' : ''}>{p.title}</span>
                    <span className={isViolation ? 'text-red-500' : ''}>{p.area||"—"}</span>
                    <span className={isViolation ? 'text-red-500' : ''}>{p.start_date||"—"}</span>
                    <span className={isViolation ? 'text-red-500' : ''}>{p.end_date||"—"}</span>
                    <span className={`${p.will_update&&p.new_start!==p.start_date?"text-blue-600":""} ${isViolation ? 'text-red-500' : ''}`}>{p.new_start||"—"}</span>
                    <span className={`${p.will_update&&p.new_end!==p.end_date?"text-blue-600":""} ${dur<rails.min_days || dur>rails.max_days ? 'text-red-500 font-medium' : ''}`}>{p.new_end||"—"}</span>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="p-3 border-t flex justify-end gap-2">
          <button className="brand-btn text-xs" onClick={onClose}>Cancel</button>
          <button className="brand-btn text-xs swoosh" onClick={apply} disabled={!preview.some(p=>p.will_update)}>
            Apply ({preview.filter(p=>p.will_update).length} updates)
          </button>
        </div>
      </div>
    </div>
  );
}