import { Router } from "express";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { requireProjectId, ensureUUIDParam } from "../auth/guards";
import { asyncHandler } from "../middleware/errorHandler";
import { exec } from "../db/exec";
import { sql } from "drizzle-orm";
import { oneOf, clampInt } from "../lib/validate";
import { parseIntClamp } from "../lib/parse";
import { makeUploader } from "../lib/uploader";
import { csvSafe, setDownloadHeaders } from "../lib/csv";
import { config } from "../config";

export const off = Router();
const upload = makeUploader(config.uploadLimitMB);

/* GET /api/ma/cohorts/:id/offboarding/template.csv?projectId= */
off.get("/cohorts/:id/offboarding/template.csv", requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||"");
  const result = await db.execute(
    sql`select external_id as "externalId", name, email, org_unit as "orgUnit"
       from cohort_members where cohort_id=${cid} order by name`
  );
  const members = (result as any).rows || result || [];
  setDownloadHeaders(res, `cohort-${cid}-template.csv`);
  const header = ["external_id","name","email","org_unit","last_day(YYYY-MM-DD)","terminate_date(YYYY-MM-DD)","owner","status","notes"];
  const rows = members.map((m:any)=>[
    m.externalId||"", m.name||"", m.email||"", m.orgUnit||"", "", "", "", "", ""
  ]);
  res.send(
    [header.map(csvSafe).join(","), ...rows.map((r: any)=>r.map(csvSafe).join(","))].join("\r\n")
  );
});

/* POST /api/ma/cohorts/:id/offboarding/import  (form-data: file) body: { projectId } */
off.post("/cohorts/:id/offboarding/import", ensureUUIDParam("id"), requireProject("member"), requireProjectId(), upload.single("file"), asyncHandler(async (req,res)=>{
  const cid = String(req.params.id||""); const { projectId } = req.body||{};
  if (!projectId || !cid || !req.file) return res.status(400).json({ error:"projectId & file required" });

  // MIME guard (Fix Pack v238)
  const okMime = ["text/csv","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
  const nameOk = /\.csv$|\.xls$|\.xlsx$/i.test(req.file.originalname||"");
  if (!okMime.includes(req.file.mimetype) && !nameOk) {
    return res.status(400).json({ error:"unsupported file type" });
  }

  const wb = XLSX.read(req.file.buffer, { type:"buffer" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<any>(sh, { defval:"" });
  const MAX_ROWS = 10000; // safety cap (Fix Pack v238)
  let upserts=0;

  for (const r of data.slice(0, MAX_ROWS)){
    const row = {
      external_id: String(r["external_id"]||"").trim(),
      name:        String(r["name"]||"").trim(),
      email:       String(r["email"]||"").trim(),
      org_unit:    String(r["org_unit"]||"").trim(),
      last_day:    r["last_day(YYYY-MM-DD)"] ? new Date(String(r["last_day(YYYY-MM-DD)"])).toISOString() : null,
      terminate:   r["terminate_date(YYYY-MM-DD)"] ? new Date(String(r["terminate_date(YYYY-MM-DD)"])).toISOString() : null,
      owner:       String(r["owner"]||"").trim() || null,
      status:      String(r["status"]||"").trim().toLowerCase() || "planned",
      notes:       String(r["notes"]||"").trim() || null,
    };
    // Upsert by (cohort_id + external_id/email)
    const extId = row.external_id || null;
    const em = row.email || null;
    const existsResult = await db.execute(
      sql`select id from offboarding_rows where cohort_id=${cid} and (external_id=${extId} or (external_id is null and email=${em})) limit 1`
    );
    const exists = (existsResult as any).rows || existsResult || [];
    if (exists.length > 0){
      const existingId = exists[0].id;
      await db.execute(
        sql`update offboarding_rows set name=${row.name||null}, email=${row.email||null}, org_unit=${row.org_unit||null}, 
            last_day=${row.last_day}, terminate_date=${row.terminate},
            owner=${row.owner}, status=${row.status}, notes=${row.notes}, updated_at=now()
           where id=${existingId}`
      );
    } else {
      await db.execute(
        sql`insert into offboarding_rows (project_id, cohort_id, external_id, name, email, org_unit, last_day, terminate_date, owner, status, notes)
         values (${projectId}, ${cid}, ${row.external_id||null}, ${row.name||null}, ${row.email||null}, ${row.org_unit||null}, 
                 ${row.last_day}, ${row.terminate}, ${row.owner}, ${row.status}, ${row.notes})`
      );
    }
    upserts++;
  }

  res.json({ ok:true, upserts, capped: data.length > MAX_ROWS });
}));

/* GET /api/ma/cohorts/:id/offboarding?projectId= */
off.get("/cohorts/:id/offboarding", ensureUUIDParam("id"), requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||"");
  const result = await db.execute(
    sql`select id, external_id as "externalId", name, email, org_unit as "orgUnit",
            last_day as "lastDay", terminate_date as "terminateDate", owner, status, notes, updated_at as "updatedAt"
       from offboarding_rows where cohort_id=${cid} order by updated_at desc`
  );
  const rows = (result as any).rows || result || [];
  res.json({ ok:true, items: rows });
});

/* GET /api/ma/cohorts/:id/offboarding.csv?projectId= */
off.get("/cohorts/:id/offboarding.csv", requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||"");
  const result = await db.execute(
    sql`select external_id, name, email, org_unit, last_day, terminate_date, owner, status, notes
       from offboarding_rows where cohort_id=${cid} order by updated_at desc`
  );
  const rows = (result as any).rows || result || [];
  setDownloadHeaders(res, `cohort-${cid}-offboarding.csv`);
  const head = "external_id,name,email,org_unit,last_day,terminate_date,owner,status,notes";
  const out = rows.map((r:any)=>[
    r.external_id||"", r.name||"", r.email||"", r.org_unit||"", r.last_day||"", r.terminate_date||"",
    r.owner||"", r.status||"", r.notes||""
  ].map(csvSafe).join(","));
  res.send([head, ...out].join("\r\n"));
});

/* POST /api/ma/cohorts/:id/offboarding/upsert  { projectId, id, owner?, status?, notes?, lastDay?, terminateDate? } */
off.post("/cohorts/:id/offboarding/upsert", requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||"");
  const { projectId, id, owner=null, status=null, notes=null, lastDay=null, terminateDate=null } = req.body||{};
  if (!projectId || !id) return res.status(400).json({ error:"projectId & id" });

  const lastDayVal = lastDay ? (typeof lastDay === 'string' ? lastDay : new Date(lastDay).toISOString()) : null;
  const terminateDateVal = terminateDate ? (typeof terminateDate === 'string' ? terminateDate : new Date(terminateDate).toISOString()) : null;

  await db.execute(
    sql`update offboarding_rows
        set owner=coalesce(${owner},owner),
            status=coalesce(${status},status),
            notes=coalesce(${notes},notes),
            last_day=coalesce(${lastDayVal}::timestamp,last_day),
            terminate_date=coalesce(${terminateDateVal}::timestamp,terminate_date),
            updated_at=now()
      where id=${id} and cohort_id=${cid}`
  );
  res.json({ ok:true });
});

/* GET /api/ma/cohorts/:id/offboarding/summary?projectId=&soonDays=7 */
off.get("/cohorts/:id/offboarding/summary", requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||"");
  const soonDays = Math.min(60, Math.max(1, Number(req.query.soonDays||"7")));

  const byResult = await db.execute(
    sql`select status, count(*)::int as n
          from offboarding_rows
         where cohort_id=${cid}
      group by status`
  );
  const by = (byResult as any).rows || [];

  const get = (k:string)=> by.find((x:any)=> (x.status||"")===k)?.n || 0;

  const soonResult = await db.execute(
    sql`select count(*)::int as n
          from offboarding_rows
         where cohort_id=${cid}
           and status <> 'done'
           and coalesce(terminate_date, last_day) is not null
           and coalesce(terminate_date, last_day) between now() and now() + (${String(soonDays)} || ' days')::interval`
  );
  const soon = (soonResult as any).rows?.[0]?.n || 0;

  const overResult = await db.execute(
    sql`select count(*)::int as n
          from offboarding_rows
         where cohort_id=${cid}
           and status <> 'done'
           and coalesce(terminate_date, last_day) is not null
           and coalesce(terminate_date, last_day) < now()`
  );
  const over = (overResult as any).rows?.[0]?.n || 0;

  const totalResult = await db.execute(
    sql`select count(*)::int as n from offboarding_rows where cohort_id=${cid}`
  );
  const total = (totalResult as any).rows?.[0]?.n || 0;

  res.json({ ok:true,
    byStatus: {
      planned: get("planned"),
      in_progress: get("in_progress"),
      blocked: get("blocked"),
      done: get("done")
    },
    dueSoon: soon,
    overdue: over,
    total
  });
});

/* GET /api/ma/cohorts/offboarding/summaries?projectId=&soonDays=7
   Returns: { items:[{ cohortId, byStatus:{planned,in_progress,blocked,done}, dueSoon, overdue, total }] }
*/
off.get("/cohorts/offboarding/summaries", requireProject("member"), async (req,res)=>{
  const pid      = String(req.query.projectId||"");
  const soonDays = Math.min(60, Math.max(1, Number(req.query.soonDays||"7")));

  const { rows } = await db.execute(
    `select c.id as "cohortId",
            sum(case when o.status='planned'      then 1 else 0 end)::int as planned,
            sum(case when o.status='in_progress' then 1 else 0 end)::int as in_progress,
            sum(case when o.status='blocked'     then 1 else 0 end)::int as blocked,
            sum(case when o.status='done'        then 1 else 0 end)::int as done,
            sum(case when o.id is not null       then 1 else 0 end)::int as total,
            sum(case when o.status <> 'done' and coalesce(o.terminate_date, o.last_day) is not null
                      and coalesce(o.terminate_date, o.last_day) between now() and now() + ($2 || ' days')::interval
                     then 1 else 0 end)::int as "dueSoon",
            sum(case when o.status <> 'done' and coalesce(o.terminate_date, o.last_day) is not null
                      and coalesce(o.terminate_date, o.last_day) < now()
                     then 1 else 0 end)::int as "overdue"
       from cohorts c
  left join offboarding_rows o on o.cohort_id = c.id
      where c.project_id = $1
   group by c.id
   order by c.id`,
    [pid, String(soonDays)] as any
  );

  const items = (rows||[]).map((r:any)=>({
    cohortId: r.cohortId,
    byStatus: { planned: r.planned||0, in_progress: r.in_progress||0, blocked: r.blocked||0, done: r.done||0 },
    total: r.total||0, dueSoon: r.dueSoon||0, overdue: r.overdue||0
  }));
  res.json({ ok:true, items });
});

/* POST /api/ma/cohorts/:id/offboarding/post-summary  { projectId, category? } */
off.post("/cohorts/:id/offboarding/post-summary", requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||""); const { projectId, category="plan" } = req.body||{};
  if (!projectId || !cid) return res.status(400).json({ error:"projectId & cohortId" });

  const cohResult = await db.execute(sql`select name,type from cohorts where id=${cid}`);
  const coh = (cohResult as any).rows?.[0];
  const sumResult = await db.execute(
    sql`select status, count(*)::int as n from offboarding_rows where cohort_id=${cid} group by status`
  );
  const sum = (sumResult as any).rows || [];

  const line = (label:string)=> {
    const r = sum.find((x:any)=> (x.status||"")===label);
    return `${label||"planned"}: ${r?.n||0}`;
  };
  const body = [
    `Offboarding Summary — ${coh?.name||cid} (${coh?.type||"cohort"})`,
    line("planned"), line("in_progress"), line("blocked"), line("done")
  ].join("\n");

  await fetch(`http://localhost:${process.env.PORT||5000}/api/messaging/post`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ projectId, category, text: body })
  }).catch(()=>{});

  res.json({ ok:true });
});

/* POST /api/ma/cohorts/:id/offboarding/bulk
 * { projectId, ids:[uuid], set:{ owner?, status? } }
 */
off.post("/cohorts/:id/offboarding/bulk", requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||"");
  const { projectId, ids=[], set={} } = req.body||{};
  if (!projectId || !cid || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error:"projectId, cohortId, ids" });

  const cols:string[]=[]; const params:any[]=[];
  if (set.owner  !== undefined){ cols.push(`owner=$${params.length+1}`);  params.push(set.owner||null); }
  if (set.status !== undefined){ cols.push(`status=$${params.length+1}`); params.push(set.status); }
  if (!cols.length) return res.json({ ok:true, updated:0 });

  params.push(ids, cid);
  const r = await exec(
    `update offboarding_rows set ${cols.join(", ")}, updated_at=now() where id = any($${params.length-1}::uuid[]) and cohort_id=$${params.length}`,
    params, 12_000, "offboarding:bulk"
  );
  res.json({ ok:true, updated: r.rowCount||0 });
});

/* POST /api/ma/cohorts/:id/offboarding/bulk-by-filter
 * { projectId, filter:{ ownerContains?, status?, dueWithinDays?, overdue?:boolean }, set:{ owner?, status? } }
 */
off.post("/cohorts/:id/offboarding/bulk-by-filter", ensureUUIDParam("id"), requireProject("member"), asyncHandler(async (req,res)=>{
  const cid = String(req.params.id||"");
  const { projectId, filter={}, set={} } = req.body||{};
  if (!projectId || !cid) return res.status(400).json({ error:"projectId & cohortId" });

  const statusOk = oneOf(["planned","in_progress","blocked","done"] as const);
  if (filter.status && !statusOk(filter.status)) return res.status(400).json({ error:"invalid status" });

  if (filter.dueWithinDays != null) {
    filter.dueWithinDays = clampInt(filter.dueWithinDays, 1, 60, 7);
  }

  const where:any[] = [sql`cohort_id=${cid}`];

  if (filter.ownerContains){
    const pattern = `%${String(filter.ownerContains).toLowerCase()}%`;
    where.push(sql`lower(coalesce(owner,'')) like ${pattern}`);
  }
  if (filter.status){
    where.push(sql`status=${filter.status}`);
  }
  if (filter.overdue){
    where.push(sql`coalesce(terminate_date,last_day) < now()`); 
  }
  if (filter.dueWithinDays){
    const days = String(Math.min(60, Math.max(1, Number(filter.dueWithinDays||7))));
    where.push(sql`coalesce(terminate_date,last_day) between now() and now() + (${days} || ' days')::interval`);
  }

  const sets:any[]=[]; 
  if (set.owner  !== undefined){ sets.push(sql`owner=${set.owner||null}`); }
  if (set.status !== undefined){ sets.push(sql`status=${set.status}`); }
  if (!sets.length) return res.json({ ok:true, updated:0 });

  const whereCombined = where.reduce((acc, curr, i) => i === 0 ? curr : sql`${acc} and ${curr}`);
  const setsCombined = sets.reduce((acc, curr, i) => i === 0 ? curr : sql`${acc}, ${curr}`);
  const query = sql`update offboarding_rows set ${setsCombined}, updated_at=now() where ${whereCombined}`;
  const r = await db.execute(query);
  res.json({ ok:true, updated: r.rowCount||0 });
}));

/* POST /api/ma/offboarding/:rowId/bump  { projectId, days:int }
 * If terminate_date set, bump that; else bump last_day; if neither, set last_day = now()+days.
 */
off.post("/offboarding/:rowId/bump", ensureUUIDParam("rowId"), requireProject("member"), async (req,res)=>{
  const { projectId, days: rawDays } = req.body||{};
  const rowId = String(req.params.rowId||"");
  if (!projectId || !rowId) return res.status(400).json({ error:"projectId & rowId" });
  const days = parseIntClamp(rawDays, 1, 60, 1);

  const r = (await db.execute(
    sql`select terminate_date, last_day from offboarding_rows where id=${rowId}`
  )).rows?.[0];
  const base = r?.terminate_date || r?.last_day || new Date().toISOString();
  const bump = (d:string, add:number)=>{
    const x = new Date(d); x.setUTCDate(x.getUTCDate()+add); return x.toISOString();
  };
  const next = bump(base, days);

  if (r?.terminate_date){
    await db.execute(sql`update offboarding_rows set terminate_date=${next}, updated_at=now() where id=${rowId}`);
  } else if (r?.last_day){
    await db.execute(sql`update offboarding_rows set last_day=${next}, updated_at=now() where id=${rowId}`);
  } else {
    await db.execute(sql`update offboarding_rows set last_day=${next}, updated_at=now() where id=${rowId}`);
  }
  res.json({ ok:true, next });
});

/* GET /api/ma/cohorts/:id/offboarding/export_filtered.csv?projectId=&owner=&status=&due=soon|overdue
 */
off.get("/cohorts/:id/offboarding/export_filtered.csv", requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||"");
  const owner = String(req.query.owner||"").toLowerCase();
  const status= String(req.query.status||"").toLowerCase();
  const due   = String(req.query.due||""); // soon|overdue|""

  const where:any[] = [sql`cohort_id=${cid}`];
  if (owner) {
    const pattern = `%${owner}%`;
    where.push(sql`lower(coalesce(owner,'')) like ${pattern}`);
  }
  if (status) where.push(sql`lower(status)=${status}`);
  if (due==="soon")    where.push(sql`status<>'done' and coalesce(terminate_date,last_day) between now() and now()+ interval '7 days'`);
  if (due==="overdue") where.push(sql`status<>'done' and coalesce(terminate_date,last_day) < now()`);

  const whereCombined = where.reduce((acc, curr, i) => i === 0 ? curr : sql`${acc} and ${curr}`);
  const rows = (await db.execute(
    sql`select external_id, name, email, org_unit, last_day, terminate_date, owner, status, notes, updated_at
       from offboarding_rows where ${whereCombined} order by updated_at desc`
  )).rows || [];

  const esc=(v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const head="external_id,name,email,org_unit,last_day,terminate_date,owner,status,notes,updated_at";
  const out = rows.map((r:any)=>[r.external_id||"",r.name||"",r.email||"",r.org_unit||"",r.last_day||"",r.terminate_date||"",r.owner||"",r.status||"",r.notes||"",r.updated_at].map(esc).join(","));
  res.type("text/csv").send([head, ...out].join("\r\n"));
});

export default off;
