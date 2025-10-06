import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const pp = Router();

/* GET /api/plan/prefs?projectId=  => { projectDefault:boolean, userDefault:boolean|null } */
pp.get("/", requireProject("member"), async (req:any, res)=>{
  const pid = String(req.query.projectId||"");
  const email = (req.user && (req.user.email || req.user.user_metadata?.email)) || null;

  const projResult = await db.execute(
    sql`select coalesce(plan_owner_me_default,false) as def from project_settings where project_id=${pid}`
  );
  const projRows = (projResult as any).rows || projResult || [];
  const proj = projRows[0]?.def ?? false;

  let user:boolean|null = null;
  if (email){
    const userResult = await db.execute(
      sql`select value from user_prefs where project_id=${pid} and user_email=${email.toLowerCase()} and key='plan_owner_me_default'`
    );
    const userRows = (userResult as any).rows || userResult || [];
    const row = userRows[0];
    if (row?.value != null) {
      try {
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        user = !!parsed;
      } catch {
        user = !!row.value;
      }
    }
  }
  res.json({ ok:true, projectDefault: !!proj, userDefault: user });
});

/* POST /api/plan/prefs  { projectId, projectDefault?, userDefault? } */
pp.post("/", requireProject("member"), async (req:any, res)=>{
  const { projectId, projectDefault, userDefault } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId" });

  // project-level
  if (typeof projectDefault === "boolean"){
    await db.execute(
      sql`insert into project_settings (project_id, plan_owner_me_default)
       values (${projectId}, ${projectDefault})
       on conflict (project_id) do update set plan_owner_me_default=${projectDefault}, updated_at=now()`
    );
  }

  // user-level
  const email = (req.user && (req.user.email || req.user.user_metadata?.email)) || null;
  if (email){
    const emailLower = email.toLowerCase();
    if (typeof userDefault === "boolean"){
      const valueJson = JSON.stringify(userDefault);
      await db.execute(
        sql`insert into user_prefs (project_id, user_email, key, value, updated_at)
         values (${projectId}, ${emailLower}, 'plan_owner_me_default', ${valueJson}, now())
         on conflict (project_id, user_email, key) do update set value=${valueJson}, updated_at=now()`
      );
    } else if (userDefault === null){
      await db.execute(
        sql`delete from user_prefs where project_id=${projectId} and user_email=${emailLower} and key='plan_owner_me_default'`
      );
    }
  }
  res.json({ ok:true });
});

export default pp;
