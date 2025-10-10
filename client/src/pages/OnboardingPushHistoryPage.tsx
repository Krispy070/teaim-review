import { getProjectId, ensureProjectPath } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function OnboardingPushHistoryPage(){
  const pid = getProjectId();
  const [items,setItems]=useState<any[]>([]);
  const [page,setPage]=useState(0);
  const limit=50;

  async function load(){
    const r=await fetchWithAuth(`/api/onboarding/pushed_list?projectId=${encodeURIComponent(pid!)}&limit=${limit}&offset=${page*limit}`);
    const j=await r.json(); if (r.ok) setItems(j.items||[]);
  }
  useEffect(()=>{ load(); },[pid,page]);

  return (
    
      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-push-history">Onboarding → Plan: Push History</h1>
          <div className="flex items-center gap-2">
            <button className="text-xs px-2 py-1 border rounded" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} data-testid="button-prev">Prev</button>
            <span className="text-xs opacity-70">Page {page+1}</span>
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>setPage(p=>p+1)} data-testid="button-next">Next</button>
          </div>
        </div>
        <div className="border rounded-2xl overflow-auto">
          <table className="text-sm min-w-[800px] w-full">
            <thead className="bg-slate-900/40 sticky top-0">
              <tr><th className="text-left px-2 py-1">When</th><th className="text-left px-2 py-1">Step</th><th className="text-left px-2 py-1">Count</th><th className="text-left px-2 py-1">Links</th></tr>
            </thead>
            <tbody>
              {items.map((it:any)=>(
                <tr key={it.id} className="border-b border-slate-800" data-testid={`row-push-${it.id}`}>
                  <td className="px-2 py-1" data-testid={`push-date-${it.id}`}>{new Date(it.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-1" data-testid={`push-step-${it.id}`}>{it.stepTitle||it.stepId}</td>
                  <td className="px-2 py-1" data-testid={`push-count-${it.id}`}>{it.count}</td>
                  <td className="px-2 py-1">
                    <a className="text-xs px-2 py-1 border rounded mr-2"
                       href={ensureProjectPath(`/plan?originType=onboarding&originId=${encodeURIComponent(it.stepId)}`)}
                       data-testid={`link-plan-${it.id}`}>
                      Open in Plan
                    </a>
                    <a className="text-xs px-2 py-1 border rounded"
                       href={ensureProjectPath(`/onboarding?stepId=${encodeURIComponent(it.stepId)}`)}
                       data-testid={`link-step-${it.id}`}>
                      Open Step
                    </a>
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td className="px-2 py-2 text-xs opacity-70" colSpan={4} data-testid="text-no-pushes">No pushes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    
  );
}
