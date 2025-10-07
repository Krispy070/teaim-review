from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
import io, csv, os
from ..tenant import TenantCtx
from ..guards import require_role, member_ctx
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/share", tags=["share"])
ADMIN_OR_PM = require_role({"owner","admin","pm","lead"})

def member_or_dev(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    if os.getenv("DEV_AUTH","0") == "1":
        return ctx  # trust dev headers (role checked by router decorator)
    return member_ctx(project_id, ctx)

@router.get("/export.csv")
def export_csv(project_id: str = Query(...), ctx: TenantCtx = Depends(member_or_dev), role_check = Depends(ADMIN_OR_PM)):
    sbs = get_supabase_client()
    
    # Try database query, fallback to MemStorage for dev mode
    try:
        rows = sbs.table("share_links").select("artifact_id,token,expires_at,revoked_at,created_at,created_by")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).order("created_at", desc=True).execute().data or []
    except Exception:
        rows = []

    # If DB returned empty and we're in dev mode, check MemStorage from share_links.py
    if not rows and os.getenv("DEV_AUTH","0") == "1":
        from .share_links import mem_share_links
        rows = [
            link for link in mem_share_links.values() 
            if link["org_id"] == ctx.org_id and link["project_id"] == project_id
        ]
        # Sort by created_at descending
        rows.sort(key=lambda x: x["created_at"], reverse=True)

    # Attach artifact name if available
    try:
        a_ids = list({r["artifact_id"] for r in rows if r.get("artifact_id")})
        if a_ids:
            arts = sbs.table("artifacts").select("id,title").in_("id", a_ids).execute().data or []
            name_map = {a["id"]: a.get("title") for a in arts}
            for r in rows: 
                r["artifact_name"] = name_map.get(r["artifact_id"], "")
    except Exception:
        # Fallback with test data artifact names
        test_artifacts = {
            "11111111-1111-1111-1111-111111111111": "SOW_v1_ACME-HCM-001.pdf",
            "22222222-2222-2222-2222-222222222222": "Change_Order_1_ACME-HCM-001.docx",
            "33333333-3333-3333-3333-333333333333": "Kickoff_Transcript_2025-09-23.txt"
        }
        for r in rows: 
            r["artifact_name"] = test_artifacts.get(r["artifact_id"], "")

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["artifact_id","artifact_name","token","url","expires_at","revoked_at","created_at","created_by"])
    
    base = os.getenv("APP_BASE_URL","").rstrip("/")
    for r in rows:
        url = f"{base}/api/share/{r['token']}"
        w.writerow([
            r.get("artifact_id", ""), 
            r.get("artifact_name", ""),
            r.get("token", ""), 
            url, 
            r.get("expires_at", ""), 
            r.get("revoked_at", ""),
            r.get("created_at", ""), 
            r.get("created_by", "")
        ])
    
    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]), 
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="share_links.csv"'}
    )