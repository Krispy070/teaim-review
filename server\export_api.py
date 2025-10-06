import io
import os
import time
import zipfile
import requests
from fastapi import APIRouter, Body, HTTPException
from .supabase_client import get_supabase_client
import logging

router = APIRouter()

BUCKET = os.getenv("BUCKET", "project-artifacts")

def list_artifacts(org_id: str, project_id: str):
    """Get all artifacts for a project"""
    supabase = get_supabase_client()
    return supabase.table("artifacts").select(
        "id,title,path,mime_type,created_at,meeting_date"
    ).eq("org_id", org_id).eq("project_id", project_id)\
     .order("created_at", desc=True).limit(20000).execute().data or []

def get_signed_url(path: str):
    """Get signed URL for artifact download"""
    try:
        supabase = get_supabase_client()
        result = supabase.storage.from_(BUCKET).create_signed_url(path, 3600)
        return result.get("signedURL") or result.get("signed_url")
    except Exception as e:
        logging.warning(f"Failed to get signed URL for {path}: {e}")
        return None

@router.post("/projects/export/start")
def export_start(
    org_id: str = Body(...),
    project_id: str = Body(...)
):
    """Start export process and create ZIP archive"""
    try:
        supabase = get_supabase_client()
        
        # Update export start time
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        safe_name = f"{project_id}-{timestamp}.zip"
        
        supabase.table("projects").update({
            "export_started_at": now
        }).eq("id", project_id).execute()
        
        # Get all artifacts
        artifacts = list_artifacts(org_id, project_id)
        
        if not artifacts:
            return {"ok": False, "error": "No artifacts to export"}
        
        # Build ZIP in memory (for larger files, consider streaming to temp file)
        buffer = io.BytesIO()
        manifest = []
        
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for artifact in artifacts:
                signed_url = get_signed_url(artifact["path"])
                if not signed_url:
                    continue
                    
                try:
                    # Download file content
                    response = requests.get(signed_url, timeout=60)
                    if response.status_code == 200:
                        # Use title as filename, fallback to path basename
                        filename = artifact["title"] or artifact["path"].split("/")[-1]
                        
                        # Add to ZIP
                        zip_file.writestr(filename, response.content)
                        
                        # Add to manifest
                        manifest.append({
                            "title": filename,
                            "path": artifact["path"],
                            "meeting_date": artifact.get("meeting_date"),
                            "created_at": artifact["created_at"]
                        })
                        
                except Exception as e:
                    logging.warning(f"Failed to download artifact {artifact['path']}: {e}")
                    continue
            
            # Add manifest file
            import json
            zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))
        
        buffer.seek(0)
        
        # Upload ZIP to storage
        export_key = f"exports/{project_id}/{safe_name}"
        
        try:
            supabase.storage.from_(BUCKET).upload(
                path=export_key,
                file=buffer.read(),
                file_options={"content-type": "application/zip"},
                upsert=True
            )
        except Exception as e:
            logging.error(f"Failed to upload export ZIP: {e}")
            return {"ok": False, "error": "Failed to upload export"}
        
        # Update completion time and path
        completion_time = time.strftime("%Y-%m-%d %H:%M:%S")
        supabase.table("projects").update({
            "export_zip_path": export_key,
            "export_completed_at": completion_time
        }).eq("id", project_id).execute()
        
        return {"ok": True, "zip": export_key, "artifacts_count": len(manifest)}
        
    except Exception as e:
        logging.error(f"Export failed for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/projects/export/download")
def export_download(org_id: str, project_id: str):
    """Get download URL for project export"""
    try:
        supabase = get_supabase_client()
        
        # Get project export info
        project = supabase.table("projects").select(
            "export_zip_path,export_completed_at"
        ).eq("id", project_id).limit(1).execute().data
        
        if not project or not project[0].get("export_zip_path"):
            return {"ok": False, "error": "No export available"}
        
        export_path = project[0]["export_zip_path"]
        signed_url = get_signed_url(export_path)
        
        if not signed_url:
            return {"ok": False, "error": "Failed to generate download URL"}
        
        return {
            "ok": True,
            "url": signed_url,
            "exported_at": project[0].get("export_completed_at")
        }
        
    except Exception as e:
        logging.error(f"Failed to get export download URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))