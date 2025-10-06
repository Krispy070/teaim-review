from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import os, json

from ..tenant import TenantCtx
from ..guards import require_role, member_ctx
from ..supabase_client import get_user_supabase, get_supabase_client
from ..email.util import mailgun_send_html, send_guard, log_send, generate_secure_token, verify_token_hash

router = APIRouter(prefix="/api/signoff", tags=["signoff"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

class RequestExternalBody(BaseModel):
    stage_id: str
    email_to: str
    message: str | None = None
    expires_hours: int = 72

@router.post("/request-external")
def request_external(body: RequestExternalBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    """Request external signoff via email with secure token link"""
    sb_user = get_user_supabase(ctx)
    
    # Ensure stage belongs to project/org
    try:
        st = sb_user.table("project_stages").select("id,title").eq("id", body.stage_id)\
             .eq("project_id", project_id).eq("org_id", ctx.org_id).single().execute().data
        if not st: 
            raise HTTPException(404, "Stage not found")
    except Exception:
        raise HTTPException(404, "Stage not found or access denied")

    # Generate secure token (service role to bypass RLS for later token validation)
    raw_token, token_hash, token_suffix = generate_secure_token()
    sb = get_supabase_client()  # Use service role client
    
    try:
        sb.table("signoff_tokens").insert({
            "org_id": ctx.org_id, 
            "project_id": project_id, 
            "stage_id": body.stage_id,
            "email": body.email_to, 
            "token_hash": token_hash,
            "token_suffix": token_suffix,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=body.expires_hours)).isoformat()
        }).execute()
    except Exception as e:
        raise HTTPException(500, f"Failed to create signoff token: {str(e)}")

    app_url = os.getenv("APP_BASE_URL", "")
    link = f"{app_url}/signoff/{raw_token}"
    html = f"""
      <p>You have a stage awaiting approval: <b>{st['title']}</b></p>
      <p><a href="{link}">Review & Approve/Reject</a> (expires in {body.expires_hours} hours)</p>
      <p>{body.message or ''}</p>
      <p>— TEAIM</p>
    """

    # Check send guards (quiet hours & daily caps)
    ok, reason = send_guard(sb_user, ctx.org_id, project_id, "signoff", body.email_to)
    if not ok:
        # Token is saved; caller can resend later
        return {"ok": False, "reason": reason, "token_link": link}

    # Send email via Mailgun
    send_result = mailgun_send_html(body.email_to, "TEAIM: Stage sign-off requested", html)
    
    if send_result.get("ok"):
        # Log successful send
        log_send(sb_user, ctx.org_id, project_id, "signoff", body.email_to, 
                status="success", provider_id=send_result.get("provider_id"), 
                subject="TEAIM: Stage sign-off requested")
        return {"ok": True, "token_link": link}
    else:
        # Log failed send
        log_send(sb_user, ctx.org_id, project_id, "signoff", body.email_to,
                status="failed", error=send_result.get("error"),
                subject="TEAIM: Stage sign-off requested")
        return {"ok": False, "reason": f"Email send failed: {send_result.get('error')}", "token_link": link}

# Public token flow (no auth required)
class TokenDecisionBody(BaseModel):
    decision: str   # approved | rejected
    notes: str | None = None

def _get_token_row(sb_service, token: str):
    """Validate and retrieve token row with security checks"""
    if not token:
        raise HTTPException(400, "Token is required")
    
    # Hash the provided token to look up in database
    import hashlib
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    try:
        row = sb_service.table("signoff_tokens").select("*").eq("token_hash", token_hash).single().execute().data
        if not row: 
            raise HTTPException(404, "Invalid or expired token")
        
        if row["used_at"] is not None: 
            raise HTTPException(400, "Token already used")
            
        # Handle Z-suffix timestamps robustly
        expires_str = row["expires_at"]
        if expires_str.endswith('Z'):
            expires_str = expires_str[:-1] + '+00:00'
        expires_at = datetime.fromisoformat(expires_str)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(400, "Token expired")
            
        return row
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Token validation failed")

@router.get("/token/validate")
def token_validate(token: str):
    """Validate token and return stage info for approval page (public endpoint)"""
    sbs = get_supabase_client()
    row = _get_token_row(sbs, token)
    
    try:
        # Get stage info for display (scoped by org/project for security)
        st = sbs.table("project_stages").select("title,status")\
            .eq("id", row["stage_id"])\
            .eq("org_id", row["org_id"])\
            .eq("project_id", row["project_id"])\
            .single().execute().data
        if not st:
            raise HTTPException(404, "Associated stage not found")
            
        return {
            "ok": True, 
            "stage_title": st["title"], 
            "status": st["status"], 
            "email": row["email"],
            "expires_at": row["expires_at"]
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Failed to retrieve stage information")

@router.post("/token/decision")
def token_decide(token: str, body: TokenDecisionBody):
    """Process external approval/rejection decision (public endpoint)"""
    if body.decision not in ("approved","rejected"):
        raise HTTPException(400, "Invalid decision: must be 'approved' or 'rejected'")
        
    sbs = get_supabase_client()
    row = _get_token_row(sbs, token)
    status = "signed_off" if body.decision == "approved" else "rejected"

    try:
        # Atomic token usage check - prevent race conditions
        token_update = sbs.table("signoff_tokens").update({
            "used_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", row["id"]).is_("used_at", None).execute()  # Only update if not used
        
        if not token_update.data:
            raise HTTPException(409, "Token has already been used")
        
        # Update stage status & audit (service role; scoped by ids already on row)
        sbs.table("project_stages").update({
            "status": status,
            "signoff_by": None,  # External signer not a user
            "signoff_date": datetime.now(timezone.utc).isoformat(),
            "signoff_decision": body.decision,
            "signoff_notes": (body.notes or f"External decision by {row['email']}")
        }).eq("id", row["stage_id"]).eq("org_id", row["org_id"]).eq("project_id", row["project_id"]).execute()

        # Create audit event
        sbs.table("audit_events").insert({
            "org_id": row["org_id"], 
            "project_id": row["project_id"],
            "actor_id": None, 
            "kind": f"stage.{body.decision}",
            "details": {  # Store as dict, not JSON string
                "stage_id": row["stage_id"], 
                "email": row["email"], 
                "via": "external_token",
                "notes": body.notes
            }
        }).execute()

        return {"ok": True, "status": status, "decision": body.decision}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to process decision: {str(e)}")