from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/updates", tags=["updates"])

@router.post("/mark_seen")
def mark_seen(project_id: str = Query(...), route_key: str = Query(...),
              ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("updates_seen").upsert({
            "org_id": ctx.org_id, "project_id": project_id,
            "user_id": ctx.user_id, "route_key": route_key,
            "seen_at": datetime.now(timezone.utc).isoformat()
        }, on_conflict="org_id,project_id,user_id,route_key").execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}