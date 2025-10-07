import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId } from "@/lib/project";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth } from "@/lib/supabase";

export default function TenantsPage(){
  const pid = getProjectId();
  const { toast } = useToast();

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ["/api/tenants/list", pid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/tenants/list?projectId=${encodeURIComponent(pid!)}`);
      const data = await res.json();
      return data.items || [];
    },
    enabled: !!pid,
  });

  const { data: migs = [], isLoading: migsLoading } = useQuery({
    queryKey: ["/api/tenants/migrations", pid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/tenants/migrations?projectId=${encodeURIComponent(pid!)}`);
      const data = await res.json();
      return data.items || [];
    },
    enabled: !!pid,
  });

  const { data: asof = [], isLoading: asofLoading } = useQuery({
    queryKey: ["/api/tenants/asof", pid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/tenants/asof?projectId=${encodeURIComponent(pid!)}`);
      const data = await res.json();
      return data.items || [];
    },
    enabled: !!pid,
  });

  const tenantMutation = useMutation({
    mutationFn: async (row: any) => {
      return apiRequest("POST", `/api/tenants/upsert`, { projectId: pid, ...row });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/list", pid] });
      toast({ description: "Tenant saved successfully" });
    },
    onError: (error: any) => {
      toast({ description: error.message || "Failed to save tenant", variant: "destructive" });
    }
  });

  const migMutation = useMutation({
    mutationFn: async (row: any) => {
      return apiRequest("POST", `/api/tenants/migrations/upsert`, { projectId: pid, ...row });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/migrations", pid] });
      toast({ description: "Migration saved successfully" });
    },
    onError: (error: any) => {
      toast({ description: error.message || "Failed to save migration", variant: "destructive" });
    }
  });

  const asofMutation = useMutation({
    mutationFn: async (row: any) => {
      return apiRequest("POST", `/api/tenants/asof/upsert`, { projectId: pid, ...row });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/asof", pid] });
      toast({ description: "As-Of date saved successfully" });
    },
    onError: (error: any) => {
      toast({ description: error.message || "Failed to save as-of date", variant: "destructive" });
    }
  });

  if (tenantsLoading || migsLoading || asofLoading) {
    return (
      <AppFrame sidebar={<SidebarV2 />}>
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-tenants">Tenants & Migrations</h1>
          <div className="flex gap-2">
            <a className="text-xs px-2 py-1 border rounded-lg" href={`/projects/${pid}/tenants/diff`} data-testid="link-diff">Diff</a>
            <a className="text-xs px-2 py-1 border rounded-lg" href={`/api/tenants/migrations.ics?projectId=${encodeURIComponent(pid!)}`} data-testid="link-ics">Migrations ICS</a>
          </div>
        </div>

        {/* Tenants */}
        <section className="p-4 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Tenants</div>
          <TenantGrid items={tenants} onSave={(row) => tenantMutation.mutate(row)} isPending={tenantMutation.isPending} />
        </section>

        {/* Migrations */}
        <section className="p-4 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Migration Windows</div>
          <MigGrid items={migs} tenants={tenants} onSave={(row) => migMutation.mutate(row)} isPending={migMutation.isPending} />
        </section>

        {/* As Of */}
        <section className="p-4 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Data As-Of</div>
          <AsOfGrid items={asof} tenants={tenants} onSave={(row) => asofMutation.mutate(row)} isPending={asofMutation.isPending} />
        </section>
      </div>
    </AppFrame>
  );
}

function TenantGrid({items,onSave,isPending}:{items:any[]; onSave:(row:any)=>void; isPending:boolean}){
  const blank = { name:"", vendor:"Workday", environment:"prod", baseUrl:"", workdayShortName:"", notes:"" };
  return (
    <table className="w-full text-sm">
      <thead className="text-xs opacity-70"><tr>
        {["Name","Vendor","Env","Base URL","WD Short","Notes",""].map(h=><th key={h} className="text-left px-2 py-1">{h}</th>)}
      </tr></thead>
      <tbody>
        {[...items, {...blank, __new:true}].map((t,i)=>(
          <Row key={t.id||`new-${i}`} t={t} onSave={onSave} isPending={isPending} />
        ))}
      </tbody>
    </table>
  );
}
function Row({t,onSave,isPending}:{t:any; onSave:(row:any)=>void; isPending:boolean}){
  const [row,setRow]=useState({...t});
  return (
    <tr className="border-b border-slate-800">
      {["name","vendor","environment","baseUrl","workdayShortName","notes"].map(k=>(
        <td key={k} className="px-2 py-1"><input className="w-full border-b border-transparent focus:border-slate-600 bg-transparent" data-testid={`input-${k}`}
          defaultValue={row[k]||""} onBlur={e=>setRow((r:any)=>({...r,[k]:e.target.value}))} disabled={isPending} /></td>
      ))}
      <td className="px-2 py-1">
        <button className="text-xs px-2 py-1 border rounded disabled:opacity-50" onClick={()=>onSave(row)} disabled={isPending} data-testid="button-save-tenant">
          {row.__new?"Add":"Save"}
        </button>
      </td>
    </tr>
  );
}
function MigGrid({items,tenants,onSave,isPending}:{items:any[]; tenants:any[]; onSave:(row:any)=>void; isPending:boolean}){
  const tById = Object.fromEntries(tenants.map((t:any)=>[t.id,t.name]));
  const blank = { name:"", type:"window", tenantId:"", startAt:"", endAt:"" };
  return (
    <table className="w-full text-sm">
      <thead className="text-xs opacity-70"><tr>
        {["Name","Type","Tenant","Start","End",""].map(h=><th key={h} className="text-left px-2 py-1">{h}</th>)}
      </tr></thead>
      <tbody>
        {[...items, {...blank, __new:true}].map((m,i)=>(
          <MigRow key={m.id||`mnew-${i}`} m={m} tenants={tenants} onSave={onSave} isPending={isPending} />
        ))}
      </tbody>
    </table>
  );
}
function MigRow({m,tenants,onSave,isPending}:{m:any; tenants:any[]; onSave:(row:any)=>void; isPending:boolean}){
  const [row,setRow]=useState({...m});
  return (
    <tr className="border-b border-slate-800">
      <td className="px-2 py-1"><input className="w-full border-b bg-transparent" defaultValue={row.name||""} onBlur={e=>setRow((r:any)=>({...r,name:e.target.value}))} disabled={isPending} data-testid="input-mig-name"/></td>
      <td className="px-2 py-1">
        <select defaultValue={row.type||"window"} onChange={e=>setRow((r:any)=>({...r,type:e.target.value}))} className="border rounded px-2 py-1 bg-transparent" disabled={isPending} data-testid="select-mig-type">
          <option value="window">window</option><option value="cutover">cutover</option><option value="blackout">blackout</option>
        </select>
      </td>
      <td className="px-2 py-1">
        <select defaultValue={row.tenantId||""} onChange={e=>setRow((r:any)=>({...r,tenantId:e.target.value||null}))} className="border rounded px-2 py-1 bg-transparent" disabled={isPending} data-testid="select-mig-tenant">
          <option value="">(none)</option>
          {tenants.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </td>
      <td className="px-2 py-1"><input type="datetime-local" defaultValue={row.startAt?String(row.startAt).slice(0,16):""}
        onBlur={e=>setRow((r:any)=>({...r,startAt:e.target.value?new Date(e.target.value).toISOString():null}))} className="border-b bg-transparent" disabled={isPending} data-testid="input-mig-start"/></td>
      <td className="px-2 py-1"><input type="datetime-local" defaultValue={row.endAt?String(row.endAt).slice(0,16):""}
        onBlur={e=>setRow((r:any)=>({...r,endAt:e.target.value?new Date(e.target.value).toISOString():null}))} className="border-b bg-transparent" disabled={isPending} data-testid="input-mig-end"/></td>
      <td className="px-2 py-1">
        <button className="text-xs px-2 py-1 border rounded disabled:opacity-50" onClick={()=>onSave(row)} disabled={isPending} data-testid="button-save-mig">
          {row.__new?"Add":"Save"}
        </button>
      </td>
    </tr>
  );
}
function AsOfGrid({items,tenants,onSave,isPending}:{items:any[]; tenants:any[]; onSave:(row:any)=>void; isPending:boolean}){
  const blank = { tenantId:"", domain:"HCM", asOf:"", note:"" };
  return (
    <table className="w-full text-sm">
      <thead className="text-xs opacity-70"><tr>{["Tenant","Domain","As-Of","Note",""].map(h=><th key={h} className="text-left px-2 py-1">{h}</th>)}</tr></thead>
      <tbody>
        {[...items, {...blank, __new:true}].map((r,i)=>(
          <AsOfRow key={r.id||`anew-${i}`} r={r} tenants={tenants} onSave={onSave} isPending={isPending} />
        ))}
      </tbody>
    </table>
  );
}
function AsOfRow({r,tenants,onSave,isPending}:{r:any; tenants:any[]; onSave:(row:any)=>void; isPending:boolean}){
  const [row,setRow]=useState({...r});
  return (
    <tr className="border-b border-slate-800">
      <td className="px-2 py-1">
        <select defaultValue={row.tenantId||""} onChange={e=>setRow((x:any)=>({...x,tenantId:e.target.value||null}))} className="border rounded px-2 py-1 bg-transparent" disabled={isPending} data-testid="select-asof-tenant">
          <option value="">(global)</option>
          {tenants.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <select defaultValue={row.domain||"HCM"} onChange={e=>setRow((x:any)=>({...x,domain:e.target.value}))} className="border rounded px-2 py-1 bg-transparent" disabled={isPending} data-testid="select-asof-domain">
          {["HCM","Payroll","Benefits","Security","FIN","All"].map(d=><option key={d}>{d}</option>)}
        </select>
      </td>
      <td className="px-2 py-1"><input type="date" defaultValue={row.asOf?String(row.asOf).slice(0,10):""}
        onBlur={e=>setRow((x:any)=>({...x,asOf:e.target.value?new Date(e.target.value).toISOString():null}))} className="border-b bg-transparent" disabled={isPending} data-testid="input-asof-date"/></td>
      <td className="px-2 py-1"><input defaultValue={row.note||""} onBlur={e=>setRow((x:any)=>({...x,note:e.target.value}))} className="w-full border-b bg-transparent" disabled={isPending} data-testid="input-asof-note"/></td>
      <td className="px-2 py-1">
        <button className="text-xs px-2 py-1 border rounded disabled:opacity-50" onClick={()=>onSave(row)} disabled={isPending} data-testid="button-save-asof">
          {row.__new?"Add":"Save"}
        </button>
      </td>
    </tr>
  );
}
