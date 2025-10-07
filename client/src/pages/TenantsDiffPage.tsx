import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useState } from "react";

export default function TenantsDiffPage(){
  const pid = getProjectId();
  const [tenants,setTenants] = useState<any[]>([]);
  const [left,setLeft] = useState<string>("");
  const [right,setRight] = useState<string>("");
  const [diff,setDiff]   = useState<any>(null);

  useEffect(()=>{ (async()=>{
    const r = await fetchWithAuth(`/api/tenants/list?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setTenants(j.items||[]);
  })(); },[pid]);

  async function run(){
    if (!left || !right) return;
    const p = new URLSearchParams({ projectId: pid!, left, right });
    const r = await fetchWithAuth(`/api/tenants/diff?${p.toString()}`); const j = await r.json();
    setDiff(j);
  }

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold" data-testid="heading-diff">Tenant Diff</h1>

        <div className="flex flex-wrap items-center gap-2">
          <select className="border rounded px-2 py-1 text-sm" value={left} onChange={e=>setLeft(e.target.value)} data-testid="select-left-tenant">
            <option value="">(left)</option>
            {tenants.map(t=><option key={t.id} value={t.id}>{t.name} [{t.environment}]</option>)}
          </select>
          <span>vs</span>
          <select className="border rounded px-2 py-1 text-sm" value={right} onChange={e=>setRight(e.target.value)} data-testid="select-right-tenant">
            <option value="">(right)</option>
            {tenants.map(t=><option key={t.id} value={t.id}>{t.name} [{t.environment}]</option>)}
          </select>
          <button className="text-xs px-2 py-1 border rounded" onClick={run} data-testid="button-compare">Compare</button>
        </div>

        {!diff ? <div className="text-sm opacity-70">Pick two tenants to compare.</div> : (
          <div className="space-y-6">
            {/* Basic fields */}
            <section className="p-4 border rounded-2xl">
              <div className="text-sm font-medium mb-2">Basics</div>
              <table className="w-full text-sm">
                <thead className="text-xs opacity-70"><tr><th></th><th className="text-left px-2 py-1">Left</th><th className="text-left px-2 py-1">Right</th></tr></thead>
                <tbody>
                  {["name","vendor","environment","baseUrl","workdayShortName"].map(k=>(
                    <tr key={k} className="border-b border-slate-800">
                      <td className="px-2 py-1 text-xs opacity-70">{k}</td>
                      <td className="px-2 py-1" data-testid={`diff-left-${k}`}>{diff.left?.[k]||"—"}</td>
                      <td className="px-2 py-1" data-testid={`diff-right-${k}`}>{diff.right?.[k]||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Domain As-Of */}
            <section className="p-4 border rounded-2xl">
              <div className="text-sm font-medium mb-2">Data As-Of by Domain</div>
              <table className="w-full text-sm">
                <thead className="text-xs opacity-70">
                  <tr><th className="text-left px-2 py-1">Domain</th><th className="text-left px-2 py-1">Left</th><th className="text-left px-2 py-1">Right</th><th className="text-left px-2 py-1">Δ days (L−R)</th></tr>
                </thead>
                <tbody>
                  {(diff.domainDiff||[]).map((r:any)=>(
                    <tr key={r.domain} className="border-b border-slate-800">
                      <td className="px-2 py-1" data-testid={`domain-${r.domain}`}>{r.domain}</td>
                      <td className="px-2 py-1" data-testid={`domain-${r.domain}-left`}>{r.left ? new Date(r.left).toLocaleDateString() : "—"}</td>
                      <td className="px-2 py-1" data-testid={`domain-${r.domain}-right`}>{r.right? new Date(r.right).toLocaleDateString(): "—"}</td>
                      <td className={`px-2 py-1 ${r.deltaDays===0?"":"font-semibold"} ${r.deltaDays>0?"text-emerald-400": r.deltaDays<0?"text-amber-300":""}`} data-testid={`domain-${r.domain}-delta`}>
                        {r.deltaDays===null? "—" : r.deltaDays}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[11px] opacity-60 mt-1">Positive Δ means Left is more recent than Right.</div>
            </section>

            {/* Migration lists */}
            <section className="p-4 border rounded-2xl">
              <div className="text-sm font-medium mb-2">Migrations (last/next ~30 days)</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs opacity-70 mb-1">Left</div>
                  <ul className="text-sm space-y-1" data-testid="migrations-left">
                    {diff.migrations?.left?.map((m:any)=>(
                      <li key={m.id} className="flex justify-between" data-testid={`migration-left-${m.id}`}>
                        <span>{m.type.toUpperCase()}: {m.name}</span>
                        <span className="opacity-70">{m.startAt ? new Date(m.startAt).toLocaleString() : "—"}</span>
                      </li>
                    )) || <li className="opacity-60">None</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-xs opacity-70 mb-1">Right</div>
                  <ul className="text-sm space-y-1" data-testid="migrations-right">
                    {diff.migrations?.right?.map((m:any)=>(
                      <li key={m.id} className="flex justify-between" data-testid={`migration-right-${m.id}`}>
                        <span>{m.type.toUpperCase()}: {m.name}</span>
                        <span className="opacity-70">{m.startAt ? new Date(m.startAt).toLocaleString() : "—"}</span>
                      </li>
                    )) || <li className="opacity-60">None</li>}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
