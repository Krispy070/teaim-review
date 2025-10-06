from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from io import BytesIO
import zipfile, tempfile, os, datetime as dt

from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client

router = APIRouter(prefix="/api/backups", tags=["backups"])
ADMIN_OR_OWNER = require_role({"owner","admin"})

def _list_backups(sb_service, org_id: str, project_id: str):
    prefix = f"org/{org_id}/project/{project_id}/"
    items = sb_service.storage().from_("backups").list(prefix) or []
    # Supabase returns array of objects with 'name','updated_at','id','metadata' etc.
    out = []
    for it in items:
        out.append({
            "key": prefix + it.get("name"),
            "name": it.get("name"),
            "updated_at": it.get("updated_at"),
            "size": (it.get("metadata") or {}).get("size")
        })
    return out

@router.get("/list")
def list_backups(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sbs = get_supabase_client()
    try:
        return {"backups": _list_backups(sbs, ctx.org_id, project_id)}
    except Exception as e:
        print(f"List backups failed: {e}")
        return {"backups": []}

@router.get("/contents")
def backup_contents(backup_key: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    sbs = get_supabase_client()
    try:
        # SECURITY: Validate backup belongs to this org/project
        expected_prefix = f"org/{ctx.org_id}/project/{project_id}/"
        if not backup_key.startswith(expected_prefix):
            raise HTTPException(403, "Access denied: backup does not belong to your organization")
        
        # download zip head (limit to ~250MB)
        b = sbs.storage().from_("backups").download(backup_key)
        if not b: raise HTTPException(404, "Backup not found")
        if len(b) > 250*1024*1024: raise HTTPException(413, "Backup too large to inspect")
        zf = zipfile.ZipFile(BytesIO(b), "r")
        entries = []
        for zi in zf.infolist():
            entries.append({"name": zi.filename, "size": zi.file_size})
        return {"entries": entries}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Backup contents failed: {e}")
        raise HTTPException(500, f"Failed to read backup contents: {str(e)}")

@router.get("/get-file")
def get_file(backup_key: str = Query(...), artifact_name: str = Query(...),
             project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    sbs = get_supabase_client()
    try:
        # SECURITY: Validate backup belongs to this org/project
        expected_prefix = f"org/{ctx.org_id}/project/{project_id}/"
        if not backup_key.startswith(expected_prefix):
            raise HTTPException(403, "Access denied: backup does not belong to your organization")
        
        b = sbs.storage().from_("backups").download(backup_key)
        if not b: raise HTTPException(404, "Backup not found")
        zf = zipfile.ZipFile(BytesIO(b), "r")
        path = artifact_name if artifact_name.startswith("artifacts/") else f"artifacts/{artifact_name}"
        try:
            data = zf.read(path)
        except KeyError:
            raise HTTPException(404, "Artifact not found in backup")
        # stream as download
        return StreamingResponse(iter([data]), media_type="application/octet-stream",
                                 headers={"Content-Disposition": f'attachment; filename="{os.path.basename(path)}"'})
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get file failed: {e}")
        raise HTTPException(500, f"Failed to get file: {str(e)}")

@router.post("/store-file")
def store_file(backup_key: str = Query(...), artifact_name: str = Query(...),
               project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    sbs = get_supabase_client()
    try:
        # SECURITY: Validate backup belongs to this org/project
        expected_prefix = f"org/{ctx.org_id}/project/{project_id}/"
        if not backup_key.startswith(expected_prefix):
            raise HTTPException(403, "Access denied: backup does not belong to your organization")
        
        b = sbs.storage().from_("backups").download(backup_key)
        if not b: raise HTTPException(404, "Backup not found")
        zf = zipfile.ZipFile(BytesIO(b), "r")
        path = artifact_name if artifact_name.startswith("artifacts/") else f"artifacts/{artifact_name}"
        try:
            data = zf.read(path)
        except KeyError:
            raise HTTPException(404, "Artifact not found in backup")

        # store under artifacts/restores/
        ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d_%H%M%S")
        fname = os.path.basename(path)
        key = f"org/{ctx.org_id}/project/{project_id}/restores/{ts}__{fname}"
        try:
            sbs.storage().from_("artifacts").upload(key, data, {
                "content-type": "application/octet-stream",
                "upsert": True
            })
        except Exception as e:
            raise HTTPException(500, f"Upload failed: {e}")

        # Optional: write an audit event
        try:
            sbs.table("audit_events").insert({
                "org_id": ctx.org_id, "project_id": project_id,
                "actor_id": ctx.user_id, "kind": "backup.restore_file",
                "details": {"backup_key": backup_key, "artifact": artifact_name, "stored_as": key}
            }).execute()
        except Exception:
            pass

        # enqueue reindex (idempotent; queue handles dedupe/backoff)
        try:
            sbs.table("reindex_queue").insert({
                "org_id": ctx.org_id, "project_id": project_id,
                "stored_key": key, "status":"pending", "attempts":0
            }).execute()
            # audit reindex queue
            try:
                sbs.table("audit_events").insert({
                    "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
                    "kind": "reindex.queued", "details": {"stored_key": key}
                }).execute()
            except Exception: pass
        except Exception:
            pass

        return {"ok": True, "stored_key": key}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Store file failed: {e}")
        raise HTTPException(500, f"Failed to store file: {str(e)}")

@router.post("/reingest-stored")
def reingest_stored(
    stored_key: str = Query(...),          # e.g. org/<org>/project/<proj>/restores/<ts>__file.ext
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(ADMIN_OR_OWNER),
):
    """
    Re-ingest a file previously restored into artifacts/restores/...
    """
    sbs = get_supabase_client()

    # 1) Validate tenant path
    expected_prefix = f"org/{ctx.org_id}/project/{project_id}/restores/"
    if not stored_key.startswith(expected_prefix):
        raise HTTPException(400, "stored_key not under this org/project restores path")

    # 2) Download bytes from artifacts bucket
    try:
        file_bytes = sbs.storage().from_("artifacts").download(stored_key)
    except Exception as e:
        raise HTTPException(404, f"Cannot download stored file: {e}")

    filename = os.path.basename(stored_key.split("/", 5)[-1])
    import mimetypes
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    # 3) Try direct Python ingest (if your code exports such a function)
    did_direct = False
    try:
        # OPTION A: your app may expose a helper we can import
        #   from ..routers.ingest import ingest_bytes   # (example)
        #   ingest_bytes(org_id=ctx.org_id, project_id=project_id, filename=filename, data=file_bytes, mime=mime, actor_id=ctx.user_id)
        # If you have that, uncomment/adapt and set did_direct=True.
        pass
    except Exception:
        did_direct = False

    # 4) Fallback: call your /api/ingest-sync endpoint with dev/prod auth
    new_artifact_id = None
    if not did_direct:
        import requests, json
        base = os.getenv("FASTAPI_URL", "http://127.0.0.1:5000")
        url = f"{base}/api/ingest-sync?project_id={project_id}"

        headers = {}
        # Always use dev mode headers in development
        headers["X-Dev-User"] = ctx.user_id or "dev-user"
        headers["X-Dev-Org"] = ctx.org_id
        headers["X-Dev-Role"] = ctx.role or "admin"
        
        # Also set production auth as fallback
        token = os.getenv("INTERNAL_API_BEARER")
        if token:
            headers["Authorization"] = f"Bearer {token}"

        files = {"file": (filename, file_bytes, mime)}
        try:
            r = requests.post(url, files=files, headers=headers, timeout=60)
            if not r.ok:
                raise HTTPException(r.status_code, f"Ingest sync failed: {r.text[:300]}")
            try:
                data = r.json()
                # Common patterns: {"artifact_id":"..."} or {"artifacts":[{"id":"..."}]}
                new_artifact_id = data.get("artifact_id") \
                    or (data.get("artifacts") or [{}])[0].get("id")
            except Exception:
                pass
        except Exception as e:
            raise HTTPException(500, f"Re-ingest request failed: {e}")

    # 5) Audit
    try:
        sbs.table("audit_events").insert({
            "org_id": ctx.org_id,
            "project_id": project_id,
            "actor_id": ctx.user_id,
            "kind": "backup.reingest",
            "details": {"stored_key": stored_key, "filename": filename, "via": "direct_or_http"}
        }).execute()
    except Exception:
        pass

    # enqueue reindex (belt-and-suspenders approach)
    try:
        sbs.table("reindex_queue").insert({
            "org_id": ctx.org_id, "project_id": project_id,
            "stored_key": stored_key, "status":"pending", "attempts":0
        }).execute()
    except Exception:
        pass

    return {"ok": True, "filename": filename, "artifact_id": new_artifact_id}

@router.post("/store-and-reingest")
def store_and_reingest(
    backup_key: str = Query(...),
    artifact_name: str = Query(...),
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(ADMIN_OR_OWNER),
):
    # 1) Store → Restores
    s = store_file(backup_key=backup_key, artifact_name=artifact_name, project_id=project_id, ctx=ctx)
    stored_key = s.get("stored_key")
    if not stored_key:
        raise HTTPException(500, "Store failed; no stored_key returned")

    # 2) Re-ingest
    r = reingest_stored(stored_key=stored_key, project_id=project_id, ctx=ctx)
    return {"ok": True, "stored_key": stored_key, "artifact_id": r.get("artifact_id")}