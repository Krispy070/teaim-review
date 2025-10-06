from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

@router.get("/recent")
def recent(project_id: str = Query(...), limit:int=10, ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        rows = sb.table("meetings").select("id,title,starts_at")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .order("starts_at", desc=True).limit(min(50, max(1,limit))).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}