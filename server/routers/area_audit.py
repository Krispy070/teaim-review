from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/areas", tags=["areas"])

@router.get("/audit7d")
def audit7d(project_id: str = Query(...), area: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    start = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    out=[]
    # best effort across tables
    def add(tbl, cols):
        try:
            q = sb.table(tbl).select(cols).eq("org_id", ctx.org_id).eq("project_id", project_id).gte("created_at", start).limit(200)
            if "area" in cols: q = q.eq("area", area)
            for r in (q.execute().data or []):
                out.append({"table": tbl, "id": r.get("id"), "title": r.get("title") or r.get("name") or r.get("id"),
                            "created_at": r.get("created_at")})
        except Exception: ...
    add("actions","id,title,area,created_at")
    add("risks","id,title,area,created_at")
    add("decisions","id,title,area,created_at")
    add("workbook_runs","id,workbook_id,created_at")  # no area; still useful
    try:
        au = sb.table("audit_events").select("id,created_at,details").eq("org_id",ctx.org_id).eq("project_id",project_id)\
              .gte("created_at", start).order("created_at", desc=True).limit(200).execute().data or []
        for a in au: out.append({"table":"audit_events","id":a.get("id"),"title":"event","created_at":a.get("created_at")})
    except Exception: ...
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"items": out[:200]}