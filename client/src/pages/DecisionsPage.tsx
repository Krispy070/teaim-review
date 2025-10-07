import TitleBar from "@/components/TitleBar";
import Card, { CardBody } from "@/components/ui/Card";
import { Table, TableHeader, TableHead, TableRow, TableCell, TableBody } from "@/components/ui/table";
import FilterBar from "@/components/ui/FilterBar";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import Spinner from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/PrintButton";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";
import useQueryState from "@/hooks/useQueryState";

export default function DecisionsPage(){
  const pid = localStorage.getItem("projectId") || (window as any).__pid || "";
  const [status,setStatus]=useQueryState("st","");
  const [decidedBy,setDecidedBy]=useQueryState("db","");
  const [q,setQ]=useQueryState("q","");
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [page,setPage]=useState(0);
  const [meta,setMeta]=useState<any>(null);
  const limit=30;

  async function load(){
    setLoading(true);
    const p = new URLSearchParams({ projectId:pid, limit:String(limit), offset:String(page*limit),
      ...(status?{status}:{}) , ...(decidedBy?{decidedBy}:{}) , ...(q?{q}:{})
    });
    const r = await fetchWithAuth(`/api/decisions?`+p.toString());
    const j=await r.json();
    setItems(j.items||[]);
    setMeta(j.meta||null);
    setLoading(false);
  }
  useEffect(()=>{ load(); },[status,decidedBy,q,page]);

  return (
    <>
      <TitleBar title="Decisions" subtitle="Program-level decisions & owners" />
      <FilterBar onClear={()=>{ setStatus(""); setDecidedBy(""); setQ(""); setPage(0); }}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px] h-8 text-[11px]"><SelectValue placeholder="all status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all status</SelectItem>
            <SelectItem value="pending">pending</SelectItem>
            <SelectItem value="approved">approved</SelectItem>
            <SelectItem value="rejected">rejected</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="decided by" value={decidedBy} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setDecidedBy(e.target.value)} className="h-8 text-[11px]" />
        <Input placeholder="search title/summary…" value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setQ(e.target.value)} className="h-8 text-[11px]" />
        <PrintButton />
        <Button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={!meta || meta.offset===0} size="sm">Prev</Button>
        <span className="text-[11px] opacity-70">{meta ? `${meta.filtered}${meta.total?` of ${meta.total}`:""}`:"—"} • Page {page+1}</span>
        <Button onClick={()=>setPage(p=>p+1)} disabled={!meta || (meta.offset+meta.limit)>=meta.filtered} size="sm">Next</Button>
      </FilterBar>

      <Card><CardBody>
        {loading ? <div className="flex items-center gap-2"><Spinner /><span className="text-xs">Loading…</span></div>
        : !items.length ? <EmptyState title="No decisions" />
        : (<Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Decided By</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((d:any)=>(
                <TableRow key={d.id} data-testid={`row-decision-${d.id}`}>
                  <TableCell className="max-w-[520px]"><div className="truncate">{d.title}</div></TableCell>
                  <TableCell>{d.decidedBy||"—"}</TableCell><TableCell>{d.status}</TableCell>
                  <TableCell>{new Date(d.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>)}
      </CardBody></Card>
    </>
  );
}
