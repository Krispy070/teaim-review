import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useState } from "react";
import Guard from "@/components/Guard";

type Row = { id:string; userEmail:string; action:string; entity:string; entityId?:string; route?:string; changes:any; createdAt:string };

export default function ActivityPage(){
  return <Guard need="admin"><ActivityPageInner /></Guard>;
}

function ActivityPageInner(){
  const pid = getProjectId();
  const [items, setItems] = useState<Row[]>([]);
  const [entity, setEntity] = useState("");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load(){
    const p = new URLSearchParams({ projectId: pid! });
    if (entity) p.set("entity", entity);
    if (user)   p.set("user", user);
    if (from)   p.set("dateFrom", from);
    if (to)     p.set("dateTo", to);
    const r = await fetchWithAuth(`/api/audit?${p.toString()}`);
    const j = await r.json(); setItems(j.items||[]);
  }
  useEffect(()=>{ if(pid) load(); },[pid]);

  return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-activity">Activity</h1>
          <a className="text-xs px-2 py-1 border rounded-lg" href={`/api/audit/export.csv?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-csv">Export CSV</a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input className="border rounded px-2 py-1 text-sm" placeholder="entity (e.g. actions, training)" value={entity} onChange={e=>setEntity(e.target.value)} data-testid="input-entity" />
          <input className="border rounded px-2 py-1 text-sm" placeholder="user email contains…" value={user} onChange={e=>setUser(e.target.value)} data-testid="input-user" />
          <input className="border rounded px-2 py-1 text-sm" type="date" value={from} onChange={e=>setFrom(e.target.value)} data-testid="input-from" />
          <input className="border rounded px-2 py-1 text-sm" type="date" value={to} onChange={e=>setTo(e.target.value)} data-testid="input-to" />
          <button className="text-xs px-2 py-1 border rounded-lg" onClick={load} data-testid="button-filter">Filter</button>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-xs opacity-70">
                <th className="px-2 py-1">When</th>
                <th className="px-2 py-1">User</th>
                <th className="px-2 py-1">Action</th>
                <th className="px-2 py-1">Entity</th>
                <th className="px-2 py-1">Entity ID</th>
                <th className="px-2 py-1">Route</th>
                <th className="px-2 py-1">Changes</th>
              </tr>
            </thead>
            <tbody>
              {items.map(r=>(
                <tr key={r.id} className="border-b border-slate-800" data-testid={`row-audit-${r.id}`}>
                  <td className="px-2 py-1 text-xs opacity-70">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-1 text-xs">{r.userEmail||"—"}</td>
                  <td className="px-2 py-1 text-xs">{r.action}</td>
                  <td className="px-2 py-1 text-xs">{r.entity}</td>
                  <td className="px-2 py-1 text-xs">{r.entityId||"—"}</td>
                  <td className="px-2 py-1 text-xs">{r.route||"—"}</td>
                  <td className="px-2 py-1 text-xs">
                    <pre className="whitespace-pre-wrap break-all">{JSON.stringify(r.changes||{}, null, 0)}</pre>
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td className="px-2 py-2 text-sm opacity-70" colSpan={7}>No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
  );
}
