from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/updates", tags=["updates"])
# Alias router without /api prefix for routing resilience
router_no_api = APIRouter(prefix="/updates", tags=["updates-no-api"])

@router.get("/count")
def count_pending(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    r = sb.table("pending_updates").select("id", count="exact")\
         .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("status","pending").execute()
    return {"count": r.count or 0}

# Alias endpoint for routing resilience
@router_no_api.get("/count")
def count_pending_no_api(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    return count_pending(project_id, ctx)