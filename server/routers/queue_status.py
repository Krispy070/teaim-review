from datetime import datetime
from fastapi import APIRouter, Depends
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client

router = APIRouter(prefix="/api/queue", tags=["queue"])
ADMIN_ONLY = require_role({"owner", "admin"})

# Scheduler heartbeat tracking
scheduler_heartbeat = {"last_seen": None, "status": "unknown"}

def update_scheduler_heartbeat():
    """Update scheduler heartbeat timestamp"""
    global scheduler_heartbeat
    scheduler_heartbeat["last_seen"] = datetime.utcnow().isoformat()
    scheduler_heartbeat["status"] = "healthy"

@router.post("/heartbeat")
def post_heartbeat():
    """Endpoint for scheduler to post heartbeat"""
    update_scheduler_heartbeat()
    return {"ok": True, "timestamp": scheduler_heartbeat["last_seen"]}

@router.get("/status")
def get_queue_status(ctx: TenantCtx = Depends(ADMIN_ONLY)):
    """Get queue lengths and scheduler heartbeat status"""
    try:
        # Use service client for reliability (admin-only endpoint)
        sbs = get_supabase_client()
        
        # Get queue lengths with tenant filtering
        queue_lengths = {}
        
        # Try to get reindex queue length
        try:
            result = sbs.table("reindex_queue").select("*", count="exact", head=True)\
                       .eq("org_id", ctx.org_id).eq("status", "pending").execute()
            queue_lengths["reindex_pending"] = result.count or 0
        except Exception:
            queue_lengths["reindex_pending"] = 0
        
        # Try to get running reindex jobs
        try:
            result = sbs.table("reindex_queue").select("*", count="exact", head=True)\
                       .eq("org_id", ctx.org_id).eq("status", "running").execute()
            queue_lengths["reindex_running"] = result.count or 0
        except Exception:
            queue_lengths["reindex_running"] = 0
            
        # Calculate scheduler health
        scheduler_status = "unknown"
        if scheduler_heartbeat["last_seen"]:
            last_seen = datetime.fromisoformat(scheduler_heartbeat["last_seen"].replace('Z', '+00:00') if scheduler_heartbeat["last_seen"].endswith('Z') else scheduler_heartbeat["last_seen"])
            seconds_since = (datetime.utcnow() - last_seen.replace(tzinfo=None)).total_seconds()
            if seconds_since < 120:  # Healthy if heartbeat within 2 minutes
                scheduler_status = "healthy"
            elif seconds_since < 300:  # Warning if within 5 minutes
                scheduler_status = "warning"
            else:
                scheduler_status = "unhealthy"
        
        return {
            "queue_lengths": queue_lengths,
            "scheduler": {
                "status": scheduler_status,
                "last_heartbeat": scheduler_heartbeat["last_seen"],
                "heartbeat_age_seconds": (datetime.utcnow() - datetime.fromisoformat(scheduler_heartbeat["last_seen"].replace('Z', '+00:00') if scheduler_heartbeat["last_seen"] else "1970-01-01T00:00:00").replace(tzinfo=None)).total_seconds() if scheduler_heartbeat["last_seen"] else None
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        print(f"Queue status error: {e}")
        return {
            "queue_lengths": {"reindex_pending": 0, "reindex_running": 0},
            "scheduler": {"status": "error", "last_heartbeat": None, "heartbeat_age_seconds": None},
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }