"""
External signoff token management router
Handles creation and management of secure tokens for external document signing
"""

import logging
import hashlib
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel

from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase, get_supabase_client

router = APIRouter(prefix="/api/signoff-tokens", tags=["signoff-tokens"])
PM_PLUS = require_role({"owner", "admin", "pm", "lead"})


class SignoffTokenCreate(BaseModel):
    doc_id: str
    signer_email: str
    expires_hours: int = 24


class ExternalSignRequest(BaseModel):
    signed_name: str
    signature_data: Optional[dict] = None


def generate_token() -> tuple[str, str]:
    """Generate a secure token and its hash"""
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token, token_hash


@router.post("/create")
def create_signoff_token(
    body: SignoffTokenCreate,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Create a secure token for external document signing"""
    sb = get_user_supabase(ctx)
    
    # Verify the document exists and belongs to this project
    try:
        doc_result = sb.table("signoff_docs").select("id,name,status")\
                      .eq("id", body.doc_id)\
                      .eq("org_id", ctx.org_id)\
                      .eq("project_id", project_id)\
                      .single().execute()
        
        if not doc_result.data:
            raise HTTPException(404, "Document not found")
        
        doc = doc_result.data
        if doc["status"] not in ["draft", "sent"]:
            raise HTTPException(400, f"Document status '{doc['status']}' cannot be signed")
        
    except Exception as e:
        logging.error(f"Failed to verify document: {e}")
        raise HTTPException(400, "Invalid document")
    
    # Generate secure token
    token, token_hash = generate_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_hours)
    
    try:
        # Store only the token hash in database for security
        token_data = {
            "doc_id": body.doc_id,
            "token": token_hash,  # Store hash, not plaintext token
            "signer_email": body.signer_email,
            "expires_at": expires_at.isoformat()
        }
        
        result = sb.table("signoff_doc_tokens").insert(token_data).execute()
        token_record = result.data[0] if result.data else None
        
        if not token_record:
            raise HTTPException(500, "Failed to create token")
        
        # Update document status to 'sent'
        sb.table("signoff_docs").update({"status": "sent"})\
          .eq("id", body.doc_id)\
          .eq("org_id", ctx.org_id)\
          .eq("project_id", project_id)\
          .execute()
        
        # Log audit event
        sb.table("audit_events").insert({
            "org_id": ctx.org_id,
            "project_id": project_id,
            "actor_id": ctx.user_id,
            "kind": "signoff_token.created",
            "details": {
                "doc_id": body.doc_id,
                "doc_name": doc["name"],
                "signer_email": body.signer_email,
                "expires_hours": body.expires_hours
            }
        }).execute()
        
        # Generate signing URL with configurable base
        import os
        base_url = os.getenv("FRONTEND_URL", "http://localhost:5000")
        signing_url = f"{base_url}/sign/{token}"
        
        return {
            "ok": True,
            "token_id": token_record["id"],
            "signing_url": signing_url,
            "expires_at": expires_at.isoformat(),
            "document": doc
        }
        
    except Exception as e:
        logging.error(f"Failed to create signoff token: {e}")
        raise HTTPException(500, "Failed to create signing token")


@router.get("/validate/{token}")
def validate_signoff_token(token: str):
    """Validate a signoff token and return document info (public endpoint)"""
    if not token:
        raise HTTPException(400, "Token is required")
    
    sbs = get_supabase_client()
    
    try:
        # Hash the provided token to lookup in database
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        # Get token record by hash
        token_result = sbs.table("signoff_doc_tokens").select("*")\
                        .eq("token", token_hash)\
                        .single().execute()
        
        if not token_result.data:
            raise HTTPException(404, "Invalid or expired token")
        
        token_record = token_result.data
        
        # Check if token is already used
        if token_record["used_at"] is not None:
            raise HTTPException(400, "Token already used")
        
        # Check if token is expired
        expires_str = token_record["expires_at"]
        if expires_str.endswith('Z'):
            expires_str = expires_str[:-1] + '+00:00'
        expires_at = datetime.fromisoformat(expires_str)
        
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(400, "Token expired")
        
        # Get document info
        doc_result = sbs.table("signoff_docs").select("id,name,html,status")\
                      .eq("id", token_record["doc_id"])\
                      .single().execute()
        
        if not doc_result.data:
            raise HTTPException(404, "Associated document not found")
        
        document = doc_result.data
        
        # Check if document is already signed
        if document["status"] == "signed":
            raise HTTPException(400, "Document already signed")
        
        return {
            "ok": True,
            "document": {
                "id": document["id"],
                "name": document["name"],
                "html": document["html"],
                "status": document["status"]
            },
            "signer_email": token_record["signer_email"],
            "expires_at": token_record["expires_at"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Token validation failed: {e}")
        raise HTTPException(500, "Token validation failed")


@router.post("/sign/{token}")
def sign_document_external(
    token: str,
    body: ExternalSignRequest,
    request: Request
):
    """Process external document signing with token (public endpoint)"""
    if not token:
        raise HTTPException(400, "Token is required")
    
    sbs = get_supabase_client()
    
    # Get client IP address
    client_ip = getattr(request.client, 'host', 'unknown') if request.client else 'unknown'
    if hasattr(request, 'headers') and 'x-forwarded-for' in request.headers:
        client_ip = request.headers['x-forwarded-for'].split(',')[0].strip()
    
    try:
        # Hash the provided token to lookup in database
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        # Validate token by hash
        token_result = sbs.table("signoff_doc_tokens").select("*")\
                        .eq("token", token_hash)\
                        .single().execute()
        
        if not token_result.data:
            raise HTTPException(404, "Invalid or expired token")
        
        token_record = token_result.data
        
        # Check if already used
        if token_record["used_at"] is not None:
            raise HTTPException(400, "Token already used")
        
        # Check expiration
        expires_str = token_record["expires_at"]
        if expires_str.endswith('Z'):
            expires_str = expires_str[:-1] + '+00:00'
        expires_at = datetime.fromisoformat(expires_str)
        
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(400, "Token expired")
        
        # Prepare signature metadata
        now = datetime.now(timezone.utc)
        signed_meta = {
            "user_agent": request.headers.get("user-agent", ""),
            "timestamp": now.isoformat(),
            "signature_data": body.signature_data or {},
            "external_signing": True
        }
        
        # Update document with signature, but only if not already signed
        doc_update_result = sbs.table("signoff_docs").update({
            "status": "signed",
            "signed_by": f"external:{token_record['signer_email']}",
            "signed_name": body.signed_name,
            "signed_ip": client_ip,
            "signed_meta": signed_meta,
            "signed_at": now.isoformat()
        }).eq("id", token_record["doc_id"])\
          .in_("status", ["draft", "sent"])\
          .execute()
        
        if not doc_update_result.data:
            raise HTTPException(400, "Document already signed or invalid status")
        
        # Mark ALL tokens for this document as used to prevent double-signing
        sbs.table("signoff_doc_tokens").update({
            "used_at": now.isoformat()
        }).eq("doc_id", token_record["doc_id"]).execute()
        
        # Get org_id and project_id for audit
        doc_info = sbs.table("signoff_docs").select("org_id,project_id")\
                    .eq("id", token_record["doc_id"])\
                    .single().execute()
        
        if doc_info.data:
            # Log audit event
            sbs.table("audit_events").insert({
                "org_id": doc_info.data["org_id"],
                "project_id": doc_info.data["project_id"],
                "actor_id": None,  # External signer
                "kind": "signoff_doc.signed_external",
                "details": {
                    "doc_id": token_record["doc_id"],
                    "signed_name": body.signed_name,
                    "signer_email": token_record["signer_email"],
                    "ip_address": client_ip,
                    "token_id": token_record["id"]
                }
            }).execute()
        
        return {
            "ok": True,
            "message": "Document signed successfully",
            "signed_at": now.isoformat(),
            "document": doc_update_result.data[0]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"External signing failed: {e}")
        raise HTTPException(500, "Failed to sign document")


@router.get("/list")
def list_signoff_tokens(
    project_id: str = Query(...),
    doc_id: Optional[str] = Query(None),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """List signoff tokens for a project or document"""
    sb = get_user_supabase(ctx)
    
    try:
        # Build query with document join to get project context
        query = sb.table("signoff_doc_tokens")\
                  .select("signoff_doc_tokens.*, signoff_docs!inner(name,project_id,org_id)")\
                  .eq("signoff_docs.org_id", ctx.org_id)\
                  .eq("signoff_docs.project_id", project_id)\
                  .order("created_at", desc=True)
        
        if doc_id:
            query = query.eq("doc_id", doc_id)
        
        result = query.execute()
        tokens = result.data or []
        
        # Clean up sensitive data
        for token in tokens:
            if "token" in token:
                # Show only last 4 characters of token hash for security
                token["token_suffix"] = token["token"][-4:] if token["token"] else ""
                del token["token"]
        
        return {"tokens": tokens}
        
    except Exception as e:
        logging.error(f"Failed to fetch signoff tokens: {e}")
        return {"tokens": []}


@router.delete("/{token_id}")
def revoke_signoff_token(
    token_id: str,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Revoke a signoff token"""
    sb = get_user_supabase(ctx)
    
    try:
        # First verify the token belongs to this project
        token_result = sb.table("signoff_doc_tokens")\
                        .select("signoff_doc_tokens.*, signoff_docs!inner(name,project_id,org_id)")\
                        .eq("signoff_doc_tokens.id", token_id)\
                        .eq("signoff_docs.org_id", ctx.org_id)\
                        .eq("signoff_docs.project_id", project_id)\
                        .single().execute()
        
        if not token_result.data:
            raise HTTPException(404, "Token not found")
        
        token_record = token_result.data
        
        # Delete the token
        sb.table("signoff_doc_tokens").delete().eq("id", token_id).execute()
        
        # Log audit event
        sb.table("audit_events").insert({
            "org_id": ctx.org_id,
            "project_id": project_id,
            "actor_id": ctx.user_id,
            "kind": "signoff_token.revoked",
            "details": {
                "token_id": token_id,
                "doc_id": token_record["doc_id"],
                "signer_email": token_record["signer_email"]
            }
        }).execute()
        
        return {"ok": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to revoke signoff token: {e}")
        raise HTTPException(500, "Failed to revoke token")