import TitleBar from "@/components/TitleBar";
import Card, { CardBody } from "@/components/ui/Card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import FilterBar from "@/components/ui/FilterBar";
import { Input } from "@/components/ui/input";
import Spinner from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";
import useQueryState from "@/hooks/useQueryState";

export default function TimelinePage(){
  const pid = localStorage.getItem("projectId") || (window as any).__pid || "";
  const [type,setType]=useQueryState("type","");
  const [q,setQ]=useQueryState("q","");
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [page,setPage]=useState(0); const limit=30;

  async function load(){
    setLoading(true);
    const p = new URLSearchParams({ projectId:pid, limit:String(limit), offset:String(page*limit), ...(type?{type}:{}) , ...(q?{q}:{}) });
    const r = await fetchWithAuth(`/api/insights/timeline?`+p.toString()); const j=await r.json();
    setItems(j.items||[]); setLoading(false);
  }
  useEffect(()=>{ load(); },[type,q,page]);

  return (
    <>
      <TitleBar title="Timeline Events" subtitle="Extracted from docs/meetings/conversations" />
      <FilterBar onClear={()=>{ setType(""); setQ(""); setPage(0); }}>
        <select className="text-[11px] px-2 py-0.5 border rounded" value={type} onChange={(e: React.ChangeEvent<HTMLSelectElement>)=>setType(e.target.value)} data-testid="select-type">
          <option value="">all types</option><option>milestone</option><option>cutover</option><option>decision</option><option>risk</option>
        </select>
        <Input placeholder="search title/summary…" value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setQ(e.target.value)} data-testid="input-search" className="text-[11px]" />
        <button className="text-[11px] px-2 py-0.5 border rounded" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} data-testid="button-prev-page">Prev</button>
        <span className="text-[11px] opacity-70" data-testid="text-page-number">Page {page+1}</span>
        <button className="text-[11px] px-2 py-0.5 border rounded" onClick={()=>setPage(p=>p+1)} data-testid="button-next-page">Next</button>
      </FilterBar>

      <Card><CardBody>
        {loading ? <div className="flex items-center gap-2"><Spinner /><span className="text-xs">Loading…</span></div>
        : !items.length ? <EmptyState title="No timeline events" />
        : (
          <Table>
            <THead><tr><TH>When</TH><TH>Title</TH><TH>Type</TH><TH>Origin</TH></tr></THead>
            <tbody>
              {items.map((it:any)=>(
                <TR key={it.id} data-testid={`row-timeline-${it.id}`}>
                  <TD>{it.startsAt? new Date(it.startsAt).toLocaleString(): new Date(it.createdAt).toLocaleString()}</TD>
                  <TD className="max-w-[480px]"><div className="truncate">{it.title}</div></TD>
                  <TD>{it.type||"—"}</TD>
                  <TD>{it.originType||"—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody></Card>
    </>
  );
}
