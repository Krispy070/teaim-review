from fastapi import APIRouter, Query, HTTPException, Depends
from typing import Optional
import psycopg2.extras
from ..db import get_conn
from ..tenant import TenantCtx, project_member_ctx

router = APIRouter(prefix="/tests", tags=["tests-library"])

class DatabaseUtil:
    def query(self, sql: str, args: tuple):
        """Execute query and return all rows as dicts"""
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args)
            return cur.fetchall()
    
    def one(self, sql: str, args: tuple):
        """Execute query and return single row as dict"""
        with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args)
            return cur.fetchone()

pg = DatabaseUtil()

@router.get("")
def list_tests(
    q: Optional[str] = None,
    areaKey: Optional[str] = None,
    bpCode: Optional[str] = None,
    priority: Optional[str] = None,  # P0..P3
    type: Optional[str] = None,      # happy|edge|negative|regression
    ctx: TenantCtx = Depends(project_member_ctx)
):
    # Project membership already validated by dependency
    projectId = ctx.project_id
        
    sql = [
        """select id, project_id as "projectId", area_key as "areaKey", bp_code as "bpCode",
                  title, version, priority, type, tags, created_at as "createdAt"
           from tests_library where project_id=%s"""
    ]
    args = [projectId]
    if areaKey:
        sql.append("and area_key=%s"); args.append(areaKey)
    if bpCode:
        sql.append("and bp_code=%s"); args.append(bpCode)
    if priority:
        sql.append("and priority=%s"); args.append(priority)
    if type:
        sql.append("and type=%s"); args.append(type)
    if q:
        sql.append("and (title ilike %s or bp_code ilike %s)"); args.extend([f"%{q}%", f"%{q}%"])
    sql.append("order by area_key nulls last, bp_code nulls last, title asc, version desc")
    rows = pg.query(" ".join(sql), tuple(args))
    return {"ok": True, "items": rows}

@router.get("/{test_id}")
def get_test(test_id: str, ctx: TenantCtx = Depends(project_member_ctx)):
    # Project membership already validated by dependency
    projectId = ctx.project_id
        
    row = pg.one("""select id, project_id as "projectId", area_key as "areaKey", bp_code as "bpCode",
                           title, version, gherkin, steps, priority, type, tags,
                           source_transcript_id as "sourceTranscriptId", created_at as "createdAt"
                    from tests_library where project_id=%s and id=%s""", (projectId, test_id))
    if not row: raise HTTPException(404, "Test not found")
    return {"ok": True, "item": row}

@router.get("/{test_id}/history")
def get_history(test_id: str, ctx: TenantCtx = Depends(project_member_ctx)):
    # Project membership already validated by dependency
    projectId = ctx.project_id
        
    rows = pg.query("""select version, diff, committed_at as "committedAt", committed_by as "committedBy"
                       from tests_history th
                       join tests_library tl on tl.id=%s and tl.project_id=%s
                       where th.test_id=tl.id
                       order by version desc""", (test_id, projectId))
    return {"ok": True, "items": rows}