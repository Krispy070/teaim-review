import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useState } from "react";
import Guard from "@/components/Guard";

export default function OpsPage(){
  return <Guard need="admin"><OpsPageInner /></Guard>;
}

function OpsPageInner(){
  const pid = getProjectId();
  const [health, setHealth] = useState<any>(null);
  const [embedJobs, setEmbedJobs] = useState<any[]>([]);
  const [parseJobs, setParseJobs] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("");

  async function loadHealth(){
    const r = await fetchWithAuth(`/api/ops/health?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setHealth(j);
  }
  async function loadJobs(type:"embed"|"parse", st="failed"){
    const r = await fetchWithAuth(`/api/ops/jobs?type=${type}&status=${st}&projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json();
    if (type==="embed") setEmbedJobs(j.items||[]);
    else setParseJobs(j.items||[]);
  }
  useEffect(()=>{ loadHealth(); loadJobs("embed","failed"); loadJobs("parse","failed"); const t=setInterval(loadHealth,5000); return ()=>clearInterval(t); },[]);

  async function retryOne(type:"embed"|"parse", id:string){
    const r = await fetchWithAuth(`/api/ops/retry`, { method:"POST", body: JSON.stringify({ type, jobId:id }) });
    setStatus(r.ok?"Retried":"Retry failed"); setTimeout(()=>setStatus(""),800);
    loadJobs(type,"failed"); loadHealth();
  }
  async function retryAll(type:"embed"|"parse"){
    const r = await fetchWithAuth(`/api/ops/retry`, { method:"POST", body: JSON.stringify({ type, allFailed:true, projectId: pid }) });
    setStatus(r.ok?"Queued all failed":"Retry failed"); setTimeout(()=>setStatus(""),800);
    loadJobs(type,"failed"); loadHealth();
  }

  const toMap = (arr:any[])=>Object.fromEntries((arr||[]).map((x:any)=>[x.status,x.n]));

  return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="heading-ops">Ops / Worker Health</h1>
          <div className="text-xs opacity-70" data-testid="text-status">{status}</div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <Card title="Embed Queue" data={toMap(health?.embed||[])} />
          <Card title="Parse Queue" data={toMap(health?.parse||[])} />
          <div className="p-4 border rounded-2xl">
            <div className="text-xs opacity-60 mb-1">Heartbeats</div>
            <ul className="text-xs space-y-1">
              {(health?.heartbeats||[]).map((h:any)=>(
                <li key={h.worker} className="flex justify-between" data-testid={`heartbeat-${h.worker}`}>
                  <span>{h.worker}</span>
                  <span className="opacity-70">{new Date(h.updatedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <OverviewPane />

        <LineageBackfillCard />

        <section className="grid md:grid-cols-2 gap-3">
          <JobPane title="Failed Embed Jobs" items={embedJobs} onRefresh={()=>loadJobs("embed","failed")} onRetry={(id)=>retryOne("embed",id)} onRetryAll={()=>retryAll("embed")} />
          <JobPane title="Failed Parse Jobs" items={parseJobs} onRefresh={()=>loadJobs("parse","failed")} onRetry={(id)=>retryOne("parse",id)} onRetryAll={()=>retryAll("parse")} />
        </section>

        <section className="grid md:grid-cols-2 gap-3">
          <ConfigInfoCard />
          <SendTestEmailCard />
          <DeliverabilityGaugeCard />
          <DeliverabilityCard />
        </section>

        <section className="grid md:grid-cols-2 gap-3">
          <SmtpHealthCard />
          <AppEmailTogglesCard />
          <SuppressionsCard />
        </section>

        <SandboxResetCard />

        <WorkersHealthCard />

        <LogsPane />
      </div>
  );
}

function ConfigInfoCard(){
  const [data,setData]=useState<any>(null);
  const [ts,setTs]=useState<string>("");
  useEffect(()=>{ (async()=>{
    const a = await fetchWithAuth(`/api/info`); const j=await a.json(); if (a.ok) setData(j);
    const t = await fetchWithAuth(`/api/time`); const tj=await t.json(); if (t.ok) setTs(tj.now);
  })(); },[]);
  if (!data) return null;
  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium mb-1">App Info</div>
      <div className="text-xs grid md:grid-cols-2 gap-x-6 gap-y-1">
        <div>Version: <b>{data.version}</b></div>
        <div>Commit: <span className="opacity-80">{data.commit || "—"}</span></div>
        <div>Node: {data.node}</div>
        <div>Env: {data.env}</div>
        <div>Timezone: {data.timezone}</div>
        <div>Uptime: {Math.floor((data.uptimeSec||0)/60)} min</div>
        <div className="md:col-span-2">Server time: {ts ? new Date(ts).toLocaleString() : "—"}</div>
      </div>
    </div>
  );
}

function SandboxResetCard(){
  const pid = getProjectId();
  const [msg,setMsg]=useState("");
  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium mb-1">Sandbox Reset (admin)</div>
      <div className="text-[11px] opacity-70 mb-1">Clears project-scoped data for a clean demo/test run. Irreversible.</div>
      <div className="flex items-center gap-2">
        <button data-testid="button-sandbox-reset-dryrun" className="text-xs px-2 py-1 border rounded" onClick={async()=>{
          const r=await fetchWithAuth(`/api/admin/sandbox/reset`, { method:"POST", body: JSON.stringify({ projectId: pid, dryRun:true }) });
          const j=await r.json(); setMsg(r.ok? "Dry run OK (open console for stmts)" : j.error||"failed");
          console.log("[reset dry-run]", j);
        }}>Dry run</button>
        <button data-testid="button-sandbox-reset-apply" className="text-xs px-2 py-1 border rounded" onClick={async()=>{
          if (!confirm("Really reset project data? This cannot be undone.")) return;
          const r=await fetchWithAuth(`/api/admin/sandbox/reset`, { method:"POST", body: JSON.stringify({ projectId: pid, dryRun:false }) });
          const j=await r.json(); setMsg(r.ok? "Reset applied" : j.error||"failed");
        }}>Apply</button>
        <span data-testid="text-sandbox-reset-status" className="text-[11px] opacity-70">{msg}</span>
      </div>
    </div>
  );
}

function WorkersHealthCard(){
  const [items,setItems]=useState<any[]>([]);
  async function load(){ 
    const r=await fetchWithAuth(`/api/workers/health`); 
    const j=await r.json(); 
    if (r.ok) setItems(j.items||[]); 
  }
  useEffect(()=>{ load(); },[]);
  return (
    <div className="p-4 border rounded-2xl" data-testid="card-workers-health">
      <div className="text-sm font-medium mb-2" data-testid="heading-workers-health">Workers Health</div>
      <div className="text-[11px] opacity-70 mb-1">Last successful run time per worker.</div>
      <div className="max-h-48 overflow-auto border rounded">
        <table className="text-xs w-full" data-testid="table-workers-health">
          <thead className="bg-slate-900/30"><tr><th className="text-left px-2 py-1">Worker</th><th className="text-left px-2 py-1">Last run</th><th className="text-left px-2 py-1">OK</th><th className="text-left px-2 py-1">Note</th><th className="text-left px-2 py-1"></th></tr></thead>
          <tbody>
            {items.map((w:any)=>(
              <tr key={w.name} className="border-b border-slate-800" data-testid={`row-worker-${w.name}`}>
                <td className="px-2 py-1" data-testid={`text-worker-name-${w.name}`}>{w.name}</td>
                <td className="px-2 py-1" data-testid={`text-worker-lastrun-${w.name}`}>{w.lastRunAt? new Date(w.lastRunAt).toLocaleString() : "—"}</td>
                <td className="px-2 py-1" data-testid={`text-worker-ok-${w.name}`}>{String(w.ok)}</td>
                <td className="px-2 py-1" data-testid={`text-worker-note-${w.name}`}>{w.note||""}</td>
                <td className="px-2 py-1">
                  {["conversationSweep","planTicketSync","onboardingDigest","offboardingWeekly"].includes(w.name) && (
                    <button className="px-2 py-0.5 border rounded" onClick={async()=>{
                      await fetchWithAuth(`/api/workers/trigger`, { method:"POST", body: JSON.stringify({ name: w.name }) });
                      load();
                    }} data-testid={`button-trigger-${w.name}`}>Trigger</button>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && <tr><td className="px-2 py-2 opacity-70" colSpan={5} data-testid="text-no-workers">No data yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogsPane(){
  const pid = getProjectId();
  const [items,setItems] = useState<any[]>([]);
  const [level,setLevel] = useState<string>("error");
  const [route,setRoute] = useState<string>("");
  const [since,setSince] = useState<string>("");

  async function load(){
    const p = new URLSearchParams({ projectId: pid! });
    if (level) p.set("level", level);
    if (route) p.set("route", route);
    if (since) p.set("since", since);
    const r = await fetchWithAuth(`/api/ops/logs?${p.toString()}`); const j = await r.json();
    setItems(j.items||[]);
  }
  useEffect(()=>{ load(); },[]);

  return (
    <div className="p-4 border rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Error Logs</div>
        <div className="flex items-center gap-2">
          <select className="text-xs border rounded px-2 py-1" value={level} onChange={e=>setLevel(e.target.value)} data-testid="select-level"><option>error</option><option>warn</option></select>
          <input className="text-xs border rounded px-2 py-1" placeholder="route contains…" value={route} onChange={e=>setRoute(e.target.value)} data-testid="input-route" />
          <input className="text-xs border rounded px-2 py-1" type="date" value={since} onChange={e=>setSince(e.target.value)} data-testid="input-since" />
          <button className="text-xs px-2 py-1 border rounded" onClick={load} data-testid="button-filter">Filter</button>
        </div>
      </div>
      <ul className="space-y-2 max-h-[320px] overflow-auto">
        {items.map((r:any, i:number)=>(
          <li key={i} className="text-xs p-2 border rounded-lg" data-testid={`log-${i}`}>
            <div className="flex items-center justify-between">
              <span className="opacity-80">{r.level.toUpperCase()} {r.status}</span>
              <span className="opacity-60">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-1">{r.message}</div>
            <div className="opacity-60">{r.method} {r.route} • {r.userEmail||"—"}</div>
          </li>
        ))}
        {!items.length && <li className="opacity-70">No errors 🎉</li>}
      </ul>
    </div>
  );
}

function Card({title, data}:{title:string; data:any}){
  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-xs opacity-60 mb-1">{title}</div>
      <div className="text-sm">pending: {data.pending||0} • running: {data.running||0} • failed: {data.failed||0}</div>
    </div>
  );
}
function JobPane({title, items, onRefresh, onRetry, onRetryAll}:{title:string; items:any[]; onRefresh:()=>void; onRetry:(id:string)=>void; onRetryAll:()=>void}){
  return (
    <div className="p-4 border rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-2 py-1 border rounded-lg" onClick={onRefresh} data-testid="button-refresh">Refresh</button>
          <button className="text-xs px-2 py-1 border rounded-lg" onClick={onRetryAll} data-testid="button-retry-all">Retry All</button>
        </div>
      </div>
      <ul className="space-y-2 max-h-[300px] overflow-auto">
        {items.map(j=>(
          <li key={j.id} className="text-xs p-2 border rounded-lg" data-testid={`job-${j.id}`}>
            <div className="flex items-center justify-between">
              <span>{j.docId}</span>
              <span className="opacity-70">{new Date(j.updatedAt).toLocaleString()}</span>
            </div>
            {j.lastError && <div className="mt-1 opacity-80">{String(j.lastError).slice(0,240)}</div>}
            <div className="mt-1">
              <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>onRetry(j.id)} data-testid={`button-retry-${j.id}`}>Retry</button>
            </div>
          </li>
        ))}
        {!items.length && <li className="opacity-70">No failed jobs 🎉</li>}
      </ul>
    </div>
  );
}

function OverviewPane(){
  const [ov,setOv] = useState<any>(null);
  const pid = getProjectId();
  async function load(){ const r = await fetchWithAuth(`/api/ops/overview?projectId=${encodeURIComponent(pid!)}`); const j = await r.json(); setOv(j); }
  useEffect(()=>{ load(); const t=setInterval(load, 60000); return ()=>clearInterval(t); },[]);
  if (!ov) return <div className="p-4 border rounded-2xl">Loading…</div>;

  // map rpm rows to points (x in minutes)
  const base = Date.now();
  const pts = (ov.rpm||[]).map((r:any)=>({ x: new Date(r.ts).getTime(), y: r.n }));
  // If server returned few points, we still render what we have.

  return (
    <div className="p-4 border rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Requests (last 15m)</div>
        <div className="text-xs opacity-70">errors: {ov.errors15} (15m) • {ov.errors60} (60m)</div>
      </div>
      <div className="mt-2">
        <Sparkline points={pts} />
      </div>
    </div>
  );
}

function LineageBackfillCard(){
  const pid = getProjectId();
  const [msg,setMsg]=useState("");
  const [preview,setPreview]=useState<any|null>(null);
  const [busy,setBusy]=useState(false);

  async function dryRun(){
    setBusy(true);
    const r = await fetchWithAuth(`/api/admin/lineage/backfill`, { method:"POST", body: JSON.stringify({ projectId: pid, dryRun: true }) });
    const j = await r.json(); setBusy(false);
    if (r.ok){ setPreview(j.preview||{}); setMsg(""); } else setMsg(j.error||"failed");
  }
  async function commit(){
    if (!confirm("Apply lineage backfill now?")) return;
    setBusy(true);
    const r = await fetchWithAuth(`/api/admin/lineage/backfill`, { method:"POST", body: JSON.stringify({ projectId: pid, dryRun: false }) });
    const j = await r.json(); setBusy(false);
    if (r.ok){ alert(`Updated: ${JSON.stringify(j.results)}`); setPreview(null); } else alert(j.error||"failed");
  }

  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium">Lineage Backfill</div>
      <div className="text-xs opacity-70 mb-2">Retro-tag actions/risks/timeline/decisions with origin=Doc wherever doc_id exists.</div>
      <div className="flex items-center gap-2">
        <button className="text-xs px-2 py-1 border rounded" onClick={dryRun} disabled={busy} data-testid="button-lineage-dryrun">{busy?"…":"Dry run"}</button>
        <button className="text-xs px-2 py-1 border rounded" onClick={commit} disabled={busy || !preview} data-testid="button-lineage-commit">Commit</button>
        <div className="text-xs opacity-70">{msg}</div>
      </div>
      {preview && (
        <div className="mt-2 text-xs" data-testid="text-lineage-preview">
          <div>Preview changes: actions {preview.actions}, timeline {preview.timeline}, risks {preview.risks}, decisions {preview.decisions}</div>
        </div>
      )}
    </div>
  );
}

function DeliverabilityGaugeCard(){
  const pid = getProjectId();
  const [data,setData]=useState<any|null>(null);
  const [days,setDays]=useState(7);
  const [trend,setTrend]=useState<any[]>([]);
  const [trendByCat,setTrendByCat]=useState<Record<string,any[]>>({});

  const load = async()=>{
    const r=await fetchWithAuth(`/api/email/metrics/gauge?projectId=${encodeURIComponent(pid!)}&days=${days}`);
    const j=await r.json(); if (r.ok) setData(j);
  };
  useEffect(()=>{ load(); }, [days]);

  useEffect(()=>{ (async()=>{
    const r=await fetchWithAuth(`/api/email/metrics/trend24?projectId=${encodeURIComponent(pid!)}`); const j=await r.json();
    if (r.ok) setTrend(j.points||[]);
  })(); },[pid, days]);

  useEffect(()=>{ (async()=>{
    const r=await fetchWithAuth(`/api/email/metrics/trend24_by_category?projectId=${encodeURIComponent(pid!)}`); const j=await r.json();
    if (r.ok){
      const map:Record<string,any[]> = {};
      (j.items||[]).forEach((it:any)=> map[it.category||"(other)"] = it.points||[]);
      setTrendByCat(map);
    }
  })(); },[pid]);

  const pct = data ? Math.round((data.bounceRate||0)*1000)/10 : 0;
  const tone = pct < 1 ? "ok" : pct < 3 ? "warn" : "err";

  function SparklineTrend({ pts }:{ pts:any[] }){
    if (!pts?.length) return <div className="text-[11px] opacity-70">No 24h trend.</div>;
    const W=240, H=48, pad=4;
    const maxY = Math.max(1, ...pts.map(p=>p.attempted||0));
    const x = (i:number)=> pad + i*( (W-2*pad) / Math.max(1, pts.length-1));
    const y = (v:number)=> H - pad - (v/maxY)*(H-2*pad);
    const line = (sel:(p:any)=>number)=> pts.map((p,i)=> `${i?"L":"M"}${x(i)},${y(sel(p))}`).join(" ");
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* attempts */}
        <path d={line(p=>p.attempted||0)} fill="none" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* bounces */}
        <path d={line(p=> (p.bounced||0)+(p.complained||0))} fill="none" stroke="#f87171" strokeWidth="1.5"/>
      </svg>
    );
  }

  function TinySpark({ pts }:{ pts:any[] }){
    if (!pts?.length) return <span className="opacity-50">—</span>;
    const W=120, H=28, pad=3;
    const maxY = Math.max(1, ...pts.map(p=>p.attempted||0));
    const x = (i:number)=> pad + i*( (W-2*pad) / Math.max(1, pts.length-1));
    const y = (v:number)=> H - pad - (v/maxY)*(H-2*pad);
    const line = (sel:(p:any)=>number)=> pts.map((p,i)=> `${i?"L":"M"}${x(i)},${y(sel(p))}`).join(" ");
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path d={line(p=>p.attempted||0)} fill="none" stroke="#60a5fa" strokeWidth="1.2"/>
        <path d={line(p=> (p.bounced||0)+(p.complained||0))} fill="none" stroke="#f87171" strokeWidth="1.2"/>
      </svg>
    );
  }

  return (
    <div className="p-4 border rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Email Deliverability</div>
        <div className="text-[11px] flex items-center gap-2">
          <span>Window</span>
          <select className="border rounded px-2 py-0.5" value={days} onChange={e=>setDays(Number(e.target.value||7))} data-testid="select-gauge-days">
            <option value={7}>7d</option><option value={14}>14d</option><option value={30}>30d</option><option value={90}>90d</option>
          </select>
          <button className="px-2 py-0.5 border rounded" onClick={load} data-testid="button-gauge-refresh">Refresh</button>
        </div>
      </div>

      <div className="mt-2">
        <div className="text-[11px] opacity-70 mb-1">Bounce/complaint rate</div>
        <div className="h-3 w-full border rounded overflow-hidden bg-slate-800">
          <div
            className={`h-full ${tone==='ok'?'bg-emerald-600':tone==='warn'?'bg-amber-600':'bg-red-600'}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            data-testid="gauge-bar"
          />
        </div>
        <div className="text-[11px] opacity-70 mt-1" data-testid="text-gauge-summary">
          {pct}% • attempted {data?.attempted||0}, delivered {data?.delivered||0},
          bounced {data?.bounced||0}, complained {data?.complained||0}, failed {data?.failed||0}, suppressed {data?.suppressed||0}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[11px] opacity-70 mb-1">By category (attempted / delivered / bounced / complained)</div>
        <div className="max-h-40 overflow-auto border rounded">
          <table className="text-xs w-full">
            <thead className="bg-slate-900/30">
              <tr><th className="text-left px-2 py-1">Category</th><th className="text-left px-2 py-1">Attempted</th><th className="text-left px-2 py-1">Delivered</th><th className="text-left px-2 py-1">Bounced</th><th className="text-left px-2 py-1">Complained</th><th className="text-left px-2 py-1">24h</th></tr>
            </thead>
            <tbody>
              {(data?.byCategory||[]).map((c:any)=>(
                <tr key={c.category} className="border-b border-slate-800" data-testid={`category-row-${c.category}`}>
                  <td className="px-2 py-1">{c.category||"(other)"}</td>
                  <td className="px-2 py-1">{c.attempted||0}</td>
                  <td className="px-2 py-1">{c.delivered||0}</td>
                  <td className="px-2 py-1">{c.bounced||0}</td>
                  <td className="px-2 py-1">{c.complained||0}</td>
                  <td className="px-2 py-1"><TinySpark pts={trendByCat[c.category||"(other)"]||[]} /></td>
                </tr>
              ))}
              {!data?.byCategory?.length && <tr><td className="px-2 py-2 opacity-70" colSpan={6} data-testid="text-no-categories">No events.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-2">
        <div className="text-[11px] opacity-70 mb-1">24h trend (attempts vs bounces)</div>
        <SparklineTrend pts={trend} />
      </div>
    </div>
  );
}

function SmtpHealthCard(){
  const pid = getProjectId();
  const [data,setData]=useState<any|null>(null);

  const load = async()=>{
    const r=await fetchWithAuth(`/api/email/smtp-health?projectId=${encodeURIComponent(pid!)}`);
    const j=await r.json(); if (r.ok) setData(j);
  };
  useEffect(()=>{ load(); const t=setInterval(load,30000); return ()=>clearInterval(t); },[pid]);

  const status = data?.status||"unknown";
  const statusColor = status==="healthy"?"text-emerald-400":status==="warning"?"text-amber-400":"text-red-400";

  return (
    <div className="p-4 border rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">SMTP Health</div>
        <button className="text-[11px] px-2 py-0.5 border rounded" onClick={load} data-testid="button-smtp-refresh">Refresh</button>
      </div>

      <div className="mt-2">
        <div className="text-[11px] opacity-70 mb-1">Last 24h bounce/complaint rate</div>
        <div className={`text-2xl font-semibold ${statusColor}`} data-testid="text-smtp-status">
          {data ? `${data.errorRate}%` : "—"}
        </div>
        <div className="text-[11px] opacity-70 mt-1" data-testid="text-smtp-summary">
          Status: <span className={statusColor}>{status}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="p-2 border rounded">
          <div className="opacity-70">Bounces</div>
          <div className="text-lg font-medium" data-testid="text-bounces">{data?.bounces||0}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="opacity-70">Complaints</div>
          <div className="text-lg font-medium" data-testid="text-complaints">{data?.complaints||0}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="opacity-70">Total Events</div>
          <div className="text-lg font-medium" data-testid="text-total-events">{data?.totalEvents||0}</div>
        </div>
      </div>
    </div>
  );
}

function SendTestEmailCard(){
  const [to,setTo]=useState(""); const [sub,setSub]=useState("TEAIM test email");
  const [body,setBody]=useState("Hello from TEAIM."); const [cat,setCat]=useState("other");
  const pid = getProjectId(); const [msg,setMsg]=useState("");
  async function sendIt(){
    const r=await fetchWithAuth(`/api/email/test_send`, { method:"POST", body: JSON.stringify({ projectId: pid, to, subject: sub, body, category: cat })});
    const j=await r.json(); setMsg(r.ok?"Sent":"Failed: "+(j.error||""));
  }
  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium mb-1">Send Test Email (app)</div>
      <div className="grid md:grid-cols-2 gap-2 text-sm">
        <input className="border rounded px-2 py-1" placeholder="to@example.com" value={to} onChange={e=>setTo(e.target.value)} data-testid="input-test-email-to" />
        <select className="border rounded px-2 py-1" value={cat} onChange={e=>setCat(e.target.value)} data-testid="select-test-email-category">
          <option>other</option><option>alerts</option><option>plan</option><option>release</option><option>onboarding</option><option>announcements</option>
        </select>
        <input className="border rounded px-2 py-1 md:col-span-2" value={sub} onChange={e=>setSub(e.target.value)} data-testid="input-test-email-subject" />
        <textarea className="border rounded px-2 py-1 md:col-span-2 h-24" value={body} onChange={e=>setBody(e.target.value)} data-testid="textarea-test-email-body" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button className="text-xs px-2 py-1 border rounded" onClick={sendIt} data-testid="button-send-test-email">Send</button>
        <span className="text-[11px] opacity-70" data-testid="text-test-email-msg">{msg}</span>
      </div>
    </div>
  );
}

function AppEmailTogglesCard(){
  const [s,setS]=useState<any>(null); const [env,setEnv]=useState<any>(null);
  useEffect(()=>{ (async()=>{
    const r=await fetchWithAuth(`/api/email/app_settings`); const j=await r.json();
    if (r.ok){ setS(j.settings); setEnv(j.env); }
  })(); },[]);
  if (!s) return null;

  async function save(partial:any){
    const body={...s, ...partial}; setS(body);
    await fetchWithAuth(`/api/email/app_settings`, { method:"POST", body: JSON.stringify(partial) });
  }

  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium mb-1">App Email Toggles (non-auth)</div>
      <div className="text-[11px] opacity-70 mb-2">Affects TEAIM emails (alerts/plan/release). Supabase auth emails are separate.</div>
      <div className="grid md:grid-cols-2 gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!s.sendingEnabled} onChange={e=>save({ sendingEnabled: e.target.checked })} data-testid="checkbox-sending-enabled"/>
          Sending enabled
        </label>
        <div/>
        <div>
          <div className="text-[11px] opacity-70">Sink (override)</div>
          <input className="border rounded px-2 py-1 w-full" value={s.sink||""} onChange={e=>setS({...s, sink:e.target.value})} onBlur={()=>save({ sink:s.sink||null })} data-testid="input-sink"/>
        </div>
        <div>
          <div className="text-[11px] opacity-70">Allowlist regex (override)</div>
          <input className="border rounded px-2 py-1 w-full" value={s.allowlistRegex||""} onChange={e=>setS({...s, allowlistRegex:e.target.value})} onBlur={()=>save({ allowlistRegex:s.allowlistRegex||null })} data-testid="input-allowlist"/>
        </div>
      </div>
      <div className="text-[11px] opacity-70 mt-2" data-testid="text-env-info">
        Env: NODE_ENV={env?.NODE_ENV||"?"}, EMAIL_SINK={env?.EMAIL_SINK||"(none)"}, ALLOWLIST={env?.EMAIL_ALLOWLIST_REGEX||"(none)"}
      </div>
    </div>
  );
}

function DeliverabilityCard(){
  const pid = getProjectId();
  const [stats,setStats]=useState<any[]>([]);
  const [recent,setRecent]=useState<any[]>([]);
  
  useEffect(()=>{ 
    (async()=>{
      const r=await fetchWithAuth(`/api/email/metrics?projectId=${encodeURIComponent(pid!)}&days=7`);
      const j=await r.json();
      setStats(j.stats||[]);
      setRecent(j.recent||[]);
    })();
  },[pid]);
  
  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium mb-2" data-testid="heading-deliverability">Email Deliverability (7d)</div>
      <div className="text-xs flex gap-3 mb-2">
        {stats.map((s:any)=> <span key={s.status} data-testid={`stat-${s.status}`}>{s.status}: {s.n}</span>)}
      </div>
      <div className="text-xs max-h-40 overflow-auto border rounded">
        <table className="w-full text-xs">
          <thead className="bg-slate-900/30"><tr><th className="text-left px-2 py-1">To</th><th className="text-left px-2 py-1">Status</th><th className="text-left px-2 py-1">At</th></tr></thead>
          <tbody>
            {recent.map((r:any,i:number)=>(
              <tr key={i} className="border-b border-slate-800" data-testid={`email-event-${i}`}>
                <td className="px-2 py-1">{r.to}</td>
                <td className="px-2 py-1">{r.status}</td>
                <td className="px-2 py-1">{new Date(r.at).toLocaleString()}</td>
              </tr>
            ))}
            {!recent.length && <tr><td className="px-2 py-2" colSpan={3}>No events.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuppressionsCard(){
  const pid = getProjectId();
  const [items,setItems]=useState<any[]>([]);
  const [email,setEmail]=useState("");
  const [msg,setMsg]=useState("");
  
  async function load(){
    const r=await fetchWithAuth(`/api/email/suppressions?projectId=${encodeURIComponent(pid!)}`);
    const j=await r.json();
    setItems(j.items||[]);
  }
  
  useEffect(()=>{ load(); },[pid]);
  
  async function add(){
    if(!email.trim()) return;
    const r=await fetchWithAuth(`/api/email/suppressions/add`, {
      method:"POST",
      body: JSON.stringify({ email, projectId: pid })
    });
    setMsg(r.ok?"Added":"Failed");
    setEmail("");
    load();
  }
  
  async function remove(e:string){
    const r=await fetchWithAuth(`/api/email/suppressions/remove`, {
      method:"POST",
      body: JSON.stringify({ email:e, projectId: pid })
    });
    setMsg(r.ok?"Removed":"Failed");
    load();
  }
  
  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium mb-2" data-testid="heading-suppressions">Suppressions</div>
      <div className="flex items-center gap-2">
        <input 
          className="border rounded px-2 py-1 text-sm" 
          placeholder="user@example.com" 
          value={email} 
          onChange={e=>setEmail(e.target.value)}
          data-testid="input-suppression-email"
        />
        <button className="text-xs px-2 py-1 border rounded" onClick={add} data-testid="button-add-suppression">Add</button>
        <span className="text-xs opacity-70" data-testid="text-suppression-msg">{msg}</span>
      </div>
      <ul className="text-xs mt-2 max-h-40 overflow-auto">
        {items.map((s:any)=>(
          <li key={s.email} className="flex items-center justify-between border rounded px-2 py-1 mt-1" data-testid={`suppression-${s.email}`}>
            <span>{s.email} • {s.reason} {s.active?"":"(inactive)"}</span>
            <button className="px-2 py-0.5 border rounded" onClick={()=>remove(s.email)} data-testid={`button-remove-${s.email}`}>Deactivate</button>
          </li>
        ))}
        {!items.length && <li className="opacity-70">No suppressions.</li>}
      </ul>
    </div>
  );
}

function Sparkline({ points }:{ points: { x:number; y:number }[] }) {
  if (!points.length) return <div className="text-xs opacity-70">no data</div>;
  const w = 220, h = 48, pad = 4;
  const xs = points.map(p=>p.x), ys = points.map(p=>p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = 0, maxY = Math.max(1, Math.max(...ys));
  const sx = (x:number)=> pad + (w-2*pad) * ((x - minX) / Math.max(1, (maxX - minX)));
  const sy = (y:number)=> h - pad - (h-2*pad) * (y / (maxY || 1));
  const d = points.map((p,i)=> `${i?"L":"M"} ${sx(p.x)} ${sy(p.y)}`).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <path d={d} fill="none" stroke="#60a5fa" strokeWidth="2"/>
      <line x1={pad} y1={sy(0)} x2={w-pad} y2={sy(0)} stroke="#334155" strokeDasharray="2,3"/>
    </svg>
  );
}
