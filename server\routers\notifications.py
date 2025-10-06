from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta, timezone
import psycopg2.extras
from ..tenant import TenantCtx, tenant_ctx, project_member_ctx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase
from ..db import get_conn

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/list")
def list_notifs(project_id: str | None = Query(None), days:int=14, ctx: TenantCtx = Depends(tenant_ctx)):
    # When project_id is provided, validate project membership for security
    if project_id:
        # Validate project membership manually
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT role FROM project_members 
                WHERE org_id = %s AND project_id = %s AND user_id = %s
                LIMIT 1
            """, (ctx.org_id, project_id, ctx.user_id))
            
            result = cur.fetchone()
            if not result:
                from fastapi import HTTPException
                raise HTTPException(403, "Not a member of this project")
        
    start = (datetime.now(timezone.utc) - timedelta(days=max(1,days))).isoformat()
    items=[]
    # best-effort union (area comments, changes transitions, signoff reminders/pendings) using local database
    try:
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            sql = """
                SELECT created_at, area, message, user_id 
                FROM area_comments 
                WHERE org_id = %s AND created_at >= %s 
            """
            params = [ctx.org_id, start]
            if project_id:
                sql += " AND project_id = %s"
                params.append(project_id)
            sql += " ORDER BY created_at DESC LIMIT 200"
            
            cur.execute(sql, params)
            c = cur.fetchall() or []
            items += [{"kind":"area_comment","created_at":x.get("created_at"),"title":f"New comment in {x.get('area')}", "detail":(x.get("message") or "")[:120]} for x in c if x]
    except Exception: ...
    try:
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            sql = """
                SELECT created_at, kind, details 
                FROM audit_events 
                WHERE org_id = %s AND created_at >= %s 
            """
            params = [ctx.org_id, start]
            if project_id:
                sql += " AND project_id = %s"
                params.append(project_id)
            sql += " ORDER BY created_at DESC LIMIT 200"
            
            cur.execute(sql, params)
            ch = cur.fetchall() or []
            items += [{"kind":x.get("kind") or "event","created_at":x.get("created_at"),"title":x.get("kind"),"detail":str(x.get("details") or "")[:120]} for x in ch if x]
    except Exception: ...
    try:
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            sql = """
                SELECT created_at, signer_email 
                FROM signoff_doc_tokens 
                WHERE org_id = %s AND used_at IS NULL AND created_at >= %s 
            """
            params = [ctx.org_id, start]
            if project_id:
                sql += " AND project_id = %s"
                params.append(project_id)
            sql += " ORDER BY created_at DESC LIMIT 100"
            
            cur.execute(sql, params)
            tk = cur.fetchall() or []
            items += [{"kind":"signoff_pending","created_at":x.get("created_at"),"title":"Sign-off pending","detail":x.get("signer_email") or ""} for x in tk if x]
    except Exception: ...
    items.sort(key=lambda i: i.get("created_at") or "", reverse=True)
    return {"items": items[:200]}

# Database utility
class DatabaseUtil:
    def one(self, sql: str, args: tuple):
        """Execute query and return single row as dict"""
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args)
            return cur.fetchone()

pg = DatabaseUtil()

@router.get("/unseen-count")
def unseen(userId: str | None = Query(None), ctx: TenantCtx = Depends(project_member_ctx)):
    # Import here to avoid circular dependency  
    from ..tenant import project_member_ctx
    from fastapi import HTTPException
    
    # Project membership already validated by dependency
    projectId = ctx.project_id
    
    # Restrict userId access for security - only allow own user or admin roles
    # ctx.role is now the project role from require_project_member
    if userId and userId != ctx.user_id and ctx.role not in {"owner", "admin"}:
        raise HTTPException(403, "Can only query own notification count")
        
    if userId:
        row = pg.one("""select count(*)::int as c from notifications
                        where project_id=%s and user_id=%s and seen=false""", (projectId, userId))
    else:
        # dev fallback: any unseen for the project
        row = pg.one("""select count(*)::int as c from notifications
                        where project_id=%s and seen=false""", (projectId,))
    return {"ok": True, "count": row["c"]}

@router.post("/mark_read_all")
def mark_read_all(ctx: TenantCtx = Depends(member_ctx)):
    # if you have a notifications table, mark as read here; dev-safe no-op:
    return {"ok": True}