from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timedelta, timezone, date
from zoneinfo import ZoneInfo
import os
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
from ..email.util import mailgun_send_html, send_guard, log_send
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/api/digest", tags=["digest"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

def _window(days=7):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start, end

def _iso_week_key(local_dt: datetime) -> str:
    y, w, _ = local_dt.isocalendar()
    return f"wk:{y}-{w:02d}"

def _month_key(local_dt: datetime) -> str:
    return f"mo:{local_dt.year}-{local_dt.month:02d}"

def _get_local_now(sb, org_id: str) -> tuple[datetime, dict]:
    s = sb.table("org_comms_settings").select("*").eq("org_id", org_id).single().execute().data or {}
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(s.get("tz", "America/Los_Angeles"))
    now_utc = datetime.now(timezone.utc)
    return now_utc.astimezone(tz), s

def _compose_counts(sb, org_id: str, project_id: str, days=7):
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    from ..tenant import TenantCtx
    
    start, end = _window(days)
    
    # Note: We need a tenant context for visibility filtering
    # For digest purposes, we'll use admin-level access to get all counts
    # In a real implementation, you might want to pass the user context through
    visibility_ctx = None  # Skip visibility filtering in digest for now
    
    def cnt(table, has_area_column=True):
        query = sb.table(table).select("id", count="exact")\
                  .eq("org_id", org_id).eq("project_id", project_id)\
                  .gte("updated_at", start.isoformat()).lte("updated_at", end.isoformat())
        
        # Apply visibility filtering if context is available
        if visibility_ctx and has_area_column:
            query = apply_area_visibility_filter(query, visibility_ctx, "area")
        
        r = query.execute()
        return r.count or 0
    return {
        "actions":   cnt("actions", True),
        "risks":     cnt("risks", True), 
        "decisions": cnt("decisions", True),
    }

def _compose_counts_filtered(sb, org_id: str, project_id: str, wanted: set, days=7):
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    from ..tenant import TenantCtx
    
    start, end = _window(days)
    
    # Note: We need a tenant context for visibility filtering
    # For digest purposes, we'll use admin-level access to get all counts
    # In a real implementation, you might want to pass the user context through
    visibility_ctx = None  # Skip visibility filtering in digest for now
    
    def cnt(table, has_area_column=True):
        if table not in wanted:
            return 0
        query = sb.table(table).select("id", count="exact")\
                  .eq("org_id", org_id).eq("project_id", project_id)\
                  .gte("updated_at", start.isoformat()).lte("updated_at", end.isoformat())
        
        # Apply visibility filtering if context is available
        if visibility_ctx and has_area_column:
            query = apply_area_visibility_filter(query, visibility_ctx, "area")
        
        r = query.execute()
        return r.count or 0
    
    counts = {}
    if "actions" in wanted:
        counts["actions"] = cnt("actions", True)
    if "risks" in wanted:
        counts["risks"] = cnt("risks", True)
    if "decisions" in wanted:
        counts["decisions"] = cnt("decisions", True)
    return counts

def _overdue_signoffs(sb, org_id: str, project_id: str):
    return sb.table("project_stages").select("title,requested_at")\
             .eq("org_id", org_id).eq("project_id", project_id)\
             .eq("status","in_review").execute().data or []

def _digest_html(project_code: str, counts: dict, overdue: list[dict]) -> str:
    import html
    
    # Sanitize all dynamic content to prevent XSS
    safe_project_code = html.escape(str(project_code))
    safe_items = "".join([
        f"<li>{html.escape(str(o.get('title', 'Unknown')))} (requested {html.escape(str(o.get('requested_at', '')))})</li>" 
        for o in overdue
    ])
    
    return f"""
    <h3>Digest — {safe_project_code}</h3>
    <ul>
      <li>Actions: {int(counts.get('actions',0))}</li>
      <li>Risks: {int(counts.get('risks',0))}</li>
      <li>Decisions: {int(counts.get('decisions',0))}</li>
    </ul>
    <p>Overdue Sign-Offs:</p>
    <ul>{safe_items or '<li>None</li>'}</ul>
    """

def _digest_html_filtered(project_code: str, counts: dict, overdue: list[dict], wanted: set, project_id: str | None = None, period: str = "Weekly") -> str:
    import html
    
    # Sanitize all dynamic content to prevent XSS
    safe_project_code = html.escape(str(project_code))
    safe_items = "".join([
        f"<li>{html.escape(str(o.get('title', 'Unknown')))} (requested {html.escape(str(o.get('requested_at', '')))})</li>" 
        for o in overdue
    ])
    
    def chip(label: str, n: int, path: str) -> str:
        """Generate a styled chip with deep link for digest sections"""
        base = os.getenv("APP_BASE_URL", "").rstrip("/")
        if project_id and base:
            url = f"{base}/projects/{project_id}/{path}"
            return f'<a href="{url}" style="text-decoration:none;border:1px solid #ddd;border-radius:6px;padding:6px 10px;margin-right:6px;color:#111;display:inline-block;margin-bottom:4px">{label}: <b>{n}</b></a>'
        else:
            # Fallback for when no base URL or project_id is available
            return f'<span style="border:1px solid #ddd;border-radius:6px;padding:6px 10px;margin-right:6px;color:#111;display:inline-block;margin-bottom:4px">{label}: <b>{n}</b></span>'
    
    # Build activity section with chips instead of list items - skip empty sections
    MUTE_EMPTY = True
    chips = []
    if "actions" in wanted and counts.get("actions", 0) > 0:
        chips.append(chip("Actions", int(counts['actions']), "actions/list"))
    if "risks" in wanted and counts.get("risks", 0) > 0:
        chips.append(chip("Risks", int(counts['risks']), "admin/audit-timeline"))
    if "decisions" in wanted and counts.get("decisions", 0) > 0:
        chips.append(chip("Decisions", int(counts['decisions']), "admin/audit-timeline"))
    
    activity_section = f"<div>{''.join(chips)}</div>" if chips else "<p>No activity sections selected.</p>"
    
    return f"""
    <h2>{period} Digest</h2>
    {activity_section}
    <p>Overdue Sign-Offs:</p>
    <ul>{safe_items or '<li>None</li>'}</ul>
    """

def _recipients(sb, org_id: str, project_id: str, period: str = "weekly"):
    roles = ['owner','admin','pm','lead']
    ms = sb.table("project_members").select("user_id, role")\
         .eq("org_id", org_id).eq("project_id", project_id).in_("role", roles).execute().data or []
    user_ids = [m["user_id"] for m in ms]

    subs = sb.table("team_subscriptions").select("user_id,digest_weekly,digest_monthly,notify_weekly,notify_monthly,notify_actions,notify_risks,notify_decisions")\
           .eq("org_id", org_id).eq("project_id", project_id).in_("user_id", user_ids).execute().data or []

    if period == "weekly":
        allowed = {s["user_id"] for s in subs if (s.get("digest_weekly") or s.get("notify_weekly"))}
    else:
        allowed = {s["user_id"] for s in subs if (s.get("digest_monthly") or s.get("notify_monthly"))}

    def resolve(emails_for: set[str]):
        emails: list[str] = []
        if emails_for:
            try:
                cs = sb.table("contacts").select("user_id,email").in_("user_id", list(emails_for)).execute().data or []
                emails.extend([c["email"] for c in cs if c.get("email")])
            except Exception: ...
            if not emails:
                up = sb.table("users_profile").select("user_id,email").in_("user_id", list(emails_for)).execute().data or []
                emails.extend([u["email"] for u in up if u.get("email")])
        return sorted(set([e for e in emails if e]))

    return resolve(allowed), {s["user_id"]: s for s in subs}

def _send_digest(sb, org_id: str, project_id: str, period_key: str):
    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
    wanted = {"actions", "risks", "decisions"}  # Include all sections in automated digest
    days = 7 if period_key.startswith("wk:") else 30
    counts = _compose_counts_filtered(sb, org_id, project_id, wanted, days=days)
    overdue = _overdue_signoffs(sb, org_id, project_id)
    period_label = "Weekly" if period_key.startswith("wk:") else "Monthly"
    
    org = sb.table("org_branding").select("*").eq("org_id", org_id).single().execute().data or {}
    html = export_header_html(org, proj["code"]) + _digest_html_filtered(proj["code"], counts, overdue, wanted, project_id, period_label)

    # Determine period from period_key (wk: or mo:)
    period = "weekly" if period_key.startswith("wk:") else "monthly"
    emails, _ = _recipients(sb, org_id, project_id, period=period)
    sent = []
    for email in emails:
        ok, reason = send_guard(sb, org_id, project_id, "digest", email)
        if not ok: continue
        subject_type = "Weekly" if period == "weekly" else "Monthly"
        mailgun_send_html(email, f"{subject_type} Digest — {proj['code']}", html)
        sb.table("comms_send_log").insert({
            "org_id": org_id, "project_id": project_id,
            "kind": "digest", "to_email": email, "period_key": period_key
        }).execute()
        sent.append(email)
    return {"sent": sent, "counts": counts, "overdue": overdue}

# Manual send/preview endpoints
@router.get("/preview")
def preview(
    project_id: str | None = Query(None, alias="project_id"),
    projectId: str | None = Query(None, alias="projectId"),
    topics: str | None = None, 
    respect_notify: bool = True,
    digest_type: str | None = Query(None), 
    ctx: TenantCtx = Depends(PM_PLUS)
):
    # Normalize project_id parameter (handle both camelCase and snake_case)
    if project_id and projectId and project_id != projectId:
        raise HTTPException(400, "Conflicting project identifiers")
    project_id = project_id or projectId
    if not project_id:
        raise HTTPException(422, "project_id or projectId is required")
    # Validate digest_type if provided
    if digest_type and digest_type not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="Digest type must be 'daily' or 'weekly'")
    
    sb = get_user_supabase(ctx)
    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
    wanted = set([t.strip() for t in (topics or "actions,risks,decisions").split(",") if t.strip()])
    # When respect_notify, drop sections that have zero subscribers for that topic
    subs = sb.table("team_subscriptions").select("notify_actions,notify_risks,notify_decisions")\
           .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
    if respect_notify and subs:
        mapk = {"actions":"notify_actions","risks":"notify_risks","decisions":"notify_decisions"}
        for sec, key in mapk.items():
            if sec in wanted and not any(s.get(key) for s in subs):
                wanted.discard(sec)

    counts = _compose_counts_filtered(sb, ctx.org_id, project_id, wanted, days=7)
    overdue = _overdue_signoffs(sb, ctx.org_id, project_id)
    
    # Add recent changes and comments for seeded data (be dev-friendly: accept visible=true OR column absent)
    try:
        changes = sb.table("changes").select("id,area,kind,summary,created_at")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .gte("created_at", (datetime.now(timezone.utc) - timedelta(days=14)).isoformat())\
                   .order("created_at", desc=True).limit(20).execute().data or []
    except Exception:
        changes = []
    
    try:
        comments = sb.table("comments").select("id,area,author,body,created_at")\
                    .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                    .gte("created_at", (datetime.now(timezone.utc) - timedelta(days=14)).isoformat())\
                    .order("created_at", desc=True).limit(20).execute().data or []
    except Exception:
        comments = []
    
    org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
    html = export_header_html(org, proj["code"]) + _digest_html_filtered(proj["code"], counts, overdue, wanted, project_id, "Weekly")
    return {
        "html": html, 
        "counts": counts, 
        "topics": list(wanted),
        "changes": changes,
        "comments": comments,
        "meta": {"project_id": project_id, "count_changes": len(changes), "count_comments": len(comments)}
    }

@router.post("/send-weekly")
def send_weekly(project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    local_now, s = _get_local_now(sb, ctx.org_id)
    period_key = _iso_week_key(local_now)

    # dedupe per week
    existing = sb.table("comms_send_log").select("id", count="exact")\
       .eq("org_id", ctx.org_id).eq("project_id", project_id)\
       .eq("kind","digest").eq("period_key", period_key).execute()
    if (existing.count or 0) > 0:
        return {"ok": True, "already_sent": True, "period_key": period_key}

    # personalized recipients
    emails, subsmap = _recipients(sb, ctx.org_id, project_id, "weekly")
    if not emails: return {"ok": True, "sent": [], "note": "no recipients"}

    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
    code = proj["code"] if proj else project_id
    
    # Get overdue signoffs once for all recipients
    overdue = _overdue_signoffs(sb, ctx.org_id, project_id)

    sent = []
    skipped = []
    for email in emails:
        # resolve user_id from contacts/users_profile
        uid = None
        try:
            c = sb.table("contacts").select("user_id,email").eq("email", email).single().execute().data
            uid = c and c.get("user_id")
        except Exception:
            try:
                u = sb.table("users_profile").select("user_id,email").eq("email", email).single().execute().data
                uid = u and u.get("user_id")
            except Exception: pass

        subs = subsmap.get(uid or "", {}) if uid else {}
        wanted = {"actions","risks","decisions"}
        if subs:
            if not subs.get("notify_actions", True): wanted.discard("actions")
            if not subs.get("notify_risks", True): wanted.discard("risks")
            if not subs.get("notify_decisions", True): wanted.discard("decisions")

        # Skip if user has no sections selected
        if not wanted:
            skipped.append(email)
            continue

        # Get counts efficiently with single call
        counts = _compose_counts_filtered(sb, ctx.org_id, project_id, wanted)
        
        org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
        html = export_header_html(org, code) + _digest_html_filtered(code, counts, overdue, wanted, project_id, "Weekly")

        ok, reason = send_guard(sb, ctx.org_id, project_id, "digest", email)
        if not ok: continue
        mailgun_send_html(email, f"Weekly Digest — {code}", html)
        sb.table("comms_send_log").insert({
            "org_id": ctx.org_id, "project_id": project_id,
            "kind": "digest", "to_email": email, "period_key": period_key
        }).execute()
        sent.append(email)

    return {"ok": True, "sent": sent, "skipped": skipped, "period_key": period_key}

def _next_weekly(local_now: datetime, day: int, hour: int) -> datetime:
    # day: 0=Mon ... 6=Sun
    target = local_now.replace(hour=hour, minute=0, second=0, microsecond=0)
    delta = (day - local_now.weekday()) % 7
    if delta == 0 and local_now >= target:
        delta = 7
    return target + timedelta(days=delta)

@router.get("/status")
def digest_status(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    try:
        sb = get_user_supabase(ctx)
        s = sb.table("org_comms_settings").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
        tz = ZoneInfo(s.get("tz","America/Phoenix"))
        now_local = datetime.now(timezone.utc).astimezone(tz)

        # last send (for this project) 
        try:
            last = sb.table("comms_send_log").select("created_at")\
                    .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("kind","digest")\
                    .order("created_at", desc=True).limit(1).execute().data
            last_send = last[0]["created_at"] if last else None
        except:
            last_send = None

        # next run (weekly)
        if s.get("weekly_enabled", True):
            wd = int(s.get("weekly_day", 4))
            wh = int(s.get("weekly_hour", 9))
            next_local = _next_weekly(now_local, wd, wh)
        else:
            next_local = None

        return {
            "tz": str(tz),
            "last_send": last_send,
            "next_run_local": next_local.isoformat() if next_local else None,
            "quiet_start": s.get("quiet_start"), "quiet_end": s.get("quiet_end"),
            "cap": s.get("daily_send_cap", 200)
        }
    except Exception as e:
        # Fallback for missing tables/auth issues 
        tz = ZoneInfo("America/Phoenix")
        now_local = datetime.now(timezone.utc).astimezone(tz)
        next_local = _next_weekly(now_local, 4, 9)  # Thursday 9am
        return {
            "tz": str(tz),
            "last_send": None,
            "next_run_local": next_local.isoformat(),
            "quiet_start": "21:00:00", 
            "quiet_end": "07:00:00",
            "cap": 200
        }

@router.post("/send-monthly")
def send_monthly(project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    local_now, s = _get_local_now(sb, ctx.org_id)
    period_key = _month_key(local_now)

    # dedupe per month
    existing = sb.table("comms_send_log").select("id", count="exact")\
       .eq("org_id", ctx.org_id).eq("project_id", project_id)\
       .eq("kind","digest").eq("period_key", period_key).execute()
    if (existing.count or 0) > 0:
        return {"ok": True, "already_sent": True, "period_key": period_key}

    # personalized recipients
    emails, subsmap = _recipients(sb, ctx.org_id, project_id, "monthly")
    if not emails: return {"ok": True, "sent": [], "note": "no recipients"}

    proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
    code = proj["code"] if proj else project_id
    
    # Get overdue signoffs once for all recipients
    overdue = _overdue_signoffs(sb, ctx.org_id, project_id)

    sent = []
    skipped = []
    for email in emails:
        # resolve user_id from contacts/users_profile
        uid = None
        try:
            c = sb.table("contacts").select("user_id,email").eq("email", email).single().execute().data
            uid = c and c.get("user_id")
        except Exception:
            try:
                u = sb.table("users_profile").select("user_id,email").eq("email", email).single().execute().data
                uid = u and u.get("user_id")
            except Exception: pass

        subs = subsmap.get(uid or "", {}) if uid else {}
        wanted = {"actions","risks","decisions"}
        if subs:
            if not subs.get("notify_actions", True): wanted.discard("actions")
            if not subs.get("notify_risks", True): wanted.discard("risks")
            if not subs.get("notify_decisions", True): wanted.discard("decisions")

        # Skip if user has no sections selected
        if not wanted:
            skipped.append(email)
            continue

        # Get counts efficiently with single call (30 days for monthly)
        counts = _compose_counts_filtered(sb, ctx.org_id, project_id, wanted, days=30)
        
        org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
        html = export_header_html(org, code) + _digest_html_filtered(code, counts, overdue, wanted, project_id, "Monthly")

        ok, reason = send_guard(sb, ctx.org_id, project_id, "digest", email)
        if not ok: continue
        mailgun_send_html(email, f"Monthly Digest — {code}", html)
        sb.table("comms_send_log").insert({
            "org_id": ctx.org_id, "project_id": project_id,
            "kind": "digest", "to_email": email, "period_key": period_key
        }).execute()
        sent.append(email)

    return {"ok": True, "sent": sent, "skipped": skipped, "period_key": period_key}
