import { useEffect, useState } from "react";
import { apiPost } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type Backup = { key:string; name:string; updated_at?:string; size?:number };
type Entry = { name:string; size:number };

export default function AdminBackups({ projectId }: { projectId: string }){
  const [items,setItems] = useState<Backup[]>([]);
  const [sel,setSel] = useState<Backup|null>(null);
  const [entries,setEntries] = useState<Entry[]>([]);
  const [loading,setLoading] = useState(false);
  const { toast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [lastArtifact, setLastArtifact] = useState<{id?:string; name?:string}|null>(null);
  const [reindexStatus, setReindexStatus] = useState<any>(null);
  const [reindexLoading, setReindexLoading] = useState(false);

  async function load(){
    const r = await fetch(`/api/backups/list?project_id=${projectId}`, { credentials:"include" });
    if (r.ok) setItems((await r.json()).backups || []);
  }
  useEffect(()=>{ load(); }, [projectId]);

  async function openBackup(b:Backup){
    setSel(b); setEntries([]); setLoading(true);
    const r = await fetch(`/api/backups/contents?project_id=${projectId}&backup_key=${encodeURIComponent(b.key)}`, { credentials:"include" });
    setLoading(false);
    if (r.ok) setEntries((await r.json()).entries || []);
  }

  async function downloadFile(name: string) {
    if (!sel) return;
    try {
      setBusyKey(name);
      const u = `/api/backups/get-file?project_id=${projectId}&backup_key=${encodeURIComponent(sel.key)}&artifact_name=${encodeURIComponent(name)}`;
      const res = await fetch(u, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name.split("/").pop() || "file";
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
      toast({ title: "Downloaded", description: name });
    } catch (e: any) {
      toast({ title: "Download failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  }

  // replaces storeFile -> now chains store → re-ingest automatically
  async function storeFile(name: string) {
    if (!sel) return;
    try {
      setBusyKey(name);
      toast({ title: "Storing…", description: name });
      const d = await apiPost<{ ok: boolean; stored_key: string }>(
        "/backups/store-file",
        undefined,
        { project_id: projectId!, backup_key: sel.key, artifact_name: name }
      );
      toast({ title: "Stored", description: d.stored_key });

      // auto chain to re-ingest (no prompt)
      toast({ title: "Re-ingesting…", description: name });
      const re = await apiPost<{ artifact_id?: string }>("/backups/reingest-stored", undefined, {
        project_id: projectId!,
        stored_key: d.stored_key,
      });
      setLastArtifact({ id: re.artifact_id, name });
      toast({ title: "Re-ingest started", description: "Check Dashboard → Restore Activity & recent artifacts." });
    } catch (e: any) {
      toast({ title: "Store/Re-ingest failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  }

  // Manual re-embed now button
  async function reEmbedNow() {
    try {
      setReindexLoading(true);
      toast({ title: "Triggering reindex", description: "Queuing all pending re-embedding jobs..." });
      
      const response = await apiPost<{ queued: number }>("/reindex/trigger", undefined, { project_id: projectId });
      
      toast({ title: "Reindex triggered", description: `Queued ${response.queued} files for re-embedding.` });
      
      // Refresh status
      const statusResponse = await fetch(`/api/reindex/status?project_id=${projectId}`, { credentials: "include" });
      if (statusResponse.ok) {
        setReindexStatus(await statusResponse.json());
      }
    } catch (e: any) {
      toast({ title: "Reindex failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setReindexLoading(false);
    }
  }

  // Load reindex status
  useEffect(() => {
    async function loadReindexStatus() {
      try {
        const r = await fetch(`/api/reindex/status?project_id=${projectId}`, { credentials: "include" });
        if (r.ok) {
          setReindexStatus(await r.json());
        }
      } catch (e) {
        // Ignore errors - reindex system may not be available
      }
    }
    if (projectId) loadReindexStatus();
  }, [projectId]);

  // one-click store + re-ingest (server does both)
  async function storeAndReingest(name: string) {
    if (!sel) return;
    try {
      setBusyKey(name);
      toast({ title: "Store + Re-ingest", description: name });
      const d = await apiPost<{ ok:boolean; stored_key:string; artifact_id?:string }>(
        "/backups/store-and-reingest",
        undefined,
        { project_id: projectId!, backup_key: sel.key, artifact_name: name }
      );
      setLastArtifact({ id: d.artifact_id, name });
      toast({ title: "Queued", description: `Stored ${d.stored_key}, re-ingest started.` });
    } catch (e: any) {
      toast({ title: "Store + Re-ingest failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  }


  return (
    <div className="p-6 space-y-4" data-testid="admin-backups-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" data-testid="backups-title">Backups</h1>
        
        {/* Manual Re-embed Control */}
        <div className="flex items-center gap-3">
          {reindexStatus && (
            <div className="text-xs text-muted-foreground" data-testid="reindex-status">
              Queue: {reindexStatus.pending || 0} pending, {reindexStatus.running || 0} running
            </div>
          )}
          <button 
            disabled={reindexLoading} 
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1" 
            onClick={reEmbedNow}
            data-testid="re-embed-now-button"
          >
            {reindexLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null} 
            Re-embed now
          </button>
        </div>
      </div>

      <div className="border rounded" data-testid="backups-list">
        {items.map(b=>(
          <div key={b.key} className="p-2 border-b last:border-0 flex items-center justify-between" data-testid={`backup-item-${b.key}`}>
            <div className="text-sm">
              <div className="font-medium">{b.name}</div>
              <div className="text-xs text-muted-foreground">{b.updated_at}</div>
            </div>
            <button 
              className="px-3 py-1 border rounded" 
              onClick={()=>openBackup(b)}
              data-testid={`open-backup-${b.key}`}
            >
              Open
            </button>
          </div>
        ))}
        {!items.length && <div className="p-3 text-sm text-muted-foreground" data-testid="no-backups">No backups yet.</div>}
      </div>

      {sel && (
        <div className="border rounded p-3" data-testid="backup-contents">
          <div className="text-sm font-medium mb-2">Backup contents: {sel.name}</div>
          {loading && <div data-testid="backup-contents-loading">Loading…</div>}
          {!loading && (
            <div className="grid gap-2">
              {entries.filter(e=>e.name.startsWith("artifacts/")).map(e=>(
                <div key={e.name} className="flex items-center justify-between border rounded px-2 py-1" data-testid={`backup-entry-${e.name}`}>
                  <div className="text-sm">{e.name} <span className="text-xs text-muted-foreground">({e.size} bytes)</span></div>
                  <div className="flex items-center gap-2">
                    <button disabled={busyKey===e.name} className="px-2 py-1 border rounded text-sm flex items-center gap-1" onClick={()=>downloadFile(e.name)} data-testid={`download-${e.name}`}>
                      {busyKey===e.name ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Download
                    </button>
                    <button disabled={busyKey===e.name} className="px-2 py-1 border rounded text-sm flex items-center gap-1" onClick={()=>storeFile(e.name)} data-testid={`store-${e.name}`}>
                      {busyKey===e.name ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Store→Re-ingest
                    </button>
                    <button disabled={busyKey===e.name} className="px-2 py-1 border rounded text-sm flex items-center gap-1" onClick={()=>storeAndReingest(e.name)} data-testid={`store-reingest-${e.name}`}>
                      {busyKey===e.name ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Store + Re-ingest
                    </button>
                  </div>
                </div>
              ))}
              {!entries.filter(e=>e.name.startsWith("artifacts/")).length && (
                <div className="text-sm text-muted-foreground" data-testid="no-artifacts">No artifact files found in this backup.</div>
              )}
            </div>
          )}
          {lastArtifact && (
            <div className="mt-3 text-sm" data-testid="last-artifact-status">
              Re-ingest started for <b>{lastArtifact.name}</b>.
              {" "}
              {lastArtifact.id ? (
                <a className="underline" href={`/projects/${projectId}/documents#artifact=${lastArtifact.id}`} data-testid="view-in-documents">
                  View in Documents
                </a>
              ) : (
                <span className="text-muted-foreground">Link will appear once ID is available.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}