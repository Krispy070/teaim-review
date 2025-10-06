import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { getProjectId, ensureProjectPath, setProjectId } from "@/lib/project";
import { useOrg } from "@/App";

function MyPlanGlanceCard(){
  const pid = getProjectId();
  const [me,setMe]=useState<any>(null);
  const [mine,setMine]=useState<boolean>(false);
  const [counts,setCounts]=useState<{dueSoon:number;overdue:number}>({dueSoon:0, overdue:0});

  useEffect(()=>{ (async()=>{
    const r=await authFetch(`/api/me`); const j=await r.json(); if (r.ok) setMe(j);
    const pr = await authFetch(`/api/plan/prefs?projectId=${encodeURIComponent(pid!)}`); const pj=await pr.json();
    if (pr.ok){
      if (pj.userDefault===true) setMine(true);
      else if (pj.userDefault===false) setMine(false);
      else if (pj.projectDefault===true) setMine(true);
    }
  })(); },[pid]);

  async function loadCounts(){
    if (!me?.email) return;
    const url = mine 
      ? `/api/plan/my_counts?projectId=${encodeURIComponent(pid!)}&owner=${encodeURIComponent(me.email)}`
      : `/api/plan/my_counts?projectId=${encodeURIComponent(pid!)}`;
    const r = await authFetch(url);
    const j = await r.json(); if (r.ok) setCounts(j);
  }
  useEffect(()=>{ loadCounts(); }, [pid, me?.email, mine]);

  return (
    <div className="p-3 border rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">My Plan glance</div>
        <div className="text-[11px] flex items-center gap-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={mine} onChange={async e=>{
              setMine(e.target.checked);
              await authFetch(`/api/plan/prefs`, { method:"POST", body: JSON.stringify({ projectId: pid, userDefault: e.target.checked }) });
            }} data-testid="checkbox-owner-me"/>
            owner = me
          </label>
          <button className="px-2 py-0.5 border rounded" onClick={loadCounts} data-testid="button-refresh-counts">Refresh</button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] mt-2">
        <span className="px-2 py-0.5 border rounded border-amber-600 text-amber-300" data-testid="chip-due-soon">Due soon (7d): {counts.dueSoon}</span>
        <span className="px-2 py-0.5 border rounded border-red-600 text-red-300" data-testid="chip-overdue">Overdue: {counts.overdue}</span>
      </div>
    </div>
  );
}

function OnboardingDigestCard(){
  const pid = getProjectId();
  const [data,setData]=useState<any|null>(null);

  useEffect(()=>{ (async()=>{
    if (!pid) return;
    try {
      const r=await authFetch(`/api/onboarding/digest?projectId=${encodeURIComponent(pid!)}`);
      const j=await r.json();
      if (r.ok) setData(j);
    } catch (err) {
      console.log("Failed to load onboarding digest:", err);
    }
  })(); },[pid]);

  if (!data) return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium mb-1">Onboarding Digest</div>
      <div className="text-xs opacity-70">Loading…</div>
    </div>
  );

  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-sm font-medium mb-2">Onboarding Digest</div>

      <div className="mb-2">
        <div className="text-xs opacity-70">Steps</div>
        <div className="flex flex-wrap gap-2">
          {data.steps.map((s:any)=>(
            <a
              key={s.id}
              className={`px-2 py-1 border rounded hover:bg-accent ${s.status==='done'?'opacity-70':''}`}
              href={ensureProjectPath(`/onboarding?stepId=${encodeURIComponent(s.id)}`)}
              title={`${s.title} — ${s.total? Math.round((s.done*100)/s.total):0}%`}>
              <span className="text-xs font-medium">{s.title}</span>
              <span className="text-[11px] opacity-70 ml-1">{s.total? Math.round((s.done*100)/s.total):0}%</span>
            </a>
          ))}
        </div>
        {(() => {
          const lastActive = (data.steps||[]).find((s:any)=> s.status!=='done');
          return lastActive && (
            <div className="text-[11px] mt-1">
              <a className="px-2 py-0.5 border rounded" href={ensureProjectPath(`/onboarding?stepId=${encodeURIComponent(lastActive.id)}`)} data-testid="link-open-last-step">
                Open last step: {lastActive.title}
              </a>
            </div>
          );
        })()}
      </div>

      <div className="grid md:grid-cols-2 gap-2">
        <div className="p-2 border rounded">
          <div className="text-xs font-medium mb-1">Due soon (7d)</div>
          <ul className="text-xs space-y-1">
            {data.soon.map((t:any,i:number)=> <li key={i}>{t.title} {t.owner?`• ${t.owner}`:""} {t.dueAt?`→ ${new Date(t.dueAt).toLocaleDateString()}`:""}</li>)}
            {!data.soon.length && <li className="opacity-60">None</li>}
          </ul>
        </div>
        <div className="p-2 border rounded">
          <div className="text-xs font-medium mb-1">Overdue</div>
          <ul className="text-xs space-y-1">
            {data.overdue.map((t:any,i:number)=> <li key={i}>{t.title} {t.owner?`• ${t.owner}`:""} {t.dueAt?`(was ${new Date(t.dueAt).toLocaleDateString()})`:""}</li>)}
            {!data.overdue.length && <li className="opacity-60">None</li>}
          </ul>
        </div>
      </div>

      <div className="mt-2">
        <div className="text-xs opacity-70 mb-1">Metrics</div>
        <div className="grid md:grid-cols-2 gap-2">
          {data.metrics.map((m:any,i:number)=>(
            <div key={i} className="px-2 py-1 border rounded text-xs">
              <div className="font-medium">{m.name}</div>
              <div className="opacity-70">{m.owner||"—"} • Target {m.target||"—"} • Current {m.current||"—"} • {m.status}</div>
            </div>
          ))}
          {!data.metrics.length && <div className="text-xs opacity-60">No metrics yet.</div>}
        </div>
      </div>

      <div className="mt-2">
        <div className="text-xs opacity-70 mb-1">Latest reflections</div>
        <ul className="text-xs max-h-28 overflow-auto space-y-1">
          {data.reflections.map((r:any,i:number)=>(<li key={i} className="border rounded px-2 py-1">{new Date(r.createdAt).toLocaleString()} — {r.content}</li>))}
          {!data.reflections.length && <li className="opacity-60">No reflections.</li>}
        </ul>
      </div>
    </div>
  );
}

function OnboardingPushedCard(){
  const pid = getProjectId();
  const [last,setLast]=useState<any|null>(null);
  useEffect(()=>{ (async()=>{
    const r=await authFetch(`/api/onboarding/pushed_last?projectId=${encodeURIComponent(pid!)}`); const j=await r.json();
    if (r.ok) setLast(j.last||null);
  })(); },[pid]);

  if (!last) return null;
  return (
    <div className="p-3 border rounded-2xl">
      <div className="text-sm font-medium mb-1">Onboarding → Plan</div>
      <div className="text-xs">Pushed <b>{last.count}</b> task(s) • {new Date(last.at).toLocaleString()}</div>
      <div className="mt-1 flex items-center gap-2">
        <a className="text-xs px-2 py-1 border rounded"
           href={ensureProjectPath(`/plan?originType=onboarding&originId=${encodeURIComponent(last.stepId)}`)}
           data-testid="link-open-plan">
          Open last push batch
        </a>
        <a className="text-xs px-2 py-1 border rounded" href={ensureProjectPath(`/onboarding?stepId=${encodeURIComponent(last.stepId)}`)} data-testid="link-open-step">Open step</a>
        <a className="text-xs underline" href={ensureProjectPath("/onboarding/push-history")} data-testid="link-push-history">Push history</a>
      </div>
    </div>
  );
}

function IngestEmailCard() {
  const pid = getProjectId();
  const [alias, setAlias] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [copied, setCopied] = useState(false);
  const orgCtx = useOrg();

  async function load() {
    if (!pid) return;
    setLoading(true);
    const role = orgCtx?.userRole || "member";
    setIsAdmin(role === "admin");
    const r = await authFetch(`/api/project-settings/ingest-alias?projectId=${encodeURIComponent(pid)}`);
    const j = await r.json();
    setAlias(j.ingestEmail || null);
    setLoading(false);
  }
  
  useEffect(() => { load(); }, [pid]);

  async function rotate() {
    if (!confirm("Generate a new ingest email alias? This will invalidate the old one.")) return;
    
    const r = await authFetch(`/api/project-settings/rotate-ingest-alias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: pid })
    });
    const j = await r.json();
    if (!r.ok) return alert("Rotate failed: " + JSON.stringify(j));
    setAlias(j.ingestEmail || null);
  }

  async function copy() {
    if (!alias) return;
    await navigator.clipboard.writeText(alias);
    setCopied(true); 
    setTimeout(()=>setCopied(false), 1000);
  }

  return (
    <div className="p-4 border rounded-2xl" data-testid="ingest-email-card">
      <div className="flex items-center justify-between">
        <div className="text-lg font-medium">Project Ingest Email</div>
        {isAdmin && (
          <button 
            className="text-xs px-2 py-1 border rounded-lg hover:bg-accent" 
            onClick={rotate}
            data-testid="button-rotate-ingest"
          >
            {alias ? "Rotate" : "Generate"}
          </button>
        )}
      </div>

      <div className="mt-2 text-sm" data-testid="text-ingest-email">
        {loading ? "Loading…" : (alias ? alias : "No alias yet. (Admin can generate)") }
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button 
          className="text-xs px-2 py-1 border rounded-lg disabled:opacity-50 hover:bg-accent"
          disabled={!alias}
          onClick={copy}
          data-testid="button-copy-ingest"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <a 
          className={`text-xs px-2 py-1 border rounded-lg hover:bg-accent ${!alias ? "pointer-events-none opacity-50" : ""}`}
          href={alias ? `mailto:${encodeURIComponent(alias)}?subject=TEAIM%20Ingest&body=Attach%20docs%20for%20project%20${pid}` : "#"}
          data-testid="link-mailto-ingest"
        >
          Compose Email
        </a>
        <span className="text-[11px] opacity-70">Forward docs here to ingest directly into this project.</span>
      </div>
    </div>
  );
}

function Card({label, value, href}:{label:string; value:string|number; href?:string}) {
  const inner = (
    <div className="p-4 border rounded-2xl">
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

function Section({title, children}:{title:string; children:any}) {
  return (<div><div className="text-lg font-medium mb-2">{title}</div>{children}</div>);
}

function IntegrationsTiles() {
  const pid = getProjectId();
  const [data, setData] = useState<any>(null);
  
  useEffect(()=>{ (async()=>{
    if(!pid) return;
    const r = await authFetch(`/api/ma/integrations/summary?projectId=${encodeURIComponent(pid)}`);
    const j = await r.json(); 
    setData(j);
  })(); },[pid]);
  
  if(!data) return null;
  
  const m = Object.fromEntries((data.counts||[]).map((c:any)=>[c.status,c.n]));
  const tile = (label:string, k:string) => (
    <div className="p-4 border rounded-2xl">
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-2xl font-semibold">{m[k]||0}</div>
    </div>
  );
  
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium opacity-80">M&A Integrations</div>
      <div className="grid gap-3 md:grid-cols-4">
        {tile("Planned","planned")}
        {tile("Building","building")}
        {tile("Testing","testing")}
        {tile("Ready/Live", "ready")}
      </div>
      <div className="mt-2">
        <a className="text-sm underline" href={ensureProjectPath("/ma/integrations")}>View integrations →</a>
      </div>
    </div>
  );
}

export default function DashboardV2() {
  const orgCtx = useOrg();
  const defaultProjectId = orgCtx?.projectId || 'e1ec6ad0-a4e8-45dd-87b0-e123776ffe6e';
  
  const urlProjectId = getProjectId();
  const projectId = urlProjectId || defaultProjectId;
  
  const [data, setData] = useState<any>(null);
  const [etl, setEtl] = useState<any>(null);
  const [myWork, setMyWork] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!urlProjectId && defaultProjectId) {
      setProjectId(defaultProjectId);
    }
  }, [urlProjectId, defaultProjectId]);

  async function loadAll() {
    if (!projectId) return;
    try {
      const [d, h, m] = await Promise.all([
        authFetch(`/api/dashboard?projectId=${encodeURIComponent(projectId)}`).then(r=>r.json()),
        authFetch(`/api/health/etl?projectId=${encodeURIComponent(projectId)}`).then(r=>r.json()),
        authFetch(`/api/mywork?projectId=${encodeURIComponent(projectId)}`).then(r=>r.json())
      ]);
      if (d.ok) setData(d);
      if (h.ok) setEtl(h);
      if (m.ok) setMyWork(m);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  }

  useEffect(() => { loadAll(); }, [projectId]);

  if (!data) return <div className="p-6">Loading…</div>;

  const k = data.counts || {};
  const rec = data.recent || { docs:[], actions:[], events:[] };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Project Overview</h1>
          <a
            className="text-xs px-3 py-1.5 border rounded-lg hover:bg-accent"
            href={`/api/projects/export.zip?projectId=${encodeURIComponent(projectId)}`}
            download
            data-testid="button-export-project"
          >
            Export Project ZIP
          </a>
        </div>

        <IngestEmailCard />

        <MyPlanGlanceCard />

        <div className="grid gap-3 md:grid-cols-4">
          <Card label="Documents" value={k.docs || 0} href={ensureProjectPath("/documents")} />
          <Card label="Storage"  value={`${Number(k.bytes || 0).toLocaleString()} bytes`} />
          <Card label="Actions"   value={`${k.actions || 0} (${k.actionsDone || 0} done)`} href={ensureProjectPath("/insights/actions")} />
          <Card label="Tests"     value={k.tests || 0} href={ensureProjectPath("/insights/tests")} />
        </div>

        <IntegrationsTiles />

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          <OnboardingPushedCard />
          <MyPlanGlanceCard />
        </div>

        <OnboardingDigestCard />

        {etl && (
          <div className="p-4 border rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="text-lg font-medium">Data Pipeline</div>
              <button
                className="text-xs px-2 py-1 border rounded-lg hover:bg-accent"
                disabled={busy}
                onClick={async ()=>{
                  setBusy(true);
                  await authFetch(`/api/health/refresh-insights`, {
                    method:"POST", 
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ projectId })
                  });
                  setBusy(false);
                  loadAll();
                }}
                data-testid="button-refresh-insights"
              >{busy ? "Refreshing…" : "Refresh Insights"}</button>
            </div>
            <div className="text-xs opacity-70 mt-2">
              Embeds: pending {etl.embed?.pending || 0}, running {etl.embed?.running || 0}, failed {etl.embed?.failed || 0} •
              Parse: pending {etl.parse?.pending || 0}, running {etl.parse?.running || 0}, failed {etl.parse?.failed || 0} •
              Needs embed: {etl.docsNeedingEmbeds || 0} • Needs parse: {etl.docsNeedingParse || 0}
            </div>
          </div>
        )}

        {myWork && (
          <div className="p-4 border rounded-2xl border-border bg-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium">My Work</h2>
              <a
                className="px-3 py-1.5 text-sm border rounded-lg hover:bg-accent"
                href={`/api/exports/mywork.csv?projectId=${projectId}`}
                download
                data-testid="button-export-mywork"
              >
                Export CSV
              </a>
            </div>
            <div className="grid gap-2 md:grid-cols-3 text-sm">
              <div className="p-3 rounded-lg bg-background">
                <div className="text-xs opacity-60">Open Actions</div>
                <div className="text-xl font-semibold">{myWork.counts?.open || 0}</div>
              </div>
              <div className="p-3 rounded-lg bg-background">
                <div className="text-xs opacity-60">Overdue</div>
                <div className="text-xl font-semibold text-destructive">{myWork.counts?.overdue || 0}</div>
              </div>
              <div className="p-3 rounded-lg bg-background">
                <div className="text-xs opacity-60">Due Soon (7d)</div>
                <div className="text-xl font-semibold text-amber-500">{myWork.counts?.dueSoon || 0}</div>
              </div>
            </div>
          </div>
        )}

        <Section title="Recent Documents">
          <ul className="space-y-2">
            {(rec.docs||[]).map((d:any)=>(
              <li key={d.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{d.name}</span>
                <a className="underline text-xs" href={ensureProjectPath(`/docs/${d.id}`)}>Open</a>
              </li>
            ))}
            {!rec.docs?.length && <li className="opacity-70 text-sm">No documents yet.</li>}
          </ul>
        </Section>

        <Section title="Latest Actions">
          <ul className="space-y-2">
            {(rec.actions||[]).map((a:any)=>(
              <li key={a.id} className="text-sm flex items-center justify-between">
                <span className="truncate">{a.title}</span>
                <span className="text-xs opacity-70">{a.status}</span>
              </li>
            ))}
            {!rec.actions?.length && <li className="opacity-70 text-sm">No actions yet.</li>}
          </ul>
        </Section>

        <Section title="Upcoming Timeline">
          <ul className="space-y-2">
            {(rec.events||[]).map((e:any)=>(
              <li key={e.id} className="text-sm flex items-center justify-between">
                <span className="truncate">{e.title}</span>
                <span className="text-xs opacity-70">{e.type}</span>
              </li>
            ))}
            {!rec.events?.length && <li className="opacity-70 text-sm">No events yet.</li>}
          </ul>
        </Section>
    </div>
  );
}
