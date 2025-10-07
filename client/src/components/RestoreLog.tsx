import { useEffect, useState } from "react";

export default function RestoreLog({ projectId }:{ projectId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=> {
    (async ()=>{
      setLoading(true);
      try {
        const kinds = ["backup.restore_file","backup.reingest","reindex.queued","reindex.completed","reindex.failed"];
        const qs = new URLSearchParams({ project_id: projectId, kind: kinds.join(",") }).toString();
        const r = await fetch(`/api/audit/list?${qs}`, { credentials:"include" });
        if (r.ok) {
          const data = await r.json();
          const events = (data.events || [])
            .filter((e:any)=> e && e.kind && e.created_at) // Ensure required fields exist
            .slice(0, 10);
          setItems(events);
        }
      } finally { setLoading(false); }
    })();
  }, [projectId]);

  if (loading) return null;
  if (!items.length) return null;

  return (
    <div className="border rounded p-3 space-y-2" data-testid="restore-log">
      <div className="text-sm font-medium">Restore & Re-embed Activity</div>
      <div className="grid gap-2">
        {items.map((e:any, i:number)=>(
          <div key={i} className="text-sm" data-testid={`restore-activity-${i}`}>
            <span className="font-mono text-xs">
              {e.created_at ? new Date(e.created_at).toLocaleString() : 'Unknown time'}
            </span>{" "}
            <b>{e.kind ? e.kind.replace("backup.","").replace("reindex.","") : 'Unknown'}</b>{" "}
            <span className="text-xs text-muted-foreground">
              {e.details?.filename || e.details?.artifact || e.details?.stored_key?.split('/').pop() || 'Unknown file'}
            </span>
            {e.kind?.startsWith('reindex.') && (
              <span className={`text-xs ml-2 px-1 rounded ${
                e.kind === 'reindex.completed' ? 'bg-green-100 text-green-700' :
                e.kind === 'reindex.failed' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {e.kind.replace('reindex.', '')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}