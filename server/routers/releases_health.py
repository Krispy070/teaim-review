from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/releases", tags=["releases"])

@router.get("/health")
def health(project_id: str = Query(...), id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("releases").select("cr_ids").eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", id).single().execute().data or {}
        ids = r.get("cr_ids") or []
        if not ids: 
            return {"counts": {"planned": 0, "in_progress": 0, "testing": 0, "deployed": 0, "closed": 0, "other": 0}, "health": "planned"}
        rows = sb.table("changes").select("status").eq("org_id", ctx.org_id).eq("project_id", project_id).in_("id", ids).execute().data or []
    except Exception:
        rows = []
    
    counts = {"planned": 0, "in_progress": 0, "testing": 0, "deployed": 0, "closed": 0, "other": 0}
    for x in rows:
        s = (x.get("status") or "").lower()
        if s in counts:
            counts[s] += 1
        else:
            counts["other"] += 1
    
    # Health rule: any open in testing/in_progress → "working"; all deployed/closed → "ready"; has planned only → "planned"
    total = sum(counts.values())
    if counts["in_progress"] or counts["testing"]:
        health = "working"
    elif total > 0 and (counts["deployed"] + counts["closed"]) == total:
        health = "ready"
    else:
        health = "planned"
    
    return {"counts": counts, "health": health}