import RecentMemory from "../components/RecentMemory";
import { supabase } from "../lib/supabase";
import { kapmemSave } from "../lib/kapmem";
import MemoryPanel from "../components/MemoryPanel";
import { useEffect, useState } from "react";
import { listRuns, createRun, TestRun } from "../lib/runs";
import { listTestCases, createTestCase, updateTestCase, deleteTestCase, TestCase } from "../lib/db";

function RunSection({ testId }: { testId: string }) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [result, setResult] = useState<"pass"|"fail"|"blocked">("pass");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  const refresh = async () => {
    try { setRuns(await listRuns(testId)); }
    catch (e:any) { setErr(e.message || String(e)); }
  };
  useEffect(() => { void refresh(); }, [testId]);

  const submit = async () => {
    setErr("");
    try {
      await createRun({ test_id: testId, result, notes });
      setNotes(""); setResult("pass");
      await refresh();
    } catch (e:any) { setErr(e.message || String(e)); }
  };

  return (
    <div style={{borderTop:"1px solid #eee", marginTop:8, paddingTop:8}}>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
        <select value={result} onChange={e=>setResult(e.target.value as any)}>
          <option value="pass">pass</option>
          <option value="fail">fail</option>
          <option value="blocked">blocked</option>
        </select>
        <input placeholder="notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} style={{flex:1}} />
        <button onClick={submit}>Run Test</button>
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


export default function TestLibrary() {
  const [rows, setRows] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Partial<TestCase>>({ project: "TEAIM", title: "", steps: "", expected: "", tags: "" });
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true); setError("");
    try { setRows(await listTestCases("TEAIM")); }
    catch (e: any) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const onCreate = async (e: any) => {
    e.preventDefault(); setError("");
    try {
      const payload = {
        project: "TEAIM",
        title: form.title?.trim()!,
        steps: form.steps?.trim()!,
        expected: form.expected?.trim()!,
        tags: form.tags?.toString() || ""
      };
      if (!payload.title || !payload.steps || !payload.expected) throw new Error("Title/steps/expected required");

      await createTestCase(payload);

      try {
        await kapmemSave(
          `Test: ${payload.title}\nSteps:\n${payload.steps}\nExpected:\n${payload.expected}\nTags: ${payload.tags}`,
          { source: "TestLibrary", project: "TEAIM", kind: "test", tags: payload.tags || "" }
        );
      } catch { /* KapMem offline? ignore for now */ }

      setForm({ project: "TEAIM", title: "", steps: "", expected: "", tags: "" });
      await refresh();
    } catch (e: any) { setError(e.message || String(e)); }
  };

  const onQuickEdit = async (id: string) => {
    const title = prompt("New title?"); if (!title) return;
    try { await updateTestCase(id, { title }); await refresh(); }
    catch (e: any) { alert(e.message || e); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this test case?")) return;
    try { await deleteTestCase(id); await refresh(); }
    catch (e: any) { alert(e.message || e); }
  };

const backfillToMemory = async () => {
  setError("");
  try {
    const { data, error } = await supabase
      .from("test_cases")
      .select("*")
      .eq("project","TEAIM")
      .limit(500);
    if (error) throw new Error(error.message);

    for (const t of data || []) {
      try {
        await kapmemSave(
          `Test: ${t.title}\nSteps:\n${t.steps}\nExpected:\n${t.expected}\nTags: ${t.tags||""}`,
          { source: "TestLibrary-backfill", project: "TEAIM", kind: "test", tags: t.tags || "" }
        );
      } catch { /* ignore single failures */ }
    }
  } catch (e:any) {
    setError(e.message || String(e));
  }
};



  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Test Library</h3>
        <button onClick={backfillToMemory}>Sync all tests → Memory</button>
      </div>

      <form onSubmit={onCreate} style={{ display: "grid", gap: 8, maxWidth: 800, marginBottom: 16 }}>
        <input placeholder="Title" value={form.title || ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        <textarea placeholder="Steps" rows={4} value={form.steps || ""} onChange={e => setForm(f => ({ ...f, steps: e.target.value }))} />
        <textarea placeholder="Expected result" rows={3} value={form.expected || ""} onChange={e => setForm(f => ({ ...f, expected: e.target.value }))} />
        <input placeholder="tags (comma separated)" value={form.tags || ""} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
        <button type="submit">Add Test</button>
        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </form>
{/* Auto-refresh: remount when list length changes */}
<div key={`recent-${rows.length}`}>
  <RecentMemory project="TEAIM" />
</div>

      {loading ? <div>Loading...</div> : (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map(r => (
            <div key={r.id} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b>{r.title}</b>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onQuickEdit(r.id!)}>Rename</button>
                  <button onClick={() => onDelete(r.id!)}>Delete</button>
                </div>
              </div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}><b>Steps:</b> {r.steps}</div>
<div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}><b>Expected:</b> {r.expected}</div>
{r.tags && <div style={{ marginTop: 4, opacity: .7 }}>tags: {r.tags}</div>}
<div style={{ opacity: .7, fontSize: 12, marginTop: 6 }}>Created: {new Date(r.created_at!).toLocaleString()}</div>

{/* --- Run Test --- */}
<RunSection testId={r.id!} />

            </div>
          ))}
          {rows.length === 0 && <div>No tests yet.</div>}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <MemoryPanel project="TEAIM" />
      </div>
    </div>
  );
}


