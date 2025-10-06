from fastapi import APIRouter, Depends, Query, HTTPException
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/review", tags=["review"])
ADMIN_OR_PM = require_role({"owner","admin","pm"})

@router.get("/pending-count")
def pending_count(kind: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("review_items").select("id", count="exact")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)\
            .eq("kind", kind).eq("status","pending").execute()
        return {"count": r.count or 0}
    except Exception as e:
        # If table doesn't exist yet, return 0
        print(f"Review count query failed: {e}")
        return {"count": 0}

@router.get("/list")
def list_items(kind: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("review_items").select("id,artifact_id,kind,severity,details,created_at")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)\
            .eq("kind", kind).eq("status","pending").order("created_at", desc=True).limit(100).execute()
        return {"items": r.data or []}
    except Exception as e:
        print(f"Review list query failed: {e}")
        return {"items": []}

@router.post("/resolve")
def resolve_item(item_id: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_PM)):
    sb = get_user_supabase(ctx)
    try:
        # ensure belongs to org/project
        exists = sb.table("review_items").select("id").eq("org_id", ctx.org_id)\
                 .eq("project_id", project_id).eq("id", item_id).limit(1).execute().data
        if not exists: 
            raise HTTPException(404, "Review item not found")
        sb.table("review_items").update({"status":"resolved"}).eq("id", item_id).execute()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Review resolve failed: {e}")
        raise HTTPException(500, f"Failed to resolve item: {str(e)}")