import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const tsnap = Router();

// Build snapshot (tenants + as-of per tenant)
async function buildSnapshot(projectId:string) {
  const [t, a, m] = await Promise.all([
    db.execute(sql`select id, name, vendor, environment, base_url as "baseUrl", wd_short as "workdayShortName", notes from tenants where project_id=${projectId} order by environment,name`),
    db.execute(sql`select tenant_id as "tenantId", domain, max(asof) as asOf from asof_dates where project_id=${projectId} group by tenant_id, domain`),
    db.execute(sql`select tenant_id as "tenantId", name, type, start_at as "startAt", end_at as "endAt" from migrations where project_id=${projectId} order by start_at`),
  ]);
  const tenants = t.rows||[];
  const asof = (a.rows||[]) as any[];
  const migs = (m.rows||[]) as any[];
  const byTenant:any = {};
  asof.forEach(r=>{ byTenant[r.tenantId] = byTenant[r.tenantId] || { domains:{} }; byTenant[r.tenantId].domains[r.domain] = r.asOf; });
  return {
    ts: new Date().toISOString(),
    tenants: tenants.map((t:any)=>({ ...t, asOf: byTenant[t.id]?.domains || {} })),
    migrations: migs
  };
}

// List
tsnap.get("/list", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(sql`select id, name, created_at as "createdAt" from tenant_snapshots where project_id=${pid} order by created_at desc`);
  res.json({ ok:true, items: rows||[] });
});

// Create
tsnap.post("/create", requireProject("member"), async (req,res)=>{
  const { projectId, name } = req.body||{};
  if (!projectId || !name) return res.status(400).json({ error:"projectId & name required" });
  const snap = await buildSnapshot(projectId);
  const { rows } = await db.execute(sql`insert into tenant_snapshots (project_id, name, data) values (${projectId},${name},${snap}) returning id`);
  res.json({ ok:true, id: rows?.[0]?.id });
});

// Get
tsnap.get("/:id", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { rows } = await db.execute(sql`select id, name, data, created_at as "createdAt" from tenant_snapshots where id=${id}`);
  res.json({ ok:true, snapshot: rows?.[0] || null });
});

// Diff vs live
tsnap.get("/:id/diff-live", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { rows } = await db.execute(sql`select project_id as "projectId", data from tenant_snapshots where id=${id}`);
  const snap = rows?.[0] as any; if (!snap) return res.status(404).json({ error:"snapshot not found" });
  const live = await buildSnapshot(String(snap.projectId));
  const snapData = snap.data as any;

  // Build domain delta per tenant name (match by name+environment)
  const mapSnap:any = {}; (snapData.tenants||[]).forEach((t:any)=> mapSnap[`${t.name}|${t.environment}`] = t.asOf || {});
  const mapLive:any = {}; (live.tenants||[]).forEach((t:any)=> mapLive[`${t.name}|${t.environment}`] = t.asOf || {});
  const keys = Array.from(new Set([...Object.keys(mapSnap), ...Object.keys(mapLive)]));

  const rowsOut = keys.map(k=>{
    const left = mapSnap[k] || {};
    const right= mapLive[k] || {};
    const domains = Array.from(new Set([...Object.keys(left), ...Object.keys(right)]));
    return {
      tenantKey: k,
      domains: domains.map(d=>{
        const l = left[d] ? new Date(left[d]) : null;
        const r = right[d]? new Date(right[d]) : null;
        let deltaDays:any = null;
        if (l && r) deltaDays = Math.round((l.getTime() - r.getTime())/(24*3600*1000));
        return { domain:d, snapshot:left[d]||null, live:right[d]||null, deltaDays };
      })
    };
  });

  res.json({ ok:true, createdAt: (snapData.ts||null), rows: rowsOut });
});
