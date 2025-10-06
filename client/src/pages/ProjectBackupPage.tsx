import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import Guard from "@/components/Guard";
import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useRef, useState } from "react";

export default function ProjectBackupPage(){
  return <Guard need="member"><ProjectBackupPageInner /></Guard>;
}

function ProjectBackupPageInner(){
  const pid = getProjectId();

  // Basic snapshot export (already there)
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg,setMsg] = useState("");
  const [asNew,setAsNew] = useState(false);
  const [newName,setNewName] = useState("");
  const [newCode,setNewCode] = useState("");

  async function importJson(){
    const f = fileRef.current?.files?.[0];
    if (!f) { setMsg("Pick a .json snapshot"); return; }

    const fd = new FormData();
    fd.append("file", f);
    fd.append("remapIds", "true");
    fd.append("requeue", "true");

    if (asNew) {
      if (!newName || !newCode) { setMsg("Provide new project name & code"); return; }
      fd.append("createNew", JSON.stringify({ name: newName, code: newCode }));
    } else {
      fd.append("targetProjectId", pid!);
    }

    const r = await fetchWithAuth(`/api/projects/import`, { method:"POST", body: fd });
    const j = await r.json();
    if (!r.ok) {
      setMsg(`Failed: ${j.error || "unknown error"}`);
      return;
    }
    setMsg(`Imported: ${JSON.stringify(j.counts)}`);

    // If new project was created, jump there
    if (asNew && j.projectId) {
      localStorage.setItem("projectId", j.projectId);
      location.href = `/projects/${j.projectId}/dashboard`;
    } else {
      setTimeout(()=>setMsg(""), 3000);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Full ZIP export/restore
  const [maxMB, setMaxMB] = useState(25);
  const [incArtifacts, setIncA] = useState(true);
  const [incSpecs, setIncS] = useState(true);
  const [incTickets, setIncT] = useState(true);

  const fullUrl = `/api/projects/export_full.zip?projectId=${encodeURIComponent(pid!)}&maxFileMB=${maxMB}&include=${[
    incArtifacts?"artifacts":null, incSpecs?"specs":null, incTickets?"tickets":null
  ].filter(Boolean).join(",")}`;

  // Restore wizard
  const zipRef = useRef<HTMLInputElement>(null);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [createNewName,setNewName2] = useState("");
  const [createNewCode,setNewCode2] = useState("");
  const [manifest,setManifest] = useState<any|null>(null);

  async function uploadZip(){
    const f = zipRef.current?.files?.[0]; if (!f){ setRestoreMsg("Pick a ZIP"); return; }
    const fd = new FormData();
    fd.append("file", f);
    if (createNewName && createNewCode) fd.append("createNew", JSON.stringify({ name:createNewName, code:createNewCode }));
    else fd.append("targetProjectId", pid!);

    setRestoreMsg("Uploading and restoring...");
    const r = await fetchWithAuth(`/api/projects/restore_full`, { method:"POST", body: fd });
    const j = await r.json();
    if (!r.ok){ setRestoreMsg(`Restore failed: ${j.error||"unknown"}`); return; }
    
    setManifest(j.manifest||{});
    const counts = j.counts || {};
    const totalItems = Object.values(counts).reduce((sum:number, val:any) => sum + (Number(val)||0), 0);
    setRestoreMsg(`Restore complete! Imported ${totalItems} items. ${j.note||""}`);
    
    // If new project was created, optionally redirect
    if (createNewName && j.projectId) {
      setRestoreMsg(prev => `${prev} New project ID: ${j.projectId}. Refresh to see changes.`);
    }
  }

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-6 max-w-3xl">
        <h1 className="text-2xl font-semibold" data-testid="heading-backup">Project Backup</h1>

        <section className="p-4 border rounded-2xl space-y-2">
          <div className="text-sm font-medium">Full backup (ZIP: CSV/JSON + binaries with size cap)</div>
          <div className="grid md:grid-cols-3 gap-2 items-center">
            <label className="text-sm">Max file size (MB)</label>
            <input type="number" className="border rounded px-2 py-1 md:col-span-2" value={maxMB} onChange={e=>setMaxMB(Number(e.target.value||25))} data-testid="input-max-mb"/>
            <label className="text-sm">Include</label>
            <div className="md:col-span-2 flex items-center gap-3">
              <label className="text-sm"><input type="checkbox" checked={incArtifacts} onChange={e=>setIncA(e.target.checked)} data-testid="checkbox-artifacts"/> Artifacts</label>
              <label className="text-sm"><input type="checkbox" checked={incSpecs} onChange={e=>setIncS(e.target.checked)} data-testid="checkbox-specs"/> Specs</label>
              <label className="text-sm"><input type="checkbox" checked={incTickets} onChange={e=>setIncT(e.target.checked)} data-testid="checkbox-tickets"/> Ticket attachments</label>
            </div>
          </div>
          <div>
            <a className="text-xs px-2 py-1 border rounded" href={fullUrl} data-testid="link-download-full-zip">Download full ZIP</a>
          </div>
        </section>

        <section className="p-4 border rounded-2xl space-y-2">
          <div className="text-sm font-medium">Restore wizard (snapshot import from ZIP)</div>
          <input ref={zipRef} type="file" accept=".zip,application/zip" className="text-xs" data-testid="input-zip" />
          <div className="grid md:grid-cols-2 gap-2">
            <div className="text-xs opacity-70 md:col-span-2">Restore into current project, or create a new one:</div>
            <input className="border rounded px-2 py-1" placeholder="New project name (optional)" value={createNewName} onChange={e=>setNewName2(e.target.value)} data-testid="input-restore-name" />
            <input className="border rounded px-2 py-1" placeholder="New project code (optional)" value={createNewCode} onChange={e=>setNewCode2(e.target.value)} data-testid="input-restore-code" />
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs px-2 py-1 border rounded" onClick={uploadZip} data-testid="button-upload-zip">Restore from ZIP</button>
          </div>
          {manifest && (
            <div className="mt-2 p-2 border rounded bg-slate-900/30 text-xs">
              <div className="font-medium mb-1">Manifest</div>
              <pre className="whitespace-pre-wrap">{JSON.stringify(manifest, null, 2)}</pre>
            </div>
          )}
          <div className="text-xs opacity-70" data-testid="text-restore-message">{restoreMsg}</div>
          <div className="text-[11px] opacity-60">Restores all snapshot data from ZIP. Binary artifacts (integration runs, specs, ticket attachments) are documented in manifest but not yet rehydrated.</div>
        </section>

        <section className="p-4 border rounded-2xl space-y-2">
          <div className="font-medium">JSON Snapshot Import/Export</div>
          <div className="flex items-center gap-2">
            <a className="text-xs px-2 py-1 border rounded-lg" href={`/api/projects/export.json?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-json">Download JSON Snapshot</a>
            <a className="text-xs px-2 py-1 border rounded-lg" href={`/api/projects/export.zip?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-zip">Download ZIP (CSVs + ICS)</a>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" className="text-xs" data-testid="input-file" />
          <label className="text-sm flex items-center gap-2 mt-2">
            <input type="checkbox" checked={asNew} onChange={e=>setAsNew(e.target.checked)} data-testid="checkbox-as-new" />
            Import as a <strong>new project</strong>
          </label>
          {asNew ? (
            <div className="grid md:grid-cols-2 gap-2">
              <input className="border rounded px-2 py-1" placeholder="New Project Name" value={newName} onChange={e=>setNewName(e.target.value)} data-testid="input-new-name" />
              <input className="border rounded px-2 py-1" placeholder="New Project Code (e.g., MARS-WD)" value={newCode} onChange={e=>setNewCode(e.target.value)} data-testid="input-new-code" />
            </div>
          ) : (
            <div className="text-xs opacity-70">Snapshot will be imported into <code>{pid}</code>.</div>
          )}
          <div className="mt-2">
            <button className="text-xs px-2 py-1 border rounded-lg" onClick={importJson} data-testid="button-import">Import</button>
          </div>
          <div className="text-xs opacity-70 mt-2" data-testid="text-message">{msg}</div>
          <div className="text-[11px] opacity-60 mt-2">
            Import re-maps IDs and re-queues embeddings/insights. Files are not included; docs restore with redacted text.
          </div>
        </section>
      </div>
    </AppFrame>
  );
}
