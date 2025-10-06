from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/presence", tags=["presence"])

@router.post("/ping")
def ping(project_id: str = Query(...), area: str | None = None, ctx: TenantCtx = Depends(member_ctx)):
    """Record user presence ping for an area"""
    sb = get_user_supabase(ctx)
    try:
        sb.table("area_presence").upsert({
            "org_id": ctx.org_id, 
            "project_id": project_id, 
            "user_id": ctx.user_id, 
            "area": area or "_global",
            "last_seen": datetime.now(timezone.utc).isoformat()
        }, on_conflict="org_id,project_id,user_id,area").execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.get("/list")
def list_presence(
    project_id: str = Query(...), 
    area: str | None = None, 
    minutes: int = 15, 
    ctx: TenantCtx = Depends(member_ctx)
):
    """List users present in an area within the last N minutes"""
    sb = get_user_supabase(ctx)
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=max(1, minutes))).isoformat()
    try:
        q = sb.table("area_presence").select("user_id,last_seen")\
             .eq("org_id", ctx.org_id).eq("project_id", project_id)\
             .gte("last_seen", cutoff)
        if area:
            q = q.eq("area", area)
        rows = q.limit(200).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}

@router.get("/me")
def me(ctx: TenantCtx = Depends(member_ctx)):
    """Get current user ID for presence tracking"""
    return {"user_id": ctx.user_id}