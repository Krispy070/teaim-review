from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import zipfile
import io
import requests
import json
import time
import logging
import re
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase, get_supabase_client

router = APIRouter(prefix="/api/documents", tags=["documents"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

BUCKET = "project-artifacts"

class BulkExportRequest(BaseModel):
    document_ids: List[str]
    export_name: str = "documents_export"

def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent zip slip attacks and filesystem issues"""
    # Remove or replace path separators and other dangerous characters
    sanitized = re.sub(r'[/\\:*?"<>|]', '-', filename)
    # Remove leading/trailing whitespace and dots
    sanitized = sanitized.strip(' .')
    # Ensure it's not empty
    if not sanitized:
        sanitized = "unknown_file"
    return sanitized

def get_signed_url(path: str) -> str:
    """Get signed URL for artifact download"""
    try:
        supabase = get_supabase_client()
        # Use sign_url instead of create_signed_url
        result = supabase.storage.from_(BUCKET).create_signed_url(path, 3600)
        return result.get('signedURL', '')
    except Exception as e:
        logging.error(f"Failed to get signed URL for {path}: {e}")
        return ""

@router.post("/bulk-export")
def bulk_export_documents(
    request: BulkExportRequest,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Create a ZIP export of selected documents"""
    try:
        sb = get_user_supabase(ctx)
        
        if not request.document_ids:
            raise HTTPException(status_code=400, detail="No document IDs provided")
        
        # Get selected artifacts
        artifacts_query = sb.table("artifacts").select("*")\
            .eq("org_id", ctx.org_id)\
            .eq("project_id", project_id)\
            .in_("id", request.document_ids)
        
        artifacts_result = artifacts_query.execute()
        artifacts = artifacts_result.data or []
        
        if not artifacts:
            raise HTTPException(status_code=404, detail="No matching documents found")
        
        # Build ZIP in memory
        buffer = io.BytesIO()
        manifest = []
        
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for artifact in artifacts:
                if not artifact.get("path"):
                    continue
                    
                signed_url = get_signed_url(artifact["path"])
                if not signed_url:
                    continue
                    
                try:
                    # Download file content
                    response = requests.get(signed_url, timeout=60)
                    if response.status_code == 200:
                        # Use title as filename, fallback to path basename
                        raw_filename = artifact.get("title") or artifact["path"].split("/")[-1]
                        filename = sanitize_filename(raw_filename)
                        
                        # Ensure filename has proper extension
                        if not any(filename.endswith(ext) for ext in ['.pdf', '.docx', '.txt', '.eml', '.vtt']):
                            # Try to get extension from path
                            original_ext = ""
                            if "." in artifact["path"]:
                                original_ext = "." + artifact["path"].split(".")[-1]
                            filename = filename + original_ext
                        
                        # Add to ZIP
                        zip_file.writestr(filename, response.content)
                        
                        # Add to manifest
                        manifest.append({
                            "id": artifact["id"],
                            "title": artifact.get("title"),
                            "filename": filename,
                            "source": artifact.get("source"),
                            "created_at": artifact.get("created_at"),
                            "path": artifact["path"]
                        })
                        
                except Exception as e:
                    logging.warning(f"Failed to download artifact {artifact['id']}: {e}")
                    continue
            
            if not manifest:
                raise HTTPException(status_code=500, detail="Failed to export any documents")
            
            # Add manifest file
            zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))
        
        buffer.seek(0)
        
        # Generate filename with timestamp
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        safe_export_name = "".join(c for c in request.export_name if c.isalnum() or c in "._-")
        filename = f"{safe_export_name}_{timestamp}.zip"
        
        # Return ZIP as streaming response
        def iter_bytes():
            buffer.seek(0)
            yield buffer.read()
        
        return StreamingResponse(
            iter_bytes(),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Bulk export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.get("/export-info")
def get_export_info(
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Get information about available documents for export"""
    try:
        sb = get_user_supabase(ctx)
        
        # Get all artifacts for the project
        result = sb.table("artifacts").select("id,title,source,created_at,path")\
            .eq("org_id", ctx.org_id)\
            .eq("project_id", project_id)\
            .order("created_at", desc=True)\
            .execute()
        
        documents = result.data or []
        
        # Filter out documents without paths
        valid_documents = [
            doc for doc in documents 
            if doc.get("path") and doc.get("title")
        ]
        
        return {
            "total_documents": len(valid_documents),
            "documents": valid_documents
        }
        
    except Exception as e:
        logging.error(f"Failed to get export info: {e}")
        return {
            "total_documents": 0,
            "documents": []
        }