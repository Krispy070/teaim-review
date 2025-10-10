import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { postJSON, getJSON } from "@/lib/authFetch";
import PageHeaderHint from "@/components/PageHeaderHint";
import { usePersistProjectId } from "@/lib/projectCtx";
import { useQuery } from "@tanstack/react-query";

type Row = { title:string; area:string; start_date:string; end_date:string };

export default function StageWizard(){
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  usePersistProjectId(projectId);
  
  const [rows,setRows] = useState<Row[]>([
    { title:"Discovery", area:"HCM", start_date:"", end_date:"" },
    { title:"Build P1", area:"HCM", start_date:"", end_date:"" },
    { title:"Test", area:"HCM", start_date:"", end_date:"" },
  ]);
  const [baselineDate, setBaselineDate] = useState<string>("");
  const [rails,setRails] = useState<{min_days:number;max_days:number}>({min_days:1,max_days:365});

  // Load guardrails
  useEffect(()=>{ (async()=>{
    try{ const r = await getJSON(`/api/stages/guardrails?project_id=${projectId}`); setRails(r); }catch{}
  })(); },[projectId]);

  // Load stage templates using TanStack Query
  const { data: templatesData, isLoading: templatesLoading, error: templatesError } = useQuery({
    queryKey: ["/api/stage-templates/list"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Convert new stage template format to wizard format  
  // Backend returns a top-level array, not an object with templates property
  const rawTemplates = Array.isArray(templatesData) ? templatesData : ((templatesData as any)?.templates ?? []);
  const tpls = rawTemplates.map((template: any) => ({
    key: template.id,
    label: template.name,
    stages: (template.stages || []).map((stage: any, index: number) => ({
      title: stage.name,
      area: stage.area || "",
      start_offset_weeks: index, // Progressive offset by stage order
      duration_weeks: Math.round((stage.duration_days || 7) / 7) // Convert days to weeks
    }))
  }));

  function calculateDate(baseDate: string, offsetWeeks: number): string {
    if (!baseDate) return "";
    const date = new Date(baseDate);
    date.setDate(date.getDate() + (offsetWeeks * 7));
    return date.toISOString().split('T')[0];
  }

  // Duration validation helpers
  function diffDays(start?: string, end?: string): number {
    if (!start || !end) return 0;
    return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
  }

  function validateDuration(start: string, end: string): string | null {
    if (!start || !end) return null;
    const days = diffDays(start, end);
    if (days < rails.min_days) return `Duration too short (min: ${rails.min_days} days)`;
    if (days > rails.max_days) return `Duration too long (max: ${rails.max_days} days)`;
    return null;
  }

  function applyTemplate(key:string){
    const t = (tpls||[]).find((x:any)=>x.key===key);
    if (!t) return;
    
    if (baselineDate) {
      // Auto-calculate dates based on baseline date and offsets
      setRows(t.stages.map((s:any)=>({
        title: s.title,
        area: s.area,
        start_date: calculateDate(baselineDate, s.start_offset_weeks || 0),
        end_date: calculateDate(baselineDate, (s.start_offset_weeks || 0) + (s.duration_weeks || 0))
      })));
    } else {
      // Just apply template without dates
      setRows(t.stages.map((s:any)=>({
        title: s.title, 
        area: s.area, 
        start_date: "", 
        end_date: ""
      })));
    }
  }

  function applyBaselineToExisting() {
    if (!baselineDate) return;
    // Find template-based stages and recalculate their dates
    const currentTemplate = tpls.find((t: any) => 
      t.stages.length === rows.length && 
      t.stages.every((s:any, i:number) => s.title === rows[i].title && s.area === rows[i].area)
    );
    if (currentTemplate) {
      setRows(prev => prev.map((r, i) => {
        const templateStage = currentTemplate.stages[i];
        if (templateStage && templateStage.start_offset_weeks !== undefined) {
          return {
            ...r,
            start_date: calculateDate(baselineDate, templateStage.start_offset_weeks),
            end_date: calculateDate(baselineDate, templateStage.start_offset_weeks + (templateStage.duration_weeks || 0))
          };
        }
        return r;
      }));
    }
  }

  function set(i:number, k:keyof Row, v:string){
    setRows(prev => prev.map((r,idx)=> {
      if (idx !== i) return r;
      const updated = { ...r, [k]: v };
      
      // Enforce duration when dates are changed
      if ((k === 'start_date' || k === 'end_date') && updated.start_date && updated.end_date) {
        const validation = validateDuration(updated.start_date, updated.end_date);
        if (validation) {
          // Reject the change if it violates duration guardrails
          alert(`Invalid duration: ${validation}`);
          return r; // Return original row without changes
        }
      }
      
      return updated;
    }));
  }
  function add(){ setRows(prev => [...prev, { title:"", area:"", start_date:"", end_date:"" }]); }
  function del(i:number){ setRows(prev => prev.filter((_,idx)=> idx!==i)); }

  async function create(){
    const stages = rows
      .filter(r=>r.title.trim())
      .map(r=>({ title:r.title.trim(), area:r.area?.trim()||undefined,
                 start_date:r.start_date||undefined, end_date:r.end_date||undefined }));
    if (!stages.length) { alert("Add at least one stage"); return; }
    
    // Validate all rows before saving
    const invalidRows = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.start_date && r.end_date) {
        const validation = validateDuration(r.start_date, r.end_date);
        if (validation) {
          invalidRows.push(`Row ${i+1}: ${validation}`);
        }
      }
    }
    
    if (invalidRows.length > 0) {
      alert(`Cannot save - fix duration issues:\n${invalidRows.join('\n')}`);
      return;
    }
    
    await postJSON(`/api/stages/batch_create?project_id=${projectId}`, { stages });
    alert("Stages created");
  }

  return (
    <div className="p-6 space-y-3">
      <PageHeaderHint id="stage-wizard" title="Stage Wizard"
        intro="Quickly create multiple stages with area and dates."
        bullets={["Apply templates for common Workday patterns", "Add rows; Save creates project_stages entries", "Use Stage Editor to refine later"]}/>
      
      <div className="flex gap-2 items-center flex-wrap">
        <select
          className="teaim-input w-full sm:w-auto"
          onChange={e=>applyTemplate(e.target.value)}
          disabled={templatesLoading}
          data-testid="select-template"
        >
          <option value="">
            {templatesLoading 
              ? "Loading templates..." 
              : templatesError 
                ? "Error loading templates" 
                : tpls.length > 0 
                  ? "Apply template" 
                  : "No templates available"}
          </option>
          {tpls.map((t: any)=><option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        
        <div className="flex gap-2 items-center">
          <label className="text-sm text-[var(--text-muted)]">Baseline Date:</label>
          <input
            type="date"
            className="teaim-input w-full sm:w-auto"
            value={baselineDate}
            onChange={e => setBaselineDate(e.target.value)}
            data-testid="input-baseline-date"
          />
          <button 
            className="px-3 py-2 border border-green-500 rounded bg-green-500 text-white hover:bg-green-600 focus:ring-2 focus:ring-green-500" 
            onClick={applyBaselineToExisting}
            disabled={!baselineDate}
            data-testid="button-apply-baseline"
          >
            Apply Baseline
          </button>
        </div>
      </div>
      <div className="teaim-surface rounded-xl divide-y divide-[var(--brand-card-border)]">
        {rows.map((r,i)=>(
          <div key={i} className="grid md:grid-cols-5 gap-2 p-2">
            <input
              className="teaim-input"
              placeholder="Title"
              value={r.title}
              onChange={e=>set(i,'title',e.target.value)}
              data-testid={`input-title-${i}`}
            />
            <input
              className="teaim-input"
              placeholder="Area"
              value={r.area}
              onChange={e=>set(i,'area',e.target.value)}
              data-testid={`input-area-${i}`}
            />
            {(() => {
              const dur = diffDays(r.start_date, r.end_date);
              const isInvalid = r.start_date && r.end_date && (dur < rails.min_days || dur > rails.max_days);
              return (
                <div className="flex flex-col">
                  <input
                    className={`teaim-input ${
                      isInvalid
                        ? 'border-red-500 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-0'
                        : ''
                    }`}
                    type="date"
                    value={r.start_date}
                    onChange={e=>set(i,'start_date',e.target.value)}
                    data-testid={`input-start-date-${i}`}
                  />
                  {isInvalid && (
                    <span className="text-xs text-red-500 mt-1">
                      {dur < rails.min_days ? `Min: ${rails.min_days}d` : `Max: ${rails.max_days}d`} 
                      ({dur}d)
                    </span>
                  )}
                </div>
              );
            })()}
            {(() => {
              const dur = diffDays(r.start_date, r.end_date);
              const isInvalid = r.start_date && r.end_date && (dur < rails.min_days || dur > rails.max_days);
              return (
                <div className="flex flex-col">
                  <input
                    className={`teaim-input ${
                      isInvalid
                        ? 'border-red-500 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-0'
                        : ''
                    }`}
                    type="date"
                    value={r.end_date}
                    onChange={e=>set(i,'end_date',e.target.value)}
                    data-testid={`input-end-date-${i}`}
                  />
                  {isInvalid && (
                    <span className="text-xs text-red-500 mt-1">
                      {dur < rails.min_days ? `Min: ${rails.min_days}d` : `Max: ${rails.max_days}d`} 
                      ({dur}d)
                    </span>
                  )}
                </div>
              );
            })()}
            <button 
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-2 focus:ring-red-500" 
              onClick={()=>del(i)}
              data-testid={`button-delete-${i}`}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button 
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-2 focus:ring-blue-500" 
          onClick={add}
          data-testid="button-add-row"
        >
          Add Row
        </button>
        <button 
          className="px-3 py-2 border border-blue-500 rounded bg-blue-500 text-white hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" 
          onClick={create}
          data-testid="button-save"
        >
          Save
        </button>
      </div>
    </div>
  );
}