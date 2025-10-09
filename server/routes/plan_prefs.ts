import { Router } from "express";
import { pool } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const pp = Router();

/* GET /api/plan/prefs?projectId=  => { projectDefault:boolean, userDefault:boolean|null } */
pp.get("/", requireProject("member"), async (req:any, res)=>{
  const pid = String(req.query.projectId||"");
  const email = (req.user && (req.user.email || req.user.user_metadata?.email)) || null;

  try {
    const projResult = await pool.query(
      `select coalesce(plan_owner_me_default,false) as def from project_settings where project_id=$1`, [pid]
    );
    const projRows = projResult.rows || [];
    const proj = projRows[0]?.def ?? false;

    let user:boolean|null = null;
    if (email){
      const userResult = await pool.query(
        `select value from user_prefs where project_id=$1 and user_email=$2 and key='plan_owner_me_default'`,
        [pid, email.toLowerCase()]
      );
      const userRows = userResult.rows || [];
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
  } catch (err: any) {
    // Handle missing table gracefully
    if (err.code === '42P01') { // relation does not exist
      res.json({ ok:true, projectDefault: false, userDefault: null });
    } else {
      throw err;
    }
  }
});

/* POST /api/plan/prefs  { projectId, projectDefault?, userDefault? } */
pp.post("/", requireProject("member"), async (req:any, res)=>{
  const { projectId, projectDefault, userDefault } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId" });

  try {
    // project-level
    if (typeof projectDefault === "boolean"){
      await pool.query(
        `insert into project_settings (project_id, plan_owner_me_default)
         values ($1, $2)
         on conflict (project_id) do update set plan_owner_me_default=$2, updated_at=now()`,
        [projectId, projectDefault]
      );
    }

    // user-level
    const email = (req.user && (req.user.email || req.user.user_metadata?.email)) || null;
    if (email){
      const emailLower = email.toLowerCase();
      if (typeof userDefault === "boolean"){
        const valueJson = JSON.stringify(userDefault);
        await pool.query(
          `insert into user_prefs (project_id, user_email, key, value, updated_at)
           values ($1, $2, 'plan_owner_me_default', $3, now())
           on conflict (project_id, user_email, key) do update set value=$3, updated_at=now()`,
          [projectId, emailLower, valueJson]
        );
      } else if (userDefault === null){
        await pool.query(
          `delete from user_prefs where project_id=$1 and user_email=$2 and key='plan_owner_me_default'`,
          [projectId, emailLower]
        );
      }
    }
    res.json({ ok:true });
  } catch (err: any) {
    // Handle missing table gracefully
    if (err.code === '42P01') { // relation does not exist
      res.json({ ok:true });
    } else {
      throw err;
    }
  }
});

export default pp;
