import { useEffect, useState } from "react";

export default function DigestChip({ orgId, projectId }: { orgId: string; projectId: string }) {
  const [st, setSt] = useState<any>(null);
  
  useEffect(() => { 
    (async () => {
      try {
        const r = await fetch(`/api/digest/status?org_id=${orgId}&project_id=${projectId}`, { credentials: "include" });
        if (r.ok) setSt(await r.json());
      } catch {}
    })(); 
  }, [orgId, projectId]);

  if (!st) return null;
  const last = st.last_send ? new Date(st.last_send).toLocaleString() : "—";
  const next = st.next_run_local ? new Date(st.next_run_local).toLocaleString() : "—";

  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border text-sm">
      <span className="font-medium">Digest</span>
      <span className="text-xs text-muted-foreground">Last:</span><span>{last}</span>
      <span className="text-xs text-muted-foreground">Next:</span><span>{next}</span>
    </div>
  );
}