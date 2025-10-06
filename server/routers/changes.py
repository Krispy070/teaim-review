from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
import io, csv

router = APIRouter(prefix="/api/changes", tags=["changes"])

STATUSES = ["intake","triage","planned","in_progress","testing","deployed","closed"]

class CR(BaseModel):
    id: Optional[str] = None
    title: str
    area: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = "medium"   # low|medium|high|urgent
    risk: Optional[str] = "medium"       # low|medium|high
    status: Optional[str] = "intake"
    assignee: Optional[str] = None       # user_id/email
    due_date: Optional[str] = None       # ISO date
    watchers: Optional[List[str]] = []

@router.get("/list")
def list_changes(project_id: str = Query(...), area: str | None = None,
                 status: str | None = None, ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("changes").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id)
        if area: q = q.eq("area", area)
        if status: q = q.eq("status", status)
        rows = q.order("created_at", desc=True).limit(2000).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}

PM_PLUS = require_role({"owner","admin","pm"})

@router.post("/upsert")
def upsert_change(body: CR, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        data = body.model_dump()
        data.update({"org_id": ctx.org_id, "project_id": project_id})
        if body.id:
            sb.table("changes").update(data).eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", body.id).execute()
        else:
            sb.table("changes").insert(data).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.post("/transition")
def transition(id: str = Query(...), to: str = Query(...), project_id: str = Query(...),
               ctx: TenantCtx = Depends(PM_PLUS)):
    if to not in STATUSES: return {"ok": False, "error": "bad status"}
    sb = get_user_supabase(ctx)
    try:
        sb.table("changes").update({"status": to}).eq("org_id", ctx.org_id)\
          .eq("project_id", project_id).eq("id", id).execute()
        # notify watchers (best effort)
        try:
            ch = sb.table("changes").select("title,watchers").eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",id).single().execute().data or {}
            for w in (ch.get("watchers") or []):
                # rely on your notification system
                sb.table("notifications").insert({
                  "org_id": ctx.org_id, "project_id": project_id,
                  "to_user": w, "kind": "change_update",
                  "payload": {"id": id, "title": ch.get("title"), "status": to}
                }).execute()
        except Exception: ...
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.get("/export.csv")
def export_csv(project_id: str = Query(...), area: str | None = None, status: str | None = None,
               ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("changes").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id)
        if area: q = q.eq("area", area)
        if status: q = q.eq("status", status)
        rows = q.order("created_at", desc=True).limit(5000).execute().data or []
    except Exception:
        rows=[]
    cols = ["id","title","area","description","priority","risk","status","assignee","due_date","watchers"]
    s=io.StringIO(); w=csv.writer(s); w.writerow(cols)
    for r in rows: w.writerow([r.get(c) for c in cols])
    s.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(iter([s.read()]), media_type="text/csv",
      headers={"Content-Disposition": 'attachment; filename="changes.csv"'})