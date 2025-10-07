import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

const s = Router();
/* GET /api/search/quick?projectId=&q=  -> groups: plan, tests, tickets, docs (max 8 each) */
s.get("/quick", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const q   = "%"+String(req.query.q||"").toLowerCase()+"%";

  const plan = (await db.execute(sql`
    select id, title from plan_tasks 
    where project_id=${pid} and lower(title) like ${q} 
    order by created_at desc limit 8
  `)).rows;

  const tests = (await db.execute(sql`
    select id, title from test_cases 
    where project_id=${pid} and lower(title) like ${q} 
    order by created_at desc limit 8
  `)).rows;

  const tickets = (await db.execute(sql`
    select id, title from tickets 
    where project_id=${pid} and lower(title) like ${q} 
    order by created_at desc limit 8
  `)).rows;

  const docs = (await db.execute(sql`
    select id, coalesce(name,filename) as title from docs 
    where project_id=${pid} and deleted_at is null 
    and lower(coalesce(name,filename,'')) like ${q} 
    order by created_at desc limit 8
  `)).rows;

  res.json({ ok:true, groups:{ plan, tests, tickets, docs } });
});
export default s;
