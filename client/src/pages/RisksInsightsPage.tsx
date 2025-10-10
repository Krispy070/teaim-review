import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import OriginBadge from "@/components/OriginBadge";
import { useEffect, useState } from "react";

type Row = { id:string; title:string; severity:number; status:string; owner?:string;
             originType?:string; originId?:string; createdAt:string };

export default function RisksInsightsPage(){
  const pid = getProjectId();
  const [items,setItems]=useState<Row[]>([]);
  const [q,setQ]=useState("");
  const [otype,setOtype]=useState("");
  const [page,setPage]=useState(0); const limit=30;
  const [msg,setMsg]=useState("");

  async function load(){
    const p = new URLSearchParams({ projectId: pid!, limit:String(limit), offset:String(page*limit) });
    if (q) p.set("q", q);
    if (otype) p.set("originType", otype);
    const r = await fetchWithAuth(`/api/insights/risks?${p.toString()}`);
    const j = await r.json();
    if (r.ok) { setItems(j.items||[]); setMsg(""); } else setMsg(j.error||"load failed");
  }
  useEffect(()=>{ if(pid) load(); },[pid, q, otype, page]);

  const exportUrl = `/api/insights/risks/export.csv?projectId=${encodeURIComponent(pid!)}${q?`&q=${encodeURIComponent(q)}`:""}${otype?`&originType=${encodeURIComponent(otype)}`:""}`;

  return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-risks">Risks</h1>
          <div className="flex items-center gap-2">
            <a className="text-xs px-2 py-1 border rounded" href={exportUrl} data-testid="button-export-csv">Export filtered CSV</a>
          </div>
        </div>
        <div className="text-xs opacity-70">{msg}</div>

        <div className="flex flex-wrap items-center gap-2">
          <input 
            className="border rounded px-2 py-1 text-sm bg-background" 
            placeholder="search title/description…" 
            value={q} 
            onChange={e=>{ setQ(e.target.value); setPage(0); }}
            data-testid="input-search-title"
          />
          <select 
            className="border rounded px-2 py-1 text-sm bg-background" 
            value={otype} 
            onChange={e=>{ setOtype(e.target.value); setPage(0); }}
            data-testid="select-origin-filter"
          >
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
                <th className="text-left px-2 py-1">Title</th>
                <th className="text-left px-2 py-1">Severity</th>
                <th className="text-left px-2 py-1">Owner</th>
                <th className="text-left px-2 py-1">Status</th>
                <th className="text-left px-2 py-1">Origin</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it=>(
                <tr key={it.id} className="border-b border-slate-800" data-testid={`row-risk-${it.id}`}>
                  <td className="px-2 py-1">{it.title}</td>
                  <td className="px-2 py-1">{it.severity}</td>
                  <td className="px-2 py-1">{it.owner||"—"}</td>
                  <td className="px-2 py-1">{it.status}</td>
                  <td className="px-2 py-1"><OriginBadge type={it.originType} id={it.originId} /></td>
                </tr>
              ))}
              {!items.length && <tr><td className="px-2 py-2 text-xs opacity-70" colSpan={5}>No risks.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <button 
            className="text-xs px-2 py-1 border rounded" 
            disabled={page===0} 
            onClick={()=>setPage(p=>Math.max(0,p-1))}
            data-testid="button-prev-page"
          >
            Prev
          </button>
          <div className="text-xs opacity-70">Page {page+1}</div>
          <button 
            className="text-xs px-2 py-1 border rounded" 
            onClick={()=>setPage(p=>p+1)}
            data-testid="button-next-page"
          >
            Next
          </button>
        </div>
      </div>
  );
}
