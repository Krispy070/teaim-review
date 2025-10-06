from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from datetime import datetime
from io import BytesIO
import os, tempfile, zipfile, json, re

from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client

router = APIRouter(prefix="/api/projects", tags=["export"])
ADMIN_OR_PM = require_role({"owner","admin","pm"})

# Get bucket from environment
BUCKET = os.getenv("BUCKET", "project-artifacts")

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

def _download_bytes(storage, bucket: str, path: str) -> bytes:
    # supabase-py storage download returns bytes
    return storage.from_(bucket).download(path)

@router.get("/export/stream")
def export_stream(
    background_tasks: BackgroundTasks,
    project_id: str = Query(...),
    include_mem: bool = Query(True),
    ctx: TenantCtx = Depends(ADMIN_OR_PM)
):
    sb = get_user_supabase(ctx)

    # gather artifacts using actual schema fields (title, path)
    arts = sb.table("artifacts").select("id,title,path,created_at")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data

    mem = []
    if include_mem:
        mem = sb.table("mem_entries").select("id,kind,body,created_at")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).limit(5000).execute().data

    # Write zip to temp file to allow true streaming FileResponse
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp_path = tmp.name
    zf = zipfile.ZipFile(tmp, mode="w", compression=zipfile.ZIP_DEFLATED)
    manifest = {
        "org_id": ctx.org_id, "project_id": project_id,
        "generated_at": datetime.utcnow().isoformat(), "include_mem": include_mem,
        "artifacts_count": len(arts), "mem_count": len(mem)
    }

    # add manifest early
    zf.writestr("manifest.json", json.dumps(manifest, indent=2))

    # artifacts
    storage = sb.storage  # uses user JWT; your RLS on storage ensures isolation
    for a in arts:
        try:
            # Use actual schema fields and bucket from environment
            b = _download_bytes(storage, BUCKET, a["path"])
            # Safe filename handling using title with fallback and sanitization
            raw_filename = a.get("title") or f"{a['id']}.bin"
            filename = sanitize_filename(raw_filename)
            arcname = f"artifacts/{filename}"
            zf.writestr(arcname, b)
        except Exception as e:
            zf.writestr(f"artifacts/_missing_{a['id']}.txt", f"Could not download: {e}")

    # memories
    if include_mem:
        zf.writestr("mem/mem_entries.ndjson", "\n".join(json.dumps(x) for x in mem))

    zf.close(); tmp.close()

    filename = f"export_{project_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"',
               "X-Accel-Buffering": "no"}  # hint to proxies
    
    # Add cleanup task to remove temporary file after response
    background_tasks.add_task(os.remove, tmp_path)
    
    return FileResponse(tmp_path, media_type="application/zip", headers=headers)