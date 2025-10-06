from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List
import datetime as dt
from ..guards import require_role, member_ctx
from ..supabase_client import get_supabase_client
from ..tenant import TenantCtx

router = APIRouter()

@router.get("/feed")
def get_audit_feed(
    project_id: str = Query(...),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    kind_filter: Optional[str] = Query(None, description="Filter by audit kind (e.g., stage.created, cr.updated)"),
    actor_filter: Optional[str] = Query(None, description="Filter by actor ID"),
    date_from: Optional[str] = Query(None, description="Start date (ISO format)"),
    date_to: Optional[str] = Query(None, description="End date (ISO format)"),
    search: Optional[str] = Query(None, description="Search in details/description"),
    ctx: TenantCtx = Depends(require_role({"admin", "owner", "pm"}))
):
    """Get filtered audit events feed for operations monitoring"""
    sb = get_supabase_client()
    
    try:
        # Base query for audit events
        query = sb.table("audit_events").select("""
            id, kind, actor_id, created_at, details,
            org_id, project_id
        """).eq("org_id", ctx.org_id).eq("project_id", project_id)
        
        # Apply filters
        if kind_filter:
            query = query.eq("kind", kind_filter)
        
        if actor_filter:
            query = query.eq("actor_id", actor_filter)
        
        if date_from:
            query = query.gte("created_at", date_from)
        
        if date_to:
            query = query.lte("created_at", date_to)
        
        # Execute query with pagination
        events = query.order("created_at", desc=True)\
                      .range(offset, offset + limit - 1)\
                      .execute().data or []
        
        # Filter by search term if provided
        if search and events:
            search_lower = search.lower()
            filtered_events = []
            for event in events:
                details = str(event.get("details", "")).lower()
                kind = str(event.get("kind", "")).lower()
                if search_lower in details or search_lower in kind:
                    filtered_events.append(event)
            events = filtered_events
        
        # Enhance events with human-readable descriptions
        enhanced_events = []
        for event in events:
            enhanced_event = event.copy()
            enhanced_event["description"] = _generate_audit_description(event)
            enhanced_event["category"] = _categorize_audit_event(event["kind"])
            enhanced_event["severity"] = _get_audit_severity(event["kind"])
            enhanced_events.append(enhanced_event)
        
        return {
            "events": enhanced_events,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "count": len(enhanced_events),
                "has_more": len(events) == limit
            },
            "filters": {
                "kind_filter": kind_filter,
                "actor_filter": actor_filter,
                "date_from": date_from,
                "date_to": date_to,
                "search": search
            }
        }
        
    except Exception as e:
        # Dev-safe: return empty feed if audit table doesn't exist
        if "not found" in str(e).lower() or "relation" in str(e).lower():
            return {
                "events": [],
                "pagination": {"limit": limit, "offset": offset, "count": 0, "has_more": False},
                "filters": {},
                "error": "Audit feed not available"
            }
        raise HTTPException(500, f"Audit feed failed: {str(e)}")

@router.get("/kinds")
def get_audit_kinds(
    project_id: str = Query(...),
    days_back: int = Query(30, ge=1, le=365),
    ctx: TenantCtx = Depends(require_role({"admin", "owner", "pm"}))
):
    """Get list of audit event kinds for filtering"""
    sb = get_supabase_client()
    
    try:
        # Get date range
        end_date = dt.datetime.now(dt.timezone.utc)
        start_date = end_date - dt.timedelta(days=days_back)
        
        # Get distinct audit kinds from recent events
        events = sb.table("audit_events").select("kind")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .gte("created_at", start_date.isoformat())\
                   .execute().data or []
        
        # Extract unique kinds and categorize them
        kinds = {}
        for event in events:
            kind = event.get("kind")
            if kind:
                category = _categorize_audit_event(kind)
                if category not in kinds:
                    kinds[category] = []
                if kind not in kinds[category]:
                    kinds[category].append(kind)
        
        # Sort kinds within each category
        for category in kinds:
            kinds[category].sort()
        
        return {"kinds_by_category": kinds}
        
    except Exception:
        # Dev-safe fallback
        return {"kinds_by_category": {}}

@router.get("/actors")
def get_audit_actors(
    project_id: str = Query(...),
    days_back: int = Query(30, ge=1, le=365),
    ctx: TenantCtx = Depends(require_role({"admin", "owner", "pm"}))
):
    """Get list of actors for filtering"""
    sb = get_supabase_client()
    
    try:
        # Get date range
        end_date = dt.datetime.now(dt.timezone.utc)
        start_date = end_date - dt.timedelta(days=days_back)
        
        # Get distinct actors from recent events
        events = sb.table("audit_events").select("actor_id")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .gte("created_at", start_date.isoformat())\
                   .is_("actor_id", "not.null")\
                   .execute().data or []
        
        # Extract unique actor IDs
        actors = list(set(event["actor_id"] for event in events if event.get("actor_id")))
        actors.sort()
        
        return {"actors": actors}
        
    except Exception:
        # Dev-safe fallback
        return {"actors": []}

@router.get("/summary")
def get_audit_summary(
    project_id: str = Query(...),
    days_back: int = Query(7, ge=1, le=90),
    ctx: TenantCtx = Depends(require_role({"admin", "owner"}))
):
    """Get audit activity summary for operations dashboard"""
    sb = get_supabase_client()
    
    try:
        # Get date range
        end_date = dt.datetime.now(dt.timezone.utc)
        start_date = end_date - dt.timedelta(days=days_back)
        
        # Get all audit events in the period
        events = sb.table("audit_events").select("kind, actor_id, created_at")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .gte("created_at", start_date.isoformat())\
                   .execute().data or []
        
        # Calculate summary statistics
        total_events = len(events)
        unique_actors = len(set(event.get("actor_id") for event in events if event.get("actor_id")))
        
        # Group by category
        category_counts = {}
        for event in events:
            category = _categorize_audit_event(event.get("kind", ""))
            category_counts[category] = category_counts.get(category, 0) + 1
        
        # Group by day
        daily_counts = {}
        for event in events:
            try:
                date_str = event.get("created_at", "")
                date_obj = dt.datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                day_key = date_obj.strftime("%Y-%m-%d")
                daily_counts[day_key] = daily_counts.get(day_key, 0) + 1
            except Exception:
                continue
        
        # Top actors
        actor_counts = {}
        for event in events:
            actor = event.get("actor_id")
            if actor:
                actor_counts[actor] = actor_counts.get(actor, 0) + 1
        
        top_actors = sorted(actor_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        
        return {
            "period": {
                "days_back": days_back,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat()
            },
            "summary": {
                "total_events": total_events,
                "unique_actors": unique_actors,
                "events_per_day": round(total_events / max(days_back, 1), 1)
            },
            "by_category": category_counts,
            "daily_activity": daily_counts,
            "top_actors": [{"actor_id": actor, "count": count} for actor, count in top_actors]
        }
        
    except Exception as e:
        # Dev-safe fallback
        if "not found" in str(e).lower() or "relation" in str(e).lower():
            return {
                "period": {"days_back": days_back},
                "summary": {"total_events": 0, "unique_actors": 0, "events_per_day": 0},
                "by_category": {},
                "daily_activity": {},
                "top_actors": [],
                "error": "Audit data not available"
            }
        raise HTTPException(500, f"Audit summary failed: {str(e)}")

# Helper functions
def _generate_audit_description(event) -> str:
    """Generate human-readable description for audit event"""
    kind = event.get("kind", "")
    actor_id = event.get("actor_id", "System")
    details = event.get("details", {})
    
    # Common patterns
    if kind.startswith("stage."):
        action = kind.split(".", 1)[1]
        stage_name = details.get("title", "stage")
        return f"{actor_id} {action} stage '{stage_name}'"
    
    elif kind.startswith("cr."):
        action = kind.split(".", 1)[1]
        cr_title = details.get("title", "change request")
        return f"{actor_id} {action} CR '{cr_title}'"
    
    elif kind.startswith("release."):
        action = kind.split(".", 1)[1]
        release_version = details.get("version", "release")
        return f"{actor_id} {action} release {release_version}"
    
    elif kind.startswith("signoff."):
        action = kind.split(".", 1)[1]
        doc_title = details.get("title", "document")
        return f"{actor_id} {action} signoff for '{doc_title}'"
    
    elif kind.startswith("member."):
        action = kind.split(".", 1)[1]
        user_id = details.get("user_id", "user")
        return f"{actor_id} {action} member {user_id}"
    
    else:
        # Generic fallback
        return f"{actor_id} performed {kind}"

def _categorize_audit_event(kind: str) -> str:
    """Categorize audit event by kind"""
    if not kind:
        return "unknown"
    
    prefix = kind.split(".", 1)[0] if "." in kind else kind
    
    category_map = {
        "stage": "Project Stages",
        "cr": "Change Requests", 
        "release": "Releases",
        "signoff": "Sign-offs",
        "member": "Team Management",
        "artifact": "Documents",
        "action": "Actions",
        "risk": "Risk Management",
        "decision": "Decisions",
        "auth": "Authentication",
        "project": "Project Management",
        "export": "Data Export",
        "import": "Data Import",
        "webhook": "Integrations",
        "notification": "Notifications"
    }
    
    return category_map.get(prefix, "Other")

def _get_audit_severity(kind: str) -> str:
    """Determine severity level of audit event"""
    if not kind:
        return "info"
    
    # High severity events
    high_severity = [
        "member.removed", "project.deleted", "signoff.revoked",
        "auth.failed", "export.unauthorized", "webhook.failed"
    ]
    
    # Medium severity events  
    medium_severity = [
        "stage.deleted", "cr.deleted", "release.cancelled",
        "member.role_changed", "signoff.expired"
    ]
    
    if kind in high_severity:
        return "high"
    elif kind in medium_severity:
        return "medium"
    else:
        return "info"