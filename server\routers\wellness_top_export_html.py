from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/wellness", tags=["wellness"])

@router.get("/top_responders.html", response_class=HTMLResponse)
def top_html(project_id: str = Query(...), days: int = 30,
             ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    days = 7 if days==7 else 30
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days-1)
    # counts current & previous
    rows = sb.table("team_wellness").select("user_id,created_at")\
           .eq("org_id", ctx.org_id).eq("project_id", project_id)\
           .gte("created_at", start.isoformat()).execute().data or []
    prev_start = start - timedelta(days=days)
    prev_end = start - timedelta(days=1)
    prev = sb.table("team_wellness").select("user_id,created_at")\
           .eq("org_id", ctx.org_id).eq("project_id", project_id)\
           .gte("created_at", prev_start.isoformat()).lte("created_at", prev_end.isoformat()).execute().data or []
    cur = {}; prv={}
    for r in rows: cur[r["user_id"]] = cur.get(r["user_id"],0) + 1
    for r in prev: prv[r["user_id"]] = prv.get(r["user_id"],0) + 1
    items = [{"user_id":u, "checkins":c, "delta": c - prv.get(u,0)} for u,c in cur.items()]
    items.sort(key=lambda x:(-x["checkins"], -x["delta"]))

    org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data or {}
    hdr = export_header_html(org, proj.get("code") or project_id)
    rows_html = "".join([f"<tr><td>{i['user_id']}</td><td>{i['checkins']}</td><td>{'+' if i['delta']>0 else ''}{i['delta']}</td></tr>" for i in items[:50]])
    html = f"""<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;max-width:880px;margin:auto">
{hdr}
<h2>Top Responders — last {days} days</h2>
<table style="border-collapse:collapse;width:100%"><thead><tr><th>User</th><th>Checkins</th><th>Δ</th></tr></thead>
<tbody>{rows_html or '<tr><td colspan=3>No data</td></tr>'}</tbody></table>
</body></html>"""
    return HTMLResponse(html)