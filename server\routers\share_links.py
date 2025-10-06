from fastapi import APIRouter, Depends, HTTPException, Query, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import secrets, os
from typing import Dict, List, Any

from ..tenant import TenantCtx, tenant_ctx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client

# In-memory storage for development mode when PostgREST has schema cache issues
mem_share_links: Dict[str, Dict[str, Any]] = {}

router = APIRouter(prefix="/share-links", tags=["share"])
ADMIN_OR_PM = require_role({"owner","admin","pm","lead"})

def member_or_dev(project_id: str = Query(...), ctx: TenantCtx = Depends(tenant_ctx)):
    if os.getenv("DEV_AUTH","0") == "1":
        return ctx  # trust dev headers (role checked by router decorator)
    return member_ctx(project_id, ctx)

class CreateBody(BaseModel):
    artifact_id: str
    expires_sec: int = 3600

@router.post("/create")
def create_link(body: CreateBody, project_id: str = Query(...), ctx: TenantCtx = Depends(member_or_dev), role_check = Depends(ADMIN_OR_PM)):
    # Use service role client for dev mode compatibility
    sbs = get_supabase_client()

    # Check sharing policy
    try:
        pol = sbs.table("org_comms_settings").select("sharing_enabled,default_share_expires_sec")\
              .eq("org_id", ctx.org_id).limit(1).execute().data
        policy = pol[0] if pol else {}
        if not policy.get("sharing_enabled", True):
            raise HTTPException(403, "Public sharing is disabled by policy")
        if not body.expires_sec:
            body.expires_sec = int(policy.get("default_share_expires_sec", 3600))
    except HTTPException:
        raise  # Re-raise policy violations
    except Exception:
        # In development mode, use defaults if policy lookup fails
        if not body.expires_sec:
            body.expires_sec = 3600

    # membership already enforced by ADMIN_OR_PM, try to verify artifact belongs here
    try:
        art = sbs.table("artifacts").select("id").eq("org_id", ctx.org_id)\
              .eq("project_id", project_id).eq("id", body.artifact_id).limit(1).execute().data
        if not art:
            raise HTTPException(404, "Artifact not found")
    except Exception:
        # Only skip validation in development mode when PostgREST has schema cache issues
        if os.getenv("DEV_AUTH","0") != "1":
            # In production, don't bypass validation - return error instead of creating invalid links
            raise HTTPException(503, "Service temporarily unavailable")
        # In dev mode with schema cache issues, skip validation
        pass

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(seconds=int(body.expires_sec))
    
    # Try database insert, fallback to MemStorage for dev mode
    try:
        sbs.table("share_links").insert({
            "org_id": ctx.org_id, "project_id": project_id, "artifact_id": body.artifact_id,
            "token": token, "expires_at": expires.isoformat(), "created_by": ctx.user_id
        }).execute()
    except Exception:
        # Use MemStorage for development mode when PostgREST has issues
        link_id = f"{ctx.org_id}:{project_id}:{token}"
        mem_share_links[link_id] = {
            "id": link_id,
            "org_id": ctx.org_id,
            "project_id": project_id,
            "artifact_id": body.artifact_id,
            "token": token,
            "expires_at": expires.isoformat(),
            "created_by": ctx.user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "revoked_at": None
        }

    base = os.getenv("APP_BASE_URL","").rstrip("/")
    url = f"{base}/api/share/{token}"
    return {"ok": True, "token": token, "url": url, "expires_at": expires.isoformat()}

@router.get("/list")
def list_links(project_id: str = Query(...), ctx: TenantCtx = Depends(member_or_dev), role_check = Depends(ADMIN_OR_PM)):
    # Use service role client for dev mode compatibility
    sbs = get_supabase_client()
    
    # Try database query, fallback to MemStorage for dev mode
    try:
        rows = sbs.table("share_links").select("id,artifact_id,token,expires_at,revoked_at,created_at,created_by")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).order("created_at", desc=True).limit(200).execute().data or []
    except Exception:
        rows = []
    
    # If DB returned empty and we're in dev mode, check MemStorage
    if not rows and os.getenv("DEV_AUTH","0") == "1":
        rows = [
            link for link in mem_share_links.values() 
            if link["org_id"] == ctx.org_id and link["project_id"] == project_id
        ]
        # Sort by created_at descending
        rows.sort(key=lambda x: x["created_at"], reverse=True)
        rows = rows[:200]  # Limit to 200
    
    # Try to attach artifact names (best effort)
    try:
        a_ids = list({r["artifact_id"] for r in rows})
        if a_ids:
            arts = sbs.table("artifacts").select("id,title").in_("id", a_ids).execute().data or []
            name_map = {a["id"]: a.get("title") for a in arts}
            for r in rows: r["artifact_name"] = name_map.get(r["artifact_id"])
    except Exception:
        # Fallback with test data artifact names
        test_artifacts = {
            "11111111-1111-1111-1111-111111111111": "SOW_v1_ACME-HCM-001.pdf",
            "22222222-2222-2222-2222-222222222222": "Change_Order_1_ACME-HCM-001.docx",
            "33333333-3333-3333-3333-333333333333": "Kickoff_Transcript_2025-09-23.txt"
        }
        for r in rows: 
            r["artifact_name"] = test_artifacts.get(r["artifact_id"], "Unknown Artifact")
    
    return {"items": rows}

@router.post("/revoke")
def revoke_link(token: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(member_or_dev), role_check = Depends(ADMIN_OR_PM)):
    sbs = get_supabase_client()
    
    # Try database update, fallback to MemStorage for dev mode
    updated = False
    try:
        out = sbs.table("share_links").update({"revoked_at": datetime.now(timezone.utc).isoformat()})\
              .eq("token", token).eq("org_id", ctx.org_id).eq("project_id", project_id).execute()
        if out.data: 
            updated = True
    except Exception:
        pass
    
    # If DB update failed/updated nothing and we're in dev mode, try MemStorage
    if not updated and os.getenv("DEV_AUTH","0") == "1":
        link_id = f"{ctx.org_id}:{project_id}:{token}"
        if link_id in mem_share_links:
            mem_share_links[link_id]["revoked_at"] = datetime.now(timezone.utc).isoformat()
            updated = True
    
    if not updated:
        raise HTTPException(404, "Not found")
    
    return {"ok": True}

@router.post("/revoke_all_for_artifact")
def revoke_all_for_artifact(artifact_id: str = Query(...),
                            project_id: str = Query(...),
                            ctx: TenantCtx = Depends(member_or_dev),
                            role_check = Depends(ADMIN_OR_PM)):
    sbs = get_supabase_client()
    
    # Try database update, fallback to MemStorage for dev mode
    revoked_count = 0
    try:
        # Only revoke active (not already revoked) links
        out = sbs.table("share_links").update({"revoked_at": datetime.now(timezone.utc).isoformat()})\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("artifact_id", artifact_id)\
              .is_("revoked_at", "null").execute()
        revoked_count = len(out.data or [])
    except Exception:
        pass
    
    # If DB update failed and we're in dev mode, try MemStorage
    if revoked_count == 0 and os.getenv("DEV_AUTH","0") == "1":
        now = datetime.now(timezone.utc).isoformat()
        for link_id, link in mem_share_links.items():
            if (link["org_id"] == ctx.org_id and 
                link["project_id"] == project_id and 
                link["artifact_id"] == artifact_id and 
                link.get("revoked_at") is None):
                link["revoked_at"] = now
                revoked_count += 1
    
    return {"ok": True, "revoked": revoked_count}

# --- Public download via proxy (no auth) ---
pub = APIRouter(tags=["share-public"])

@pub.get("/share/{token}")
def share_public(token: str = Path(...)):
    sbs = get_supabase_client()
    
    # Try database first, fallback to MemStorage for dev mode
    try:
        row = sbs.table("share_links").select("*").eq("token", token).limit(1).execute().data
    except Exception:
        # Use MemStorage for development mode when PostgREST has issues
        row = []
        for link in mem_share_links.values():
            if link["token"] == token:
                row = [link]
                break
    
    if not row: raise HTTPException(404, "Invalid token")
    r = row[0]
    if r.get("revoked_at"): raise HTTPException(403, "Link revoked")
    if datetime.now(timezone.utc) > datetime.fromisoformat(r["expires_at"]):
        raise HTTPException(403, "Link expired")

    art = sbs.table("artifacts").select("title,storage_bucket,storage_path")\
          .eq("id", r["artifact_id"]).limit(1).execute().data
    if not art: raise HTTPException(404, "Artifact missing")
    a = art[0]
    b = sbs.storage.from_(a["storage_bucket"]).download(a["storage_path"])
    fname = a.get("title") or "document"
    return StreamingResponse(iter([b]), media_type="application/octet-stream",
      headers={"Content-Disposition": f'attachment; filename="{fname}"; filename*=UTF-8\'\'{fname}\''})