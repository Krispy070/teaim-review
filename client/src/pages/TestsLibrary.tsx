import * as React from "react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRuns, createRun, TestRun } from "../lib/runs";
import { kapmemSave } from "../lib/kapmem";

type TestRow = {
  id:string; projectId:string; areaKey?:string; bpCode?:string;
  title:string; version:number; priority:"P0"|"P1"|"P2"|"P3";
  type:"happy"|"edge"|"negative"|"regression"; tags:string[]; createdAt:string;
};

export default function TestsLibrary({ projectId }: { projectId:string }) {
  const [q, setQ] = React.useState(""); const [areaKey, setArea] = React.useState("");
  const [bpCode, setBp] = React.useState(""); const [priority, setPri] = React.useState("");
  const [type, setType] = React.useState("");
  const [focusId, setFocus] = React.useState<string|null>(null);

  const qs = new URLSearchParams({ projectId });
  if (q) qs.set("q", q); if (areaKey) qs.set("areaKey", areaKey);
  if (bpCode) qs.set("bpCode", bpCode); if (priority) qs.set("priority", priority);
  if (type) qs.set("type", type);

  const { data, isLoading } = useQuery({ 
    queryKey: ["tests-lib", projectId, q, areaKey, bpCode, priority, type], 
    queryFn: async () => {
      const r = await fetch(`/api/tests?${qs.toString()}`); 
      return r.json();
    }, 
    staleTime: 10000 
  });

  const items: TestRow[] = data?.items ?? [];
  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="card p-4 mb-4">
        <div className="grid grid-cols-5 gap-3">
          <input 
            placeholder="Search title/BP…" 
            className="k-input" 
            value={q} 
            onChange={e=>setQ(e.target.value)}
            data-testid="input-search"
          />
          <input 
            placeholder="Area (HCM/FIN…)" 
            className="k-input" 
            value={areaKey} 
            onChange={e=>setArea(e.target.value)}
            data-testid="input-area"
          />
          <input 
            placeholder="BP Code" 
            className="k-input" 
            value={bpCode} 
            onChange={e=>setBp(e.target.value)}
            data-testid="input-bp-code"
          />
          <select 
            className="k-input" 
            value={priority} 
            onChange={e=>setPri(e.target.value)}
            data-testid="select-priority"
          >
            <option value="">Priority</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <select 
            className="k-input" 
            value={type} 
            onChange={e=>setType(e.target.value)}
            data-testid="select-type"
          >
            <option value="">Type</option>
            <option value="happy">happy</option>
            <option value="edge">edge</option>
            <option value="negative">negative</option>
            <option value="regression">regression</option>
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-auto">
        {isLoading ? (
          <div className="p-4" data-testid="loading-tests">Loading…</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="text-left py-2 px-3">Area</th>
                <th className="text-left py-2 px-3">BP</th>
                <th className="text-left py-2 px-3">Title</th>
                <th className="text-left py-2 px-3">Priority</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-left py-2 px-3">Version</th>
                <th className="py-2 px-3"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map(row=>(
                <tr key={row.id} className="border-t border-border" data-testid={`row-test-${row.id}`}>
                  <td className="py-2 px-3" data-testid={`text-area-${row.id}`}>{row.areaKey || "—"}</td>
                  <td className="py-2 px-3" data-testid={`text-bp-${row.id}`}>{row.bpCode || "—"}</td>
                  <td className="py-2 px-3" data-testid={`text-title-${row.id}`}>{row.title}</td>
                  <td className="py-2 px-3">
                    <span className="k-pill k-pill--gold" data-testid={`text-priority-${row.id}`}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="py-2 px-3" data-testid={`text-type-${row.id}`}>{row.type}</td>
                  <td className="py-2 px-3" data-testid={`text-version-${row.id}`}>{row.version}</td>
                  <td className="py-2 px-3 text-right">
                    <button 
                      className="k-btn" 
                      onClick={()=>setFocus(row.id)}
                      data-testid={`button-view-${row.id}`}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {items.length===0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-text-muted" data-testid="text-no-tests">
                    No tests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {focusId && <TestViewer projectId={projectId} id={focusId} onClose={()=>setFocus(null)} />}
    </div>
  );
}

function RunSection({ testId }: { testId: string }) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [result, setResult] = useState<"pass"|"fail"|"blocked">("pass");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState("");

  const refresh = async () => {
    try { setRuns(await listRuns(testId)); }
    catch (e:any) { setErr(e.message || String(e)); }
  };
  useEffect(() => { void refresh(); }, [testId]);

  const submit = async () => {
    if (saving) return;
    setErr(""); setAck("");
    setSaving(true);
    try {
      await createRun({ test_id: testId, result, notes });
      try {
        await kapmemSave(
          `Run: ${result.toUpperCase()} for test ${testId}\nNotes: ${notes}`,
          { source: "TestRun", project: "TEAIM", kind: "run", tags: result }
        );
      } catch {}

      setNotes(""); setResult("pass");
      await refresh();
      setAck("Saved");
      window.dispatchEvent(new CustomEvent("runs:changed"));
      setTimeout(() => setAck(""), 1200);
    } catch (e:any) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{borderTop:"1px solid #eee", marginTop:8, paddingTop:8}}>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
        <select disabled={saving} value={result} onChange={e=>setResult(e.target.value as any)}>
          <option value="pass">pass</option>
          <option value="fail">fail</option>
          <option value="blocked">blocked</option>
        </select>
        <input
          disabled={saving}
          placeholder="notes (optional)"
          value={notes}
          onChange={e=>setNotes(e.target.value)}
          style={{flex:1}}
        />
        <button disabled={saving} onClick={submit}>
          {saving ? "Running…" : "Run Test"}
        </button>
        {ack && <span style={{fontSize:12, opacity:.8}}>{ack}</span>}
      </div>
      {err && <div style={{color:"crimson"}}>{err}</div>}
      {runs.length>0 && (
        <div style={{fontSize:12, opacity:.9}}>
          <div style={{fontWeight:600, marginBottom:4}}>Recent Runs</div>
          <div style={{display:"grid", gap:4}}>
            {runs.map(run=>(
              <div key={run.id} style={{display:"flex", justifyContent:"space-between"}}>
                <div>{new Date(run.created_at!).toLocaleString()}</div>
                <div style={{textTransform:"uppercase"}}>{run.result}</div>
                <div style={{flex:1, marginLeft:8, opacity:.8}}>{run.notes}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TestViewer({ projectId, id, onClose }:{ projectId:string; id:string; onClose:()=>void }) {
  const { data } = useQuery({ 
    queryKey: ["test", id], 
    queryFn: async () => {
      const r = await fetch(`/api/tests/${id}?projectId=${projectId}`); 
      return r.json();
    }
  });
  const { data: hist } = useQuery({ 
    queryKey: ["test-hist", id], 
    queryFn: async () => {
      const r = await fetch(`/api/tests/${id}/history?projectId=${projectId}`); 
      return r.json();
    }
  });

  const t = data?.item;
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" data-testid="modal-test-viewer">
      <div className="card p-4 w-[900px] max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-2">
          <h3 className="card__title" data-testid="text-test-title">
            {t?.title} <span className="text-text-muted ml-2">v{t?.version}</span>
          </h3>
          <button 
            className="k-btn" 
            onClick={onClose}
            data-testid="button-close-viewer"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-text-muted mb-1">Gherkin</h4>
            <pre className="whitespace-pre-wrap text-sm" data-testid="text-gherkin">
              {t?.gherkin}
            </pre>
            <h4 className="text-text-muted mt-3 mb-1">Steps</h4>
            <ol className="list-decimal pl-5 text-sm" data-testid="list-steps">
              {(t?.steps||[]).map((s:string,i:number)=><li key={i}>{s}</li>)}
            </ol>
          </div>
          <div>
            <h4 className="text-text-muted mb-1">History</h4>
            <ul className="text-sm" data-testid="list-history">
              {(hist?.items||[]).map((h:any, i:number)=>(
                <li key={i} className="mb-2">
                  <div className="text-text-soft">v{h.version} — {new Date(h.committedAt).toLocaleString()}</div>
                  <details>
                    <summary className="cursor-pointer">Diff</summary>
                    <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(h.diff, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <RunSection testId={id} />
      </div>
    </div>
  );
}