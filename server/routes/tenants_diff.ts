import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const tdiff = Router();

/** GET /api/tenants/diff?projectId=&left=&right= */
tdiff.get("/", requireProject("member"), async (req, res) => {
  const pid  = String(req.query.projectId||"");
  const left = String(req.query.left||"");
  const right= String(req.query.right||"");
  if (!pid || !left || !right) return res.status(400).json({ error:"projectId, left, right required" });

  const tl = (await db.execute(
    sql`select id, name, vendor, environment, base_url as "baseUrl", wd_short as "workdayShortName", notes
       from tenants where project_id=${pid} and id=${left} limit 1`
  )).rows?.[0];
  const tr = (await db.execute(
    sql`select id, name, vendor, environment, base_url as "baseUrl", wd_short as "workdayShortName", notes
       from tenants where project_id=${pid} and id=${right} limit 1`
  )).rows?.[0];
  if (!tl || !tr) return res.status(404).json({ error:"tenant not found" });

  // As-of dates by domain
  const { rows: al } = await db.execute(
    sql`select domain, max(asof) as asof from asof_dates where project_id=${pid} and tenant_id=${left} group by domain`
  );
  const { rows: ar } = await db.execute(
    sql`select domain, max(asof) as asof from asof_dates where project_id=${pid} and tenant_id=${right} group by domain`
  );
  const mapL = Object.fromEntries(al.map((r:any)=>[r.domain, r.asof]));
  const mapR = Object.fromEntries(ar.map((r:any)=>[r.domain, r.asof]));
  const domains = Array.from(new Set([...Object.keys(mapL), ...Object.keys(mapR)])).sort();

  const domainDiff = domains.map(d=>{
    const l = mapL[d] ? new Date(mapL[d]) : null;
    const r = mapR[d] ? new Date(mapR[d]) : null;
    let deltaDays: number | null = null;
    if (l && r) deltaDays = Math.round((l.getTime() - r.getTime()) / (24*3600*1000));
    return { domain: d, left: mapL[d] || null, right: mapR[d] || null, deltaDays };
  });

  // Upcoming migrations overlap
  const { rows: ml } = await db.execute(
    sql`select id, name, type, start_at as "startAt", end_at as "endAt"
       from migrations where project_id=${pid} and tenant_id=${left} and (start_at >= now() - interval '30 days') order by start_at asc`
  );
  const { rows: mr } = await db.execute(
    sql`select id, name, type, start_at as "startAt", end_at as "endAt"
       from migrations where project_id=${pid} and tenant_id=${right} and (start_at >= now() - interval '30 days') order by start_at asc`
  );

  res.json({ ok:true, left: tl, right: tr, domainDiff, migrations: { left: ml||[], right: mr||[] } });
});
