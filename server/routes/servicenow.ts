import { Router } from "express";
import { db } from "../db/client";
import fetch from "node-fetch";
import { requireProject } from "../auth/projectAccess";
import { readSecret } from "../lib/secretReader";
import { sql } from "drizzle-orm";

export const snow = Router();

snow.post("/push", requireProject("member"), async (req, res) => {
  const { projectId, ticketId } = req.body || {};
  if (!projectId || !ticketId) return res.status(400).json({ error: "projectId & ticketId" });

  const t = (await db.execute(sql`select title, description, external_key as "externalKey" from tickets where id = ${ticketId}`)).rows?.[0];
  if (!t) return res.status(404).json({ error: "ticket not found" });

  const base = await readSecret(projectId, "project", null, "SN_INSTANCE_URL");
  const user = await readSecret(projectId, "project", null, "SN_USER");
  const pass = await readSecret(projectId, "project", null, "SN_PASSWORD");
  if (!base || !user || !pass) return res.status(400).json({ error: "Missing SN_* secrets" });

  const url = `${base.replace(/\/+$/, "")}/api/now/table/incident${t.externalKey ? `/${encodeURIComponent(t.externalKey)}` : ""}`;
  const body = t.externalKey ? { short_description: t.title, description: t.description || "" } :
    { short_description: t.title, description: t.description || "", caller_id: user };
  const method = t.externalKey ? "PATCH" : "POST";
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({})) as any;
  if (!r.ok) return res.status(r.status).json({ error: "ServiceNow push failed", detail: j });

  const key = j?.result?.sys_id || t.externalKey || null;
  const extUrl = key ? `${base.replace(/\/+$/, "")}/nav_to.do?uri=incident.do?sys_id=${key}` : null;
  await db.execute(sql`update tickets set external_system = 'servicenow', external_key = ${key}, external_url = ${extUrl}, updated_at = now() where id = ${ticketId}`);
  res.json({ ok: true, externalKey: key, externalUrl: extUrl });
});

snow.get("/sync", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const tid = String(req.query.ticketId || "");
  const t = (await db.execute(sql`select external_key as "key" from tickets where id = ${tid}`)).rows?.[0];
  if (!t?.key) return res.status(400).json({ error: "ticket not pushed" });

  const base = await readSecret(pid, "project", null, "SN_INSTANCE_URL");
  const user = await readSecret(pid, "project", null, "SN_USER");
  const pass = await readSecret(pid, "project", null, "SN_PASSWORD");
  const url = `${base!.replace(/\/+$/, "")}/api/now/table/incident/${encodeURIComponent(t.key)}`;
  const r = await fetch(url, { headers: { Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") } });
  const j = await r.json().catch(() => ({})) as any;
  if (!r.ok) return res.status(r.status).json({ error: "ServiceNow sync failed", detail: j });

  const st = j?.result?.state;
  const pri = j?.result?.priority;
  const status = st == 2 ? "in_progress" : st == 6 ? "closed" : null;
  const priority = pri == 1 ? "critical" : pri == 2 ? "high" : pri == 3 ? "med" : pri == 4 ? "low" : null;
  
  if (status || priority) {
    let updateQuery = sql`update tickets set updated_at = now()`;
    if (status) updateQuery = sql`${updateQuery}, status = ${status}`;
    if (priority) updateQuery = sql`${updateQuery}, priority = ${priority}`;
    updateQuery = sql`${updateQuery} where id = ${tid}`;
    await db.execute(updateQuery);
  }
  
  res.json({ ok: true, data: j?.result || {} });
});
