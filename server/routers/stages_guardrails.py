from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/stages", tags=["stages"])

@router.get("/guardrails")
def guardrails(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        s = sb.table("org_settings").select("stage_min_days,stage_max_days")\
            .eq("org_id", ctx.org_id).single().execute().data or {}
        return {"min_days": int(s.get("stage_min_days") or 1), "max_days": int(s.get("stage_max_days") or 365)}
    except Exception:
        return {"min_days": 1, "max_days": 365}