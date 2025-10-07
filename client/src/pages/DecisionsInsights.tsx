import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import OriginBadge from "@/components/OriginBadge";
import { useEffect, useState } from "react";

type Row = { id:string; title:string; description?:string; decidedBy?:string; area?:string; status?:string; originType?:string; originId?:string; createdAt:string };

export default function DecisionsInsights(){
  const pid = getProjectId();
  const [items,setItems]=useState<Row[]>([]);
  const [q,setQ]=useState("");
  const [otype,setOtype]=useState("");
  const [page,setPage]=useState(0); const limit=30;
  const [msg,setMsg]=useState("");

  async function load(){
    const p = new URLSearchParams({ projectId: pid!, limit:String(limit), offset:String(page*limit) });
    if (q) p.set("q", q); if (otype) p.set("originType", otype);
    const r = await fetchWithAuth(`/api/insights/decisions?${p.toString()}`);
    const j = await r.json();
    if (r.ok){ setItems(j.items||[]); setMsg(""); } else setMsg(j.error||"load failed");
  }
  useEffect(()=>{ if(pid) load(); },[pid, q, otype, page]);

  const exportUrl = `/api/insights/decisions/export.csv?projectId=${encodeURIComponent(pid!)}${q?`&q=${encodeURIComponent(q)}`:""}${otype?`&originType=${encodeURIComponent(otype)}`:""}`;

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-decisions">Decisions</h1>
          <a data-testid="link-export-csv" className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" href={exportUrl}>Export filtered CSV</a>
        </div>
        <div className="text-xs opacity-70">{msg}</div>

        <div className="flex flex-wrap items-center gap-2">
          <input data-testid="input-search-decisions" className="border rounded px-2 py-1 text-sm bg-background" placeholder="search title/description…" value={q} onChange={e=>{ setQ(e.target.value); setPage(0); }} />
          <select data-testid="select-origin-filter" className="border rounded px-2 py-1 text-sm bg-background" value={otype} onChange={e=>{ setOtype(e.target.value); setPage(0); }}>
            <option value="">All origins</option>
            <option value="doc">document</option>
            <option value="conversation">conversation</option>
            <option value="meeting">meeting</option>
          </select>
        </div>

        <div className="border rounded-2xl overflow-auto">
          <table className="text-sm min-w-[900px] w-full">
            <thead className="bg-slate-900/40 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">When</th>
                <th className="text-left px-2 py-1">Decision</th>
                <th className="text-left px-2 py-1">Description</th>
                <th className="text-left px-2 py-1">By</th>
                <th className="text-left px-2 py-1">Origin</th>
                <th className="text-left px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it=>(
                <tr key={it.id} data-testid={`row-decision-${it.id}`} className="border-b border-slate-800">
                  <td className="px-2 py-1">{new Date(it.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-1">{it.title}</td>
                  <td className="px-2 py-1">{it.description || "—"}</td>
                  <td className="px-2 py-1">{it.decidedBy || "—"}</td>
                  <td className="px-2 py-1"><OriginBadge type={it.originType} id={it.originId} /></td>
                  <td className="px-2 py-1">{it.status || "—"}</td>
                </tr>
              ))}
              {!items.length && <tr><td className="px-2 py-2 text-xs opacity-70" colSpan={6}>No decisions.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <button data-testid="button-prev-page" className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50 disabled:opacity-50" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Prev</button>
          <div className="text-xs opacity-70">Page {page+1}</div>
          <button data-testid="button-next-page" className="text-xs px-2 py-1 border rounded hover:bg-slate-800/50" onClick={()=>setPage(p=>p+1)}>Next</button>
        </div>
      </div>
    </AppFrame>
  );
}
