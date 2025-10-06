import { AppFrame } from "@/components/layout/AppFrame";
import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useRef, useState } from "react";

type S = { id:string; name:string; email?:string; org?:string; role?:string; raci?:string };

export default function StakeholderMatrixPage(){
  const pid = getProjectId();
  const [items,setItems]=useState<S[]>([]);
  const [q,setQ]=useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg,setMsg]=useState("");

  async function load(){
    const r = await fetchWithAuth(`/api/ma/stakeholders?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setItems(j.items||[]);
  }
  useEffect(()=>{ load(); },[]);

  async function doImport(){
    const f = fileRef.current?.files?.[0]; if(!f){ setMsg("Pick CSV/XLSX"); return; }
    const fd = new FormData(); fd.append("file", f);
    const r = await fetchWithAuth(`/api/ma/stakeholders/import?projectId=${encodeURIComponent(pid!)}`, { method:"POST", body: fd });
    const j = await r.json(); setMsg(r.ok?`Imported ${j.inserted} updated ${j.updated}`:"Import failed");
    setTimeout(()=>setMsg(""),2000); if (fileRef.current) fileRef.current.value=""; load();
  }

  const filtered = items.filter(s=> !q || [s.name,s.email,s.org,s.role].join(" ").toLowerCase().includes(q.toLowerCase()));
  const buckets = {
    R: filtered.filter(s=>s.raci==="R"),
    A: filtered.filter(s=>s.raci==="A"),
    C: filtered.filter(s=>s.raci==="C"),
    I: filtered.filter(s=>s.raci==="I"),
  };

  return (
    <AppFrame>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-raci-matrix">RACI Matrix</h1>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="text-xs" data-testid="input-file-upload" />
            <button className="text-xs px-2 py-1 border rounded" onClick={doImport} data-testid="button-import">Import Stakeholders</button>
          </div>
        </div>
        {msg && <div className="text-xs opacity-70" data-testid="text-import-message">{msg}</div>}

        <div className="flex items-center gap-2">
          <input className="border rounded px-2 py-1 text-sm" placeholder="search name/email/org/role…" value={q} onChange={e=>setQ(e.target.value)} data-testid="input-search" />
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          {(["R","A","C","I"] as const).map(tag=>(
            <div key={tag} className="p-3 border rounded-2xl" data-testid={`column-raci-${tag}`}>
              <div className="text-xs opacity-70 mb-1">{tag} — {(tag==="R" && "Responsible") || (tag==="A" && "Accountable") || (tag==="C" && "Consulted") || "Informed"} ({(buckets as any)[tag].length})</div>
              <ul className="text-sm space-y-1">
                {(buckets as any)[tag].map((s:S)=>(
                  <li key={s.id} className="flex items-center justify-between" data-testid={`stakeholder-${tag}-${s.id}`}>
                    <span className="truncate">{s.name} {s.email?`(${s.email})`:""}</span>
                    <span className="text-xs opacity-70">{s.org || s.role || ""}</span>
                  </li>
                ))}
                {!(buckets as any)[tag].length && <li className="opacity-60 text-xs">None</li>}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-[11px] opacity-60">CSV/XLSX columns: <code>Name, Email, Org, Role, RACI</code></div>
      </div>
    </AppFrame>
  );
}
