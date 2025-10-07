import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { sql } from "drizzle-orm";

export const vault = Router();

function mask(s:string){ return s.length<=4 ? "●".repeat(s.length) : "●".repeat(s.length-4) + s.slice(-4); }

function getUser(req: any) {
  return req.user || null;
}

vault.get("/list", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const scope = String(req.query.scope||"");
  const refId = String(req.query.refId||"");
  const where = [`project_id=$1`]; const params:any=[pid];
  if (scope){ where.push(`scope=$${params.length+1}`); params.push(scope); }
  if (refId){ where.push(`ref_id=$${params.length+1}`); params.push(refId); }
  const { rows } = await db.execute(sql.raw(
    `select id, scope, ref_id as "refId", key_name as "keyName", created_by as "createdBy", rotated_at as "rotatedAt", created_at as "createdAt"
       from secrets where ${where.join(" and ")} order by created_at desc`
  ));
  res.json({ ok:true, items: rows||[] });
});

vault.post("/set", requireProject("member"), async (req,res)=>{
  const { projectId, scope, refId=null, keyName, value } = req.body||{};
  if (!projectId || !scope || !keyName || !value) return res.status(400).json({ error:"projectId, scope, keyName, value" });
  const ct = encryptSecret(String(value));
  const u = getUser(req)||{};
  const { rows } = await db.execute(sql.raw(
    `select id from secrets where project_id=$1 and scope=$2 and coalesce(ref_id::text,'')=coalesce($3,'') and key_name=$4 limit 1`
  ), [projectId, scope, refId, keyName] as any);
  if (rows?.length) {
    await db.execute(sql.raw(
      `update secrets set ciphertext=$1, rotated_at=now(), updated_at=now() where id=$2`
    ), [ct, rows[0].id] as any);
    return res.json({ ok:true, id: rows[0].id, rotated:true });
  } else {
    const ins = await db.execute(sql.raw(
      `insert into secrets (project_id, scope, ref_id, key_name, ciphertext, created_by) values ($1,$2,$3,$4,$5,$6) returning id`
    ), [projectId, scope, refId, keyName, ct, (u as any).email||null] as any);
    return res.json({ ok:true, id: ins.rows?.[0]?.id, rotated:false });
  }
});

vault.get("/reveal/:id", requireProject("admin"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { rows } = await db.execute(sql.raw(`select ciphertext from secrets where id=$1`), [id] as any);
  if (!rows?.length) return res.status(404).json({ error:"not found" });
  const val = decryptSecret(rows[0].ciphertext);
  res.json({ ok:true, value: val });
});

vault.delete("/:id", requireProject("admin"), async (req,res)=>{
  const id = String(req.params.id||"");
  await db.execute(sql.raw(`delete from secrets where id=$1`), [id] as any);
  res.json({ ok:true });
});
