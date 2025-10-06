from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import logging

from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client as get_service_supabase

router = APIRouter(prefix="/classifier/ingest", tags=["classifier-ingest"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

log = logging.getLogger("classifier_ingest")

class ClassifierResult(BaseModel):
    change_type: str  # action|risk|decision|integration
    operation: str    # insert|update|delete
    target_table: str
    target_id: Optional[str] = None
    payload: Dict[str, Any]
    confidence: float = Field(ge=0.0, le=1.0)
    source_artifact_id: Optional[str] = None
    source_span: Optional[str] = None

class ClassifierBatch(BaseModel):
    project_id: str
    results: List[ClassifierResult]
    processing_timestamp: Optional[str] = None

def _queue_update(sb, org_id: str, project_id: str, result: ClassifierResult, created_by: str = "classifier"):
    """Queue a classifier result as a pending update"""
    
    # Enqueue to updates table for PM review
    update_record = {
        "org_id": org_id,
        "project_id": project_id,
        "change_type": result.change_type,
        "operation": result.operation,
        "target_table": result.target_table,
        "target_id": result.target_id,
        "payload": result.payload,
        "source_artifact_id": result.source_artifact_id,
        "source_span": result.source_span,
        "confidence": result.confidence,
        "created_by": created_by,
        "status": "pending",
        "reviewed_by": None,
        "applied_at": None
    }
    
    response = sb.table("updates").insert(update_record).execute()
    return response.data[0] if response.data else None

def _emit_classifier_event(org_id: str, project_id: str, result: ClassifierResult):
    """Emit webhook event for classifier processing"""
    try:
        from ..utils.events import emit_event
        emit_event(
            org_id=org_id,
            project_id=project_id,
            kind="classifier.ingest",
            details={
                "change_type": result.change_type,
                "operation": result.operation,
                "target_table": result.target_table,
                "confidence": result.confidence,
                "source_artifact_id": result.source_artifact_id
            }
        )
    except Exception as e:
        log.warning(f"Failed to emit classifier event: {e}")

@router.post("/single")
def ingest_single(result: ClassifierResult, project_id: str, ctx: TenantCtx = Depends(PM_PLUS)):
    """Ingest a single classifier result into updates queue"""
    
    sb = get_user_supabase(ctx)
    
    try:
        # Queue the classifier result
        queued_update = _queue_update(sb, ctx.org_id, project_id, result, "classifier")
        
        if not queued_update:
            raise HTTPException(500, "Failed to queue classifier result")
        
        # Emit webhook event
        _emit_classifier_event(ctx.org_id, project_id, result)
        
        log.info(f"Queued classifier result: {result.change_type}/{result.operation} for project {project_id}")
        
        return {
            "ok": True,
            "update_id": queued_update["id"],
            "status": "queued",
            "confidence": result.confidence
        }
        
    except Exception as e:
        log.error(f"Failed to ingest classifier result: {e}")
        raise HTTPException(500, f"Failed to ingest classifier result: {str(e)}")

@router.post("/batch")  
def ingest_batch(batch: ClassifierBatch, ctx: TenantCtx = Depends(PM_PLUS)):
    """Ingest a batch of classifier results into updates queue"""
    
    sb = get_user_supabase(ctx)
    
    if not batch.results:
        raise HTTPException(400, "No classifier results provided")
    
    # Verify user is a member of the target project
    try:
        sb.table("project_members").select("id").eq("org_id", ctx.org_id)\
          .eq("project_id", batch.project_id).eq("user_id", ctx.user_id).single().execute()
    except Exception:
        raise HTTPException(403, "Access denied: not a member of target project")
    
    # Use user supabase to ensure proper RLS enforcement
    # Only use org_id and project_id from validated context
    
    queued_updates = []
    failed_results = []
    
    for i, result in enumerate(batch.results):
        try:
            # Queue each result with validated context
            queued_update = _queue_update(sb, ctx.org_id, batch.project_id, result, "classifier")
            
            if queued_update:
                queued_updates.append({
                    "index": i,
                    "update_id": queued_update["id"],
                    "change_type": result.change_type,
                    "confidence": result.confidence
                })
                
                # Emit webhook event for each result
                _emit_classifier_event(ctx.org_id, batch.project_id, result)
            else:
                failed_results.append({"index": i, "error": "Failed to queue update"})
                
        except Exception as e:
            log.error(f"Failed to process batch item {i}: {e}")
            failed_results.append({"index": i, "error": str(e)})
    
    log.info(f"Processed classifier batch: {len(queued_updates)} queued, {len(failed_results)} failed")
    
    return {
        "ok": True,
        "queued": len(queued_updates),
        "failed": len(failed_results),
        "queued_updates": queued_updates,
        "failed_results": failed_results,
        "project_id": batch.project_id
    }

@router.post("/reprocess")
def reprocess_artifact(artifact_id: str, project_id: str, background_tasks: BackgroundTasks, ctx: TenantCtx = Depends(PM_PLUS)):
    """Trigger re-processing of an artifact through the classifier"""
    
    sb = get_user_supabase(ctx)
    
    # Verify artifact exists and belongs to project
    try:
        artifact = sb.table("artifacts").select("id,title,source")\
                     .eq("id", artifact_id).eq("project_id", project_id).single().execute()
        
        if not artifact.data:
            raise HTTPException(404, "Artifact not found")
            
    except Exception:
        raise HTTPException(404, "Artifact not found or access denied")
    
    # Add background task to reprocess
    background_tasks.add_task(_reprocess_artifact_task, ctx.org_id, project_id, artifact_id)
    
    return {
        "ok": True,
        "artifact_id": artifact_id,
        "status": "reprocessing_scheduled",
        "message": "Artifact has been queued for reprocessing"
    }

def _reprocess_artifact_task(org_id: str, project_id: str, artifact_id: str):
    """Background task to reprocess an artifact through classifier"""
    try:
        # This would integrate with your ML pipeline
        log.info(f"Reprocessing artifact {artifact_id} for project {project_id}")
        
        # Emit event for reprocessing
        from ..utils.events import emit_event
        emit_event(
            org_id=org_id,
            project_id=project_id,
            kind="classifier.reprocess",
            details={
                "artifact_id": artifact_id,
                "scheduled_at": datetime.now(timezone.utc).isoformat()
            }
        )
        
    except Exception as e:
        log.error(f"Failed to reprocess artifact {artifact_id}: {e}")

@router.get("/stats")
def get_classifier_stats(project_id: str, ctx: TenantCtx = Depends(member_ctx)):
    """Get classifier processing statistics for project"""
    
    sb = get_user_supabase(ctx)
    
    try:
        # Get update statistics by change type
        stats = sb.table("updates").select("change_type,status,confidence")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .eq("created_by", "classifier").execute()
        
        data = stats.data or []
        
        # Aggregate stats
        by_type = {}
        by_status = {}
        confidence_sum = 0
        confidence_count = 0
        
        for item in data:
            change_type = item.get("change_type", "unknown")
            status = item.get("status", "unknown")
            confidence = item.get("confidence", 0.0)
            
            by_type[change_type] = by_type.get(change_type, 0) + 1
            by_status[status] = by_status.get(status, 0) + 1
            
            if confidence:
                confidence_sum += confidence
                confidence_count += 1
        
        avg_confidence = confidence_sum / confidence_count if confidence_count > 0 else 0.0
        
        return {
            "project_id": project_id,
            "total_results": len(data),
            "by_change_type": by_type,
            "by_status": by_status,
            "average_confidence": round(avg_confidence, 3),
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        log.error(f"Failed to get classifier stats: {e}")
        raise HTTPException(500, f"Failed to get classifier stats: {str(e)}")