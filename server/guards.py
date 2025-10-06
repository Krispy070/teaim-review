from fastapi import Depends, HTTPException, Query, Body, Request
from .tenant import tenant_ctx, TenantCtx
from typing import Set
import logging
import json

async def resolve_project_id(
    request: Request,
    project_id: str | None = Query(None)
) -> str:
    """Resolve project_id from either query parameter or request body"""
    
    # First try query parameter
    if project_id:
        return project_id
    
    # Then try request body
    try:
        body = await request.json()
        if isinstance(body, dict):
            # Check both snake_case and camelCase variants
            for key in ("project_id", "projectId"):
                if key in body and body[key]:
                    return body[key]
    except Exception:
        # Request might not have JSON body, that's okay
        pass
    
    # Neither source provided project_id
    raise HTTPException(
        status_code=422, 
        detail=[{"loc": ["query", "project_id"], "msg": "Field required"}]
    )

def member_ctx(project_id: str = Depends(resolve_project_id), ctx: TenantCtx = Depends(tenant_ctx)):
    """Fetch project membership and add role/can_sign to context"""
    
    # SECURITY: Check account status first to enforce deactivation/closure
    # Note: This check is handled at the tenant_ctx level now
    # Account status enforcement is done via Supabase user metadata
    
    # Enhanced dev mode detection - use DEV_AUTH flag instead of ctx.jwt check
    from .tenant import DEV_AUTH
    
    if DEV_AUTH:
        # Security hardening: Validate dev context more strictly
        if not ctx.user_id or not ctx.org_id:
            logging.error(f"SECURITY: Invalid dev context - missing user_id or org_id")
            raise HTTPException(403, "Invalid development authentication context")
        
        # Ensure development mode has proper role and permissions
        ctx.role = ctx.role or "admin"  # Use role from dev headers or default to admin
        ctx.can_sign = True
        
        # Enhanced security logging for dev mode
        logging.info(f"🔧 member_ctx DEV: user={ctx.user_id}, org={ctx.org_id}, role={ctx.role}, project={project_id}")
        logging.warning(f"SECURITY: Development membership context granted for {ctx.user_id} on project {project_id}")
        return ctx
    
    try:
        from .supabase_client import get_supabase_client
        sb = get_supabase_client()
        
        # RLS ensures we only see rows if member; this extra check gives a clean 403
        result = sb.table("project_members").select("role, can_sign").eq("org_id", ctx.org_id).eq("project_id", project_id).eq("user_id", ctx.user_id).limit(1).execute()
        
        if not result.data:
            raise HTTPException(403, "Not a member of this project")
        
        member_data = result.data[0]
        ctx.role = member_data["role"]
        ctx.can_sign = member_data["can_sign"]
        return ctx
        
    except Exception as e:
        # Enhanced error handling with security logging
        logging.warning(f"SECURITY: Project membership query failed for user {ctx.user_id} on project {project_id}: {type(e).__name__}")
        
        # For development, fall back to direct database query if Supabase not available
        if DEV_AUTH:  # Use DEV_AUTH flag instead of ctx.jwt check
            try:
                from .db import get_conn
                
                logging.info(f"Attempting database fallback for project membership: {ctx.user_id} on {project_id}")
                
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        SELECT role, can_sign FROM project_members 
                        WHERE org_id = %s AND project_id = %s AND user_id = %s
                        LIMIT 1
                    """, (ctx.org_id, project_id, ctx.user_id))
                    
                    result = cur.fetchone()
                    if result:
                        ctx.role = result[0]
                        ctx.can_sign = result[1] if result[1] is not None else False
                        logging.info(f"✅ Database fallback successful: role={ctx.role}, can_sign={ctx.can_sign}")
                        return ctx
                    else:
                        logging.warning(f"SECURITY: No project membership found in database fallback for {ctx.user_id}")
            except Exception as db_e:
                logging.error(f"SECURITY: Database fallback failed for {ctx.user_id}: {type(db_e).__name__}")
        
        # Enhanced error message - don't leak system details
        raise HTTPException(403, "Access denied")

def require_role(allowed: Set[str]):
    """Create a dependency that requires specific roles"""
    def _inner(project_id: str = Depends(resolve_project_id), ctx: TenantCtx = Depends(member_ctx)):
        if ctx.role not in allowed:
            raise HTTPException(403, f"Requires role: {', '.join(sorted(allowed))}")
        return ctx
    return _inner

def require_signer_or_admin():
    """Create a dependency that requires signer flag or admin/owner role"""
    def _inner(project_id: str = Depends(resolve_project_id), ctx: TenantCtx = Depends(member_ctx)):
        if ctx.role in {"owner", "admin"} or getattr(ctx, "can_sign", False):
            return ctx
        raise HTTPException(403, "Requires signer or admin")
    return _inner

def require_area_signer():
    """Create a dependency that checks per-area sign-off authority"""
    def _inner(project_id: str = Depends(resolve_project_id), stage_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
        # Admin/owner roles always have authority
        if ctx.role in {"owner", "admin"}:
            return ctx
        
        # Check area-based sign-off permissions
        try:
            # First get the stage's area
            from .db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                # Get stage area
                cur.execute("""
                    SELECT area FROM project_stages 
                    WHERE id = %s AND project_id = %s AND org_id = %s
                    LIMIT 1
                """, (stage_id, project_id, ctx.org_id))
                
                stage_result = cur.fetchone()
                if not stage_result:
                    raise HTTPException(404, "Stage not found")
                
                stage_area = stage_result[0]
                
                # Check project member access controls
                cur.execute("""
                    SELECT can_sign_all, sign_areas FROM project_member_access 
                    WHERE org_id = %s AND project_id = %s AND user_id = %s
                    LIMIT 1
                """, (ctx.org_id, project_id, ctx.user_id))
                
                access_result = cur.fetchone()
                
                if access_result:
                    can_sign_all, sign_areas = access_result
                    
                    # User can sign all areas
                    if can_sign_all:
                        return ctx
                    
                    # Check if user has authority for this specific area
                    if stage_area and sign_areas and stage_area in sign_areas:
                        return ctx
                
                # Fallback to traditional can_sign flag
                if getattr(ctx, "can_sign", False):
                    return ctx
                
                # No sign-off authority found
                if stage_area:
                    raise HTTPException(403, f"No sign-off authority for area: {stage_area}")
                else:
                    raise HTTPException(403, "No sign-off authority for this stage")
                
        except HTTPException:
            raise
        except Exception as e:
            # Strict fallback - only allow admin/owner or existing can_sign flag
            # DO NOT expand to PM role to prevent privilege escalation
            if ctx.role in {"owner", "admin"} or getattr(ctx, "can_sign", False):
                return ctx
            raise HTTPException(503, "Unable to verify sign-off authority - please try again")
    
    return _inner

async def require_area_admin(area: str, project_id: str, ctx: TenantCtx):
    """Check if user is area admin (dev-safe fallback)"""
    # PM+/Owner always allowed
    if ctx.role in ("owner","admin","pm"): return True
    try:
        from .supabase_client import get_supabase_client
        sb = get_supabase_client()
        r = sb.table("area_admins").select("user_id").eq("org_id", ctx.org_id)\
             .eq("project_id", project_id).eq("area", area).eq("user_id", ctx.user_id).limit(1).execute().data
        return bool(r)
    except Exception:
        return False  # fail-closed

# Pre-configured role combinations for common use cases
OWNER_ONLY = require_role({"owner"})
ADMIN_OR_OWNER = require_role({"owner", "admin"})
PM_PLUS = require_role({"owner", "admin", "pm", "lead"})
ANY_MEMBER = member_ctx
SIGNER_OR_ADMIN = require_signer_or_admin()
AREA_SIGNER = require_area_signer()