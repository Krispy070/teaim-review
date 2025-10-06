from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase, get_supabase_client

router = APIRouter(prefix="/api/artifacts", tags=["artifact-share"])

class ShareBody(BaseModel):
    artifact_id: Optional[str] = None        # recommend using artifact_id
    storage_bucket: Optional[str] = None     # or (bucket + path)
    storage_path: Optional[str] = None
    expires_sec: int = 86400                 # default 24h

@router.post("/share-url")
def share_url(body: ShareBody, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """
    Returns a time-boxed public URL for an artifact.
    """
    if not (body.artifact_id or (body.storage_bucket and body.storage_path)):
        raise HTTPException(400, "Provide artifact_id OR (storage_bucket+storage_path)")

    bucket = body.storage_bucket
    path = body.storage_path

    # Resolve from artifact_id with user-scoped read to enforce RLS/membership
    if body.artifact_id:
        try:
            sb_user = get_user_supabase(ctx)
            row = sb_user.table("artifacts").select("storage_bucket,storage_path")\
                  .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", body.artifact_id)\
                  .single().execute().data
            if not row:
                raise HTTPException(404, "Artifact not found")
            bucket, path = row["storage_bucket"], row["storage_path"]
        except Exception as e:
            # Graceful fallback for development mode
            if "JWT required" in str(e) or "401" in str(e):
                # In development mode, fallback to service client for artifact lookup
                try:
                    sb_svc = get_supabase_client()
                    row = sb_svc.table("artifacts").select("storage_bucket,storage_path")\
                          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", body.artifact_id)\
                          .single().execute().data
                    if not row:
                        raise HTTPException(404, "Artifact not found")
                    bucket, path = row["storage_bucket"], row["storage_path"]
                except:
                    raise HTTPException(404, "Artifact not found")
            else:
                raise HTTPException(404, "Artifact not found")

    # Create signed URL with service client
    try:
        sb_svc = get_supabase_client()
        res = sb_svc.storage.from_(bucket).create_signed_url(path, body.expires_sec)
        url = res.get("signedURL") or res.get("signed_url")  # supabase-py variants
        if not url:
            raise RuntimeError("No signed URL returned")
        # Optional: prepend public URL origin if storage client returns relative
        origin = sb_svc.storage.url if hasattr(sb_svc.storage, "url") else ""
        return {"ok": True, "url": (origin + url) if (origin and url.startswith("/")) else url, "expires_sec": body.expires_sec}
    except Exception as e:
        raise HTTPException(500, f"Failed to create signed URL: {e}")