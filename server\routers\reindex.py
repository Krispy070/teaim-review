from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timezone
import os, requests

from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client

router = APIRouter(prefix="/api/reindex", tags=["reindex"])
ADMIN_OR_PM = require_role({"owner","admin","pm"})

class QueueBody(BaseModel):
    artifact_id: str | None = None
    stored_key: str | None = None   # org/<org>/project/<proj>/restores/...

@router.get("/list")
def list_queue(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    r = sb.table("reindex_queue").select("*")\
          .eq("org_id", ctx.org_id).eq("project_id", project_id)\
          .order("scheduled_at", desc=True).limit(200).execute()
    return {"items": r.data or []}

@router.post("/queue")
def queue_item(body: QueueBody, project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_PM)):
    if not (body.artifact_id or body.stored_key):
        raise HTTPException(400, "Provide artifact_id or stored_key")
    sb = get_user_supabase(ctx)
    # idempotent upsert-ish: pending or failed can be requeued
    sb.table("reindex_queue").insert({
        "org_id": ctx.org_id, "project_id": project_id,
        "artifact_id": body.artifact_id, "stored_key": body.stored_key,
        "status": "pending", "attempts": 0,
        "scheduled_at": datetime.now(timezone.utc).isoformat()
    }).execute()
    # audit
    try:
        sb.table("audit_events").insert({
            "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
            "kind": "reindex.queued",
            "details": {"artifact_id": body.artifact_id, "stored_key": body.stored_key}
        }).execute()
    except Exception: pass
    return {"ok": True}

@router.get("/status")
def get_status(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Get reindex queue status for project"""
    sb = get_user_supabase(ctx)
    try:
        # Count pending jobs
        pending = sb.table("reindex_queue").select("id", count="exact")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .eq("status", "pending").execute()
        # Count running jobs  
        running = sb.table("reindex_queue").select("id", count="exact")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .eq("status", "running").execute()
        return {
            "pending": pending.count or 0,
            "running": running.count or 0
        }
    except Exception as e:
        # Return empty status if table/query fails
        return {"pending": 0, "running": 0}

@router.post("/trigger") 
def trigger_reindex(project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_PM)):
    """Manually trigger reindexing of all stored files for a project"""
    sb = get_user_supabase(ctx)
    sbs = get_supabase_client()  # Service client for storage operations
    
    # Find all files in project restores that can be re-embedded
    # Look for files stored under org/<org>/project/<proj>/restores/
    try:
        restore_prefix = f"org/{ctx.org_id}/project/{project_id}/restores/"
        # List files in artifacts bucket under restores path  
        files = sbs.storage.from_("artifacts").list(restore_prefix) or []
        
        queued_count = 0
        for file_obj in files:
            if not file_obj.get("name"):
                continue
            stored_key = restore_prefix + file_obj["name"] 
            
            # Check if already queued/processing
            existing = sb.table("reindex_queue").select("id")\
                        .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                        .eq("stored_key", stored_key)\
                        .in_("status", ["pending", "running"]).execute()
            
            if not (existing.data or []):
                # Queue for reindexing
                sb.table("reindex_queue").insert({
                    "org_id": ctx.org_id, "project_id": project_id,
                    "stored_key": stored_key, "status": "pending", "attempts": 0,
                    "scheduled_at": datetime.now(timezone.utc).isoformat()
                }).execute()
                queued_count += 1
                
        return {"queued": queued_count}
    except Exception as e:
        raise HTTPException(500, f"Failed to trigger reindex: {e}")

@router.post("/run-now")
def run_now(artifact_id: str | None = None, stored_key: str | None = None,
            project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_PM)):
    # enqueue then return; scheduler will pick it up very soon
    return queue_item(QueueBody(artifact_id=artifact_id, stored_key=stored_key), project_id, ctx)