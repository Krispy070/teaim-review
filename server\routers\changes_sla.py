from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/changes", tags=["changes"])

def _sla_state(due: str|None, priority: str|None):
    if not due: return {"state":"none","days_left":None}
    try:
        dd = datetime.fromisoformat(due).date()
    except Exception:
        return {"state":"none","days_left":None}
    today = datetime.now(timezone.utc).date()
    days = (dd - today).days
    # thresholds by priority
    thr = {"urgent":2,"high":3,"medium":5,"low":7}
    t = thr.get((priority or "medium").lower(),5)
    if days < 0: return {"state":"overdue","days_left":days}
    if days <= t: return {"state":"breach_soon","days_left":days}
    return {"state":"ok","days_left":days}

@router.get("/sla")
def sla(project_id: str = Query(...), area: str|None=None, ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("changes").select("id,title,area,priority,due_date,status,assignee,watchers")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)
        if area: q = q.eq("area", area)
        rows = q.order("due_date", asc=True).limit(1000).execute().data or []
        for r in rows:
            s = _sla_state(r.get("due_date"), r.get("priority"))
            r["sla"] = s
        return {"items": rows}
    except Exception:
        return {"items": []}

@router.post("/sla_alerts")
def sla_alerts(project_id: str = Query(...), ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    # Manual trigger for demo/dev (scheduler can call this periodically)
    sb = get_user_supabase(ctx)
    sent=0
    try:
        rows = sb.table("changes").select("id,title,priority,due_date,watchers").eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        from ..email.util import mailgun_send_html, send_guard
        for r in rows:
            s = _sla_state(r.get("due_date"), r.get("priority"))
            if s["state"] in ("overdue","breach_soon"):
                for w in (r.get("watchers") or []):
                    try:
                        ok,_ = send_guard(sb, ctx.org_id, project_id, "cr_sla", w)
                        if ok:
                            mailgun_send_html([w],
                                f"[SLA] CR '{r.get('title')}' is {s['state']} ({s['days_left']})",
                                f"<p>Change Request: <b>{r.get('title')}</b><br/>Due: {r.get('due_date') or 'n/a'}<br/>Priority: {r.get('priority')}</p>")
                            sent += 1
                    except Exception: ...
        return {"ok": True, "sent": sent}
    except Exception:
        return {"ok": False, "sent": sent}

@router.post("/sla_alerts_assignee")
def sla_alerts_assignee(project_id: str = Query(...), ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    sent=0
    try:
        rows = sb.table("changes").select("id,title,priority,due_date,assignee")\
                 .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        from ..email.util import mailgun_send_html, send_guard
        for r in rows:
            s = _sla_state(r.get("due_date"), r.get("priority"))
            if s["state"] in ("overdue","breach_soon") and r.get("assignee"):
                try:
                    ok,_ = send_guard(sb, ctx.org_id, project_id, "cr_sla_assignee", r["assignee"])
                    if ok:
                        mailgun_send_html([r["assignee"]],
                            f"[SLA] Your CR '{r.get('title')}' is {s['state']} ({s['days_left']})",
                            f"<p>CR: <b>{r.get('title')}</b><br/>Due: {r.get('due_date') or 'n/a'}<br/>Priority: {r.get('priority')}</p>")
                        sent+=1
                except Exception: ...
        return {"ok": True, "sent": sent}
    except Exception:
        return {"ok": False, "sent": sent}