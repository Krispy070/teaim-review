from fastapi import APIRouter, Depends
from typing import Optional
import datetime as dt
from ..tenant import TenantCtx
from ..guards import require_role
from ..deps import get_service_supabase

router = APIRouter(prefix="/api/ops", tags=["ops"])

@router.get("/scheduler_health")
def scheduler_health(ctx: TenantCtx = Depends(require_role({"owner","admin"}))):
    sb = get_service_supabase()
    out = {"queue": {"due": 0, "total": 0}, "tokens_revoked_today": 0}
    try:
        q = sb.table("comms_queue").select("id").is_("sent_at","null").execute().data or []
        out["queue"]["total"] = len(q)
        # rough due count
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        d = sb.table("comms_queue").select("id").lte("not_before", now).is_("sent_at","null").execute().data or []
        out["queue"]["due"] = len(d)
    except Exception: ...
    try:
        start = dt.datetime.now(dt.timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0).isoformat()
        t = sb.table("signoff_doc_tokens").select("id").gte("revoked_at", start).execute().data or []
        out["tokens_revoked_today"] = len(t or [])
    except Exception: ...
    return out

@router.get("/comms_queue")
def get_comms_queue_list(
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
    ctx: TenantCtx = Depends(require_role({"owner","admin"}))
):
    """Get detailed communications queue list with retry information"""
    sb = get_service_supabase()
    
    try:
        # Build query for comms queue
        query = sb.table("comms_queue").select("""
            id, org_id, project_id, kind, to_email, to_token, 
            not_before, sent_at, created_at, details, error_count, last_error
        """).eq("org_id", ctx.org_id)
        
        # Filter by status if provided
        if status == "pending":
            query = query.is_("sent_at", "null")
        elif status == "sent":
            query = query.not_.is_("sent_at", "null")
        elif status == "due":
            now = dt.datetime.now(dt.timezone.utc).isoformat()
            query = query.lte("not_before", now).is_("sent_at", "null")
            
        # Order by creation time descending
        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        
        result = query.execute()
        items = result.data or []
        
        # Calculate retry metrics for chart
        retry_metrics = _calculate_retry_metrics(sb, ctx.org_id)
        
        return {
            "items": items,
            "total": len(items),
            "retry_metrics": retry_metrics,
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat()
        }
        
    except Exception as e:
        print(f"Comms queue list error: {e}")
        return {
            "items": [],
            "total": 0,
            "retry_metrics": {"daily_retries": [], "retry_by_kind": {}},
            "error": str(e),
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat()
        }

def _calculate_retry_metrics(sb, org_id: str):
    """Calculate retry statistics for the retries chart"""
    import datetime as dt
    
    try:
        # Get retry data for the last 7 days
        end_date = dt.datetime.now(dt.timezone.utc)
        start_date = end_date - dt.timedelta(days=7)
        
        # Query queue items with error counts from the last week
        queue_items = sb.table("comms_queue").select("""
            created_at, error_count, kind, sent_at
        """).eq("org_id", org_id)\
          .gte("created_at", start_date.isoformat())\
          .lte("created_at", end_date.isoformat()).execute().data or []
        
        # Group by day for daily retry chart
        daily_retries = {}
        retry_by_kind = {}
        
        for item in queue_items:
            date_str = item["created_at"][:10]  # YYYY-MM-DD
            error_count = item.get("error_count", 0) or 0
            kind = item.get("kind", "unknown")
            
            # Daily retries
            if date_str not in daily_retries:
                daily_retries[date_str] = {"date": date_str, "retries": 0, "total": 0}
            daily_retries[date_str]["total"] += 1
            daily_retries[date_str]["retries"] += error_count
            
            # Retries by kind
            if kind not in retry_by_kind:
                retry_by_kind[kind] = {"kind": kind, "retries": 0, "total": 0}
            retry_by_kind[kind]["total"] += 1
            retry_by_kind[kind]["retries"] += error_count
        
        # Convert to arrays for chart consumption
        daily_data = list(daily_retries.values())
        daily_data.sort(key=lambda x: x["date"])
        
        kind_data = list(retry_by_kind.values())
        kind_data.sort(key=lambda x: x["retries"], reverse=True)
        
        return {
            "daily_retries": daily_data,
            "retry_by_kind": kind_data
        }
        
    except Exception as e:
        print(f"Retry metrics calculation error: {e}")
        return {
            "daily_retries": [],
            "retry_by_kind": []
        }