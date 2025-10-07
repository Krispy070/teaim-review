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
    try {
      const userResult = await db.execute(
        sql`select pref_value from user_preferences where project_id=${pid} and user_email=${email.toLowerCase()} and pref_key='plan_owner_me_default'`
      );
      const userRows = (userResult as any).rows || userResult || [];
      const row = userRows[0];
      if (row?.pref_value != null) {
        try {
          const parsed = typeof row.pref_value === 'string' ? JSON.parse(row.pref_value) : row.pref_value;
          user = !!parsed;
        } catch {
          user = !!row.pref_value;
        }
      }
    } catch (err) {
      // Gracefully handle missing table in development
      console.log('user_preferences table not available, using defaults');
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
    try {
      if (typeof userDefault === "boolean"){
        const valueJson = JSON.stringify(userDefault);
        await db.execute(
          sql`insert into user_preferences (project_id, user_email, pref_key, pref_value, updated_at)
           values (${projectId}, ${emailLower}, 'plan_owner_me_default', ${valueJson}, now())
           on conflict (project_id, user_email, pref_key) do update set pref_value=${valueJson}, updated_at=now()`
        );
      } else if (userDefault === null){
        await db.execute(
          sql`delete from user_preferences where project_id=${projectId} and user_email=${emailLower} and pref_key='plan_owner_me_default'`
        );
      }
    } catch (err) {
      // Gracefully handle missing table in development
      console.log('user_preferences table not available, skipping user pref save');
    }
  }
  res.json({ ok:true });
});

export default pp;
