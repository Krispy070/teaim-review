from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import hashlib, secrets, os

from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase, get_supabase_client as get_service_supabase

router = APIRouter(prefix="/invite", tags=["invite-seeding"])
ADMIN_ONLY = require_role({"owner","admin"})

class InviteBody(BaseModel):
    email: EmailStr
    role: str  # owner|admin|pm|lead|member|guest
    can_sign: bool = False
    send_email: bool = True

class BulkInviteBody(BaseModel):
    invites: List[InviteBody]

class AcceptInviteBody(BaseModel):
    token: str
    user_name: str

def _generate_invite_token():
    return secrets.token_urlsafe(32)

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

@router.post("/send")
def send_invite(body: InviteBody, project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_ONLY)):
    """Send a project invite (admin only)"""
    
    # Validate role hierarchy - only owners can invite admins
    if body.role in {"owner", "admin"} and ctx.role != "owner":
        raise HTTPException(403, "Only owner can invite admin/owner roles")
    
    sb = get_user_supabase(ctx)
    
    # Check if user already invited or is member
    existing = sb.table("project_invites").select("id").eq("org_id", ctx.org_id)\
                .eq("project_id", project_id).eq("email", str(body.email)).execute()
    if existing.data:
        raise HTTPException(409, "User already invited to this project")
    
    # Check if user is already a member
    member_check = sb.table("project_members").select("id").eq("org_id", ctx.org_id)\
                    .eq("project_id", project_id).eq("email", str(body.email)).execute()
    if member_check.data:
        raise HTTPException(409, "User is already a member of this project")
    
    # Generate invite token
    token = _generate_invite_token()
    token_hash = _hash_token(token)
    
    # Store invite
    sb.table("project_invites").insert({
        "org_id": ctx.org_id,
        "project_id": project_id,
        "email": str(body.email),
        "role": body.role,
        "can_sign": body.can_sign,
        "token_hash": token_hash,
        "invited_by": ctx.user_id,
        "expires_at": (datetime.now(timezone.utc).replace(microsecond=0) + 
                      timedelta(days=7)).isoformat()
    }).execute()
    
    # Send email if requested
    if body.send_email:
        try:
            from ..email.util import mailgun_send_html, send_guard, log_send
            
            # Get project name for email
            project = sb.table("projects").select("name").eq("id", project_id).single().execute()
            project_name = project.data.get("name", "TEAIM Project") if project.data else "TEAIM Project"
            
            invite_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5000')}/invite/accept?token={token}"
            
            html_body = f"""
            <h2>You're Invited to Join {project_name}</h2>
            <p>You've been invited to join the <strong>{project_name}</strong> project on TEAIM as a <strong>{body.role}</strong>.</p>
            <p><a href="{invite_url}" style="background: #007cba; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Accept Invitation</a></p>
            <p>This invitation expires in 7 days.</p>
            <p>If you can't click the button, copy and paste this URL: {invite_url}</p>
            """
            
            from ..email.util import send_guard
            can_send, reason = send_guard(sb, ctx.org_id, project_id, "invite.sent", str(body.email))
            if can_send:
                result = mailgun_send_html(
                    to_email=str(body.email),
                    subject=f"Invitation to Join {project_name}",
                    html=html_body
                )
                log_send(sb, ctx.org_id, project_id, "invite.sent", str(body.email),
                        status="success" if result.get("ok") else "failed",
                        subject=f"Invitation to Join {project_name}")
            else:
                print(f"Cannot send invite email: {reason}")
        except Exception as e:
            # Don't fail the invite if email fails
            print(f"Failed to send invite email: {e}")
    
    return {"ok": True, "token": token, "invite_url": f"/invite/accept?token={token}"}

@router.post("/bulk")
def bulk_invite(body: BulkInviteBody, project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_ONLY)):
    """Send multiple invites at once (admin only)"""
    
    results = []
    for invite in body.invites:
        try:
            result = send_invite(invite, project_id, ctx)
            results.append({"email": str(invite.email), "status": "sent", "token": result["token"]})
        except HTTPException as e:
            results.append({"email": str(invite.email), "status": "failed", "error": e.detail})
        except Exception as e:
            results.append({"email": str(invite.email), "status": "failed", "error": str(e)})
    
    return {"results": results}

@router.get("/list")
def list_invites(project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_ONLY)):
    """List pending invites for project (admin only)"""
    
    sb = get_user_supabase(ctx)
    invites = sb.table("project_invites").select("*")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .order("created_at", desc=True).execute()
    
    return {"invites": invites.data or []}

@router.post("/revoke")
def revoke_invite(email: str, project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_ONLY)):
    """Revoke a pending invite (admin only)"""
    
    sb = get_user_supabase(ctx)
    sb.table("project_invites").delete()\
      .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("email", email).execute()
    
    return {"ok": True}

@router.get("/validate")
def validate_invite(token: str):
    """Validate an invite token (public endpoint)"""
    
    token_hash = _hash_token(token)
    sbs = get_service_supabase()
    
    try:
        invite = sbs.table("project_invites").select("*")\
                   .eq("token_hash", token_hash).single().execute()
        
        if not invite.data:
            raise HTTPException(404, "Invalid invitation token")
        
        # Check expiration
        expires_at = datetime.fromisoformat(invite.data["expires_at"].replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(410, "Invitation has expired")
        
        # Get project name
        project = sbs.table("projects").select("name").eq("id", invite.data["project_id"]).single().execute()
        project_name = project.data.get("name", "TEAIM Project") if project.data else "TEAIM Project"
        
        return {
            "valid": True,
            "project_name": project_name,
            "role": invite.data["role"],
            "email": invite.data["email"],
            "can_sign": invite.data["can_sign"]
        }
    except Exception as e:
        if "404" in str(e) or "410" in str(e):
            raise
        raise HTTPException(400, "Invalid invitation")

@router.post("/accept")
def accept_invite(body: AcceptInviteBody):
    """Accept an invitation and create user/membership (public endpoint)"""
    
    token_hash = _hash_token(body.token)
    sbs = get_service_supabase()
    
    try:
        # Get and validate invite
        invite = sbs.table("project_invites").select("*")\
                   .eq("token_hash", token_hash).single().execute()
        
        if not invite.data:
            raise HTTPException(404, "Invalid invitation token")
        
        # Check expiration
        expires_at = datetime.fromisoformat(invite.data["expires_at"].replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(410, "Invitation has expired")
        
        invite_data = invite.data
        
        # Create or update user record
        sbs.table("users").upsert({
            "email": invite_data["email"],
            "name": body.user_name,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }, on_conflict="email").execute()
        
        # Get user ID
        user = sbs.table("users").select("id").eq("email", invite_data["email"]).single().execute()
        user_id = user.data["id"]
        
        # Create project membership
        sbs.table("project_members").upsert({
            "org_id": invite_data["org_id"],
            "project_id": invite_data["project_id"],
            "user_id": user_id,
            "role": invite_data["role"],
            "can_sign": invite_data["can_sign"]
        }, on_conflict="org_id,project_id,user_id").execute()
        
        # Delete the invite
        sbs.table("project_invites").delete().eq("id", invite_data["id"]).execute()
        
        return {"ok": True, "message": "Invitation accepted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Failed to accept invitation: {str(e)}")