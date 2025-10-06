import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/authFetch";

type Props = {
  open: boolean;
  onClose: () => void;
  artifactId: string;
  projectId: string;
};

const PRESETS = [
  { label: "15 minutes", sec: 900 },
  { label: "1 hour", sec: 3600 },
  { label: "24 hours", sec: 86400 },
  { label: "7 days", sec: 604800 },
];

export default function ShareDialog({ open, onClose, artifactId, projectId }: Props){
  const { toast } = useToast();
  const [sec, setSec] = useState(3600);
  const [url, setUrl] = useState<string>("");
  const [useRevocable, setUseRevocable] = useState(false);
  const [linkId, setLinkId] = useState<string>("");

  useEffect(()=>{ if (!open) { setUrl(""); setSec(3600); setUseRevocable(false); setLinkId(""); } },[open]);

  async function create(){
    try {
      // Always use revocable share link system for consistency
      const res = await authFetch(`/api/share-links/create?project_id=${projectId}`, {
        method: "POST",
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ 
          artifact_id: artifactId,
          expires_sec: sec
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setUrl(d.url);
      setLinkId(d.token); // Use token as linkId for revocation
      
      if (useRevocable) {
        toast({ title: "Revocable share link created", description: `Valid for ~${Math.round(sec/60)} min. Can be revoked anytime.` });
      } else {
        toast({ title: "Share link ready", description: `Valid for ~${Math.round(sec/60)} min.` });
      }
    } catch(e:any) {
      toast({ title:"Failed to create share link", description:String(e?.message||e), variant:"destructive" });
    }
  }
  async function copy(){
    try { await navigator.clipboard.writeText(url); toast({ title:"Copied to clipboard" }); }
    catch { /* no-op */ }
  }

  async function revoke(){
    if (!useRevocable || !linkId) return;
    try {
      const res = await authFetch(`/api/share-links/revoke?token=${linkId}&project_id=${projectId}`, {
        method: "POST"
      });
      if (!res.ok) throw new Error(await res.text());
      setUrl("");
      setLinkId("");
      toast({ title: "Link revoked", description: "The share link is no longer accessible." });
    } catch(e:any) {
      toast({ title:"Failed to revoke link", description:String(e?.message||e), variant:"destructive" });
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="w-[520px] bg-white dark:bg-neutral-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-4 text-slate-900 dark:text-slate-100" onClick={e=>e.stopPropagation()}>
        <div className="text-sm font-medium mb-2 text-slate-900 dark:text-slate-100">Share document</div>
        <div className="mb-3">
          <label className="flex items-center gap-2 text-sm mb-2 text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={useRevocable} 
              onChange={(e) => setUseRevocable(e.target.checked)}
              className="rounded"
              data-testid="checkbox-revocable"
            />
            <span>Create revocable link (can be disabled anytime)</span>
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-2 mb-3">
          {PRESETS.map(p=>(
            <button key={p.sec}
              className={`px-2 py-2 border border-slate-300 dark:border-slate-600 rounded ${sec===p.sec?'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-neutral-700'}`}
              onClick={()=>setSec(p.sec)}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-neutral-700 rounded" onClick={create} data-testid="button-create-link">
            Create {useRevocable ? 'Revocable ' : ''}Link
          </button>
          <button className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-neutral-700 rounded disabled:opacity-50" disabled={!url} onClick={()=>window.open(url,'_blank')} data-testid="button-open-link">Open</button>
          <button className="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-neutral-700 rounded disabled:opacity-50" disabled={!url} onClick={copy} data-testid="button-copy-link">Copy</button>
          {useRevocable && url && (
            <button className="px-3 py-2 border border-red-300 dark:border-red-700 rounded bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300" onClick={revoke} data-testid="button-revoke-link">
              Revoke
            </button>
          )}
          <button className="ml-auto px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-neutral-700 rounded" onClick={onClose} data-testid="button-close-dialog">Close</button>
        </div>
        {url && (
          <div className="mt-3">
            <div className="text-xs break-all text-slate-600 dark:text-slate-400">{url}</div>
            {useRevocable && (
              <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                ⚠️ This is a revocable link - it can be disabled anytime from this dialog.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}