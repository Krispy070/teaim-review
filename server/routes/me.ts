import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const me = Router();

/* GET /api/me?projectId= */
me.get("/", async (req:any, res)=>{
  const u = req.user || {};
  const email = u.email || u.user_metadata?.email || null;
  const name  = u.user_metadata?.full_name || u.user_metadata?.name || null;

  const roles = (u.app_metadata?.roles || u.user_metadata?.roles || []);
  const isAdmin = !!(u.role === "admin" || roles.includes?.("admin"));

  let projectRole = null;
  const projectId = String(req.query.projectId || "");
  const userId = u.id || null;
  
  if (projectId && userId) {
    const result = (await db.execute(sql`
      select role from project_members 
      where project_id=${projectId} and user_id=${userId}
      limit 1
    `)).rows;
    
    if (result.length > 0) {
      projectRole = result[0].role;
    }
  }

  res.json({ ok:true, email, name, isAdmin, projectRole });
});

export default me;
