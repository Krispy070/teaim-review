from fastapi import APIRouter, Depends, Query, Path, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_storage_client
from fastapi.responses import HTMLResponse, StreamingResponse
import io, csv, tempfile, os
from pathlib import Path as PathLib
from uuid import uuid4
import re

router = APIRouter(prefix="/api/guides", tags=["guides"])
PM_PLUS = require_role({"owner","admin","pm"})

class Guide(BaseModel):
    id: Optional[str] = None
    title: str
    area: Optional[str] = None
    owner: Optional[str] = None       # user_id/email
    visibility: Optional[str] = "team" # team|owners|public (future)
    tags: Optional[List[str]] = []
    steps: Optional[List[str]] = []    # simple markdown bullet steps
    sources: Optional[List[dict]] = [] # [{type:'meeting', id:'...', clip:{start_ms,end_ms}}, {type:'comment', id:'...'}]
    status: Optional[str] = "draft"    # draft|approved|archived

@router.get("/list")
def list_guides(project_id: str = Query(...), area: str | None = None,
                ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("guides").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id)
        if area: q = q.eq("area", area)
        rows = q.order("updated_at", desc=True).limit(1000).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}

@router.get("/search")
def search(project_id: str = Query(...), q: str = Query(""), area: str | None = None,
           ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        qry = sb.table("guides").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id)
        if area: qry = qry.eq("area", area)
        rows = qry.limit(1000).execute().data or []
        ql = q.lower()
        res = [g for g in rows if (ql in (g.get("title") or "").lower() 
                                   or any(ql in (s or "").lower() for s in (g.get("steps") or []))
                                   or any(ql in (t or "").lower() for t in (g.get("tags") or [])))]
        return {"items": res[:200]}
    except Exception:
        return {"items": []}

@router.post("/upsert")
def upsert(body: Guide, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        data = body.model_dump()
        data.update({"org_id": ctx.org_id, "project_id": project_id, "updated_at": datetime.now(timezone.utc).isoformat()})
        if body.id:
            sb.table("guides").update(data).eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",body.id).execute()
        else:
            sb.table("guides").insert(data).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.post("/delete")
def delete(id: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("guides").delete().eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",id).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

# Promote area comment -> guide (quick capture)
@router.post("/promote_comment")
def promote_comment(project_id: str = Query(...), area: str = Query(...), comment_id: str = Query(...),
                    ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        c = sb.table("area_comments").select("message,user_id,created_at").eq("org_id",ctx.org_id)\
             .eq("project_id",project_id).eq("id",comment_id).single().execute().data or {}
        if not c: return {"ok": False}
        sb.table("guides").insert({
            "org_id": ctx.org_id, "project_id": project_id,
            "title": (c.get("message") or "").split("\n")[0][:120] or "Mini Guide",
            "area": area, "owner": c.get("user_id"),
            "steps": [c.get("message") or ""], 
            "sources": [{"type":"comment","id":comment_id}],
            "status":"draft", "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

# Create from meeting clip (dev-safe; stores metadata only)
class ClipBody(BaseModel):
    meeting_id: str
    start_ms: int
    end_ms: int
    title: str
    area: Optional[str] = None
    note: Optional[str] = None

@router.post("/from_meeting_clip")
def from_meeting_clip(body: ClipBody, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("guides").insert({
            "org_id": ctx.org_id, "project_id": project_id,
            "title": body.title, "area": body.area, "owner": ctx.user_id,
            "steps": [body.note or ""],
            "sources": [{"type":"meeting","id":body.meeting_id,"clip":{"start_ms":body.start_ms,"end_ms":body.end_ms}}],
            "status":"draft", "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

# File upload for guides - returns markdown reference
@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Upload a file for use in guides and return markdown reference"""
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # File validation
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.doc', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.svg'}
    ALLOWED_MIME_TYPES = {
        'application/pdf', 'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml'
    }
    
    # Read file content
    content = await file.read()
    
    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large: {len(content)} bytes (max {MAX_FILE_SIZE})")
    
    # Check extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {ext}")
    
    # Check MIME type
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"MIME type not allowed: {file.content_type}")
    
    try:
        # Sanitize filename to prevent path traversal
        safe_filename = Path(file.filename).name  # Extract just the filename, no path
        safe_filename = re.sub(r'[^\w\-_\.]', '_', safe_filename)  # Replace special chars with underscore
        
        # Generate unique storage key for guides
        unique_id = uuid4().hex[:8]
        storage_key = f"guides/{ctx.org_id}/{project_id}/{unique_id}_{safe_filename}"
        
        # Upload to Supabase storage
        storage = get_supabase_storage_client()
        storage.upload(storage_key, content, file_options={"content-type": file.content_type})
        
        # Generate public URL for the file
        # For Supabase storage, the URL pattern is typically:
        # https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
        file_url = f"/api/guides/file/{ctx.org_id}/{project_id}/{unique_id}_{safe_filename}"
        
        # Determine markdown based on file type
        if file.content_type and file.content_type.startswith('image/'):
            # For images, return image markdown
            markdown = f"![{file.filename}]({file_url})"
        else:
            # For documents, return link markdown
            markdown = f"[{file.filename}]({file_url})"
        
        return {
            "ok": True,
            "filename": file.filename,  # Keep original filename for display
            "storage_key": storage_key,
            "url": file_url,
            "markdown": markdown
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# Serve uploaded guide files
# TEMPORARILY DISABLED - Path parameter issue
# @router.get("/file/{org_id}/{project_id}/{filename}")
async def serve_guide_file_DISABLED(
    org_id: str = Path(...),
    project_id: str = Path(...), 
    filename: str = Path(...),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Serve uploaded guide files with proper authentication"""
    
    # Verify user has access to this project
    if ctx.org_id != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        storage_key = f"guides/{org_id}/{project_id}/{filename}"
        storage = get_supabase_storage_client()
        
        # Download file from storage
        file_data = storage.download(storage_key)
        
        # Determine content type from filename
        ext = PathLib(filename).suffix.lower()
        content_type = {
            '.pdf': 'application/pdf',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc': 'application/msword',
            '.txt': 'text/plain',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
        }.get(ext, 'application/octet-stream')
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=content_type,
            headers={"Content-Disposition": f"inline; filename={filename}"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=404, detail="File not found")

# Export HTML (printable) + CSV
@router.get("/export.html", response_class=HTMLResponse)
def export_html(project_id: str = Query(...), id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    import html
    sb = get_user_supabase(ctx)
    try:
        g = sb.table("guides").select("*").eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",id).single().execute().data or {}
    except Exception:
        g={}
    steps = "".join([f"<li>{html.escape(s)}</li>" for s in (g.get("steps") or [])]) or "<li>—</li>"
    tags = html.escape(", ".join(g.get("tags") or []))
    html_content = f"""<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;max-width:880px;margin:auto">
<h2>{html.escape(g.get('title','Guide'))}</h2>
<div><b>Area:</b> {html.escape(g.get('area','—'))} • <b>Owner:</b> {html.escape(g.get('owner','—'))} • <b>Status:</b> {html.escape(g.get('status','draft'))} • <b>Tags:</b> {tags or '—'}</div>
<ol>{steps}</ol>
</body></html>"""
    return HTMLResponse(html_content)

@router.get("/export.csv")
def export_csv(project_id: str = Query(...), area: str | None = None, ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("guides").select("*").eq("org_id",ctx.org_id).eq("project_id",project_id)
        if area: q = q.eq("area", area)
        rows = q.order("updated_at",desc=True).limit(5000).execute().data or []
    except Exception:
        rows=[]
    def safe_csv_value(val):
        """Prevent CSV formula injection by prefixing dangerous values with single quote"""
        if val and str(val).startswith(('=', '+', '-', '@')):
            return f"'{val}"
        return val
    
    s=io.StringIO(); w=csv.writer(s); w.writerow(["id","title","area","owner","status","tags","steps"])
    for r in rows: w.writerow([safe_csv_value(r.get("id")),safe_csv_value(r.get("title")),safe_csv_value(r.get("area")),
                               safe_csv_value(r.get("owner")),safe_csv_value(r.get("status")),
                               safe_csv_value("|".join(r.get("tags") or [])), safe_csv_value("|".join(r.get("steps") or []))])
    s.seek(0)
    return StreamingResponse(iter([s.read()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="guides.csv"'})