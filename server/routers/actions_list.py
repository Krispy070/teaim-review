from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from datetime import date, datetime, timedelta
from typing import Optional, List
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase
from ..visibility_guard import get_visibility_context, apply_area_visibility_filter

router = APIRouter(prefix="/actions", tags=["actions"])
PM_PLUS = require_role({"owner","admin","pm","lead"})
member_ctx = require_role({"owner","admin","pm","lead","member"})

class SnoozeBody(BaseModel):
    snooze_until: date

class Action(BaseModel):
    id: str
    title: str
    description: str
    status: str
    due_date: Optional[date]
    snooze_until: Optional[date]
    owner: Optional[str]
    created_at: datetime
    
class ActionsResponse(BaseModel):
    actions: List[Action]
    total_count: int

@router.get("/list", response_model=ActionsResponse)
def list_actions(
    project_id: str = Query(...),
    status: Optional[str] = Query(None, description="Filter by status: todo, in_progress, done"),
    overdue_only: bool = Query(False, description="Only return overdue actions"),
    owner: Optional[str] = Query(None, description="Filter by owner user ID"),
    area: Optional[str] = Query(None, description="Filter by specific area"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """List actions with filtering and pagination"""
    sb = get_user_supabase(ctx)
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    try:
        # Build base query for count
        count_query = sb.table("actions").select("id")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)
        
        # Build main query for data
        result_query = sb.table("actions").select("*")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)
        
        # Apply visibility filtering based on user's area permissions
        count_query = apply_area_visibility_filter(count_query, visibility_ctx, "area")
        result_query = apply_area_visibility_filter(result_query, visibility_ctx, "area")
        
        # Apply filters to both queries
        if status:
            count_query = count_query.eq("status", status)
            result_query = result_query.eq("status", status)
        
        if overdue_only:
            today = date.today().isoformat()
            count_query = count_query.filter("due_date", "lt", today)\
                              .filter("status", "neq", "done")\
                              .is_("snooze_until", None)
            result_query = result_query.filter("due_date", "lt", today)\
                              .filter("status", "neq", "done")\
                              .is_("snooze_until", None)
        
        # Apply owner filter
        if owner:
            if owner in ["unassigned", "none", "null"]:
                # Handle unassigned (NULL) owners
                count_query = count_query.is_("owner", None)
                result_query = result_query.is_("owner", None)
            else:
                count_query = count_query.eq("owner", owner)
                result_query = result_query.eq("owner", owner)
        
        # Apply area filter (only if user has permission to see that area)
        if area:
            # Check if user can view this specific area
            if visibility_ctx.can_view_all or area in visibility_ctx.visibility_areas:
                count_query = count_query.eq("area", area)
                result_query = result_query.eq("area", area)
            else:
                # User doesn't have permission for this area, return empty results
                return {"actions": [], "total_count": 0}
        
        # Execute count query
        count_result = count_query.execute()
        total_count = len(count_result.data) if count_result.data else 0
        
        # Execute main query with pagination and ordering
        result = result_query.order("due_date", desc=False)\
                           .range(offset, offset + limit - 1).execute()
        
        actions = result.data or []
        
        return {"actions": actions, "total_count": total_count}
        
    except Exception as e:
        # Graceful fallback for development
        return {"actions": [], "total_count": 0}

@router.get("/overdue", response_model=ActionsResponse)
def get_overdue_actions(
    project_id: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Get overdue actions (dedicated endpoint for dashboard widget)"""
    return list_actions(
        project_id=project_id,
        overdue_only=True,
        limit=limit,
        offset=0,
        ctx=ctx
    )

@router.post("/snooze/{action_id}")
def snooze_action(
    action_id: str,
    body: SnoozeBody,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Snooze an action until a specific date"""
    sb = get_user_supabase(ctx)
    
    try:
        sb.table("actions").update({"snooze_until": body.snooze_until.isoformat()})\
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", action_id).execute()
        return {"ok": True, "snoozed_until": body.snooze_until}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@router.post("/unsnooze/{action_id}")
def unsnooze_action(
    action_id: str,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Remove snooze from an action"""
    sb = get_user_supabase(ctx)
    
    try:
        sb.table("actions").update({"snooze_until": None})\
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", action_id).execute()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@router.get("/soon")
def soon(project_id: str = Query(...), days: Optional[int] = None, ctx: TenantCtx = Depends(member_ctx)):
    """Get actions due within specified days (uses org SLA setting if not provided)"""
    try:
        sb = get_user_supabase(ctx)
        
        # Get SLA threshold from org settings if days not provided
        if days is None:
            try:
                settings = sb.table("org_comms_settings").select("sla_due_soon_days")\
                            .eq("org_id", ctx.org_id).single().execute().data
                days = int(settings.get("sla_due_soon_days", 3)) if settings else 3
            except:
                days = 3  # fallback to default
        
        # Ensure days is int
        days = int(days)
        
        today = date.today().isoformat()
        until = (date.today() + timedelta(days=days)).isoformat()
        rows = sb.table("actions").select("id,title,owner,status,due_date")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .neq("status","done").not_.is_("due_date","null")\
               .gte("due_date", today).lte("due_date", until)\
               .order("due_date", desc=False).limit(200).execute().data or []
        return {"items": rows}
    except Exception as e:
        # Graceful fallback for development environment without database tables
        return {"items": []}