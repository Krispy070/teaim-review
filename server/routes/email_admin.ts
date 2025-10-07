import { Router } from "express";
import { pool } from "../db/client";
import { assertProjectAccess } from "../auth/projectAccess";

export const emailAdmin = Router();

emailAdmin.get("/metrics", async (req, res) => {
  const pid = String(req.query.projectId||"");
  if (!pid) return res.status(400).json({ error: "projectId required" });
  
  await assertProjectAccess(req, pid, "member");
  
  const days = Math.min(90, Math.max(1, Number(req.query.days||"7")));
  
  const evResult = await pool.query(
    `select status, count(*)::int as n
       from email_events
      where project_id=$1
        and created_at >= now() - ($2 || ' days')::interval
      group by status`,
    [pid, String(days)]
  );

  const recentResult = await pool.query(
    `select to_email as "to", status, reason, created_at as "at"
       from email_events
      where project_id=$1
      order by created_at desc
      limit 50`,
    [pid]
  );

  res.json({ ok:true, stats: evResult.rows || [], recent: recentResult.rows || [] });
});

emailAdmin.get("/suppressions", async (req, res) => {
  const pid = String(req.query.projectId||"");
  if (!pid) return res.status(400).json({ error: "projectId required" });
  
  await assertProjectAccess(req, pid, "admin");
  
  const result = await pool.query(
    `select email, reason, source, active, created_at as "createdAt", updated_at as "updatedAt"
       from email_suppressions order by updated_at desc limit 1000`,
    []
  );
  res.json({ ok:true, items: result.rows || [] });
});

emailAdmin.post("/suppressions/add", async (req, res) => {
  const { email, reason="manual", projectId } = req.body||{};
  if (!email) return res.status(400).json({ error:"email required" });
  if (!projectId) return res.status(400).json({ error:"projectId required" });
  
  await assertProjectAccess(req, projectId, "admin");
  
  await pool.query(
    `insert into email_suppressions (email, reason, source, active, updated_at)
     values ($1,$2,'manual',true,now())
     on conflict (email) do update set active=true, reason=$2, source='manual', updated_at=now()`,
    [email, reason]
  );
  res.json({ ok:true });
});

emailAdmin.post("/suppressions/remove", async (req, res) => {
  const { email, projectId } = req.body||{};
  if (!email) return res.status(400).json({ error:"email required" });
  if (!projectId) return res.status(400).json({ error:"projectId required" });
  
  await assertProjectAccess(req, projectId, "admin");
  
  await pool.query(
    `update email_suppressions set active=false, updated_at=now() where email=$1`,
    [email]
  );
  res.json({ ok:true });
});

emailAdmin.get("/metrics/gauge", async (req,res)=>{
  const pid = String(req.query.projectId||"");
  if (!pid) return res.status(400).json({ error: "projectId required" });
  
  await assertProjectAccess(req, pid, "member");
  
  const days = Math.min(90, Math.max(1, Number(req.query.days||"7")));

  const overall = (await pool.query(
    `select
        sum(case when status='sent'       then 1 else 0 end)::int as attempted,
        sum(case when status='delivered'  then 1 else 0 end)::int as delivered,
        sum(case when status='bounced'    then 1 else 0 end)::int as bounced,
        sum(case when status='complained' then 1 else 0 end)::int as complained,
        sum(case when status='failed'     then 1 else 0 end)::int as failed,
        sum(case when status='suppressed' then 1 else 0 end)::int as suppressed
       from email_events
      where (project_id is null or project_id=$1)
        and created_at >= now() - ($2 || ' days')::interval`,
    [pid, String(days)]
  )).rows?.[0] || { attempted:0, delivered:0, bounced:0, complained:0, failed:0, suppressed:0 };

  const byCat = (await pool.query(
    `select category,
            sum(case when status='sent'       then 1 else 0 end)::int as attempted,
            sum(case when status='delivered'  then 1 else 0 end)::int as delivered,
            sum(case when status='bounced'    then 1 else 0 end)::int as bounced,
            sum(case when status='complained' then 1 else 0 end)::int as complained
       from email_events
      where (project_id is null or project_id=$1)
        and created_at >= now() - ($2 || ' days')::interval
      group by category
      order by category`,
    [pid, String(days)]
  )).rows || [];

  const attempted = overall.attempted || 0;
  const bad = (overall.bounced||0) + (overall.complained||0);
  const bounceRate = attempted ? (bad / attempted) : 0;

  res.json({ ok:true, attempted, delivered: overall.delivered||0, bounced: overall.bounced||0,
             complained:overall.complained||0, failed: overall.failed||0, suppressed: overall.suppressed||0,
             bounceRate, byCategory: byCat });
});

export default emailAdmin;
