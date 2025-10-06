import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getJSON, postJSON } from "@/lib/authFetch";
import { useToast } from "@/hooks/use-toast";
import { downloadGET } from "@/lib/download";

function useProjectId() {
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const m = location.match(/\/projects\/([^/]+)/);
  if (m) return m[1];
  return sessionStorage.getItem("kap.projectId") || "";
}

export default function ShareLinksManager(){
  const projectId = useProjectId();
  const { toast } = useToast();
  const [rows,setRows] = useState<any[]>([]);
  const [loading,setLoading]=useState(false);

  async function load(){
    if (!projectId) return;
    setLoading(true);
    try { 
      const d = await getJSON<{items:any[]}>(`/api/share-links/list?project_id=${projectId}`); 
      setRows(d.items||[]); 
    }
    catch { setRows([]); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ load(); },[projectId]);

  async function revoke(token:string){
    try { 
      await postJSON(`/api/share-links/revoke?project_id=${projectId}&token=${encodeURIComponent(token)}`, {});
      toast({ title:"Revoked"}); 
      load(); 
    }
    catch(e:any){ 
      toast({ title:"Revoke failed", description:String(e?.message||e), variant:"destructive" }); 
    }
  }

  async function exportCSV(){
    try {
      await downloadGET(`/api/share/export.csv?project_id=${projectId}`, "share_links.csv");
      toast({ title:"CSV exported", description:"Share links exported successfully" });
    }
    catch(e:any){
      toast({ title:"Export failed", description:String(e?.message||e), variant:"destructive" });
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Share Links</h1>
        <button 
          className="px-3 py-2 border rounded" 
          onClick={exportCSV}
          data-testid="button-export-csv"
        >
          Export CSV
        </button>
      </div>
      <div className="border rounded">
        {rows.map((r,i)=>(
          <div key={i} className="p-3 border-b last:border-0 grid md:grid-cols-5 gap-2 items-center text-sm">
            <div className="truncate md:col-span-2">
              <div><b>{r.artifact_name || r.artifact_id}</b></div>
              <div className="text-xs text-muted-foreground">Token: {r.token.slice(0,10)}…</div>
            </div>
            <div className="text-xs">Expires: {r.expires_at}</div>
            <div className={`text-xs ${r.revoked_at?'text-red-600':'text-green-600'}`}>
              {r.revoked_at ? `Revoked: ${r.revoked_at}` : "Active"}
            </div>
            <div className="flex items-center gap-2">
              <button 
                className="px-2 py-1 border rounded text-xs"
                data-testid={`button-copy-${r.token}`}
                onClick={()=>navigator.clipboard.writeText(`${location.origin}/api/share/${r.token}`)}>
                Copy
              </button>
              {!r.revoked_at && (
                <button 
                  className="px-2 py-1 border rounded text-xs" 
                  data-testid={`button-revoke-${r.token}`}
                  onClick={()=>revoke(r.token)}>
                  Revoke
                </button>
              )}
            </div>
          </div>
        ))}
        {!rows.length && !loading && <div className="p-3 text-sm text-muted-foreground">No share links yet.</div>}
        {loading && <div className="p-3 text-sm">Loading…</div>}
      </div>
    </div>
  );
}