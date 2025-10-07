import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const r = Router();

// Use the same VITE_ env (Replit sets them). For prod you can also use server-only keys.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn("[tests.routes] Supabase env not set; test routes will fail.");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// Middleware to restrict test routes to development only
const devOnlyGuard = (req: any, res: any, next: any) => {
  if (process.env.DEV_AUTH !== '1' && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: "Test endpoints disabled in production" });
  }
  next();
};

r.use(devOnlyGuard);

// GET /api/tests/:id/runs  -> list runs for a test
r.get("/:id/runs", async (req, res) => {
  try {
    const testId = req.params.id;
    const { data, error } = await supabase
      .from("test_runs")
      .select("*")
      .eq("test_id", testId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ runs: data || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

// POST /api/tests/:id/runs  { result: 'pass'|'fail'|'blocked', notes?: string }
r.post("/:id/runs", async (req, res) => {
  try {
    const testId = req.params.id;
    const { result, notes } = req.body || {};
    if (!testId || !result) return res.status(400).json({ error: "testId and result required" });

    const { data, error } = await supabase
      .from("test_runs")
      .insert({ test_id: testId, result, notes })
      .select("*")
      .single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true, run: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

// GET /api/tests/stats?projectId=TEAIM  -> mini dashboard stats
r.get("/stats", async (req, res) => {
  try {
    const project = String(req.query.projectId || "TEAIM");
    const { data: tests, error: e1 } = await supabase
      .from("test_cases").select("id").eq("project", project);
    if (e1) return res.status(400).json({ error: e1.message });

    const ids = (tests || []).map(t => t.id);
    if (!ids.length) return res.json({ total: 0, pass: 0, fail: 0, blocked: 0 });

    const { data: runs, error: e2 } = await supabase
      .from("test_runs").select("*").in("test_id", ids);
    if (e2) return res.status(400).json({ error: e2.message });

    const latest: Record<string, any> = {};
    (runs || []).forEach(r => {
      const p = latest[r.test_id];
      if (!p || new Date(r.created_at) > new Date(p.created_at)) latest[r.test_id] = r;
    });
    const vals = Object.values(latest);
    const pass = vals.filter((r: any) => r.result === "pass").length;
    const fail = vals.filter((r: any) => r.result === "fail").length;
    const blocked = vals.filter((r: any) => r.result === "blocked").length;
    return res.json({ total: ids.length, pass, fail, blocked });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

export default r;
