from fastapi import APIRouter, Body, HTTPException
from .supabase_client import get_supabase_client
from .db import get_conn
import time
import logging

router = APIRouter()

@router.post("/projects/archive")
def archive_project(
    org_id: str = Body(...),
    project_id: str = Body(...),
    purge_vectors: bool = Body(True)
):
    """Archive a project and optionally purge vector data to save storage"""
    try:
        supabase = get_supabase_client()
        
        # Set project to archiving status to prevent new operations
        supabase.table("projects").update({
            "lifecycle_status": "archiving"
        }).eq("id", project_id).execute()
        
        if purge_vectors:
            # Delete vector data that can be regenerated
            # Keep artifacts and summaries for viewing
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    # Delete artifact chunks (embeddings)
                    cur.execute(
                        "DELETE FROM artifact_chunks WHERE project_id = %s",
                        (project_id,)
                    )
                    
                    # Delete memory chunks (embeddings)
                    cur.execute("""
                        DELETE FROM mem_chunks WHERE mem_entry_id IN (
                            SELECT id FROM mem_entries WHERE project_id = %s
                        )
                    """, (project_id,))
                    
                    logging.info(f"Purged vector data for project {project_id}")
                    
            except Exception as e:
                logging.warning(f"Failed to purge vectors for project {project_id}: {e}")
        
        # Mark as archived
        archived_time = time.strftime("%Y-%m-%d %H:%M:%S")
        supabase.table("projects").update({
            "lifecycle_status": "archived",
            "archived_at": archived_time,
            "storage_class": "cold"
        }).eq("id", project_id).execute()
        
        return {"ok": True, "status": "archived", "archived_at": archived_time}
        
    except Exception as e:
        logging.error(f"Failed to archive project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/reopen")
def reopen_project(
    org_id: str = Body(...),
    project_id: str = Body(...)
):
    """Reopen an archived project"""
    try:
        supabase = get_supabase_client()
        
        # Reactivate project
        supabase.table("projects").update({
            "lifecycle_status": "active",
            "storage_class": "hot",
            "archived_at": None
        }).eq("id", project_id).execute()
        
        return {"ok": True, "status": "active"}
        
    except Exception as e:
        logging.error(f"Failed to reopen project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/projects/{project_id}/storage-info")
def get_project_storage_info(project_id: str):
    """Get storage information for a project"""
    try:
        supabase = get_supabase_client()
        
        # Get basic project info
        project = supabase.table("projects").select(
            "id,name,lifecycle_status,storage_class,bytes_used,archived_at"
        ).eq("id", project_id).limit(1).execute().data
        
        if not project:
            return {"ok": False, "error": "Project not found"}
        
        # Count artifacts
        artifacts_count = len(supabase.table("artifacts").select("id").eq("project_id", project_id).execute().data or [])
        
        # Count embeddings (if not purged)
        chunks_count = len(supabase.table("artifact_chunks").select("id").eq("project_id", project_id).execute().data or [])
        
        return {
            "ok": True,
            "project": project[0],
            "artifacts_count": artifacts_count,
            "chunks_count": chunks_count,
            "has_embeddings": chunks_count > 0
        }
        
    except Exception as e:
        logging.error(f"Failed to get storage info for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))