import html
from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

@router.get("/export_html", response_class=HTMLResponse)
def export_html(project_id: str = Query(...), artifact_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    # fetch summary
    s = sb.table("summaries").select("actions,risks,decisions")\
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("artifact_id", artifact_id)\
          .single().execute().data
    if not s:
        return HTMLResponse("<html><body>No summary.</body></html>")

    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data or {}
    org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
    header = export_header_html(org, proj.get("code") or project_id)

    def listify(title, arr, fields):
        if not arr: return ""
        escaped_title = html.escape(title)
        rows = "".join([f"<li>{html.escape(x.get('title') or x.get('text') or '—')}</li>" for x in arr])
        return f"<h3>{escaped_title}</h3><ul>{rows}</ul>"

    html_content = f"""
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/static/print.css" />
    </head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;max-width:880px;margin:auto">
      {header}
      <h2>Meeting Summary</h2>
      {listify("Actions", s.get("actions") or [], ["title","owner"])}
      {listify("Risks", s.get("risks") or [], ["title","severity"])}
      {listify("Decisions", s.get("decisions") or [], ["title","decided_by"])}
    </body></html>
    """
    return HTMLResponse(html_content)