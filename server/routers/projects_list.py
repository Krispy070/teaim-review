from fastapi import APIRouter, Depends
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/projects", tags=["projects"])

@router.get("/list")
def list_projects(ctx: TenantCtx = Depends(member_ctx)):
    sb = get_supabase_client()
    try:
        rows = sb.table("projects").select("id,code,name").eq("org_id", ctx.org_id).order("created_at", desc=True).limit(50).execute().data or []
        return {"items": rows}
    except Exception:
        # dev-safe fallback
        return {"items": []}