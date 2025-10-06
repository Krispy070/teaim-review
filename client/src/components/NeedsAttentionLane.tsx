import { useEffect, useState } from "react";

export default function NeedsAttentionLane({ projectId }:{ projectId:string }) {
  const [items,setItems] = useState<any[]>([]);
  const [loading,setLoading] = useState(false);
  const [isAdminPm,setIsAdminPm] = useState<boolean>(true); // TODO: derive from session/role store - for now allow all users to resolve

  async function load(){
    setLoading(true);
    try {
      const r = await fetch(`/api/review/list?project_id=${projectId}&kind=needs_ocr`, { credentials: "include" });
      if (r.ok) setItems((await r.json()).items || []);
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, [projectId]);

  async function resolve(id:string){
    if (!confirm("Mark as resolved?")) return;
    const r = await fetch(`/api/review/resolve?project_id=${projectId}&item_id=${id}`, { method:"POST", credentials: "include" });
    if (r.ok) load();
  }

  if (loading) return <div className="p-3 border rounded" data-testid="needs-attention-loading">Loading…</div>;
  if (!items.length) return null;

  return (
    <div className="border rounded p-3 space-y-2" data-testid="needs-attention-lane">
      <div className="text-sm font-medium">Needs Attention (OCR)</div>
      <div className="grid gap-2">
        {items.map((x:any)=>(
          <div key={x.id} className="flex items-center justify-between border rounded p-2" data-testid={`needs-attention-item-${x.id}`}>
            <div className="text-sm">
              <div className="font-medium">{x.details?.filename || x.artifact_id}</div>
                <div className="text-xs text-muted-foreground">Reason: {x.details?.reason || "low_text"}</div>
            </div>
            <div className="flex items-center gap-2">
              {/* Link to your artifact view if available */}
              {/* <Link className="text-sm underline" to={`/projects/${projectId}/documents/${x.artifact_id}`}>Open</Link> */}
              {isAdminPm && (
                <button 
                  className="px-2 py-1 text-sm border rounded" 
                  onClick={()=>resolve(x.id)}
                  data-testid={`resolve-button-${x.id}`}
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}