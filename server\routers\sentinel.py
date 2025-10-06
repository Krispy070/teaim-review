from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

# Only admins/owners can run security diagnostics
ADMIN_OR_OWNER = require_role({"owner", "admin"})

router = APIRouter(prefix="/sentinel", tags=["sentinel"])

@router.get("/tenant-leak")
def tenant_leak_test(project_id: str = Query(...), target_project_id: str = Query(...), 
                     ctx: TenantCtx = Depends(member_ctx)):
    """
    Diagnostic route to test multi-tenant security.
    Attempts to read from another project - should be blocked by RLS.
    Returns leak=false if security is working correctly.
    Only admins/owners can run security diagnostics.
    """
    # Additional role check: Only admins/owners can run diagnostics
    if ctx.role not in {"owner", "admin"}:
        from fastapi import HTTPException
        raise HTTPException(403, "Security diagnostics require admin or owner role")
    try:
        # Use user-scoped client so RLS applies with the caller's JWT
        sb = get_user_supabase(ctx)
        # RLS should block if not a member of target project
        res = sb.table("project_stages").select("id").eq("project_id", target_project_id).limit(1).execute()
        leaked = bool(res.data)
        return {
            "ok": True, 
            "leak": leaked, 
            "message": "FAIL: Data leaked across projects" if leaked else "PASS: Multi-tenant security working",
            "current_user": ctx.user_id,
            "current_org": ctx.org_id,
            "target_project": target_project_id,
            "test_type": "user_scoped_rls"
        }
    except Exception as e:
        from fastapi import HTTPException
        
        error_str = str(e).lower()
        error_dict = getattr(e, 'details', {}) or {}
        
        # Only return PASS for legitimate RLS/permission denials
        if any(phrase in error_str for phrase in ['permission denied', 'access denied', 'unauthorized', 'forbidden']):
            return {
                "ok": True,
                "leak": False,
                "message": "PASS: Access properly blocked by RLS",
                "current_user": ctx.user_id,
                "current_org": ctx.org_id,
                "target_project": target_project_id,
                "test_type": "user_scoped_rls"
            }
        
        # For schema/connection errors, return diagnostic error (not false positive PASS)
        return {
            "ok": False,
            "leak": None,
            "message": f"ERROR: Diagnostic failed - {type(e).__name__}",
            "current_user": ctx.user_id,
            "current_org": ctx.org_id,
            "target_project": target_project_id,
            "test_type": "user_scoped_rls",
            "error_type": type(e).__name__
        }