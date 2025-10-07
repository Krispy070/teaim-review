from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
from typing import List, Optional
import os
import pytz
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase, get_supabase_client

router = APIRouter(prefix="/api/signoff", tags=["signoff"])

PM_PLUS = require_role({"owner","admin","pm"})

@router.post("/set_expiry")
def set_expiry(project_id: str = Query(...), stage_id: str = Query(...), hours: int = 120,
               ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        # find doc
        d = sb.table("signoff_docs").select("id").eq("org_id", ctx.org_id)\
             .eq("project_id", project_id).eq("stage_id", stage_id).limit(1).execute().data or []
        if not d: return {"ok": True, "updated": 0}
        expires = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()
        r = sb.table("signoff_doc_tokens").update({"expires_at": expires})\
            .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("doc_id", d[0]["id"]).is_("used_at","null").execute()
        return {"ok": True, "updated": (r.count if hasattr(r,"count") else None)}
    except Exception:
        return {"ok": False}

@router.post("/remind_all")
def remind_all(project_id: str = Query(...), stage_id: str = Query(...),
               ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx); sbs = get_supabase_client()
    try:
        d = sb.table("signoff_docs").select("id").eq("org_id", ctx.org_id)\
             .eq("project_id", project_id).eq("stage_id", stage_id).limit(1).execute().data or []
        if not d: return {"ok": True, "sent": 0}
        tokens = sb.table("signoff_doc_tokens").select("token,signer_email")\
                 .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("doc_id", d[0]["id"])\
                 .is_("used_at","null").is_("revoked_at","null").execute().data or []
        sent = 0
        base = os.getenv("APP_BASE_URL","").rstrip("/")
        try:
            from ..email.util import mailgun_send_html, send_guard
            for t in tokens:
                link = f"{base}/signoff/doc/{t['token']}"
                ok,_ = send_guard(sb, ctx.org_id, project_id, "signoff_reminder", t["signer_email"])
                if ok:
                    result = mailgun_send_html(t["signer_email"], "[Reminder] Sign-off request pending",
                                      f"<p>Your sign-off link is still pending:</p><p><a href='{link}'>Open</a></p>")
                    if result.get("ok"):
                        sent += 1
        except Exception: ...
        return {"ok": True, "sent": sent}
    except Exception:
        return {"ok": False}

@router.get("/last_action")
def last_action(project_id: str = Query(...), stage_id: str = Query(...),
                ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    # best-effort: use audit_events if present
    try:
        r = sb.table("audit_events").select("created_at")\
             .eq("org_id", ctx.org_id).eq("project_id", project_id)\
             .eq("kind","stage.request_signoff").contains("details", {"stage_id": stage_id})\
             .order("created_at", desc=True).limit(1).execute().data or []
        return {"last": r[0]["created_at"] if r else None}
    except Exception:
        return {"last": None}

class TokensBody(BaseModel):
    tokens: List[str] = Field(min_length=1)
    # for remind throttle
    min_hours_between: int = 12
    # for set expiry
    hours: int = 120

@router.post("/remind_selected")
def remind_selected(body: TokensBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    base = os.getenv("APP_BASE_URL","").rstrip("/")
    sent = 0
    try:
        # fetch emails for tokens
        rows = sb.table("signoff_doc_tokens").select("token,signer_email,doc_id")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)\
            .in_("token", body.tokens).is_("used_at","null").is_("revoked_at","null")\
            .execute().data or []
        now = datetime.now(timezone.utc)
        for r in rows:
            email = r.get("signer_email")
            if not email: continue
            # throttle by comms_send_log (per email/kind daily-ish)
            try:
                last = sb.table("comms_send_log").select("created_at")\
                       .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                       .eq("kind","signoff_reminder").eq("to_email", email)\
                       .order("created_at", desc=True).limit(1).execute().data
                if last:
                    dt_last = datetime.fromisoformat(last[0]["created_at"].replace("Z","+00:00"))
                    if (now - dt_last) < timedelta(hours=body.min_hours_between): 
                        continue  # throttled
            except Exception: ...
            # send
            try:
                from ..email.util import mailgun_send_html, send_guard
                ok,_ = send_guard(sb, ctx.org_id, project_id, "signoff_reminder", email)
                if ok:
                    link = f"{base}/signoff/doc/{r['token']}"
                    mailgun_send_html(email, "[Reminder] Sign-off request", f"<p>Your sign-off link: <a href='{link}'>Open</a></p>")
                    sent += 1
                    # log
                    try:
                        sb.table("comms_send_log").insert({
                          "org_id": ctx.org_id, "project_id": project_id,
                          "kind": "signoff_reminder", "to_email": email,
                          "details": {"token": r["token"]}
                        }).execute()
                    except Exception: ...
            except Exception: ...
        return {"ok": True, "sent": sent}
    except Exception:
        return {"ok": False, "sent": 0}

@router.post("/set_expiry_selected")
def set_expiry_selected(body: TokensBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        expires = (datetime.now(timezone.utc) + timedelta(hours=body.hours)).isoformat()
        r = sb.table("signoff_doc_tokens").update({"expires_at": expires})\
            .eq("org_id", ctx.org_id).eq("project_id", project_id).in_("token", body.tokens).is_("used_at","null").execute()
        return {"ok": True, "updated": (r.count if hasattr(r,"count") else None)}
    except Exception:
        return {"ok": False, "updated": 0}

@router.post("/revoke_expired_now")
def revoke_expired_now(project_id: str | None = None, ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    try:
        now = datetime.now(timezone.utc).isoformat()
        q = sb.table("signoff_doc_tokens").update({"revoked_at":"now()"})\
            .eq("org_id", ctx.org_id).is_("used_at","null").is_("revoked_at","null").lt("expires_at", now)
        if project_id: q = q.eq("project_id", project_id)
        r = q.execute()
        return {"ok": True, "updated": getattr(r, "count", None)}
    except Exception:
        return {"ok": False, "updated": 0}

class ScheduleBody(BaseModel):
    tokens: List[str] = Field(min_length=1)
    at_local: Optional[str] = "09:00"   # HH:MM
    timezone: Optional[str] = None      # e.g., "America/Los_Angeles"
    min_hours_between: int = 12

@router.post("/schedule_reminders")
def schedule_reminders(body: ScheduleBody, project_id: str = Query(...),
                       ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    tzname = body.timezone or (sb.table("org_comms_settings").select("timezone").eq("org_id", ctx.org_id).single().execute().data or {}).get("timezone") or "UTC"
    tz = pytz.timezone(tzname)
    hh, mm = (body.at_local or "09:00").split(":")
    local_now = datetime.now(tz)
    # tomorrow at HH:MM local
    tomorrow = (local_now + timedelta(days=1)).replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
    due_utc = tomorrow.astimezone(pytz.UTC).isoformat()

    try:
        for tok in body.tokens:
            sb.table("comms_queue").insert({
                "org_id": ctx.org_id,
                "project_id": project_id,
                "kind": "signoff_reminder",
                "to_token": tok,
                "not_before": due_utc,
                "details": {"min_hours_between": body.min_hours_between}
            }).execute()
        return {"ok": True, "scheduled_for": due_utc, "tokens": len(body.tokens)}
    except Exception:
        return {"ok": False}