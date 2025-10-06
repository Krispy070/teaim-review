import { useEffect, useMemo, useState } from "react";
import { getJSON } from "@/lib/authFetch";
import { useParams } from "wouter";

export default function WellnessCard(){
  const params = useParams<{projectId: string}>();
  const projectId = params.projectId;
  const [pts,setPts]=useState<{created_at:string;score:number}[]>([]);
  useEffect(()=>{ (async()=>{ try{
    const d = await getJSON(`/api/wellness/summary?project_id=${projectId}`);
    setPts(d.items||[]);
  }catch{ setPts([]); } })(); },[projectId]);

  const avg = useMemo(()=>{
    if (!pts.length) return null;
    const s = pts.reduce((a,b)=> a + Number(b.score||0), 0) / pts.length;
    return Math.round(s*10)/10;
  },[pts]);

  const vibe = avg==null ? "n/a"
    : avg >= 4.2 ? "🚀 excellent"
    : avg >= 3.5 ? "🙂 steady"
    : avg >= 2.8 ? "😐 needs attention"
    : "⚠️ at risk";

  return (
    <div className="brand-card p-3">
      <div className="text-sm font-medium mb-1">Team Wellness</div>
      {avg==null ? (
        <div className="text-xs text-muted-foreground">No check-ins yet.</div>
      ) : (
        <>
          <div className="text-2xl font-semibold">{avg}</div>
          <div className="text-xs text-muted-foreground">{vibe}</div>
          <div className="mt-2 h-[36px] flex items-end gap-1">
            {(pts.slice().reverse()).map((p,i)=>(
              <div key={i} title={`${p.score} • ${new Date(p.created_at).toLocaleDateString()}`}
                   style={{ height: `${(Number(p.score||0)/5)*36}px`, width: '6px', background: 'var(--brand-accent)', opacity: .75 }} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">How's the team today?</span>
            {[1,2,3,4,5].map(n=>(
              <button key={n} className="brand-btn text-xs" onClick={async ()=>{
                await fetch(`/api/wellness/checkin?project_id=${projectId}`, {
                  method:"POST", credentials:"include",
                  headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({score:n})
                });
                // quick local refresh
                try{
                  const d = await getJSON(`/api/wellness/summary?project_id=${projectId}`);
                  setPts(d.items||[]);
                }catch{}
              }}>{n}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}