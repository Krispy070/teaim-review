from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/stages", tags=["stages"])

@router.get("/signed")
def signed_stages(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    # Prefer signoff docs with stage_id + status 'signed'
    rows = sb.table("signoff_docs").select("stage_id")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)\
            .eq("status","signed").not_.is_("stage_id","null").execute().data or []
    # Fallback: method_metrics with kind 'stage.signed'
    if not rows:
        mm = sb.table("method_metrics").select("stage_id")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id)\
              .eq("kind","stage.signed").not_.is_("stage_id","null").execute().data or []
        ids = list({m["stage_id"] for m in mm if m.get("stage_id")})
    else:
        ids = list({r["stage_id"] for r in rows if r.get("stage_id")})
    return {"stage_ids": ids}