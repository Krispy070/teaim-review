from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
import datetime as dt
from ..guards import require_role, member_ctx
from ..supabase_client import get_supabase_client
from ..tenant import TenantCtx

router = APIRouter()

@router.get("/daily")
def daily_digest(
    project_id: str = Query(...),
    owner: Optional[str] = Query(None),
    days_back: int = Query(1, ge=1, le=30),
    format: str = Query("json"),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Generate daily digest for change owners"""
    
    sb = get_supabase_client()
    
    # Calculate date range
    end_date = dt.datetime.now(dt.timezone.utc)
    start_date = end_date - dt.timedelta(days=days_back)
    
    # Base query for CRs in the timeframe
    query = sb.table("changes").select("""
        id, title, assignee, priority, status, due_date, area, risk,
        created_at, updated_at
    """).eq("org_id", ctx.org_id).eq("project_id", project_id)
    
    # Filter by owner if specified
    if owner:
        query = query.eq("assignee", owner)
    
    # Filter by date range (updated in the period)
    query = query.gte("updated_at", start_date.isoformat()).lte("updated_at", end_date.isoformat())
    
    try:
        crs = query.execute().data or []
    except Exception as e:
        # Dev-safe: return empty if table doesn't exist
        crs = []
    
    # Group by assignee/owner
    owners_digest = {}
    for cr in crs:
        assignee = cr.get("assignee") or "Unassigned"
        if assignee not in owners_digest:
            owners_digest[assignee] = {
                "owner": assignee,
                "total_crs": 0,
                "by_status": {},
                "by_priority": {},
                "overdue": 0,
                "due_today": 0,
                "due_tomorrow": 0,
                "crs": []
            }
        
        digest = owners_digest[assignee]
        digest["total_crs"] += 1
        digest["crs"].append(cr)
        
        # Group by status
        status = cr.get("status") or "intake"
        digest["by_status"][status] = digest["by_status"].get(status, 0) + 1
        
        # Group by priority
        priority = cr.get("priority") or "medium"
        digest["by_priority"][priority] = digest["by_priority"].get(priority, 0) + 1
        
        # Check due dates
        due_date = cr.get("due_date")
        if due_date:
            try:
                due_dt = dt.datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                today = dt.datetime.now(dt.timezone.utc).date()
                due_dt_date = due_dt.date()
                
                if due_dt_date < today:
                    digest["overdue"] += 1
                elif due_dt_date == today:
                    digest["due_today"] += 1
                elif due_dt_date == today + dt.timedelta(days=1):
                    digest["due_tomorrow"] += 1
            except Exception:
                pass
    
    if format == "html":
        # Generate HTML digest
        html_parts = []
        html_parts.append("<h2>Daily Change Request Digest</h2>")
        html_parts.append(f"<p>Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}</p>")
        
        for owner, digest in owners_digest.items():
            html_parts.append(f"<h3>{owner}</h3>")
            html_parts.append(f"<p><strong>Total CRs:</strong> {digest['total_crs']}</p>")
            
            if digest["overdue"] > 0:
                html_parts.append(f"<p style='color: red;'><strong>Overdue:</strong> {digest['overdue']}</p>")
            if digest["due_today"] > 0:
                html_parts.append(f"<p style='color: orange;'><strong>Due Today:</strong> {digest['due_today']}</p>")
            if digest["due_tomorrow"] > 0:
                html_parts.append(f"<p style='color: blue;'><strong>Due Tomorrow:</strong> {digest['due_tomorrow']}</p>")
            
            # Status breakdown
            if digest["by_status"]:
                html_parts.append("<p><strong>By Status:</strong></p><ul>")
                for status, count in digest["by_status"].items():
                    html_parts.append(f"<li>{status}: {count}</li>")
                html_parts.append("</ul>")
            
            # Priority breakdown
            if digest["by_priority"]:
                html_parts.append("<p><strong>By Priority:</strong></p><ul>")
                for priority, count in digest["by_priority"].items():
                    html_parts.append(f"<li>{priority}: {count}</li>")
                html_parts.append("</ul>")
            
            html_parts.append("<hr>")
        
        return {"html": "".join(html_parts)}
    
    # Return JSON format
    return {
        "digest_date": end_date.isoformat(),
        "days_back": days_back,
        "project_id": project_id,
        "owner_filter": owner,
        "owners": list(owners_digest.values())
    }

@router.get("/owners")
def get_owners(
    project_id: str = Query(...),
    days_back: int = Query(30, ge=1, le=90),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Get list of change owners/assignees for the project"""
    
    sb = get_supabase_client()
    
    # Get distinct assignees from recent CRs
    try:
        end_date = dt.datetime.now(dt.timezone.utc)
        start_date = end_date - dt.timedelta(days=days_back)
        
        crs = sb.table("changes").select("assignee")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                .gte("updated_at", start_date.isoformat())\
                .execute().data or []
        
        # Extract unique assignees
        owners = set()
        for cr in crs:
            assignee = cr.get("assignee")
            if assignee:
                owners.add(assignee)
        
        return {"owners": sorted(list(owners))}
    
    except Exception:
        # Dev-safe fallback
        return {"owners": []}

@router.post("/schedule")
def schedule_digest(
    project_id: str = Query(...),
    owner: Optional[str] = Query(None),
    frequency: str = Query("daily"),  # daily, weekly
    enabled: bool = Query(True),
    ctx: TenantCtx = Depends(require_role({"admin"}))
):
    """Schedule recurring digest for owner(s)"""
    
    # This would integrate with the scheduler to send periodic digests
    # For now, just acknowledge the request
    return {
        "message": "Digest scheduling registered",
        "project_id": project_id,
        "owner": owner,
        "frequency": frequency,
        "enabled": enabled
    }