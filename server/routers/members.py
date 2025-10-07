from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/members", tags=["members"])
ADMIN_OR_OWNER = require_role({"owner", "admin"})

class UpsertBody(BaseModel):
    user_id: str
    role: str  # 'owner','admin','pm','lead','member','guest'
    can_sign: bool = False

@router.get("/list")
def list_members(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """List all project members (any member can view)"""
    try:
        sb = get_supabase_client()
        result = sb.table("project_members").select("user_id, role, can_sign, created_at")\
                .eq("project_id", project_id).order("created_at", desc=False).execute()
        return {"members": result.data}
    except Exception as e:
        # Development fallback using direct database
        try:
            from ..db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT user_id, role, can_sign, created_at 
                    FROM project_members 
                    WHERE org_id = %s AND project_id = %s 
                    ORDER BY created_at ASC
                """, (ctx.org_id, project_id))
                
                results = cur.fetchall()
                members = []
                for row in results:
                    members.append({
                        "user_id": row[0],
                        "role": row[1], 
                        "can_sign": row[2] if row[2] is not None else False,
                        "created_at": row[3].isoformat() if row[3] else None
                    })
                return {"members": members}
        except Exception as db_e:
            raise HTTPException(500, f"Failed to fetch members: {str(db_e)}")

@router.post("/upsert")
def upsert_member(body: UpsertBody, project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    """Add or update a project member (admin/owner only)"""
    
    # Optional guard: only 'owner' can assign 'owner' or 'admin'
    if body.role in {"owner", "admin"} and ctx.role != "owner":
        raise HTTPException(403, "Only owner can assign admin/owner")
    
    try:
        sb = get_supabase_client()
        sb.table("project_members").upsert({
            "org_id": ctx.org_id, 
            "project_id": project_id,
            "user_id": body.user_id, 
            "role": body.role, 
            "can_sign": body.can_sign
        }, on_conflict="org_id,project_id,user_id").execute()
        return {"ok": True}
    except Exception as e:
        # Development fallback using direct database
        try:
            from ..db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO project_members (org_id, project_id, user_id, role, can_sign, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (org_id, project_id, user_id)
                    DO UPDATE SET role = EXCLUDED.role, can_sign = EXCLUDED.can_sign
                """, (ctx.org_id, project_id, body.user_id, body.role, body.can_sign))
                conn.commit()
            return {"ok": True}
        except Exception as db_e:
            raise HTTPException(500, f"Failed to upsert member: {str(db_e)}")

@router.post("/remove")
def remove_member(user_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    """Remove a project member (admin/owner only)"""
    
    # Prevent admins from removing themselves
    if ctx.role != "owner" and user_id == ctx.user_id:
        raise HTTPException(400, "Admins cannot remove themselves")
    
    try:
        sb = get_supabase_client()
        sb.table("project_members").delete().eq("org_id", ctx.org_id)\
            .eq("project_id", project_id).eq("user_id", user_id).execute()
        return {"ok": True}
    except Exception as e:
        # Development fallback using direct database
        try:
            from ..db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM project_members 
                    WHERE org_id = %s AND project_id = %s AND user_id = %s
                """, (ctx.org_id, project_id, user_id))
                conn.commit()
            return {"ok": True}
        except Exception as db_e:
            raise HTTPException(500, f"Failed to remove member: {str(db_e)}")