from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import pytz, os, json
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase
from ..deps import get_service_supabase

router = APIRouter(prefix="/api/changes", tags=["changes"])
PM_PLUS = require_role({"owner","admin","pm"})

class ScheduleBulkBody(BaseModel):
    ids: List[str]                       # CR ids to nudge (assignee-based)
    at_local: Optional[str] = "09:00"    # HH:MM
    timezone: Optional[str] = None
    subject: Optional[str] = None        # optional override
    html: Optional[str] = None           # optional override
    min_hours_between: int = 12
    name: Optional[str] = None           # save as group preset name (optional)

@router.post("/schedule_nudge_bulk")
def schedule_nudge_bulk(body: ScheduleBulkBody, project_id: str = Query(...),
                        ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx); sbs = get_service_supabase()
    # compute due time
    try:
        tzname = body.timezone or (sb.table("org_comms_settings").select("timezone")
                   .eq("org_id", ctx.org_id).single().execute().data or {}).get("timezone") or "UTC"
    except Exception:
        tzname = "UTC"
    
    tz = pytz.timezone(tzname)
    hh, mm = (body.at_local or "09:00").split(":")
    local_now = datetime.now(tz)
    tomorrow = (local_now + timedelta(days=1)).replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
    due_utc = tomorrow.astimezone(pytz.UTC).isoformat()

    # fetch assignees for the CR ids
    try:
        rows = sb.table("changes").select("id,title,assignee,priority,due_date")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).in_("id", body.ids).execute().data or []
    except Exception:
        rows=[]

    # create comms_queue items (one per assignee per CR)
    queued=0
    for r in rows:
        to = r.get("assignee")
        if not to: continue
        try:
            sbs.table("comms_queue").insert({
                "org_id": ctx.org_id, "project_id": project_id,
                "kind": "cr_nudge_bulk",
                "to_email": to,
                "not_before": due_utc,
                "details": {
                    "id": r.get("id"),
                    "title": r.get("title"),
                    "due": r.get("due_date"),
                    "priority": r.get("priority"),
                    "subject": body.subject,
                    "html": body.html,
                    "min_hours_between": body.min_hours_between
                }
            }).execute(); queued+=1
        except Exception: ...
    # save group preset (optional)
    try:
        if body.name:
            sbs.table("ops_kv").upsert({
                "key": f"cr_nudge_group:{ctx.org_id}:{project_id}:{body.name}",
                "val": {"ids": body.ids, "subject": body.subject, "html": body.html}
            }).execute()
    except Exception: ...
    return {"ok": True, "queued": queued, "scheduled_for": due_utc}

@router.get("/nudge_groups")
def nudge_groups(project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        keypref = f"cr_nudge_group:{ctx.org_id}:{project_id}:"
        rows = sb.table("ops_kv").select("key,val").ilike("key", keypref + "%").limit(200).execute().data or []
        return {"items": [{"name": r["key"].split(":")[-1], "val": r.get("val")} for r in rows]}
    except Exception:
        return {"items": []}