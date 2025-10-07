import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const riskExports = Router();

riskExports.get("/export.csv", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const pmin = Number(req.query.pmin_bin||1), pmax = Number(req.query.pmax_bin||5);
  const imin = Number(req.query.imin||1), imax = Number(req.query.imax||5);
  const status = String(req.query.status||"");
  const tag = String(req.query.tag||"");

  let query = sql`
    select id, title, description, probability, impact, severity, owner, status, due_at as "dueAt", tags
    from risks 
    where project_id = ${pid}
      and ceil(greatest(1, least(5, probability/20.0))) between ${pmin} and ${pmax}
      and greatest(1, least(5, impact)) between ${imin} and ${imax}
  `;
  
  if (status && status !== "any") {
    query = sql`${query} and status = ${status}`;
  }
  if (tag) {
    query = sql`${query} and tags::text ilike ${`%${tag}%`}`;
  }
  
  query = sql`${query} order by severity desc, created_at desc`;
  
  const { rows } = await db.execute(query);
  const esc = (s:any)=>`"${String(s??"").replace(/"/g,'""')}"`;
  const header = "id,title,description,probability,impact,severity,owner,status,dueAt,tags";
  const lines = rows.map((r:any)=>[
    r.id,r.title,r.description,r.probability,r.impact,r.severity,r.owner||"",r.status||"",r.dueAt||"",Array.isArray(r.tags)?r.tags.join("|"):""
  ].map(esc).join(","));
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="risks_${pid}_filtered.csv"`);
  res.send([header,...lines].join("\r\n"));
});

riskExports.get("/heatmap.svg", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select ceil(greatest(1, least(5, probability/20.0)))::int as pbin,
            greatest(1, least(5, impact))::int as ibin,
            count(*)::int as n
       from risks where project_id=${pid} group by pbin, ibin`);
  const mat = Array.from({length:5},()=>Array(5).fill(0));
  for (const r of rows) mat[r.pbin-1][r.ibin-1]=r.n;

  const cell = 46, pad=28, w = pad+5*cell+pad, h=pad+5*cell+pad;
  const toShade = (n:number)=> n===0 ? "#0f172a" : (n<3?"#047857": n<6?"#b45309": "#b91c1c");

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">`;
  svg += `<style>.lbl{font: 10px sans-serif; fill:#cbd5e1}</style>`;
  for (let i=0;i<5;i++){
    svg += `<text class="lbl" x="${pad-8}" y="${pad+i*cell+cell/2+3}" text-anchor="end">P${i+1}</text>`;
    svg += `<text class="lbl" x="${pad+i*cell+cell/2}" y="${pad-8}" text-anchor="middle">I${i+1}</text>`;
  }
  for (let r=0;r<5;r++){
    for(let c=0;c<5;c++){
      const x=pad+c*cell, y=pad+r*cell, n=mat[r][c];
      svg += `<rect x="${x}" y="${y}" width="${cell-4}" height="${cell-4}" fill="${toShade(n)}" rx="6" ry="6"/>`;
      svg += `<text class="lbl" x="${x+(cell-4)/2}" y="${y+(cell-4)/2+3}" text-anchor="middle">${n}</text>`;
    }
  }
  svg += `</svg>`;
  res.setHeader("Content-Type","image/svg+xml; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="risk_heatmap_${pid}.svg"`);
  res.send(svg);
});
