from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase
from .changes_sla import _sla_state

router = APIRouter(prefix="/api/changes", tags=["changes"])
PM_PLUS = require_role({"owner","admin","pm"})

@router.post("/nudge_assignee")
def nudge_assignee(id: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("changes").select("title,assignee,priority,due_date").eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",id).single().execute().data or {}
        if not r or not r.get("assignee"): return {"ok": True, "sent": 0}
        s = _sla_state(r.get("due_date"), r.get("priority"))
        subj = f"[Nudge] CR '{r.get('title')}' — status check ({s['state']})"
        html = f"<p>CR: <b>{r.get('title')}</b><br/>Due: {r.get('due_date') or 'n/a'}<br/>Priority: {r.get('priority')}</p>"
        try:
            from ..email.util import mailgun_send_html, send_guard
            ok,_ = send_guard(sb, ctx.org_id, project_id, "cr_nudge", r["assignee"])
            if ok: mailgun_send_html(r["assignee"], subj, html); return {"ok": True, "sent": 1}
        except Exception: ...
        return {"ok": False, "sent": 0}
    except Exception:
        return {"ok": False, "sent": 0}

class NudgeBulkBody(BaseModel):
    ids: List[str]
    subject: Optional[str] = None
    html: Optional[str] = None
    min_hours_between: int = 12

@router.post("/nudge_assignee_bulk")
def nudge_assignee_bulk(body: NudgeBulkBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    sent = 0
    try:
        rows = sb.table("changes").select("id,title,priority,due_date,assignee")\
                 .eq("org_id", ctx.org_id).eq("project_id", project_id).in_("id", body.ids).execute().data or []
        now = datetime.now(timezone.utc)
        for r in rows:
            to = r.get("assignee")
            if not to: continue
            # throttle
            try:
                last = sb.table("comms_send_log").select("created_at")\
                         .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                         .eq("kind","cr_nudge").eq("to_email", to)\
                         .order("created_at", desc=True).limit(1).execute().data
                ok_throttle = True
                if last:
                    dt_last = datetime.fromisoformat(last[0]["created_at"].replace("Z","+00:00"))
                    ok_throttle = (now - dt_last) >= timedelta(hours=body.min_hours_between)
            except Exception:
                ok_throttle = True
            if not ok_throttle: continue

            s = _sla_state(r.get("due_date"), r.get("priority"))
            subj = body.subject or f"[Nudge] CR '{r.get('title')}' — {s['state']} ({s['days_left']})"
            html = (body.html or "<p>CR: <b>{{TITLE}}</b><br/>Due: {{DUE}}<br/>Priority: {{PRIO}}</p>")\
                    .replace("{{TITLE}}", r.get("title") or "")\
                    .replace("{{DUE}}", r.get("due_date") or "n/a")\
                    .replace("{{PRIO}}", r.get("priority") or "n/a")
            try:
                from ..email.util import mailgun_send_html, send_guard
                ok,_ = send_guard(sb, ctx.org_id, project_id, "cr_nudge", to)
                if ok:
                    mailgun_send_html(to, subj, html)
                    sent += 1
                    try:
                        sb.table("comms_send_log").insert({
                          "org_id": ctx.org_id, "project_id": project_id,
                          "kind":"cr_nudge","to_email":to,"details":{"id":r["id"]}
                        }).execute()
                    except Exception: ...
            except Exception: ...
        return {"ok": True, "sent": sent}
    except Exception:
        return {"ok": False, "sent": sent}

@router.post("/update_small")
def update_small(id: str = Query(...), project_id: str = Query(...),
                 assignee: str | None = None, due_date: str | None = None,
                 ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    patch={}
    if assignee is not None: patch["assignee"]=assignee
    if due_date is not None: patch["due_date"]=due_date
    try:
        if patch:
            sb.table("changes").update(patch).eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",id).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}