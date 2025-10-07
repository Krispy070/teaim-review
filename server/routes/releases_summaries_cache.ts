import { Router } from "express";
import { exec } from "../db/exec";
import { requireProject } from "../auth/projectAccess";
import crypto from "node:crypto";

type Entry = { at: number; data: any };
const TTL_MS = 15_000;
const cache = new Map<string, Entry>();

function etagFor(obj: any) {
  try {
    const json = JSON.stringify(obj);
    return `"W/${crypto.createHash("sha1").update(json).digest("hex")}"`;
  } catch {
    return "";
  }
}

const relsum = Router();

/* GET /api/releases/summaries?projectId= */
relsum.get("/summaries", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const key = pid || "_";

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return res.json({ ok:true, items: hit.data });

  const rels = (await exec(
    `select id from releases where project_id=$1 order by imported_at desc limit 30`, [pid], 12_000, "releases:list-ids"
  )).rows || [];

  const out:any[] = [];
  for (const r of rels) {
    const rid = r.id;

    const gate = (await exec(
      `select sum(case when is_required then 1 else 0 end)::int as req_total,
              sum(case when is_required and status='passed' then 1 else 0 end)::int as req_passed
         from test_cases where project_id=$1 and release_id=$2`,
      [pid, rid], 12_000, "releases:gate"
    )).rows?.[0] || { req_total:0, req_passed:0 };

    const modules = (await exec(
      `select module,
              sum(case when status='passed'      then 1 else 0 end)::int as passed,
              sum(case when status='failed'      then 1 else 0 end)::int as failed,
              sum(case when status='blocked'     then 1 else 0 end)::int as blocked,
              sum(case when status='in_progress' then 1 else 0 end)::int as in_progress,
              sum(case when is_required          then 1 else 0 end)::int as req_total,
              sum(case when is_required and status='passed' then 1 else 0 end)::int as req_passed,
              count(*)::int as total
         from test_cases where project_id=$1 and release_id=$2
        group by module order by module`,
      [pid, rid], 12_000, "releases:mods"
    )).rows || [];

    out.push({ releaseId: rid,
      gate: { required: gate.req_total||0, passed: gate.req_passed||0, ready: (gate.req_total||0)>0 && gate.req_total===gate.req_passed },
      modules
    });
  }

  cache.set(key, { at: now, data: out });
  
  const tag = etagFor(out);
  const inm = String(req.headers["if-none-match"] || "");
  if (tag && inm === tag) {
    res.status(304).end();
    return;
  }
  res.setHeader("ETag", tag);
  res.json({ ok: true, items: out });
});

export default relsum;
