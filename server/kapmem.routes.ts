import { Router } from "express";

const r = Router();
const KURL = process.env.VITE_KAPMEM_URL || "";
const KTOKEN = process.env.VITE_KAPMEM_TOKEN || "";

r.post("/save", async (req, res) => {
  if (!KURL) return res.status(501).json({ error: "KapMem not configured" });
  try {
    const r2 = await fetch(`${KURL.replace(/\/$/, "")}/ingest/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(KTOKEN ? { "Authorization": `Bearer ${KTOKEN}` } : {})
      },
      body: JSON.stringify(req.body || [])
    });
    const text = await r2.text();
    if (!r2.ok) return res.status(r2.status).send(text);
    return res.type("application/json").send(text);
  } catch (e: any) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

export default r;
