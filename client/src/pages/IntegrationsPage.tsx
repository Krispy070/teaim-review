import TitleBar from "@/components/TitleBar";
import Card, { CardBody } from "@/components/ui/Card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import FilterBar from "@/components/ui/FilterBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";
import useQueryState from "@/hooks/useQueryState";

function getStatusBadgeTone(status: string): "default"|"ok"|"warn"|"err"|"info" {
  switch(status?.toLowerCase()) {
    case 'live': return 'ok';
    case 'in_progress': return 'info';
    case 'blocked': return 'err';
    case 'planned': return 'warn';
    default: return 'default';
  }
}

export default function IntegrationsPage(){
  const pid = localStorage.getItem("projectId") || (window as any).__pid || "";
  const [system,setSystem]   = useQueryState("sys","");
  const [status,setStatus]   = useQueryState("st","");
  const [q,setQ]             = useQueryState("q","");
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [page,setPage]=useState(0); const limit=30;

  async function load(){
    setLoading(true);
    const p = new URLSearchParams({
      projectId: pid, limit:String(limit), offset:String(page*limit),
      ...(system?{system}:{}) , ...(status?{status}:{}) , ...(q?{q}:{})
    });
    const r = await fetchWithAuth(`/api/integrations?`+p.toString()); const j=await r.json();
    setItems(j.items||[]); setLoading(false);
  }
  useEffect(()=>{ load(); },[system,status,q,page]);

  return (
    <>
      <TitleBar title="Integrations" subtitle="Interfaces & automations">
        <a className="text-xs px-2 py-1 border rounded"
           href={`/api/integrations/export.csv?`+new URLSearchParams({ projectId:pid, ...(system?{system}:{}) , ...(status?{status}:{}) , ...(q?{q}:{}) }).toString()}
           data-testid="link-export-csv">
          Export CSV (filtered)
        </a>
      </TitleBar>

      <FilterBar onClear={()=>{ setSystem(""); setStatus(""); setQ(""); setPage(0); }}>
        <select className="text-[11px] px-2 py-0.5 border rounded" value={system} onChange={(e: React.ChangeEvent<HTMLSelectElement>)=>setSystem(e.target.value)} data-testid="select-system">
          <option value="">all systems</option>
          <option>Workday</option><option>ServiceNow</option><option>Jira</option><option>ADP</option><option>Custom</option>
        </select>
        <select className="text-[11px] px-2 py-0.5 border rounded" value={status} onChange={(e: React.ChangeEvent<HTMLSelectElement>)=>setStatus(e.target.value)} data-testid="select-status">
          <option value="">all status</option>
          <option>planned</option><option>in_progress</option><option>blocked</option><option>live</option>
        </select>
        <Input placeholder="search name/system/desc…" value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setQ(e.target.value)} data-testid="input-search" className="text-[11px]" />
        <Button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} data-testid="button-prev-page">Prev</Button>
        <span className="text-[11px] opacity-70" data-testid="text-page-number">Page {page+1}</span>
        <Button onClick={()=>setPage(p=>p+1)} data-testid="button-next-page">Next</Button>
      </FilterBar>

      <Card><CardBody>
        {loading ? <div className="flex items-center gap-2"><Spinner /><span className="text-xs">Loading…</span></div>
        : !items.length ? <EmptyState title="No integrations" hint="Add or import records." />
        : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>System</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Run freq</TableHead>
                <TableHead>Last run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it:any)=>(
                <TableRow key={it.id} data-testid={`row-integration-${it.id}`}>
                  <TableCell className="max-w-[360px]"><div className="truncate">{it.name}</div></TableCell>
                  <TableCell>{it.system}</TableCell>
                  <TableCell>
                    <Badge tone={getStatusBadgeTone(it.status)} data-testid={`badge-status-${it.status}`}>
                      {it.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{it.owner||"—"}</TableCell>
                  <TableCell>{it.runFreq||"—"}</TableCell>
                  <TableCell>{it.lastRunAt? new Date(it.lastRunAt).toLocaleString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardBody></Card>
    </>
  );
}
