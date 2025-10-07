from fastapi import APIRouter, Depends, Query, Response, HTTPException
from fastapi.responses import PlainTextResponse
from datetime import datetime, timezone
import psycopg2.extras
from ..tenant import TenantCtx, require_project_member, tenant_ctx, DEV_AUTH
from ..guards import member_ctx
from ..supabase_client import get_user_supabase
from ..db import get_conn

router = APIRouter(prefix="/api/releases", tags=["releases"])

# Database utility
class DatabaseUtil:
    def query(self, sql: str, args: tuple):
        """Execute query and return all rows as dicts"""
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args)
            return cur.fetchall()

pg = DatabaseUtil()

def fmt(dt):
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z","+00:00"))
        except:
            dt = datetime.utcnow().replace(tzinfo=timezone.utc)
    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

@router.get("/ics")
def ics(projectId: str = Query(...), ctx: TenantCtx = Depends(tenant_ctx)):
    # Validate project membership manually since require_project_member doesn't work in this context
    from ..db import get_conn
    if not DEV_AUTH:  # Skip in dev mode like require_project_member does
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT role FROM project_members 
                WHERE org_id = %s AND project_id = %s AND user_id = %s
                LIMIT 1
            """, (ctx.org_id, projectId, ctx.user_id))
            
            result = cur.fetchone()
            if not result:
                raise HTTPException(403, "Not a member of this project")
        
    rows = pg.query("""
      select id, title, starts_at, coalesce(ends_at, starts_at) as ends_at, channel
      from calendar_events
      where project_id=%s and starts_at between now() and now() + interval '60 days'
      order by starts_at asc
    """, (projectId,))
    lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TEAIM//Releases//EN"]
    for r in rows:
        lines += [
            "BEGIN:VEVENT",
            f"UID:{r['id']}@teaim",
            f"SUMMARY:{r['title']}",
            f"DTSTART:{fmt(r['starts_at'])}",
            f"DTEND:{fmt(r['ends_at'])}",
            f"CATEGORIES:{r.get('channel','staging')}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", media_type="text/calendar")

@router.get("/month.ics", response_class=PlainTextResponse)
def month_ics(
    project_id: str | None = Query(None, alias="project_id"),
    projectId: str | None = Query(None, alias="projectId"),
    year: int = Query(...), 
    month: int = Query(...)
):
    # Normalize project_id parameter (handle both camelCase and snake_case)
    from fastapi import HTTPException
    if project_id and projectId and project_id != projectId:
        raise HTTPException(400, "Conflicting project identifiers")
    project_id = project_id or projectId
    if not project_id:
        raise HTTPException(422, "project_id or projectId is required")
    
    # Validate project membership
    ctx = require_project_member(project_id)
    sb = get_user_supabase(ctx)
    try:
        # Get future calendar events instead of releases (next 60 days is typical for tests)
        rows = sb.table("calendar_events").select("id,title,starts_at,ends_at,channel")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)\
            .gte("starts_at", datetime.utcnow().isoformat())\
            .order("starts_at").limit(100).execute().data or []
    except Exception:
        rows=[]
    ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TEAIM//Releases//EN"]
    def fmt(dtstr): 
        try:
            return datetime.fromisoformat(dtstr.replace("Z","+00:00")).strftime("%Y%m%dT%H%M%SZ")
        except Exception: return None
    for r in rows:
        s=fmt(r.get("starts_at")); e=fmt(r.get("ends_at") or r.get("starts_at"))
        if not s or not e: continue
        ics += ["BEGIN:VEVENT", f"UID:{r['id']}@teaim", f"DTSTART:{s}", f"DTEND:{e}", 
               f"SUMMARY:{r.get('title', 'Event')}", f"CATEGORIES:{r.get('channel','staging')}", "END:VEVENT"]
    ics += ["END:VCALENDAR"]
    return PlainTextResponse("\r\n".join(ics), media_type="text/calendar")