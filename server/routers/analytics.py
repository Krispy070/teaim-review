from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
# Alias router without /api prefix to match Express proxy rewriting
router_no_api = APIRouter(prefix="/analytics", tags=["analytics-no-api"])

def _summary_impl(project_id: str, ctx: TenantCtx):
    """Shared implementation for summary endpoint"""
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    
    sb = get_user_supabase(ctx)
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    def cnt(table, has_area_column=True): 
        try:
            query = sb.table(table).select("*", count="exact")\
                      .eq("org_id", ctx.org_id).eq("project_id", project_id)
            
            # Apply visibility filtering for tables with area columns
            if has_area_column:
                query = apply_area_visibility_filter(query, visibility_ctx, "area")
            
            r = query.execute()
            return r.count or 0
        except Exception:
            return 0
    def cnt_stages_in_review():
        try:
            return sb.table("project_stages").select("*", count="exact")\
                     .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("status","in_review").execute().count or 0
        except Exception:
            return 0
    
    return {
        "actions": cnt("actions", True),
        "risks": cnt("risks", True),
        "decisions": cnt("decisions", True),
        "docs": cnt("artifacts", False),
        "stages_in_review": cnt_stages_in_review()
    }

@router.get("/summary")
def summary(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    return _summary_impl(project_id, ctx)

@router_no_api.get("/summary")
def summary_no_api(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    return _summary_impl(project_id, ctx)

def _burnup_impl(project_id: str, days: int, ctx: TenantCtx):
    """Shared implementation for burnup endpoint"""
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    
    sb = get_user_supabase(ctx)
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    def daily(table, has_area_column=True):
        try:
            query = sb.table(table).select("created_at").eq("org_id", ctx.org_id).eq("project_id", project_id)\
                      .gte("created_at", start.isoformat()).lte("created_at", end.isoformat())
            
            # Apply visibility filtering for tables with area columns
            if has_area_column:
                query = apply_area_visibility_filter(query, visibility_ctx, "area")
            
            rows = query.execute().data or []
        except Exception:
            rows = []
        buckets = {}
        for r in rows:
            d = (r["created_at"] or "")[:10]
            buckets[d] = buckets.get(d,0)+1
        out=[]; cur=0
        for i in range(days+1):
            day = (start + timedelta(days=i)).date().isoformat()
            cur += buckets.get(day,0)
            out.append({"date": day, "count": cur})
        return out
    return {
        "actions": daily("actions", True),
        "docs": daily("artifacts", False)
    }

@router.get("/burnup")
def burnup(project_id: str = Query(...), days: int = 35, ctx: TenantCtx = Depends(member_ctx)):
    return _burnup_impl(project_id, days, ctx)

@router_no_api.get("/burnup")
def burnup_no_api(project_id: str = Query(...), days: int = 35, ctx: TenantCtx = Depends(member_ctx)):
    return _burnup_impl(project_id, days, ctx)