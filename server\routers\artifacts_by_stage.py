from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])

@router.get("/by_stage")
def by_stage(project_id: str = Query(...), stage_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    # Try explicit stage_id column first
    try:
        r = sb.table("artifacts").select("id,name,public_url,created_at")\
             .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("stage_id", stage_id)\
             .order("created_at", desc=True).limit(1).execute().data or []
        if r: return {"artifact": r[0], "url": r[0].get("public_url")}
    except Exception:
        pass
    # Fallback: look in meta jsonb for stage_id
    try:
        r = sb.rpc("artifacts_by_stage_meta", {"p_org": str(ctx.org_id), "p_project": str(project_id), "p_stage": str(stage_id)}).execute().data or []
        a = r[0] if r else None
        return {"artifact": a, "url": (a and a.get("public_url"))}
    except Exception:
        return {"artifact": None, "url": None}