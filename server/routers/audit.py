from fastapi import APIRouter, Query, Depends
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/audit", tags=["audit"])
# Alias router with /api prefix for routing resilience
router_api = APIRouter(prefix="/api/audit", tags=["audit-api"])

@router.get("/list")
def list_audit_events(
    project_id: str = Query(...),
    kind: str = Query(None),  # Optional filter by event kind
    limit: int = Query(50, le=100),  # Limit results, max 100
    ctx: TenantCtx = Depends(member_ctx)
):
    """List audit events for a project, optionally filtered by kind"""
    sbs = get_supabase_client()
    
    try:
        # Build query
        query = sbs.table("audit_events").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id)
        
        # Apply kind filter if provided (comma-separated for multiple kinds)
        if kind:
            kinds = [k.strip() for k in kind.split(",") if k.strip()]
            if len(kinds) == 1:
                query = query.eq("kind", kinds[0])
            elif len(kinds) > 1:
                query = query.in_("kind", kinds)
        
        # Order by most recent and limit
        result = query.order("created_at", desc=True).limit(limit).execute()
        
        return {"events": result.data or []}
        
    except Exception as e:
        print(f"Failed to fetch audit events: {e}")
        return {"events": []}

# API prefix alias endpoint for routing resilience
@router_api.get("/list")
def list_audit_events_api(
    project_id: str = Query(...),
    kind: str = Query(None),
    limit: int = Query(50, le=100),
    ctx: TenantCtx = Depends(member_ctx)
):
    return list_audit_events(project_id, kind, limit, ctx)