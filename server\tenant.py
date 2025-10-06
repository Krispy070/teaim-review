from fastapi import Depends, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional
import os, jwt, time, logging

JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
JWT_ALG = "HS256"
DEV_AUTH = os.getenv("DEV_AUTH", "0") == "1"

# Production safety: Ensure JWT secret is available in production mode
if not DEV_AUTH and not JWT_SECRET:
    logging.error("PRODUCTION ERROR: SUPABASE_JWT_SECRET required when DEV_AUTH=0")
    raise RuntimeError("Missing SUPABASE_JWT_SECRET for production authentication")

class TenantCtx(BaseModel):
    user_id: str
    org_id: str
    role: str
    can_sign: bool = False
    jwt: Optional[str] = None
    project_id: Optional[str] = None  # Added for project-scoped endpoints

def tenant_ctx(authorization: Optional[str] = Header(None),
               x_dev_user: Optional[str] = Header(None, alias="X-Dev-User"),
               x_dev_org: Optional[str] = Header(None, alias="X-Dev-Org"),
               x_dev_role: Optional[str] = Header(None, alias="X-Dev-Role")) -> TenantCtx:
    """Extract authenticated user context from JWT token or dev headers"""
    
    # Enhanced security logging for all authentication attempts
    import time
    start_time = time.time()
    
    # Log dev mode usage with enhanced security context
    if DEV_AUTH and x_dev_user:
        logging.info(f"🔧 Dev mode active: {x_dev_user}@{x_dev_org} ({x_dev_role})")
        # Security audit: Log dev mode authentication bypass
        logging.warning(f"SECURITY: Development authentication bypass used by {x_dev_user}@{x_dev_org}")
    
    # Dev bypass (ONLY when DEV_AUTH=1) with enhanced validation
    if DEV_AUTH:
        if not (x_dev_user and x_dev_org):
            logging.error(f"SECURITY: Invalid dev mode authentication attempt - missing headers")
            raise HTTPException(401, "Dev mode requires X-Dev-User and X-Dev-Org headers")
        
        # Validate dev headers format for security
        if not x_dev_user.strip() or not x_dev_org.strip():
            logging.error(f"SECURITY: Invalid dev mode authentication attempt - empty headers")
            raise HTTPException(401, "Dev mode headers cannot be empty")
        
        # Limit dev role to safe values
        safe_dev_roles = {"owner", "admin", "pm", "lead", "member", "guest"}
        dev_role = x_dev_role if x_dev_role in safe_dev_roles else "member"
        
        logging.info("✅ Development authentication successful")
        return TenantCtx(
            user_id=x_dev_user, 
            org_id=x_dev_org, 
            role=dev_role, 
            jwt=None
        )

    # Production path: real JWT required
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    
    token = authorization.split(" ", 1)[1]
    
    # Production requires valid JWT secret
    if not JWT_SECRET:
        logging.error("SUPABASE_JWT_SECRET not configured - cannot verify production tokens")
        raise HTTPException(500, "Server authentication configuration error")
    
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG], options={"verify_aud": False})
        logging.info(f"✅ Production JWT validation successful for user {claims.get('sub', 'unknown')}")
    except jwt.ExpiredSignatureError:
        logging.warning(f"SECURITY: Expired JWT token presented")
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError as e:
        logging.warning(f"SECURITY: Invalid JWT token presented - {type(e).__name__}")
        raise HTTPException(401, "Invalid authentication token")
    except Exception as e:
        logging.error(f"SECURITY: JWT validation error - {type(e).__name__}")
        raise HTTPException(401, "Authentication failed")
    
    # Check token expiration
    if claims.get("exp") and claims["exp"] < int(time.time()):
        raise HTTPException(401, "Token expired")
    
    # Extract claims
    org_id = claims.get("org_id")
    sub = claims.get("sub") 
    role = claims.get("role", "member")
    
    if not org_id or not sub:
        raise HTTPException(403, "Missing org/user claims in token")
    
    return TenantCtx(user_id=sub, org_id=org_id, role=role, jwt=token)

def require_project_member(project_id: str, ctx: TenantCtx = Depends(tenant_ctx)) -> TenantCtx:
    """Verify user is a member of the specified project"""
    
    # Skip membership check in development mode with enhanced logging
    if DEV_AUTH:
        logging.info("Development mode - skipping project membership check")
        logging.warning(f"SECURITY: Project membership check bypassed for {ctx.user_id}@{ctx.org_id} on project {project_id}")
        return ctx
        
    try:
        from .db import get_conn
        
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT role FROM project_members 
                WHERE org_id = %s AND project_id = %s AND user_id = %s
                LIMIT 1
            """, (ctx.org_id, project_id, ctx.user_id))
            
            result = cur.fetchone()
            if not result:
                raise HTTPException(403, "Not a member of this project")
            
            # Update context with actual project role
            ctx.role = result[0]
        
        return ctx
        
    except Exception as e:
        logging.error(f"Project membership check failed: {e}")
        raise HTTPException(403, "Access denied")

def require_project_admin(project_id: str, ctx: TenantCtx = Depends(tenant_ctx)) -> TenantCtx:
    """Verify user has admin/pm role in the specified project"""
    
    # Skip admin check in development mode
    if DEV_AUTH:
        logging.info("Development mode - skipping project admin check")
        return ctx
        
    try:
        from .db import get_conn
        
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT role FROM project_members 
                WHERE org_id = %s AND project_id = %s AND user_id = %s
                LIMIT 1
            """, (ctx.org_id, project_id, ctx.user_id))
            
            result = cur.fetchone()
            if not result or result[0] not in ["admin", "pm"]:
                raise HTTPException(403, "Insufficient permissions - admin or pm role required")
        
        return ctx
        
    except Exception as e:
        logging.error(f"Project admin check failed: {e}")
        raise HTTPException(403, "Access denied")

def require_stage_signer(project_id: str, ctx: TenantCtx = Depends(tenant_ctx)) -> TenantCtx:
    """Verify user can sign off on stages (customer_signer role)"""
    
    # Skip signer check in development mode
    if DEV_AUTH:
        logging.info("Development mode - skipping stage signer check")
        return ctx
    
    try:
        from .db import get_conn
        
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT role FROM project_members 
                WHERE org_id = %s AND project_id = %s AND user_id = %s
                LIMIT 1
            """, (ctx.org_id, project_id, ctx.user_id))
            
            result = cur.fetchone()
            if not result or result[0] not in ["admin", "pm", "customer_signer"]:
                raise HTTPException(403, "Insufficient permissions - signer role required")
        
        return ctx
        
    except Exception as e:
        logging.error(f"Stage signer check failed: {e}")
        raise HTTPException(403, "Access denied")

# Role-based guards for composable endpoint protection
def require_role(allowed_roles: set[str]):
    """Create a dependency that requires specific roles"""
    def _inner(project_id: str, ctx: TenantCtx = Depends(require_project_member)):
        if ctx.role not in allowed_roles:
            raise HTTPException(403, f"Requires role: {', '.join(sorted(allowed_roles))}")
        return ctx
    return _inner

# Commonly used role combinations
ADMIN_ONLY = require_role({"admin"})
PM_OR_ADMIN = require_role({"pm", "admin"})
SIGNER_OR_ADMIN = require_role({"customer_signer", "admin"})
ANY_MEMBER = require_project_member

# Reusable dependency for project-scoped endpoints
def project_member_ctx(
    project_id: str | None = Query(None, alias="projectId"),
    project_id_snake: str | None = Query(None, alias="project_id"),
    ctx: TenantCtx = Depends(tenant_ctx),
) -> TenantCtx:
    """Dependency that validates project membership and adds project_id to context"""
    pid = project_id or project_id_snake
    if not pid:
        raise HTTPException(422, "projectId required")
    
    ctx = require_project_member(pid, ctx)
    setattr(ctx, 'project_id', pid)
    return ctx