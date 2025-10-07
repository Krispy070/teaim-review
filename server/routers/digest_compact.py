from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
from ..visibility_guard import get_visibility_context, apply_area_visibility_filter

router = APIRouter(prefix="/api/digest", tags=["digest"])
MEMBER_PLUS = require_role({"owner","admin","pm","lead","member"})

def _window(days=7):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start, end

@router.get("/compact")
def get_compact_digest(
    project_id: str = Query(...),
    days: int = Query(7, ge=1, le=90, description="Days back to analyze"),
    org_id: str = Query(None),  # Make org_id optional for dev environments
    ctx: TenantCtx = Depends(member_ctx)  # Use member_ctx instead of MEMBER_PLUS
):
    """Get compact digest data for UI display with deep link support"""
    # Handle dev environment where org_id might be needed
    if org_id and not hasattr(ctx, 'org_id'):
        ctx.org_id = org_id
        
    sb = get_user_supabase(ctx)
    
    try:
        # Get project info for title
        proj_result = sb.table("projects").select("code, title").eq("id", project_id).single().execute()
        if not proj_result.data:
            return {"error": "Project not found"}
        
        project_code = proj_result.data.get("code", "Unknown")
        project_title = proj_result.data.get("title", "Unknown Project")
        
        start, end = _window(days)
        
        # Get visibility context for area-based filtering
        visibility_ctx = get_visibility_context(ctx, project_id)
        
        # Helper to count items with visibility filtering
        def cnt(table, has_area_column=True):
            query = sb.table(table).select("*", count="exact")\
                      .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                      .gte("updated_at", start.isoformat()).lte("updated_at", end.isoformat())
            
            # Apply visibility filtering if context is available
            if visibility_ctx and has_area_column:
                query = apply_area_visibility_filter(query, visibility_ctx, "area")
            
            r = query.execute()
            return r.count or 0

        # Get counts for main categories
        counts = {
            "actions": cnt("actions", True),
            "risks": cnt("risks", True), 
            "decisions": cnt("decisions", True),
        }
        
        # Get overdue signoffs with visibility filtering
        overdue_query = sb.table("project_stages").select("title,requested_at,area")\
                         .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                         .eq("status","in_review")
        
        # Apply visibility filtering for area-based access
        if visibility_ctx:
            overdue_query = apply_area_visibility_filter(overdue_query, visibility_ctx, "area")
        
        overdue = overdue_query.execute().data or []
        
        # Get recent activity by area (for area-based deep links)
        recent_areas = {}
        if visibility_ctx:
            for table in ["actions", "risks", "decisions"]:
                area_query = sb.table(table).select("area")\
                              .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                              .gte("updated_at", start.isoformat()).lte("updated_at", end.isoformat())\
                              .not_.is_("area", "null")
                
                # Apply visibility filtering
                area_query = apply_area_visibility_filter(area_query, visibility_ctx, "area")
                
                result = area_query.execute()
                # Count by area manually in Python
                for row in result.data or []:
                    area = row.get("area")
                    if area:
                        if area not in recent_areas:
                            recent_areas[area] = {"actions": 0, "risks": 0, "decisions": 0}
                        recent_areas[area][table] += 1
        
        # Get recent activity by owner
        recent_owners = {}
        for table in ["actions", "risks", "decisions"]:
            owner_query = sb.table(table).select("owner")\
                          .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                          .gte("updated_at", start.isoformat()).lte("updated_at", end.isoformat())\
                          .not_.is_("owner", "null")
            
            # Apply visibility filtering
            if visibility_ctx:
                owner_query = apply_area_visibility_filter(owner_query, visibility_ctx, "area")
            
            result = owner_query.execute()
            # Count by owner manually in Python
            for row in result.data or []:
                owner = row.get("owner")
                if owner:
                    if owner not in recent_owners:
                        recent_owners[owner] = {"actions": 0, "risks": 0, "decisions": 0}
                    recent_owners[owner][table] += 1
        
        return {
            "project_code": project_code,
            "project_title": project_title,
            "period_days": days,
            "counts": counts,
            "overdue_signoffs": overdue,
            "recent_by_area": recent_areas,
            "recent_by_owner": recent_owners,
            "total_activity": sum(counts.values())
        }
        
    except Exception as e:
        print(f"Error getting compact digest: {e}")
        return {
            "project_code": "Unknown",
            "project_title": "Unknown Project", 
            "period_days": days,
            "counts": {"actions": 0, "risks": 0, "decisions": 0},
            "overdue_signoffs": [],
            "recent_by_area": {},
            "recent_by_owner": {},
            "total_activity": 0
        }