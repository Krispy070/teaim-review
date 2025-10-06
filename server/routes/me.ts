import { Router } from "express";
export const me = Router();

/* GET /api/me */
me.get("/", (req:any, res)=>{
  const u = req.user || {};
  const email = u.email || u.user_metadata?.email || null;
  const name  = u.user_metadata?.full_name || u.user_metadata?.name || null;

  const roles = (u.app_metadata?.roles || u.user_metadata?.roles || []);
  const isAdmin = !!(u.role === "admin" || roles.includes?.("admin"));

  res.json({ ok:true, email, name, isAdmin });
});

export default me;
