import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "react-router-dom";
import { getJSON, postJSON } from "@/lib/authFetch";
import PageHeading from "@/components/PageHeading";
import SignoffRequestModal from "@/components/SignoffRequestModal";
import StageTemplateApplyProject from "@/components/StageTemplateApplyProject";
import { useToast } from "@/hooks/use-toast";

type Stage = { 
  id: string; 
  title: string; 
  area?: string; 
  start_date?: string; 
  end_date?: string; 
  status: string; 
  created_at: string;
  requested_by?: string;
  signoff_by?: string;
};

// Helper functions for date manipulation
function iso(d:Date){ return d.toISOString().slice(0,10); }
function adjustDate(isoStr:string, days:number){
  try{ const d = new Date(isoStr+"T00:00:00"); d.setDate(d.getDate()+days); return iso(d); }
  catch { return iso(new Date()); }
}
function diffDays(a:string|undefined,b:string|undefined){
  if (!a || !b) return null;
  const A=new Date(a+"T00:00:00"), B=new Date(b+"T00:00:00");
  return Math.round((+B - +A)/86400000);
}
function shiftDate(baseISO:string, days:number){ 
  const d=new Date(baseISO+"T00:00:00"); 
  d.setDate(d.getDate()+days); 
  return iso(d); 
}
function deepCopy(obj: any): any {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

export default function StagesPage() {
  const { projectId } = useParams();
  const location = useLocation();
  const { toast } = useToast();
  const [rows, setRows] = useState<Stage[]>([]);
  const [edit, setEdit] = useState<Record<string, Partial<Stage>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const refMap = useRef<Record<string, HTMLDivElement|null>>({});
  const focusId = new URLSearchParams(location.search).get("focus") || "";
  const [signoffModal, setSignoffModal] = useState<{stageId: string; stageTitle: string; stageArea?: string; stageOwner?: string} | null>(null);
  const [undoHistory, setUndoHistory] = useState<Record<string, Partial<Stage>>[]>([]);
  const [undoStack,setUndoStack] = useState<Record<string, any[]>>({});
  const [snapshot,setSnapshot] = useState<Record<string,{start_date?:string;end_date?:string}>>({});
  const [savedAt,setSavedAt] = useState<string>("");
  const [rowSavedAt,setRowSavedAt] = useState<Record<string,string>>({});
  const [snapshotProjectId, setSnapshotProjectId] = useState<string>("");
  const [undoAllBusy, setUndoAllBusy] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const [areaSnapshots, setAreaSnapshots] = useState<Record<string, Record<string,{start_date?:string;end_date?:string}>>>({});
  const [areaSavedAt, setAreaSavedAt] = useState<Record<string, string>>({});
  const [undoAreaBusy, setUndoAreaBusy] = useState<Record<string, boolean>>({});
  const [shiftDays, setShiftDays] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(0);
  const [endToDate, setEndToDate] = useState<string>(iso(new Date()));
  const [showProjectTemplate, setShowProjectTemplate] = useState(false);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    try {
      const d = await getJSON<{stages: Stage[]}>(`/api/stages/list?project_id=${projectId}`);
      const stages = d.stages || [];
      setRows(stages);
      setEdit({});
      return stages; // Return for deterministic snapshot refresh
    } catch (error) {
      console.error('Failed to load stages:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [projectId]);

  function refreshSnapshotFromRows(stagesData?: any[]) {
    const stagesToUse = stagesData || rows;
    if (!projectId || !stagesToUse.length) return;
    const snap: Record<string,{start_date?:string;end_date?:string}> = {};
    stagesToUse.forEach(s=> snap[s.id] = { start_date:s.start_date, end_date:s.end_date });
    setSnapshot(snap);
    setSnapshotProjectId(projectId);
  }

  useEffect(()=>{  // take initial snapshot per project
    if (!projectId || !rows.length) return;
    if (snapshotProjectId === projectId) return; // Already have snapshot for this project
    
    refreshSnapshotFromRows();
    // Don't set savedAt on initial load, only on actual save operations
  },[projectId, rows.length]);  // run when project or rows initially available

  useEffect(() => {
    if (focusId && refMap.current[focusId]) {
      refMap.current[focusId]!.scrollIntoView({ behavior: "smooth", block: "center" });
      
      // Auto-focus the first input in the focused stage
      setTimeout(() => {
        const firstInput = document.querySelector(`[data-stage-id="${focusId}"][data-field="title"]`) as HTMLInputElement;
        if (firstInput) {
          firstInput.focus();
          firstInput.select(); // Select all text for easy editing
        }
      }, 500); // Small delay to ensure scroll animation completes
    }
  }, [focusId, rows]);

  // Per-row undo stack management
  function pushUndo(id:string, patch:any){
    setUndoStack(st => ({...st, [id]: [...(st[id]||[]), patch]}));
  }
  function popUndo(id:string){
    const arr = undoStack[id]||[]; const last = arr.pop();
    setUndoStack(st=>({...st, [id]: arr}));
    return last;
  }

  // Revert last change for a specific stage
  async function revertLast(id: string) {
    const prev = popUndo(id);
    if (!prev) return;
    
    // Apply the previous state
    setEdit(prevEdit => ({
      ...prevEdit,
      [id]: {
        ...(prevEdit[id] || {}),
        ...prev
      }
    }));
    
    // Update DOM inputs to reflect the reverted values
    setTimeout(() => {
      Object.keys(prev).forEach(field => {
        const input = document.querySelector(`[data-stage-id="${id}"][data-field="${field}"]`) as HTMLInputElement;
        if (input) {
          input.value = prev[field] || "";
        }
      });
    }, 0);
    
    // Show toast notification
    toast({ 
      title: "Reverted", 
      description: "Stage dates restored" 
    });
  }

  // Centralized date update with duration-preserving logic
  function updateDate(id: string, field: 'start_date' | 'end_date', newValue: string) {
    const currentStage = rows.find(r => r.id === id);
    if (!currentStage) return;

    // Get effective values (current edits + server state)
    const effectiveStart = edit[id]?.start_date !== undefined ? edit[id].start_date : currentStage.start_date;
    const effectiveEnd = edit[id]?.end_date !== undefined ? edit[id].end_date : currentStage.end_date;

    // Snapshot for global Ctrl+Z undo (before changes)
    const currentSnapshot = deepCopy(edit);
    
    if (field === 'start_date') {
      // Duration-preserving logic for start_date changes
      const oldSpan = diffDays(effectiveStart, effectiveEnd);
      if (oldSpan !== null && effectiveEnd) {
        // preserve duration: move end_date by same delta
        const delta = diffDays(effectiveStart, newValue) || 0;
        const newEnd = shiftDate(effectiveEnd, delta);
        pushUndo(id, { start_date: effectiveStart, end_date: effectiveEnd });
        setEdit(prev => ({ 
          ...prev, 
          [id]: { 
            ...(prev[id] || {}), 
            start_date: newValue, 
            end_date: newEnd 
          }
        }));
        // Update DOM for end_date input too
        setTimeout(() => {
          const endInput = document.querySelector(`[data-stage-id="${id}"][data-field="end_date"]`) as HTMLInputElement;
          if (endInput) endInput.value = newEnd;
        }, 0);
      } else {
        pushUndo(id, { start_date: effectiveStart });
        setEdit(prev => ({ 
          ...prev, 
          [id]: { 
            ...(prev[id] || {}), 
            start_date: newValue 
          }
        }));
      }
    } else {
      // end_date logic: ensure end >= effective start
      if (effectiveStart && diffDays(effectiveStart, newValue)! < 0) {
        // Clamp to start date
        const fixed = effectiveStart;
        pushUndo(id, { end_date: effectiveEnd });
        setEdit(prev => ({ 
          ...prev, 
          [id]: { 
            ...(prev[id] || {}), 
            end_date: fixed 
          }
        }));
        // Update DOM to show clamped value
        setTimeout(() => {
          const input = document.querySelector(`[data-stage-id="${id}"][data-field="end_date"]`) as HTMLInputElement;
          if (input) input.value = fixed;
        }, 0);
      } else {
        pushUndo(id, { end_date: effectiveEnd });
        setEdit(prev => ({ 
          ...prev, 
          [id]: { 
            ...(prev[id] || {}), 
            end_date: newValue 
          }
        }));
      }
    }
    
    // Add to global undo history for Ctrl+Z
    setUndoHistory(prev => [...prev, currentSnapshot]);
  }

  async function save(id: string) {
    if (!projectId) return;
    const patch = edit[id];
    if (!patch) return;
    
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      await postJSON(`/api/stages/update?project_id=${projectId}&stage_id=${id}`, {
        title: patch.title ?? undefined,
        area: patch.area ?? undefined,
        start_date: patch.start_date ?? undefined,
        end_date: patch.end_date ?? undefined
      });
      // Show save toast
      toast({ title:"Stage updated", description:`Saved ${Object.keys(patch).join(", ")}` });
      setRowSavedAt(t => ({...t, [id]: new Date().toLocaleTimeString()}));
      await load();
      setRenderNonce(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save stage:', error);
      toast({ title:"Error", description:"Failed to save stage", variant:"destructive" });
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  async function saveField(id: string, fieldPatch: Partial<Stage>) {
    if (!projectId) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      await postJSON(`/api/stages/update?project_id=${projectId}&stage_id=${id}`, {
        title: fieldPatch.title ?? undefined,
        area: fieldPatch.area ?? undefined,
        start_date: fieldPatch.start_date ?? undefined,
        end_date: fieldPatch.end_date ?? undefined
      });
      setRowSavedAt(t => ({...t, [id]: new Date().toLocaleTimeString()}));
      await load();
      setRenderNonce(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save stage field:', error);
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  function bind(id: string, k: keyof Stage) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      // Save current state to undo history before making changes
      setUndoHistory(prev => {
        const newHistory = [...prev, structuredClone(edit)];
        // Keep max 20 undo states to prevent memory issues
        return newHistory.slice(-20);
      });
      
      setEdit(prev => ({ 
        ...prev, 
        [id]: { 
          ...(prev[id] || {}), 
          [k]: e.target.value 
        }
      }));
    };
  }

  function revert(id: string) {
    setEdit(prev => ({ ...prev, [id]: {} }));
    // Reset form inputs to original values
    const stage = rows.find(s => s.id === id);
    if (stage) {
      const inputs = document.querySelectorAll(`[data-stage-id="${id}"]`);
      inputs.forEach((input: any) => {
        const field = input.dataset.field;
        if (field && stage[field as keyof Stage]) {
          input.value = stage[field as keyof Stage] || '';
        }
      });
    }
  }

  // Save all pending changes (Ctrl+S)
  const saveAll = useCallback(async () => {
    const pendingPatches = Object.entries(edit).filter(([,patch]) => Object.keys(patch || {}).length > 0);
    if (pendingPatches.length === 0) return;
    
    if (!projectId) return;
    
    // Save each patch without calling load() after each one
    try {
      await Promise.all(pendingPatches.map(([stageId, patch]) => 
        postJSON(`/api/stages/update?project_id=${projectId}&stage_id=${stageId}`, {
          title: patch.title ?? undefined,
          area: patch.area ?? undefined,
          start_date: patch.start_date ?? undefined,
          end_date: patch.end_date ?? undefined
        })
      ));
      
      // Clear all edits and reload once after all saves complete
      setEdit({});
      await load();
      setRenderNonce(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save all stages:', error);
    }
  }, [edit, projectId]);

  // Save All (new snapshot)
  async function saveAllSnapshot(){
    const snap: Record<string,{start_date?:string;end_date?:string}> = {};
    for (const s of rows){
      snap[s.id] = { start_date:s.start_date, end_date:s.end_date };
    }
    setSnapshot(snap);
    setSavedAt(new Date().toLocaleTimeString());
    toast({ title:"Snapshot saved", description:"Undo All will revert to this state" });
  }

  // Save Area Snapshot
  async function saveAreaSnapshot(area: string){
    const areaStages = rows.filter(s => (s.area || "General") === area);
    const areaSnap: Record<string,{start_date?:string;end_date?:string}> = {};
    for (const s of areaStages){
      areaSnap[s.id] = { start_date:s.start_date, end_date:s.end_date };
    }
    setAreaSnapshots(prev => ({ ...prev, [area]: areaSnap }));
    setAreaSavedAt(prev => ({ ...prev, [area]: new Date().toLocaleTimeString() }));
    toast({ title:"Area snapshot saved", description:`${area}: Undo Area will revert to this state` });
  }

  // Undo Area Changes
  async function undoAreaChanges(area: string) {
    const areaSnap = areaSnapshots[area];
    if (!areaSnap) {
      toast({ title:"No snapshot", description:`No saved snapshot for ${area}`, variant:"destructive" });
      return;
    }
    
    setUndoAreaBusy(prev => ({ ...prev, [area]: true }));
    try {
      // Filter stages for this area
      const areaStages = rows.filter(s => (s.area || "General") === area);
      
      // Build list of stages that need reverting on server
      const updates = areaStages.filter(s => {
        const prev = areaSnap[s.id];
        return prev && (s.start_date !== prev.start_date || s.end_date !== prev.end_date);
      }).map(s => ({ 
        id: s.id, 
        patch: areaSnap[s.id] 
      }));
      
      if (updates.length > 0) {
        // Clear any local edits for area stages
        setEdit(prevEdit => {
          const newEdit = { ...prevEdit };
          areaStages.forEach(s => { delete newEdit[s.id]; });
          return newEdit;
        });
        
        // Persist bulk revert to server
        const results = await Promise.allSettled(updates.map(u => 
          postJSON(`/api/stages/update?project_id=${projectId}&stage_id=${u.id}`, {
            start_date: u.patch.start_date ?? undefined,
            end_date: u.patch.end_date ?? undefined
          })
        ));
        
        const successes = results.filter(r => r.status === 'fulfilled').length;
        const failures = results.length - successes;
        
        if (failures === 0) {
          toast({ title:"Area reverted", description:`${area}: Restored ${successes} stage(s)` });
        } else {
          toast({ title:"Partial revert", description:`${area}: ${successes} stages reverted, ${failures} failed`, variant:"destructive" });
        }
        
        // Reload and refresh render
        await load();
        setRenderNonce(prev => prev + 1);
      } else {
        // Just clear local edits for area stages
        setEdit(prevEdit => {
          const newEdit = { ...prevEdit };
          areaStages.forEach(s => { delete newEdit[s.id]; });
          return newEdit;
        });
        toast({ title:"Area cleared", description:`${area}: Local edits cleared` });
      }
    } catch (error) {
      console.error('Failed to undo area changes:', error);
      toast({ title:"Error", description:`Failed to undo ${area} changes`, variant:"destructive" });
    } finally {
      setUndoAreaBusy(prev => ({ ...prev, [area]: false }));
    }
  }

  // Shift all end dates in area by ±X days
  async function shiftAreaEndDates(area: string, days: number) {
    if (!days) return;
    if (!projectId) return;

    try {
      const areaStages = rows.filter(s => (s.area || "General") === area);
      const stagesToUpdate = areaStages.filter(s => s.end_date); // Only shift stages that have end dates
      
      if (stagesToUpdate.length === 0) {
        toast({ title: "No end dates", description: `${area}: No stages have end dates to shift`, variant: "destructive" });
        return;
      }

      // Prepare updates with shifted end dates
      const updates = stagesToUpdate.map(s => ({
        id: s.id,
        newEndDate: shiftDate(s.end_date!, days)
      }));

      // Apply shifts to server
      const results = await Promise.allSettled(updates.map(u => 
        postJSON(`/api/stages/update?project_id=${projectId}&stage_id=${u.id}`, {
          end_date: u.newEndDate
        })
      ));

      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.length - successes;

      // Reload to reflect changes
      await load();
      setRenderNonce(prev => prev + 1);

      if (failures === 0) {
        toast({ 
          title: "Dates shifted", 
          description: `${area}: ${days > 0 ? '+' + days : days} day(s) applied to ${successes} end date(s)` 
        });
      } else {
        toast({ 
          title: "Partial shift", 
          description: `${area}: ${successes} shifted, ${failures} failed`, 
          variant: "destructive" 
        });
      }
    } catch (error) {
      console.error('Failed to shift area end dates:', error);
      toast({ title: "Error", description: `Failed to shift ${area} end dates`, variant: "destructive" });
    }
  }

  // Shift all start dates in area by ±X days (preserve durations)
  async function shiftAreaStartDates(area: string, days: number) {
    if (!days) return;
    if (!projectId) return;

    try {
      const areaStages = rows.filter(s => (s.area || "General") === area);
      const stagesToUpdate = areaStages.filter(s => s.start_date && s.end_date); // Only shift stages with both dates
      
      if (stagesToUpdate.length === 0) {
        toast({ title: "No date ranges", description: `${area}: No stages have both start and end dates`, variant: "destructive" });
        return;
      }

      // Prepare updates with shifted start/end dates (preserve duration)
      const updates = stagesToUpdate.map(s => {
        const newStartDate = shiftDate(s.start_date!, days);
        const newEndDate = shiftDate(s.end_date!, days);
        return {
          id: s.id,
          newStartDate,
          newEndDate
        };
      });

      // Apply shifts to server
      const results = await Promise.allSettled(updates.map(u => 
        postJSON(`/api/stages/update?project_id=${projectId}&stage_id=${u.id}`, {
          start_date: u.newStartDate,
          end_date: u.newEndDate
        })
      ));

      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.length - successes;

      // Reload to reflect changes
      await load();
      setRenderNonce(prev => prev + 1);

      if (failures === 0) {
        toast({ 
          title: "Dates shifted", 
          description: `${area}: ${days > 0 ? '+' + days : days} day(s) applied to ${successes} stage(s), durations preserved` 
        });
      } else {
        toast({ 
          title: "Partial shift", 
          description: `${area}: ${successes} shifted, ${failures} failed`, 
          variant: "destructive" 
        });
      }
    } catch (error) {
      console.error('Failed to shift area start dates:', error);
      toast({ title: "Error", description: `Failed to shift ${area} start dates`, variant: "destructive" });
    }
  }

  // Set uniform duration for all stages in area
  async function setAreaDuration(area: string, days: number) {
    if (!days || days < 1) return;
    if (!projectId) return;

    try {
      const areaStages = rows.filter(s => (s.area || "General") === area);
      const stagesToUpdate = areaStages.filter(s => s.start_date); // Only update stages with start dates
      
      if (stagesToUpdate.length === 0) {
        toast({ title: "No start dates", description: `${area}: No stages have start dates to calculate duration from`, variant: "destructive" });
        return;
      }

      // Prepare updates with uniform duration (start + N days = end)
      const updates = stagesToUpdate.map(s => {
        const newEndDate = shiftDate(s.start_date!, days - 1); // days-1 for inclusive count
        return {
          id: s.id,
          newEndDate
        };
      });

      // Apply uniform durations to server
      const results = await Promise.allSettled(updates.map(u => 
        postJSON(`/api/stages/update?project_id=${projectId}&stage_id=${u.id}`, {
          end_date: u.newEndDate
        })
      ));

      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.length - successes;

      // Reload to reflect changes
      await load();
      setRenderNonce(prev => prev + 1);

      if (failures === 0) {
        toast({ 
          title: "Duration set", 
          description: `${area}: ${days} day duration applied to ${successes} stage(s)` 
        });
      } else {
        toast({ 
          title: "Partial update", 
          description: `${area}: ${successes} updated, ${failures} failed`, 
          variant: "destructive" 
        });
      }
    } catch (error) {
      console.error('Failed to set area duration:', error);
      toast({ title: "Error", description: `Failed to set ${area} duration`, variant: "destructive" });
    }
  }

  // Set all end dates in area to specific date (v2.12.9)
  async function setAreaEndToDate(area: string, targetDate: string) {
    if (!projectId) return;
    
    try {
      const areaStages = stagesByArea[area] || [];
      const stagesToUpdate = areaStages.filter(s => s.start_date); // Only update stages with start dates
      
      if (!stagesToUpdate.length) {
        toast({ title: "No dates", description: `${area}: No stages have dates to set`, variant: "destructive" });
        return;
      }

      // Prepare updates with new end date
      const updates = stagesToUpdate.map(s => ({
        id: s.id,
        newEndDate: targetDate
      }));

      // Apply end date changes to server
      let successes = 0, failures = 0;
      for (const { id, newEndDate } of updates) {
        try {
          await putStage(id, { end_date: newEndDate });
          successes++;
        } catch {
          failures++;
        }
      }

      // Reload data and show results
      await load();
      if (failures === 0) {
        toast({ 
          title: "End dates set", 
          description: `${area}: End dates set to ${targetDate} for ${successes} stage(s)` 
        });
      } else {
        toast({ 
          title: "Partial success", 
          description: `${area}: ${successes} updated, ${failures} failed`, 
          variant: failures > successes ? "destructive" : "default" 
        });
      }
    } catch (error) {
      console.error('Failed to set area end dates:', error);
      toast({ title: "Error", description: `Failed to set ${area} end dates`, variant: "destructive" });
    }
  }

  // Align durations to organization template (v2.12.9)
  async function alignAreaDurationsToTemplate(area: string) {
    if (!projectId) return;
    
    try {
      // Fetch org template durations
      const templateResponse = await getJSON<{durations: Record<string, number>}>(`/api/org/template_durations?project_id=${projectId}&area=${encodeURIComponent(area)}`);
      const templateDurations = templateResponse.durations || {};
      
      const areaStages = stagesByArea[area] || [];
      const stagesToUpdate = areaStages.filter(s => s.start_date && s.title); 
      
      if (!stagesToUpdate.length) {
        toast({ title: "No stages", description: `${area}: No stages with start dates to align`, variant: "destructive" });
        return;
      }

      // Apply template durations where available
      let successes = 0, failures = 0;
      for (const stage of stagesToUpdate) {
        try {
          const templateDays = templateDurations[stage.title];
          if (templateDays) {
            const newEndDate = shiftDate(stage.start_date!, templateDays - 1);
            await putStage(stage.id, { end_date: newEndDate });
            successes++;
          }
        } catch {
          failures++;
        }
      }

      // Reload and show results
      await load();
      if (successes > 0) {
        toast({ 
          title: "Durations aligned", 
          description: `${area}: ${successes} stage(s) aligned to template, ${failures} skipped` 
        });
      } else {
        toast({ 
          title: "No changes", 
          description: `${area}: No matching template durations found`, 
          variant: "default" 
        });
      }
    } catch (error) {
      console.error('Failed to align area durations:', error);
      toast({ title: "Error", description: `Failed to align ${area} durations`, variant: "destructive" });
    }
  }

  // Undo last changes (Ctrl+Z)
  const undoChanges = useCallback(() => {
    if (undoHistory.length === 0) return;
    
    const lastState = undoHistory[undoHistory.length - 1];
    setEdit(lastState);
    setUndoHistory(prev => prev.slice(0, -1));
    
    // Force re-render by updating input values via React state
    // The component will re-render and show the restored values
    setTimeout(() => {
      // Update DOM values for uncontrolled inputs to match state
      Object.keys(lastState).forEach(stageId => {
        const stageChanges = lastState[stageId];
        const originalStage = rows.find(s => s.id === stageId);
        if (!originalStage) return;
        
        Object.keys(stageChanges).forEach(field => {
          const input = document.querySelector(`[data-stage-id="${stageId}"][data-field="${field}"]`) as HTMLInputElement;
          if (input) {
            const value = stageChanges[field as keyof Stage] || originalStage[field as keyof Stage] || '';
            input.value = value;
          }
        });
      });
    }, 0);
  }, [undoHistory, rows]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          saveAll();
        } else if (e.key === 'z') {
          e.preventDefault();
          undoChanges();
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeydown);
    return () => document.removeEventListener('keydown', handleGlobalKeydown);
  }, [saveAll, undoChanges]);

  function handleKeyDown(id: string) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save(id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        revert(id);
      }
    };
  }

  // Specialized date keyboard handler with duration-preserving sync
  function handleDateKeyDown(id: string, field: 'start_date' | 'end_date') {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      const step = e.shiftKey ? 7 : (e.ctrlKey||e.metaKey) ? 30 : 1;
      const currentStage = rows.find(r => r.id === id);
      const keepDurationBackwards = e.altKey; // NEW: hold Alt to preserve duration by shifting start
      
      if (e.key === "ArrowUp") { 
        e.preventDefault();
        const currentValue = (e.currentTarget as HTMLInputElement).value || currentStage?.[field] || iso(new Date());
        const newValue = adjustDate(currentValue, step);
        (e.currentTarget as HTMLInputElement).value = newValue;
        
        // Enhanced end_date handling with bidirectional duration preservation
        if (field === 'end_date' && keepDurationBackwards) {
          const effectiveStart = edit[id]?.start_date !== undefined ? edit[id].start_date : currentStage?.start_date;
          const effectiveEnd = edit[id]?.end_date !== undefined ? edit[id].end_date : currentStage?.end_date;
          const oldSpan = diffDays(effectiveStart, effectiveEnd);
          if (oldSpan !== null && effectiveStart) {
            // shift start by same delta
            const delta = diffDays(effectiveEnd, newValue) || 0; // how much we moved end
            const newStart = shiftDate(effectiveStart, delta);
            pushUndo(id, { start_date: effectiveStart, end_date: effectiveEnd });
            setEdit(prev => ({ 
              ...prev, 
              [id]: { 
                ...(prev[id] || {}), 
                end_date: newValue, 
                start_date: newStart 
              }
            }));
            // Update DOM for start_date input too
            setTimeout(() => {
              const startInput = document.querySelector(`[data-stage-id="${id}"][data-field="start_date"]`) as HTMLInputElement;
              if (startInput) startInput.value = newStart;
            }, 0);
            toast({ title:"Duration preserved", description:`Shifted start by ${delta>0? "+"+delta: delta} day(s)` });
            return; // Skip normal updateDate call
          }
        }
        
        updateDate(id, field, newValue);
      }
      if (e.key === "ArrowDown") { 
        e.preventDefault();
        const currentValue = (e.currentTarget as HTMLInputElement).value || currentStage?.[field] || iso(new Date());
        const newValue = adjustDate(currentValue, -step);
        (e.currentTarget as HTMLInputElement).value = newValue;
        
        // Enhanced end_date handling with bidirectional duration preservation
        if (field === 'end_date' && keepDurationBackwards) {
          const effectiveStart = edit[id]?.start_date !== undefined ? edit[id].start_date : currentStage?.start_date;
          const effectiveEnd = edit[id]?.end_date !== undefined ? edit[id].end_date : currentStage?.end_date;
          const oldSpan = diffDays(effectiveStart, effectiveEnd);
          if (oldSpan !== null && effectiveStart) {
            // shift start by same delta
            const delta = diffDays(effectiveEnd, newValue) || 0; // how much we moved end
            const newStart = shiftDate(effectiveStart, delta);
            pushUndo(id, { start_date: effectiveStart, end_date: effectiveEnd });
            setEdit(prev => ({ 
              ...prev, 
              [id]: { 
                ...(prev[id] || {}), 
                end_date: newValue, 
                start_date: newStart 
              }
            }));
            // Update DOM for start_date input too
            setTimeout(() => {
              const startInput = document.querySelector(`[data-stage-id="${id}"][data-field="start_date"]`) as HTMLInputElement;
              if (startInput) startInput.value = newStart;
            }, 0);
            toast({ title:"Duration preserved", description:`Shifted start by ${delta>0? "+"+delta: delta} day(s)` });
            return; // Skip normal updateDate call
          }
        }
        
        updateDate(id, field, newValue);
      }
      if (e.key === "Enter") { 
        e.preventDefault(); 
        save(id);
      }
      if (e.key === "Escape") { 
        e.preventDefault();
        const prev = popUndo(id); 
        if (prev) {
          // Check if this was a coupled change (both start_date and end_date)
          if (prev.start_date !== undefined && prev.end_date !== undefined) {
            // Restore both fields to their previous values
            const startInput = document.querySelector(`[data-stage-id="${id}"][data-field="start_date"]`) as HTMLInputElement;
            const endInput = document.querySelector(`[data-stage-id="${id}"][data-field="end_date"]`) as HTMLInputElement;
            if (startInput) startInput.value = prev.start_date || "";
            if (endInput) endInput.value = prev.end_date || "";
            setEdit(prevEdit => ({ 
              ...prevEdit, 
              [id]: { 
                ...(prevEdit[id] || {}), 
                start_date: prev.start_date,
                end_date: prev.end_date 
              }
            }));
          } else if (prev[field] !== undefined) {
            // Restore just the focused field to its previous value
            (e.currentTarget as HTMLInputElement).value = prev[field] || ""; 
            setEdit(prevEdit => ({ 
              ...prevEdit, 
              [id]: { 
                ...(prevEdit[id] || {}), 
                [field]: prev[field] 
              }
            }));
          }
        }
      }
    };
  }

  function isFieldDirty(stageId: string, field: keyof Stage): boolean {
    const changes = edit[stageId];
    if (!changes) return false;
    const originalStage = rows.find(s => s.id === stageId);
    if (!originalStage) return false;
    return changes[field] !== undefined && changes[field] !== originalStage[field];
  }

  function getInputClassName(stageId: string, field: keyof Stage): string {
    const baseClasses = "border rounded p-2 text-sm transition-all duration-200";
    const dirtyClasses = isFieldDirty(stageId, field) 
      ? "border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-950/30 ring-1 ring-orange-200 dark:ring-orange-800" 
      : "border-gray-300 dark:border-gray-600";
    return `${baseClasses} ${dirtyClasses}`;
  }

  // Calculate pending changes for global indicator
  const pendingChanges = Object.keys(edit).filter(id => Object.keys(edit[id] || {}).length > 0);
  const hasUndoHistory = undoHistory.length > 0;

  // Group stages by area
  const stagesByArea = useMemo(() => {
    const groups: Record<string, Stage[]> = {};
    rows.forEach(stage => {
      const area = stage.area || "General";
      if (!groups[area]) groups[area] = [];
      groups[area].push(stage);
    });
    return groups;
  }, [rows]);

  // Get sorted area names
  const areaNames = useMemo(() => {
    return Object.keys(stagesByArea).sort((a, b) => {
      if (a === "General") return 1;  // General goes last
      if (b === "General") return -1;
      return a.localeCompare(b);
    });
  }, [stagesByArea]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">Loading stages...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="stages-page">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xl font-semibold heading">Stages</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Snapshot: {savedAt || "—"}</span>
          <button className="brand-btn text-xs" onClick={() => setShowProjectTemplate(true)} data-testid="button-apply-project-template">Apply Template to Project</button>
          <button className="brand-btn text-xs" onClick={saveAllSnapshot}>Save All (snapshot)</button>
          <button className="brand-btn text-xs" disabled={undoAllBusy} onClick={async ()=>{
            setUndoAllBusy(true);
            try {
              // Check if there are any local edits to clear
              const hasLocalEdits = Object.keys(edit).length > 0;
              
              // Build list of stages that need reverting on server
              const updates = rows.filter(s => {
                const prev = snapshot[s.id];
                return prev && (s.start_date !== prev.start_date || s.end_date !== prev.end_date);
              }).map(s => ({ 
                id: s.id, 
                patch: snapshot[s.id] 
              }));
              
              if (updates.length > 0) {
                // Preserve local edits in case all server calls fail
                const priorEdit = structuredClone(edit);
                
                // Persist bulk revert to server with error tracking
                const results = await Promise.allSettled(updates.map(u => 
                  postJSON(`/api/stages/update?project_id=${projectId}&stage_id=${u.id}`, {
                    start_date: u.patch.start_date ?? undefined,
                    end_date: u.patch.end_date ?? undefined
                  })
                ));
                
                const successes = results.filter(r => r.status === 'fulfilled').length;
                const failures = results.filter(r => r.status === 'rejected').length;
                
                // Always reload to ensure UI matches server state
                const freshStages = await load();
                
                if (failures === 0) {
                  // All succeeded - full success
                  toast({ title:"Reverted", description:"All stages reverted to last saved snapshot" });
                  // Local edits cleared by load(), renderNonce bump needed
                  setRenderNonce(prev => prev + 1);
                } else if (successes > 0) {
                  // Partial success - some failed
                  toast({ title:"Partial Revert", description:`Reverted ${successes} of ${updates.length} stages`, variant:"destructive" });
                  // Local edits cleared by load(), renderNonce bump needed
                  setRenderNonce(prev => prev + 1);
                } else {
                  // All failed - no server changes, preserve local edits
                  setEdit(priorEdit); // Restore local edits since no server success
                  setRenderNonce(prev => prev + 1); // Force input re-render
                  toast({ title:"Error", description:"Failed to revert any stages", variant:"destructive" });
                }
              } else if (hasLocalEdits) {
                // Only local edits exist - clear them and call load for consistency
                await load();
                setRenderNonce(prev => prev + 1);
                toast({ title:"Reverted", description:"Local edits cleared" });
              } else {
                // Nothing to revert
                toast({ title:"No Changes", description:"Nothing to revert" });
              }
              
            } catch (error) {
              console.error('Failed to revert stages:', error);
              toast({ title:"Error", description:"Failed to revert stages", variant:"destructive" });
            } finally {
              setUndoAllBusy(false);
            }
          }}>{undoAllBusy ? "Reverting..." : "Undo All"}</button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div></div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {pendingChanges.length > 0 && (
            <div className="flex items-center gap-2 px-2 py-1 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded">
              <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
              <span className="text-orange-700 dark:text-orange-300">
                {pendingChanges.length} unsaved change{pendingChanges.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
          <div className="flex items-center gap-4 opacity-70">
            <span>
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 border rounded text-xs">Ctrl+S</kbd> Save All
            </span>
            {hasUndoHistory && (
              <span>
                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 border rounded text-xs">Ctrl+Z</kbd> Undo
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="border rounded" data-testid="stages-list">
        {areaNames.map(areaName => (
          <div key={areaName} className="space-y-1">
            {/* Area Header with Controls */}
            <div className="flex items-center justify-between py-2 px-3 bg-muted/50 border-b-2 border-brand-primary">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-brand-primary">{areaName}</h3>
                <span className="text-xs text-muted-foreground">
                  {stagesByArea[areaName].length} stage{stagesByArea[areaName].length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input 
                    className="border rounded p-1 text-xs w-[50px]" 
                    type="number" 
                    value={shiftDays}
                    onChange={e => setShiftDays(parseInt(e.target.value || '0', 10))} 
                    placeholder="±days"
                    data-testid={`shift-days-input-${areaName}`}
                  />
                  <button 
                    className="brand-btn text-xs" 
                    onClick={() => shiftAreaStartDates(areaName, shiftDays)}
                    disabled={!shiftDays}
                    data-testid={`shift-start-${areaName}`}
                    title="Shift start dates, preserve durations"
                  >
                    Shift Start
                  </button>
                  <button 
                    className="brand-btn text-xs" 
                    onClick={() => shiftAreaEndDates(areaName, shiftDays)}
                    disabled={!shiftDays}
                    data-testid={`shift-end-${areaName}`}
                  >
                    Shift End
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <input 
                    className="border rounded p-1 text-xs w-[50px]" 
                    type="number" 
                    value={durationDays}
                    onChange={e => setDurationDays(parseInt(e.target.value || '0', 10))} 
                    placeholder="N days"
                    data-testid={`duration-days-input-${areaName}`}
                  />
                  <button 
                    className="brand-btn text-xs" 
                    onClick={() => setAreaDuration(areaName, durationDays)}
                    disabled={!durationDays || durationDays < 1}
                    data-testid={`set-duration-${areaName}`}
                    title="Set uniform duration for all stages"
                  >
                    Set Duration
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <input 
                    className="border rounded p-1 text-xs w-[90px]" 
                    type="date" 
                    value={endToDate}
                    onChange={e => setEndToDate(e.target.value)} 
                    data-testid={`end-to-date-input-${areaName}`}
                  />
                  <button 
                    className="brand-btn text-xs" 
                    onClick={() => setAreaEndToDate(areaName, endToDate)}
                    data-testid={`set-end-to-${areaName}`}
                    title="Set all end dates to this date"
                  >
                    Set End to
                  </button>
                  <button 
                    className="brand-btn text-xs" 
                    onClick={() => alignAreaDurationsToTemplate(areaName)}
                    data-testid={`align-template-${areaName}`}
                    title="Align stage durations to organization template"
                  >
                    Align Template
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">
                  Saved: {areaSavedAt[areaName] || "—"}
                </span>
                <button 
                  className="brand-btn text-xs" 
                  onClick={() => saveAreaSnapshot(areaName)}
                  data-testid={`save-area-${areaName}`}
                >
                  Save Area
                </button>
                <button 
                  className="brand-btn text-xs" 
                  disabled={undoAreaBusy[areaName] || !areaSnapshots[areaName]}
                  onClick={() => undoAreaChanges(areaName)}
                  data-testid={`undo-area-${areaName}`}
                >
                  {undoAreaBusy[areaName] ? "Undoing..." : "Undo Area"}
                </button>
              </div>
            </div>
            
            {/* Column Headers (only for first area) */}
            {areaName === areaNames[0] && (
              <div className="p-3 border-b bg-gray-50 dark:bg-gray-800 grid md:grid-cols-5 gap-2 text-sm font-medium text-muted-foreground">
                <div>Title</div>
                <div>Area</div>
                <div>Start Date</div>
                <div>End Date</div>
                <div>Status & Actions</div>
              </div>
            )}
            
            {/* Stages in this area */}
            {stagesByArea[areaName].map(s => (
          <div 
            key={s.id} 
            ref={el => { refMap.current[s.id] = el }}
            className={`p-3 border-b last:border-0 grid md:grid-cols-5 gap-2 items-center ${s.id === focusId ? 'ring-2 ring-[var(--brand-accent)] pulse-once' : ''}`}
            data-testid={`stage-row-${s.id}`}
          >
            <input 
              key={`${s.id}-title-${renderNonce}`}
              className={getInputClassName(s.id, "title")} 
              defaultValue={s.title} 
              onChange={bind(s.id, "title")} 
              onKeyDown={handleKeyDown(s.id)}
              placeholder="Stage title"
              data-testid={`input-title-${s.id}`}
              data-stage-id={s.id}
              data-field="title"
            />
            <input 
              key={`${s.id}-area-${renderNonce}`}
              className={getInputClassName(s.id, "area")} 
              defaultValue={s.area || ""} 
              onChange={bind(s.id, "area")} 
              onKeyDown={handleKeyDown(s.id)}
              placeholder="Area (HCM, Payroll, ...)"
              data-testid={`input-area-${s.id}`}
              data-stage-id={s.id}
              data-field="area"
            />
            <input 
              key={`${s.id}-start_date-${renderNonce}`}
              className={getInputClassName(s.id, "start_date")} 
              type="date" 
              defaultValue={s.start_date || ""} 
              onChange={(e) => updateDate(s.id, "start_date", e.target.value)}
              onKeyDown={handleDateKeyDown(s.id, "start_date")}
              data-testid={`input-start-date-${s.id}`}
              data-stage-id={s.id}
              data-field="start_date"
            />
            <input 
              key={`${s.id}-end_date-${renderNonce}`}
              className={getInputClassName(s.id, "end_date")} 
              type="date" 
              defaultValue={s.end_date || ""} 
              onChange={(e) => updateDate(s.id, "end_date", e.target.value)}
              onKeyDown={handleDateKeyDown(s.id, "end_date")}
              data-testid={`input-end-date-${s.id}`}
              data-stage-id={s.id}
              data-field="end_date"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Saved {rowSavedAt[s.id] || "—"}</span>
              <div className="text-xs text-muted-foreground px-2 py-1 border rounded bg-gray-50 dark:bg-gray-800">
                {s.status}
              </div>
              <button 
                className={`px-2 py-1 border rounded text-xs transition-all ${
                  saving[s.id] 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : Object.keys(edit[s.id] || {}).length > 0
                      ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => save(s.id)}
                disabled={saving[s.id]}
                data-testid={`button-save-${s.id}`}
                title="Press Enter to save quickly"
              >
                {saving[s.id] ? 'Saving...' : Object.keys(edit[s.id] || {}).length > 0 ? 'Save Changes' : 'Save'}
              </button>
              {Object.keys(edit[s.id] || {}).length > 0 && (
                <button 
                  className="px-2 py-1 border rounded text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                  onClick={() => revert(s.id)}
                  data-testid={`button-revert-${s.id}`}
                  title="Press Escape to revert quickly"
                >
                  Revert
                </button>
              )}
              {(undoStack[s.id] || []).length > 0 && (
                <button 
                  className="px-2 py-1 border rounded text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 transition-all"
                  onClick={() => revertLast(s.id)}
                  data-testid={`button-revert-last-${s.id}`}
                  title="Undo the last date change"
                >
                  Revert last
                </button>
              )}
              <button 
                className="px-2 py-1 border rounded text-xs hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400"
                onClick={() => setSignoffModal({
                  stageId: s.id, 
                  stageTitle: edit[s.id]?.title || s.title, 
                  stageArea: edit[s.id]?.area || s.area,
                  stageOwner: edit[s.id]?.area || s.area ? `Area Lead (${edit[s.id]?.area || s.area})` : undefined
                })}
                data-testid={`button-request-signoff-${s.id}`}
              >
                Request Sign-Off
              </button>
            </div>
          </div>
        ))}
          </div>
        ))}
        {!rows.length && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No stages yet. Stages are typically created through the sign-off workflow.
          </div>
        )}
      </div>
      {signoffModal && projectId && (
        <SignoffRequestModal 
          projectId={projectId}
          stageId={signoffModal.stageId}
          stageTitle={signoffModal.stageTitle}
          stageArea={signoffModal.stageArea}
          onClose={() => {
            setSignoffModal(null);
            load(); // Refresh to see status change
          }}
        />
      )}
      {showProjectTemplate && projectId && (
        <StageTemplateApplyProject 
          projectId={projectId}
          stages={rows}
          onClose={() => {
            setShowProjectTemplate(false);
            load(); // Refresh to see changes
          }}
        />
      )}
    </div>
  );
}