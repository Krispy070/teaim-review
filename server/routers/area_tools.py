from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel
from datetime import datetime, timezone
import io, zipfile, csv, json, psycopg2.extras
from ..tenant import TenantCtx, require_project_member
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
from ..brand.export_header import export_header_html
from ..db import get_conn

router = APIRouter(prefix="/api/area", tags=["areas"])
areas_router = APIRouter(prefix="/api/areas", tags=["areas"])
PM_PLUS = require_role({"owner","admin","pm"})

class NextMeetingBody(BaseModel):
    area: str
    starts_at: str  # ISO string

@router.post("/next_meeting")
def set_next_meeting(body: NextMeetingBody, project_id: str = Query(...)):
    ctx = require_project_member(project_id)
    sb = get_user_supabase(ctx)
    try:
        sb.table("area_meta").upsert({
            "org_id": ctx.org_id, "project_id": project_id, "area": body.area,
            "next_meeting": body.starts_at
        }, on_conflict="org_id,project_id,area").execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.get("/next_meeting")
def get_next_meeting(project_id: str = Query(...), area: str = Query(...)):
    ctx = require_project_member(project_id)
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("area_meta").select("next_meeting").eq("org_id", ctx.org_id)\
             .eq("project_id", project_id).eq("area", area).single().execute().data or {}
        return {"next_meeting": r.get("next_meeting")}
    except Exception:
        return {"next_meeting": None}

@router.get("/preview.html", response_class=HTMLResponse)
def preview_html(project_id: str = Query(...), area: str = Query(...)):
    # Validate project membership
    ctx = require_project_member(project_id)
    sb = get_user_supabase(ctx)
    org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data or {}
    hdr = export_header_html(org, proj.get("code") or project_id)

    def _safe(table, select, **flt):
        try:
            q = sb.table(table).select(select).eq("org_id", ctx.org_id).eq("project_id", project_id)
            for k,v in flt.items(): q = q.eq(k, v)
            return q.limit(50).execute().data or []
        except Exception: return []

    actions  = _safe("actions", "id,title,owner,area,status,created_at", area=area)
    risks    = _safe("risks", "id,title,owner,area,status,created_at", area=area)
    decis    = _safe("decisions", "id,title,decided_by,area,status,created_at", area=area)
    wbs      = _safe("workbooks", "id,name,area,asof_date,due_date,iterations_planned,iterations_done,status", area=area)

    man = {"org_id": str(ctx.org_id), "project_id": project_id, "area": area,
           "generated_at": datetime.now(timezone.utc).isoformat(),
           "counts": {"actions": len(actions), "risks": len(risks),
                      "decisions": len(decis), "workbooks": len(wbs)}}

    def table(title, rows, cols):
        if not rows: return f"<h3>{title}</h3><div style='color:#666'>None</div>"
        th = "".join([f"<th style='text-align:left;padding:4px'>{c}</th>" for c in cols])
        trs = "".join([ "<tr>"+ "".join([f"<td style='padding:4px'>{(r.get(c,''))}</td>" for c in cols]) + "</tr>" for r in rows ])
        return f"<h3>{title}</h3><table style='border-collapse:collapse;width:100%'><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"

    html = f"""<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;max-width:880px;margin:auto">
{hdr}
<h2>Area Package Preview — {area}</h2>
<pre style="background:#fafafa;padding:8px;border:1px solid #eee;border-radius:6px">{json.dumps(man,indent=2)}</pre>
{table("Open Actions", [r for r in actions if (r.get("status") or "").lower()=="open"], ["id","title","owner","created_at"])}
{table("Risks", risks, ["id","title","owner","status","created_at"])}
{table("Decisions", decis, ["id","title","decided_by","created_at"])}
{table("Workbooks", wbs, ["id","name","asof_date","due_date","iterations_planned","iterations_done","status"])}
</body></html>"""
    return HTMLResponse(html)

# Removed duplicate broken ZIP endpoint - working version below

# Database utility for the areas endpoint
class DatabaseUtil:
    def query(self, sql: str, args: tuple):
        """Execute query and return all rows as dicts"""
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args)
            return cur.fetchall()
    
    def one(self, sql: str, args: tuple):
        """Execute query and return single row as dict"""
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args)
            return cur.fetchone()

pg = DatabaseUtil()

@areas_router.get("/{area_key}/zip")
def area_zip(area_key: str, projectId: str | None = Query(None), project_id: str | None = Query(None), dryRun: str | None = Query(None)):
    pid = projectId or project_id
    if not pid: raise HTTPException(400, "projectId required")
    
    # Validate project membership
    ctx = require_project_member(pid)

    area = pg.one("select id from areas where project_id=%s and key=%s limit 1", (pid, area_key))
    if not area: raise HTTPException(404, "area not found")

    art = pg.one("""
      select filename, mime, data, kind
      from artifacts
      where project_id=%s and area_id=%s and kind in ('area_zip','wb_export_csv')
      order by case when kind='area_zip' then 0 else 1 end, created_at desc
      limit 1
    """, (pid, area["id"]))

    if not art: raise HTTPException(404, "no artifact for area")
    if dryRun in ("1","true","True"): return {"ok": True, "hasArtifact": True, "kind": art["kind"], "filename": art["filename"]}

    from io import BytesIO
    from base64 import b64decode
    return StreamingResponse(BytesIO(b64decode(art["data"])), media_type=art["mime"], headers={"Content-Disposition": f'attachment; filename="{art["filename"]}"'})