from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/actions", tags=["actions"])

@router.get("/by_area")
def by_area(project_id: str = Query(...), area: str = Query(...), status: str = "open",
            ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("actions").select("id,title,owner,area,status,created_at")\
             .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("area", area)
        if status: q = q.eq("status", status)
        rows = q.order("created_at", desc=True).limit(200).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}