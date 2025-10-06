import { useState } from "react";
import { useParams, useLocation } from "wouter";

type T = { name:string; run:()=>Promise<void>; result?:'ok'|'fail'; detail?:string };

function useResolvedProjectId(currentProject?: { id?: string }) {
  const [location] = useLocation();
  // 1) try current project state
  if (currentProject?.id) return currentProject.id;
  // 2) try URL: /projects/:projectId/...
  if (location) {
    const m = location.match(/\/projects\/([0-9a-f-]{36})\b/i);
    if (m) return m[1];
  }
  // 3) try global injected var (optional)
  // @ts-ignore
  if (window.__PID) return window.__PID as string;
  return "";
}

export default function TestRunner(){
  const { projectId: paramProjectId } = useParams();
  const currentProject = undefined; // Could be from context if available
  const projectId = useResolvedProjectId(currentProject) || paramProjectId;
  const [running,setRunning]=useState(false);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState<string|null>(null);
  const [log,setLog]=useState<string[]>([]);
  const [results,setResults]=useState<T[]>([]);
  const [seedLog,setSeedLog]=useState<string>("");

  function addLog(s:string){ setLog(l=>[...l, s]); }

  async function runAllTests() {
    const rs:T[]=[];
    for (const t of tests){
      try { await t.run(); rs.push({...t, result:'ok'}); addLog(`✅ ${t.name}`); }
      catch(e:any){ rs.push({...t, result:'fail', detail: e?.message || String(e)}); addLog(`❌ ${t.name}: ${e?.message||e}`); }
    }
    setResults(rs);
  }

  async function seed() {
    setBusy(true); 
    setErr(null);
    addLog("Seeding sample data…");

    if (!projectId) {
      setErr("Pick a project first — no projectId resolved.");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/admin/test/seed-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }) // <-- important
      });

      const raw = await res.text();
      let d: any;
      try { 
        d = raw ? JSON.parse(raw) : {}; 
      } catch (e:any) { 
        d = { ok:false, parseError:String(e), raw, status:res.status }; 
      }

      addLog(JSON.stringify(d));
      setSeedLog(JSON.stringify(d, null, 2));

      if (!res.ok || d?.ok === false) {
        setErr(`Seed endpoint error (HTTP ${res.status}). ${d?.error ?? d?.parseError ?? ""}`);
        return;
      }
      
      await runAllTests();
    } catch (e:any) {
      setErr(`Seed call failed: ${String(e)}`);
      addLog(`❌ Seed call failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const tests: T[] = [
    { name: "Areas summary_all", run: async()=> { const r=await fetch(`/api/areas/summary_all?project_id=${projectId}`,{credentials:"include"}); if(!r.ok) throw new Error("areas summary"); }},
    { name: "Workbooks metrics", run: async()=> { const r=await fetch(`/api/workbooks/metrics?project_id=${projectId}`,{credentials:"include"}); if(!r.ok) throw new Error("wb metrics"); }},
    { name: "Workbooks export CSV", run: async()=> { const r=await fetch(`/api/workbooks/export.csv?project_id=${projectId}`,{credentials:"include"}); if(!r.ok) throw new Error("wb export"); }},
    { name: "Digest preview HTML", run: async()=> { const r=await fetch(`/api/digest/preview?project_id=${projectId}&digest_type=weekly`,{credentials:"include"}); if(!r.ok) throw new Error("digest preview"); }},
    { name: "Area export ZIP (HCM)", run: async()=> { const r=await fetch(`/api/area/export.zip?project_id=${projectId}&area=HCM`,{credentials:"include"}); if(!r.ok) throw new Error("area zip"); }},
    { name: "Notifications unseen count", run: async()=> { const r=await fetch(`/api/notifications/list?project_id=${projectId}`,{credentials:"include"}); if(!r.ok) throw new Error("notify count"); const data=await r.json(); if(!data.items || !Array.isArray(data.items)) throw new Error("invalid response"); }},
    { name: "Releases ICS", run: async()=> { const now=new Date(); const y=now.getFullYear(); const m=String(now.getMonth()+1).padStart(2,'0'); const r=await fetch(`/api/releases/month.ics?project_id=${projectId}&year=${y}&month=${m}`,{credentials:"include"}); if(!r.ok) throw new Error("ICS"); }},
    // Negative: invalid signoff token shows 404/invalid page (public path)
    { name: "Sign-off invalid token (negative)", run: async()=> {
      const r=await fetch(`/signoff/doc/invalid-token`,{credentials:"include"});
      if (r.status===200){ const html=await r.text(); if(!/Invalid Token|Not Found|invalid/i.test(html)) throw new Error("expected invalid"); }
    }},
  ];

  async function runAll(){
    setRunning(true); setResults([]); setLog([]); setSeedLog(""); setErr(null);
    try {
      await seed();
    } finally { setRunning(false); }
  }

  // guard UI
  const canSeed = Boolean(projectId);
  const okCount = results.filter(r=>r.result==='ok').length;

  return (
    <div className="brand-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Staging Test Runner</div>
        <button 
          className="brand-btn text-xs" 
          onClick={runAll} 
          disabled={!canSeed || running || busy} 
          aria-busy={running || busy ? "true" : "false"}
          data-testid="button-seed-run"
        >
          {running || busy ? "Seeding…" : "Seed & Run"}
        </button>
      </div>
      {!canSeed && <div className="mt-2 text-[13px] text-amber-300">No project detected in URL or context.</div>}
      {err && <div className="mt-2 text-[13px] text-red-400">{err}</div>}
      <div className="text-xs text-muted-foreground">Project: {projectId}</div>
      <div className="text-xs">
        {results.map((r,i)=> <div key={i} className={r.result==='ok'?'text-emerald-600':'text-red-500'}>{r.result==='ok'?'✅':'❌'} {r.name}{r.detail?`: ${r.detail}`:''}</div>)}
        {!results.length && <div className="text-muted-foreground">Click "Seed & Run".</div>}
      </div>
      <div className="text-xs">
        {results.length? <>Passed: {okCount}/{results.length}</> : null}
      </div>
      <div className="text-[11px] whitespace-pre-wrap bg-white/5 p-2 rounded border">
        {log.join("\n")}
      </div>
      {seedLog && (
        <div className="text-[11px] whitespace-pre-wrap bg-green-900/20 p-2 rounded border border-green-500/20">
          <div className="text-green-400 font-medium mb-1">Seed Response (v2):</div>
          {seedLog}
        </div>
      )}
    </div>
  );
}