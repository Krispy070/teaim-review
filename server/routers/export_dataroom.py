from fastapi import APIRouter, Depends, Query, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
import io, zipfile, json, os, tempfile
from datetime import datetime, timezone
from typing import Iterator
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/export", tags=["export"])

@router.get("/dataroom.zip")
def dataroom(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Export project data room as ZIP file containing artifacts, links, sign-offs, and manifest"""
    sb = get_user_supabase(ctx); sbs = get_supabase_client()
    
    try:
        # Get project and branding data
        proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data or {}
        code = proj.get("code") or project_id
        org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
        
        # Collect data
        arts = sb.table("artifacts").select("id,name,storage_bucket,storage_path,created_at")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id).limit(5000).execute().data or []
        links = sb.table("share_links").select("artifact_id,token,expires_at,revoked_at,created_at")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id).limit(5000).execute().data or []
        docs = sb.table("signoff_docs").select("id,name,status,signed_by,signed_name,signed_at,created_at")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id).limit(2000).execute().data or []
        
        manifest = {
          "org_id": ctx.org_id, 
          "project_id": project_id, 
          "project_code": code,
          "generated_at": datetime.now(timezone.utc).isoformat(),
          "counts": {"artifacts": len(arts), "links": len(links), "signoff_docs": len(docs)}
        }
        
        # Build HTML manifest (brand header + quick tables)
        hdr = export_header_html(org, code)
        def table(title, rows, cols):
            if not rows: return f"<h3>{title}</h3><div>No items.</div>"
            th = "".join([f"<th style='text-align:left;padding:4px'>{c}</th>" for c in cols])
            trs = ""
            for r in rows[:1000]:
                tds = "".join([f"<td style='padding:4px'>{(r.get(c) if isinstance(r,dict) else '')}</td>" for c in cols])
                trs += f"<tr>{tds}</tr>"
            return f"<h3>{title}</h3><table style='border-collapse:collapse;width:100%'><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"
        
        html_manifest = f"""<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;max-width:880px;margin:auto}}</style>
</head><body>{hdr}
<h2>Data Room Manifest</h2>
<div style="font-size:12px;color:#666">Generated {manifest['generated_at']}</div>
{table("Artifacts", arts, ["id","name","created_at"])}
{table("Share Links", links, ["artifact_id","token","expires_at","revoked_at","created_at"])}
{table("Sign-Off Docs", docs, ["id","name","status","signed_by","signed_at","created_at"])}
</body></html>"""
        
        # Create ZIP
        buf = io.BytesIO()
        zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)
        
        # Add manifest and metadata
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        zf.writestr("manifest.html", html_manifest)
        zf.writestr("share_links.json", json.dumps(links, indent=2, default=str))
        zf.writestr("signoff_docs.json", json.dumps(docs, indent=2, default=str))
        
        # Pack artifacts (best effort, throttle to keep dev fast)
        for a in arts[:500]:
            try:
                b = sbs.storage.from_(a["storage_bucket"]).download(a["storage_path"])
                zf.writestr(f"artifacts/{a.get('name') or a['id']}", b)
            except Exception as e:
                zf.writestr(f"artifacts/_missing_{a['id']}.txt", f"Missing: {e}")
        
        zf.close()
        buf.seek(0)
        
        return StreamingResponse(
            iter([buf.getvalue()]), 
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="dataroom.zip"'}
        )
        
    except Exception as e:
        print(f"Failed to export data room: {e}")
        # Return minimal ZIP with error info
        buf = io.BytesIO()
        zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)
        zf.writestr("error.txt", f"Export failed: {e}")
        zf.close()
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]), 
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="dataroom-error.zip"'}
        )

PM_PLUS = require_role({"owner","admin","pm","lead"})

def _stream_zip_generator(ctx: TenantCtx, project_id: str, memory_mode: bool = False) -> Iterator[bytes]:
    """
    Memory-efficient ZIP streaming generator for large dataroom exports.
    
    memory_mode=True: Uses disk-backed streaming with SpooledTemporaryFile (memory-efficient)
    memory_mode=False: Uses BytesIO in-memory approach (faster for smaller exports)
    """
    sb = get_user_supabase(ctx)
    sbs = get_supabase_client()
    
    # Get project and branding data
    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data or {}
    code = proj.get("code") or project_id
    org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
    
    # Collect metadata first (lightweight queries)
    links = sb.table("share_links").select("artifact_id,token,expires_at,revoked_at,created_at")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id).limit(5000).execute().data or []
    docs = sb.table("signoff_docs").select("id,name,status,signed_by,signed_name,signed_at,created_at")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id).limit(2000).execute().data or []
    
    # Create appropriate file-like object based on memory mode
    if memory_mode:
        # Memory-efficient: Use disk-backed temporary file for large exports
        from tempfile import SpooledTemporaryFile
        zip_file_obj = SpooledTemporaryFile(max_size=50*1024*1024)  # 50MB threshold
    else:
        # Standard mode: Use in-memory BytesIO for faster small exports
        zip_file_obj = io.BytesIO()
    
    last_yield_pos = 0
    
    try:
        zip_file = zipfile.ZipFile(zip_file_obj, "w", zipfile.ZIP_DEFLATED, compresslevel=1)
        
        # Add manifest and metadata files first
        manifest = {
            "org_id": ctx.org_id,
            "project_id": project_id, 
            "project_code": code,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "memory_mode": memory_mode,
            "streaming": True
        }
        
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))
        zip_file.writestr("share_links.json", json.dumps(links, indent=2, default=str))
        zip_file.writestr("signoff_docs.json", json.dumps(docs, indent=2, default=str))
        
        # Build HTML manifest
        hdr = export_header_html(org, code)
        def table(title, rows, cols):
            if not rows: return f"<h3>{title}</h3><div>No items.</div>"
            th = "".join([f"<th style='text-align:left;padding:4px'>{c}</th>" for c in cols])
            trs = ""
            for r in rows[:1000]:
                tds = "".join([f"<td style='padding:4px'>{(r.get(c) if isinstance(r,dict) else '')}</td>" for c in cols])
                trs += f"<tr>{tds}</tr>"
            return f"<h3>{title}</h3><table style='border-collapse:collapse;width:100%'><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"
        
        html_manifest = f"""<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;max-width:880px;margin:auto}}</style>
</head><body>{hdr}
<h2>Streaming Data Room Export</h2>
<div style="font-size:12px;color:#666">Generated {manifest['generated_at']} • Memory Mode: {memory_mode}</div>
{table("Share Links", links, ["artifact_id","token","expires_at","revoked_at","created_at"])}
{table("Sign-Off Docs", docs, ["id","name","status","signed_by","signed_at","created_at"])}
</body></html>"""
        
        zip_file.writestr("manifest.html", html_manifest)
        
        def yield_new_bytes():
            """Yield new bytes since last yield without closing the ZIP"""
            nonlocal last_yield_pos
            if memory_mode:
                # For streaming mode, yield incrementally  
                zip_file_obj.flush()
                current_pos = zip_file_obj.tell()
                zip_file_obj.seek(last_yield_pos)
                new_bytes = zip_file_obj.read(current_pos - last_yield_pos)
                last_yield_pos = current_pos
                if new_bytes:
                    yield new_bytes
        
        # Process artifacts in batches for memory mode, all at once for standard
        if memory_mode:
            batch_size = 25  # Smaller batches for streaming
            offset = 0
            
            while True:
                arts_batch = sb.table("artifacts").select("id,name,storage_bucket,storage_path,created_at")\
                    .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                    .order("created_at")\
                    .range(offset, offset + batch_size - 1).execute().data or []
                
                if not arts_batch:
                    break
                    
                for a in arts_batch:
                    try:
                        b = sbs.storage.from_(a["storage_bucket"]).download(a["storage_path"])
                        zip_file.writestr(f"artifacts/{a.get('name') or a['id']}", b)
                    except Exception as e:
                        zip_file.writestr(f"artifacts/_missing_{a['id']}.txt", f"Missing: {e}")
                
                offset += batch_size
                
                # Stream incremental bytes every few batches
                if offset % 50 == 0:
                    yield from yield_new_bytes()
        else:
            # Standard mode: Load all artifacts at once
            arts = sb.table("artifacts").select("id,name,storage_bucket,storage_path,created_at")\
                    .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                    .order("created_at")\
                    .limit(5000).execute().data or []
                    
            for a in arts:
                try:
                    b = sbs.storage.from_(a["storage_bucket"]).download(a["storage_path"])
                    zip_file.writestr(f"artifacts/{a.get('name') or a['id']}", b)
                except Exception as e:
                    zip_file.writestr(f"artifacts/_missing_{a['id']}.txt", f"Missing: {e}")
        
        # Close ZIP and yield final bytes
        zip_file.close()
        
        if memory_mode:
            # Yield any remaining bytes
            yield from yield_new_bytes()
        else:
            # Standard mode: yield all bytes at once
            zip_file_obj.seek(0)
            while True:
                chunk = zip_file_obj.read(8192)
                if not chunk:
                    break
                yield chunk
        
        zip_file_obj.close()
            
    except Exception as e:
        # Clean up and log error - do not yield additional content after streaming started
        zip_file_obj.close()
        # Log the error instead of yielding corrupt content
        import logging
        logging.error(f"Streaming dataroom export failed for project {project_id}: {e}")
        # If this is the first content, we can yield an error ZIP
        # If streaming already started, the client will get a partial download
        if last_yield_pos == 0:
            error_buf = io.BytesIO()
            error_zip = zipfile.ZipFile(error_buf, "w", zipfile.ZIP_DEFLATED)
            error_zip.writestr("error.txt", f"Export failed before streaming began: {e}")
            error_zip.close()
            error_buf.seek(0)
            yield error_buf.read()

@router.get("/zip-stream")
def stream_dataroom_zip(
    project_id: str = Query(...), 
    memory_mode: bool = Query(False, description="Enable memory-efficient disk-backed streaming for large exports"),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """
    Streaming Data Room ZIP export with memory mode toggle.
    
    Memory mode (memory_mode=true):
    - Uses disk-backed SpooledTemporaryFile for memory efficiency
    - Streams incrementally during processing
    - Recommended for large exports (>1000 files)
    
    Standard mode (memory_mode=false): 
    - Uses in-memory BytesIO for faster processing
    - Single response after full processing
    - Recommended for smaller exports (<1000 files)
    """
    try:
        proj = get_user_supabase(ctx).table("projects").select("code").eq("id", project_id).single().execute().data or {}
        code = proj.get("code") or project_id
        
        filename = f"dataroom_stream_{code}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"
        
        return StreamingResponse(
            _stream_zip_generator(ctx, project_id, memory_mode),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Accel-Buffering": "no",  # Disable proxy buffering for true streaming
                "Cache-Control": "no-store"  # Prevent caching of large exports
            }
        )
        
    except Exception as e:
        # Return error response if initialization fails
        import logging
        logging.error(f"Stream export initialization failed for project {project_id}: {e}")
        
        error_buf = io.BytesIO()
        error_zip = zipfile.ZipFile(error_buf, "w", zipfile.ZIP_DEFLATED)
        error_zip.writestr("error.txt", f"Stream export initialization failed: {e}")
        error_zip.close()
        error_buf.seek(0)
        
        return StreamingResponse(
            iter([error_buf.getvalue()]),
            media_type="application/zip", 
            headers={"Content-Disposition": 'attachment; filename="dataroom-stream-error.zip"'}
        )