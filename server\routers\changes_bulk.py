from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
from .changes_sla import _sla_state

router = APIRouter(prefix="/api/changes", tags=["changes"])
PM_PLUS = require_role({"owner","admin","pm"})

class BulkBody(BaseModel):
    ids: List[str]
    to: str  # intake|triage|planned|in_progress|testing|deployed|closed

@router.post("/bulk_transition")
def bulk_transition(body: BulkBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    updated = 0
    try:
        for cid in body.ids:
            try:
                sb.table("changes").update({"status": body.to})\
                  .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", cid).execute()
                updated += 1
            except Exception: ...
        return {"ok": True, "updated": updated}
    except Exception:
        return {"ok": False, "updated": 0}

@router.get("/list_advanced")
def list_advanced(project_id: str = Query(...),
                  area: Optional[str] = None,
                  status: Optional[str] = None,
                  priority: Optional[str] = None,
                  assignee: Optional[str] = None,
                  sort: Optional[str] = "sla",  # sla|due|priority
                  ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("changes").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id)
        if area: q = q.eq("area", area)
        if status: q = q.eq("status", status)
        if priority: q = q.eq("priority", priority)
        if assignee: q = q.eq("assignee", assignee)
        rows = q.limit(2000).execute().data or []
        # compute SLA
        for r in rows:
            r["sla"] = _sla_state(r.get("due_date"), r.get("priority"))
        if sort=="sla":
            rows.sort(key=lambda r: (r["sla"]["state"]!="overdue", r["sla"]["state"]!="breach_soon", r["sla"]["days_left"] if r["sla"]["days_left"] is not None else 999))
        elif sort=="due":
            rows.sort(key=lambda r: (r.get("due_date") or "9999-12-31"))
        elif sort=="priority":
            order={"urgent":0,"high":1,"medium":2,"low":3}
            rows.sort(key=lambda r: order.get((r.get("priority") or "medium").lower(),2))
        return {"items": rows}
    except Exception:
        return {"items": []}