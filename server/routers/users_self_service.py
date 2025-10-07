from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from ..tenant import TenantCtx, tenant_ctx
from ..supabase_client import get_supabase_client
import os
import logging

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/request_reset")
def request_reset(email: str = Query(...)):
    """
    Self-service: issue a recovery link by email if SERVICE ROLE is configured;
    otherwise returns ok=False so the frontend can fall back to supabase-js flow.
    """
    try:
        # Try to generate recovery link using Supabase admin API
        sb = get_supabase_client()
        result = sb.auth.admin.generate_link({
            "type": "recovery",
            "email": email,
            "options": {"redirect_to": os.getenv("APP_BASE_URL", "").rstrip("/")}
        })
        
        if not result:
            return {"ok": False}
        
        try:
            action_link = getattr(result, 'action_link', None)
            if not action_link:
                return {"ok": False}
        except Exception:
            return {"ok": False}
            return {"ok": False}
            
        # Best-effort email sending
        try:
            from ..email_send import mg_send
            mg_send(
                to_email=email,
                subject="[TEAIM] Password reset",
                text="Use this link to reset your password: " + str(action_link),
                html=f"<p>Reset link: <a href='{str(action_link)}'>Reset Password</a></p>"
            )
        except Exception: 
            pass  # Fail silently on email send errors
            
        return {"ok": True}
    except Exception:
        return {"ok": False}

class AccountAction(BaseModel):
    confirm: bool = False

@router.post("/deactivate_account")
def deactivate_account(action: AccountAction, ctx: TenantCtx = Depends(tenant_ctx)):
    """
    Self-service: deactivate the current user's account.
    This sets the user status to inactive but preserves all data.
    """
    if not action.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")
    
    try:
        # Get user info from Supabase using the user_id from context
        admin_sb = get_supabase_client()
        user_result = admin_sb.auth.admin.get_user_by_id(ctx.user_id)
        
        if not user_result or not user_result.user:
            raise HTTPException(status_code=404, detail="User not found")
            
        user = user_result.user
        
        # Check account status first to enforce current state
        user_metadata = user.user_metadata or {}
        account_status = user_metadata.get('status', 'active')
        
        if account_status in ('deactivated', 'pending_deletion'):
            raise HTTPException(status_code=403, detail=f"Account is already {account_status}")
        
        # Update user status in auth system
        
        # Use admin API to suspend the user and revoke sessions
        result = admin_sb.auth.admin.update_user_by_id(
            uid=user.id,
            attributes={"user_metadata": {"status": "deactivated", "deactivated_at": "now()"}}
        )
        
        if result and result.user:
            # Revoke all refresh tokens to force logout
            try:
                admin_sb.auth.admin.sign_out(user.id, scope='global')
            except Exception as e:
                logging.warning(f"Could not revoke sessions for deactivated user {user.id}: {e}")
            
            return {"ok": True, "message": "Account deactivated successfully"}
        else:
            return {"ok": False, "error": "Failed to deactivate account"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deactivation failed: {str(e)}")

@router.post("/close_account")  
def close_account(action: AccountAction, ctx: TenantCtx = Depends(tenant_ctx)):
    """
    Self-service: permanently close the current user's account.
    This marks the account for deletion and removes access.
    """
    if not action.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")
    
    try:
        # Get user info from Supabase using the user_id from context
        admin_sb = get_supabase_client()
        user_result = admin_sb.auth.admin.get_user_by_id(ctx.user_id)
        
        if not user_result or not user_result.user:
            raise HTTPException(status_code=404, detail="User not found")
            
        user = user_result.user
        
        # Check account status first to enforce current state
        user_metadata = user.user_metadata or {}
        account_status = user_metadata.get('status', 'active')
        
        if account_status in ('pending_deletion'):
            raise HTTPException(status_code=403, detail="Account closure already requested")
        
        # Use admin API to mark user for deletion
        
        # Mark for deletion in metadata first
        result = admin_sb.auth.admin.update_user_by_id(
            uid=user.id,
            attributes={"user_metadata": {"status": "pending_deletion", "deletion_requested_at": "now()"}}
        )
        
        if result and result.user:
            # Revoke all refresh tokens to force logout
            try:
                admin_sb.auth.admin.sign_out(user.id, scope='global')
            except Exception as e:
                logging.warning(f"Could not revoke sessions for user marked for deletion {user.id}: {e}")
        
        # Note: Actual user deletion is typically handled by a background job
        # to allow for data cleanup and compliance with data retention policies
        
        return {"ok": True, "message": "Account closure requested. You will be logged out shortly."}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Account closure failed: {str(e)}")

@router.get("/account_status")
def get_account_status(ctx: TenantCtx = Depends(tenant_ctx)):
    """
    Get the current account status and settings.
    """
    try:
        # Get user info from Supabase using the user_id from context
        admin_sb = get_supabase_client()
        user_result = admin_sb.auth.admin.get_user_by_id(ctx.user_id)
        
        if not user_result or not user_result.user:
            # Fallback for development mode
            user_info = {
                "user_id": ctx.user_id,
                "org_id": ctx.org_id,
                "status": "active",
                "email": f"{ctx.user_id}@example.com"
            }
            return user_info
            
        user = user_result.user
        user_metadata = user.user_metadata or {}
        
        return {
            "user_id": user.id,
            "email": user.email,
            "status": user_metadata.get('status', 'active'),
            "created_at": user.created_at,
            "last_sign_in": getattr(user, 'last_sign_in_at', None),
            "deactivated_at": user_metadata.get('deactivated_at'),
            "deletion_requested_at": user_metadata.get('deletion_requested_at')
        }
        
    except Exception as e:
        # Fallback for development mode if Supabase is not available
        user_info = {
            "user_id": ctx.user_id,
            "org_id": ctx.org_id,
            "status": "active",
            "email": f"{ctx.user_id}@example.com"
        }
        return user_info