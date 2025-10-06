from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])

@router.get("/last")
def last_artifact(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("artifacts").select("id,name,public_url,created_at")\
             .eq("org_id", ctx.org_id).eq("project_id", project_id)\
             .order("created_at", desc=True).limit(1).execute().data or []
        a = r[0] if r else None
        # return best-effort link
        link = a.get("public_url") if a else None
        return {"artifact": a, "url": link}
    except Exception:
        return {"artifact": None, "url": None}