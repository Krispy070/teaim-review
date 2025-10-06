from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
import io, zipfile, json, datetime as dt
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/api/export", tags=["export"])

@router.get("/csv_bundle.zip")
def csv_bundle(project_id: str = Query(...),
               types: str = Query("actions,risks,decisions"),
               ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    tset = {t.strip() for t in types.split(",") if t.strip()}
    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data or {}
    code = proj.get("code") or project_id
    org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}

    def q(table, cols):
        try:
            r = sb.table(table).select(",".join(cols))\
                 .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                 .order("created_at", desc=True).limit(5000).execute().data or []
            return r
        except Exception:
            return []

    actions = q("actions", ["id","title","owner","status","area","created_at"]) if "actions" in tset else []
    risks   = q("risks",   ["id","title","severity","owner","area","created_at"]) if "risks" in tset else []
    decis   = q("decisions",["id","title","decided_by","area","created_at"]) if "decisions" in tset else []

    hdr = export_header_html(org, code)
    html = f"""<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;max-width:880px;margin:auto}}</style>
</head><body>{hdr}
<h2>CSV Bundle</h2>
<div style="font-size:12px;color:#666">Generated {dt.datetime.now(dt.timezone.utc).isoformat()}</div>
<ul>
  <li>actions.csv — {len(actions)} rows</li>
  <li>risks.csv — {len(risks)} rows</li>
  <li>decisions.csv — {len(decis)} rows</li>
</ul>
</body></html>"""

    buf = io.BytesIO(); zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)

    # write CSVs
    import csv
    def write_csv(name, rows, cols):
        s = io.StringIO(); w = csv.writer(s); w.writerow(cols)
        for r in rows: w.writerow([r.get(c) for c in cols])
        zf.writestr(name, s.getvalue())

    if "actions" in tset:  write_csv("actions.csv",  actions, ["id","title","owner","status","area","created_at"])
    if "risks"   in tset:  write_csv("risks.csv",    risks,   ["id","title","severity","owner","area","created_at"])
    if "decisions" in tset:write_csv("decisions.csv",decis,   ["id","title","decided_by","area","created_at"])

    zf.writestr("manifest.html", html)
    zf.close(); buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="csv_bundle.zip"'})