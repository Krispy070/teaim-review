import { useEffect, useState } from "react";
import { getJSON } from "@/lib/authFetch";
import { useLocation } from "wouter";

export default function StageHealthChip(){
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  const [late,setLate]=useState<number>(0);
  const [ok,setOk]=useState<number>(0);

  useEffect(()=>{ (async()=>{ try{
    const d = await getJSON(`/api/method/lateness?project_id=${projectId}`);
    setLate(d?.summary?.late || 0);
    setOk(d?.summary?.on_time_or_early || 0);
  }catch{ setLate(0); setOk(0); } })(); },[projectId]);

  if (late===0 && ok===0) return null;

  return (
    <div className="inline-flex items-center gap-2 brand-chip">
      <span className="text-xs">Stages</span>
      <span className="text-xs" style={{color: late>0 ? "var(--brand-warn)" : "var(--brand-good)"}}>
        {late>0 ? `${late} late` : `${ok} on-time`}
      </span>
    </div>
  );
}