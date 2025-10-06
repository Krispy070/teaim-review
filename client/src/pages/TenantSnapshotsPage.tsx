import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useState } from "react";

export default function TenantSnapshotsPage(){
  const pid = getProjectId();
  const [items,setItems]=useState<any[]>([]);
  const [name,setName]=useState("");
  const [diff,setDiff]=useState<any|null>(null);

  async function load(){
    const r = await fetchWithAuth(`/api/tenants/snapshots/list?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setItems(j.items||[]);
  }
  useEffect(()=>{ if(pid) load(); },[pid]);

  async function create(){
    if (!name) return;
    await fetchWithAuth(`/api/tenants/snapshots/create`, { method:"POST", body: JSON.stringify({ projectId: pid, name }) });
    setName(""); load();
  }
  async function compare(id:string){
    const r = await fetchWithAuth(`/api/tenants/snapshots/${id}/diff-live`);
    const j = await r.json(); setDiff(j);
  }

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold" data-testid="heading-snapshots">Tenant Snapshots</h1>
        <div className="flex items-center gap-2">
          <input className="border rounded px-2 py-1" placeholder="Snapshot name" value={name} onChange={e=>setName(e.target.value)} data-testid="input-snapshot-name" />
          <button className="text-xs px-2 py-1 border rounded" onClick={create} data-testid="button-create-snapshot">Create snapshot</button>
        </div>

        <ul className="space-y-2">
          {items.map(s=>(
            <li key={s.id} className="p-2 border rounded-lg text-sm flex items-center justify-between" data-testid={`snapshot-${s.id}`}>
              <div><span className="font-medium" data-testid={`snapshot-name-${s.id}`}>{s.name}</span> <span className="text-xs opacity-70" data-testid={`snapshot-date-${s.id}`}>({new Date(s.createdAt).toLocaleString()})</span></div>
              <button className="text-xs px-2 py-1 border rounded" onClick={()=>compare(s.id)} data-testid={`button-compare-${s.id}`}>Compare with live</button>
            </li>
          ))}
          {!items.length && <li className="opacity-70" data-testid="text-no-snapshots">No snapshots yet.</li>}
        </ul>

        {diff && (
          <div className="p-4 border rounded-2xl" data-testid="diff-results">
            <div className="text-sm font-medium mb-2" data-testid="diff-header">Diff vs live (snapshot at {diff.createdAt ? new Date(diff.createdAt).toLocaleString() : "—"})</div>
            <table className="w-full text-sm">
              <thead className="text-xs opacity-70">
                <tr><th className="text-left px-2 py-1">Tenant</th><th className="text-left px-2 py-1">Domain</th><th className="text-left px-2 py-1">Snapshot</th><th className="text-left px-2 py-1">Live</th><th className="text-left px-2 py-1">Δ days (S−L)</th></tr>
              </thead>
              <tbody>
                {diff.rows?.flatMap((row:any)=> row.domains.map((d:any)=>(
                  <tr key={row.tenantKey + d.domain} className="border-b border-slate-800" data-testid={`diff-row-${row.tenantKey}-${d.domain}`}>
                    <td className="px-2 py-1" data-testid={`diff-tenant-${row.tenantKey}`}>{row.tenantKey}</td>
                    <td className="px-2 py-1" data-testid={`diff-domain-${d.domain}`}>{d.domain}</td>
                    <td className="px-2 py-1" data-testid={`diff-snapshot-${d.domain}`}>{d.snapshot ? new Date(d.snapshot).toLocaleDateString() : "—"}</td>
                    <td className="px-2 py-1" data-testid={`diff-live-${d.domain}`}>{d.live ? new Date(d.live).toLocaleDateString() : "—"}</td>
                    <td className={`px-2 py-1 ${d.deltaDays===0?"":"font-semibold"} ${d.deltaDays>0?"text-amber-300": d.deltaDays<0?"text-emerald-400":""}`} data-testid={`diff-delta-${d.domain}`}>{d.deltaDays===null?"—":d.deltaDays}</td>
                  </tr>
                )))}
              </tbody>
            </table>
            <div className="text-[11px] opacity-60 mt-1" data-testid="diff-legend">Positive Δ means snapshot is newer than live; negative Δ means live is ahead.</div>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
