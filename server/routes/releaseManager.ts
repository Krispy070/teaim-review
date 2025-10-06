import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import OpenAI from "openai";
import fetch from "node-fetch";

export const relMgr = Router();
const upload = multer();
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function postMessage(projectId: string, category: string, text: string) {
  const row = (await db.execute(
    sql`select slack_webhook_id as "whId" from project_channels where project_id=${projectId} and category=${category} limit 1`
  )).rows?.[0] as any;
  
  if (row?.whId) {
    const whRow = (await db.execute(sql`select url from webhooks where id=${String(row.whId)}`)).rows?.[0] as any;
    if (whRow?.url) {
      await fetch(whRow.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
    }
  }
}

function detectModule(s:string){
  const x = (s||"").toLowerCase();
  if (/payroll/.test(x)) return "Payroll";
  if (/\b(absence|leave)\b/.test(x)) return "Absence";
  if (/\b(time|time\-tracking)\b/.test(x)) return "Time";
  if (/\bbenefit(s)?\b/.test(x)) return "Benefits";
  if (/\b(fin(ance)?|gl|ap|ar)\b/.test(x)) return "FIN";
  if (/\bsecurity|role(s)?\b/.test(x)) return "Security";
  if (/\bintegration(s)?|interface(s)?\b/.test(x)) return "Integrations";
  if (/\bhcm|core hr|workday platform\b/.test(x)) return "HCM";
  return "Custom";
}

/* List releases */
// GET /api/release-manager?projectId=
relMgr.get("/", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const rows = (await db.execute(
    sql`select id, code, year, title, imported_at as "importedAt", status
       from release_imports where project_id=${pid} and release_id is null order by imported_at desc`
  )).rows || [];
  res.json({ ok:true, items: rows });
});

/* Import release Excel */
// POST /api/release-manager/import  (form-data: file) body { projectId, code, year }
relMgr.post("/import", requireProject("member"), upload.single("file"), async (req,res)=>{
  const { projectId, code="R1", year=new Date().getUTCFullYear(), title=null } = req.body||{};
  if (!projectId || !req.file) return res.status(400).json({ error:"projectId & file required" });

  const ins = await db.execute(
    sql`insert into release_imports (project_id, code, year, title, status) values (${projectId},${code},${Number(year)},${title},'imported') returning id`
  );
  const relId = ins.rows?.[0]?.id;

  const wb = XLSX.read(req.file.buffer, { type:"buffer" });
  let total=0;
  for (const name of wb.SheetNames){
    const data = XLSX.utils.sheet_to_json<any>(wb.Sheets[name], { defval:"" });
    if (!data.length) continue;
    await db.execute(sql`insert into release_imports (release_id, filename, sheet, rows) values (${relId},${req.file.originalname},${name},${data.length})`);
    for (const row of data){
      const area = String(row["Area"]||row["Feature"]||row["Topic"]||"").trim();
      const change = String(row["Change"]||row["Description"]||row["Notes"]||"").trim();
      if (!area && !change) continue;
      await db.execute(
        sql`insert into release_changes (release_id, module, area, change_desc) values (${relId},${detectModule(area+" "+change)},${area||null},${change})`
      );
      total++;
    }
  }
  res.json({ ok:true, releaseId: relId, changes: total });
});

/* Analyze impact (AI) */
// POST /api/release-manager/:id/analyze { projectId }
relMgr.post("/:id/analyze", requireProject("member"), async (req,res)=>{
  const rid = String(req.params.id||""); const { projectId } = req.body||{};
  if (!projectId || !rid) return res.status(400).json({ error:"projectId & releaseId" });

  const ch = (await db.execute(
    sql`select id, module, area, change_desc from release_changes where release_id=${rid} limit 400`
  )).rows || [];
  const cfg = (await db.execute(
    sql`select module, key, value from config_entries where project_id=${projectId} limit 400`
  )).rows || [];

  const sys = `You are a Workday release impact analyst. For each release change, rate risk 1-100 and describe potential impacts in context of current configuration entries. Return strict JSON: [{"id": "...","risk": <1-100>,"impact": "<text>"}]. Keep impact brief.`;
  const usr = `Release changes:\n${ch.slice(0,200).map((c:any)=>`ID:${c.id} | Module:${c.module} | ${c.area} -> ${c.change_desc}`).join("\n")}\n\nConfig snapshot:\n${cfg.slice(0,200).map((x:any)=>`${x.module}:${x.key}=${x.value}`).join("\n")}`;

  const r = await ai.chat.completions.create({
    model:"gpt-4o-mini",
    temperature:0.2,
    response_format:{ type:"json_object" },
    messages:[{role:"system", content:sys},{role:"user", content:usr}]
  });

  let out:any={ items:[] }; try{ out = JSON.parse(r.choices[0]?.message?.content || "{}"); }catch{}
  const items:any[] = Array.isArray(out.items) ? out.items : (Array.isArray(out) ? out : []);
  for (const it of items){
    await db.execute(sql`update release_changes set risk_score=coalesce(${Number(it.risk)||50},50), impact=coalesce(${it.impact||''},'') where id=${it.id}`);
  }
  await db.execute(sql`update release_imports set status='analyzed' where id=${rid}`);
  
  const rel = (await db.execute(sql`select code, year from release_imports where id=${rid}`)).rows?.[0] as any;
  await postMessage(projectId, "release", `✅ Release ${rel?.code} ${rel?.year} analyzed: ${items.length} items rated`).catch(() => {});
  
  res.json({ ok:true, updated: items.length });
});

/* Generate test pack */
// POST /api/release-manager/:id/testpack { projectId }
relMgr.post("/:id/testpack", requireProject("member"), async (req,res)=>{
  const rid = String(req.params.id||""); const { projectId } = req.body||{};
  if (!projectId || !rid) return res.status(400).json({ error:"projectId & releaseId" });

  const ch = (await db.execute(
    sql`select id, module, area, change_desc, risk_score from release_changes where release_id=${rid} order by risk_score desc limit 200`
  )).rows || [];

  let created=0;
  for (const c of ch){
    const cAny = c as any;
    const title = `[${cAny.module||"Module"}] Verify: ${cAny.area||""} — ${String(cAny.change_desc || "").slice(0,120)}`;
    await db.execute(
      sql`insert into release_test_cases (project_id, release_id, module, title, status)
       values (${projectId},${rid},${cAny.module||"Custom"},${title},'planned')`
    );
    created++;
  }
  await db.execute(sql`update release_imports set status='in_testing' where id=${rid}`);
  
  const rel = (await db.execute(sql`select code, year from release_imports where id=${rid}`)).rows?.[0] as any;
  await postMessage(projectId, "release", `🧪 Release ${rel?.code} ${rel?.year} test pack generated: ${created} test cases`).catch(() => {});
  
  res.json({ ok:true, created });
});

/* Create review brief + meeting */
// POST /api/release-manager/:id/review { projectId, whenISO?, link? }
relMgr.post("/:id/review", requireProject("member"), async (req,res)=>{
  const rid = String(req.params.id||""); const { projectId, whenISO=null, link=null } = req.body||{};
  if (!projectId || !rid) return res.status(400).json({ error:"projectId & releaseId" });

  // simple text brief
  const hi = (await db.execute(
    sql`select code, year from release_imports where id=${rid}`
  )).rows?.[0];
  const stats = (await db.execute(
    sql`select count(*)::int as n, sum(case when risk_score>=70 then 1 else 0 end)::int as hi
       from release_changes where release_id=${rid}`
  )).rows?.[0] || { n:0, hi:0 };
  const brief = `Release ${hi.code} ${hi.year} — ${stats.n} changes (${stats.hi} high risk)
Agenda:
1) High-risk modules overview
2) Proposed test pack
3) Owners & due windows
4) Decisions / open questions`;

  // create a Meeting row for tracking
  await db.execute(
    sql`insert into meetings (project_id, title, starts_at, link, attendees, source, transcript_text, summary)
     values (${projectId},${`Release Review: ${hi.code} ${hi.year}`},${whenISO||null},${link||null},${JSON.stringify([])},'release',null,${brief})`
  );
  await db.execute(sql`update release_imports set status='in_review' where id=${rid}`);
  
  await postMessage(projectId, "release", `📋 Release ${hi.code} ${hi.year} review meeting scheduled${link ? `: ${link}` : ""}`).catch(() => {});
  
  res.json({ ok:true, brief });
});

/* Get release test cases */
// GET /api/release-manager/:id/tests?projectId=&module=&status=&q=
relMgr.get("/:id/tests", requireProject("member"), async (req,res)=>{
  const rid = String(req.params.id||""); 
  const pid = String(req.query.projectId||"");
  const mod = String(req.query.module||"");
  const status = String(req.query.status||"");
  const q = String(req.query.q||"");
  
  if (!pid || !rid) return res.status(400).json({ error:"projectId & releaseId" });

  const rows = (await db.execute(sql`
    select id, module, title, owner, status, due_at as "dueAt" 
    from release_test_cases 
    where project_id=${pid} and release_id=${rid}
      ${mod ? sql`and module=${mod}` : sql``}
      ${status ? sql`and status=${status}` : sql``}
      ${q ? sql`and lower(title) like ${'%' + q.toLowerCase() + '%'}` : sql``}
    order by created_at desc limit 100
  `)).rows || [];
  
  res.json({ ok:true, items: rows });
});

/* Transcript to tests */
// POST /api/release-manager/:id/transcript-to-tests { projectId, transcript }
relMgr.post("/:id/transcript-to-tests", requireProject("member"), async (req,res)=>{
  const rid = String(req.params.id||""); const { projectId, transcript } = req.body||{};
  if (!projectId || !rid || !transcript) return res.status(400).json({ error:"projectId, releaseId, transcript" });

  const sys = `Extract test cases from this meeting transcript. Return strict JSON array: [{"module":"HCM|Payroll|...|Custom","title":"<test case>","owner":"<name or null>"}]. Keep titles concise.`;
  const r = await ai.chat.completions.create({
    model:"gpt-4o-mini",
    temperature:0.3,
    response_format:{ type:"json_object" },
    messages:[{role:"system", content:sys},{role:"user", content:transcript}]
  });

  let out:any={ items:[] }; try{ out = JSON.parse(r.choices[0]?.message?.content || "{}"); }catch{}
  const items:any[] = Array.isArray(out.items) ? out.items : (Array.isArray(out.tests) ? out.tests : (Array.isArray(out) ? out : []));
  
  let created=0;
  for (const t of items){
    await db.execute(
      sql`insert into release_test_cases (project_id, release_id, module, title, owner, status)
       values (${projectId},${rid},${t.module||"Custom"},${t.title||"Unnamed test"},${t.owner||null},'planned')`
    );
    created++;
  }
  
  res.json({ ok:true, created });
});

export default relMgr;
