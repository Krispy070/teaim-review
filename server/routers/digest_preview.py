from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
from ..email.util import mailgun_send_html, send_guard
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/digest-preview", tags=["digest-preview"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

class TestSendRequest(BaseModel):
    email: str
    topics: list[str] = ["actions", "risks", "decisions"]
    period: str = "Weekly"

def _window(days=7):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start, end

def _compose_counts_for_preview(sb, org_id: str, project_id: str, wanted: set, days=7):
    """Simplified count function for preview - matches digest.py logic"""
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    
    start, end = _window(days)
    visibility_ctx = None  # Skip visibility filtering in preview for now
    
    def cnt(table, has_area_column=True):
        if table not in wanted:
            return 0
        try:
            query = sb.table(table).select("id", count="exact")\
                      .eq("org_id", org_id).eq("project_id", project_id)\
                      .gte("updated_at", start.isoformat()).lte("updated_at", end.isoformat())
            
            if visibility_ctx and has_area_column:
                query = apply_area_visibility_filter(query, visibility_ctx, "area")
            
            r = query.execute()
            return r.count or 0
        except Exception as e:
            # Handle missing tables gracefully (common in dev environment)
            if 'PGRST205' in str(e) or 'Could not find the table' in str(e):
                return 0
            raise
    
    counts = {}
    if "actions" in wanted:
        counts["actions"] = cnt("actions", True)
    if "risks" in wanted:
        counts["risks"] = cnt("risks", True)
    if "decisions" in wanted:
        counts["decisions"] = cnt("decisions", True)
    return counts

def _overdue_signoffs_for_preview(sb, org_id: str, project_id: str):
    """Get overdue signoffs for preview - matches digest.py logic"""
    try:
        return sb.table("project_stages").select("title,requested_at")\
                 .eq("org_id", org_id).eq("project_id", project_id)\
                 .eq("status","in_review").execute().data or []
    except Exception as e:
        # Handle missing tables gracefully (common in dev environment)
        if 'PGRST205' in str(e) or 'Could not find the table' in str(e):
            return []
        raise

def _digest_html_with_branding(project_code: str, counts: dict, overdue: list[dict], wanted: set, project_id: str, period: str, org_branding: dict):
    """Generate digest HTML with full branding - enhanced from digest.py"""
    import html
    import os
    
    # Sanitize all dynamic content
    safe_project_code = html.escape(str(project_code))
    safe_items = "".join([
        f"<li>{html.escape(str(o.get('title', 'Unknown')))} (requested {html.escape(str(o.get('requested_at', '')))})</li>" 
        for o in overdue
    ])
    
    def chip(label: str, n: int, path: str) -> str:
        """Generate styled chip with deep link"""
        base = os.getenv("APP_BASE_URL", "").rstrip("/")
        if project_id and base:
            url = f"{base}/projects/{project_id}/{path}"
            return f'<a href="{url}" style="text-decoration:none;border:1px solid #ddd;border-radius:6px;padding:6px 10px;margin-right:6px;color:#111;display:inline-block;margin-bottom:4px">{label}: <b>{n}</b></a>'
        else:
            return f'<span style="border:1px solid #ddd;border-radius:6px;padding:6px 10px;margin-right:6px;color:#111;display:inline-block;margin-bottom:4px">{label}: <b>{n}</b></span>'
    
    # Build activity section with chips - skip empty sections
    chips = []
    if "actions" in wanted and counts.get("actions", 0) > 0:
        chips.append(chip("Actions", int(counts['actions']), "actions/list"))
    if "risks" in wanted and counts.get("risks", 0) > 0:
        chips.append(chip("Risks", int(counts['risks']), "admin/audit-timeline"))
    if "decisions" in wanted and counts.get("decisions", 0) > 0:
        chips.append(chip("Decisions", int(counts['decisions']), "admin/audit-timeline"))
    
    activity_section = f"<div>{''.join(chips)}</div>" if chips else "<p>No activity in selected sections.</p>"
    
    # Get brand header HTML
    header_html = export_header_html(org_branding, project_code)
    
    # Combine header with digest content
    digest_content = f"""
    <h2>{period} Digest</h2>
    {activity_section}
    <p><strong>Overdue Sign-Offs:</strong></p>
    <ul>{safe_items or '<li>None</li>'}</ul>
    """
    
    return header_html + digest_content

@router.get("/html")
def get_preview_html(
    project_id: str = Query(...), 
    topics: str = "actions,risks,decisions",
    period: str = "Weekly",
    days: int = 7,
    ctx: TenantCtx = Depends(member_ctx)
):
    """Generate preview HTML for digest with full branding"""
    try:
        sb = get_user_supabase(ctx)
        
        # Get project info with fallback for dev environments
        project_code = "PROJECT"
        try:
            proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
            if proj and proj.get("code"):
                project_code = proj["code"]
        except Exception as e:
            if 'PGRST205' in str(e) or 'Could not find the table' in str(e):
                project_code = "PROJECT (dev)"  # Clear dev indicator
            else:
                raise HTTPException(status_code=404, detail="Project not found")
        
        # Parse wanted topics
        wanted = set([t.strip() for t in topics.split(",") if t.strip()])
        
        # Get counts and overdue signoffs (handles missing tables gracefully)
        counts = _compose_counts_for_preview(sb, ctx.org_id, project_id, wanted, days=days)
        overdue = _overdue_signoffs_for_preview(sb, ctx.org_id, project_id)
        
        # Get org branding with fallback
        org = {}
        try:
            org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
        except Exception as e:
            if 'PGRST205' in str(e) or 'Could not find the table' in str(e):
                org = {}  # Use default branding
            else:
                raise
        
        # Generate HTML with full branding
        html = _digest_html_with_branding(
            project_code, counts, overdue, wanted, project_id, period, org
        )
        
        return {
            "html": html,
            "counts": counts,
            "overdue_count": len(overdue),
            "topics": list(wanted),
            "project_code": project_code,
            "period": period
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate preview: {str(e)}")

@router.post("/test-send")
def send_test_digest(
    request: TestSendRequest,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Send a test digest to specified email address"""
    try:
        sb = get_user_supabase(ctx)
        
        # Get project info with fallback for dev environments
        project_code = "PROJECT"
        try:
            proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
            if proj and proj.get("code"):
                project_code = proj["code"]
        except Exception as e:
            if 'PGRST205' in str(e) or 'Could not find the table' in str(e):
                project_code = "PROJECT (dev)"  # Clear dev indicator
            else:
                raise HTTPException(status_code=404, detail="Project not found")
        
        # Validate email format
        import re
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, request.email):
            raise HTTPException(status_code=400, detail="Invalid email format")
        
        # Parse topics and determine days from period
        wanted = set(request.topics)
        days = 7 if request.period == "Weekly" else 30
        
        # Get counts and overdue signoffs (handles missing tables gracefully)
        counts = _compose_counts_for_preview(sb, ctx.org_id, project_id, wanted, days=days)
        overdue = _overdue_signoffs_for_preview(sb, ctx.org_id, project_id)
        
        # Get org branding with fallback
        org = {}
        try:
            org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
        except Exception as e:
            if 'PGRST205' in str(e) or 'Could not find the table' in str(e):
                org = {}  # Use default branding
            else:
                raise
        
        # Generate HTML with full branding
        html = _digest_html_with_branding(
            project_code, counts, overdue, wanted, project_id, request.period, org
        )
        
        # Check send guards (handle missing tables gracefully)
        ok, reason = True, None
        try:
            ok, reason = send_guard(sb, ctx.org_id, project_id, "digest", request.email)
        except Exception as e:
            if 'PGRST205' in str(e) or 'Could not find the table' in str(e):
                ok, reason = True, None  # Skip rate limiting in dev environment
            else:
                raise
                
        if not ok:
            raise HTTPException(status_code=429, detail=f"Send blocked: {reason}")
        
        # Send email
        subject = f"Test {request.period} Digest — {project_code}"
        mailgun_send_html(request.email, subject, html)
        
        # Log the test send (with special marker) - handle missing table gracefully
        try:
            sb.table("comms_send_log").insert({
                "org_id": ctx.org_id, 
                "project_id": project_id,
                "kind": "digest", 
                "to_email": request.email, 
                "period_key": f"test-{datetime.now().strftime('%Y-%m-%d-%H%M%S')}"
            }).execute()
        except Exception as e:
            if 'PGRST205' in str(e) or 'Could not find the table' in str(e):
                pass  # Skip logging in dev environment
            else:
                raise
        
        return {
            "success": True,
            "message": f"Test digest sent to {request.email}",
            "subject": subject,
            "counts": counts,
            "overdue_count": len(overdue)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send test digest: {str(e)}")

@router.get("/recipients")  
def get_digest_recipients(
    project_id: str = Query(...),
    period: str = "weekly",
    ctx: TenantCtx = Depends(member_ctx)
):
    """Get list of current digest recipients for the project"""
    try:
        sb = get_user_supabase(ctx)
        
        # Get eligible roles
        roles = ['owner','admin','pm','lead']
        ms = sb.table("project_members").select("user_id, role")\
             .eq("org_id", ctx.org_id).eq("project_id", project_id).in_("role", roles).execute().data or []
        user_ids = [m["user_id"] for m in ms]
        
        if not user_ids:
            return {"recipients": [], "period": period}
        
        # Get subscriptions
        subs = sb.table("team_subscriptions").select("user_id,digest_weekly,digest_monthly,notify_weekly,notify_monthly,notify_actions,notify_risks,notify_decisions")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).in_("user_id", user_ids).execute().data or []
        
        # Filter by period
        if period == "weekly":
            allowed_user_ids = {s["user_id"] for s in subs if (s.get("digest_weekly") or s.get("notify_weekly"))}
        else:
            allowed_user_ids = {s["user_id"] for s in subs if (s.get("digest_monthly") or s.get("notify_monthly"))}
        
        # Resolve emails
        recipients = []
        if allowed_user_ids:
            try:
                # Try contacts table first
                contacts = sb.table("contacts").select("user_id,email").in_("user_id", list(allowed_user_ids)).execute().data or []
                emails_found = {c["user_id"]: c["email"] for c in contacts if c.get("email")}
                
                # Fill in gaps from users_profile  
                missing_user_ids = allowed_user_ids - set(emails_found.keys())
                if missing_user_ids:
                    profiles = sb.table("users_profile").select("user_id,email").in_("user_id", list(missing_user_ids)).execute().data or []
                    for p in profiles:
                        if p.get("email"):
                            emails_found[p["user_id"]] = p["email"]
                
                # Build recipient list with subscription details
                for user_id in allowed_user_ids:
                    email = emails_found.get(user_id)
                    if email:
                        sub = next((s for s in subs if s["user_id"] == user_id), {})
                        recipients.append({
                            "email": email,
                            "user_id": user_id,
                            "subscriptions": {
                                "actions": sub.get("notify_actions", True),
                                "risks": sub.get("notify_risks", True), 
                                "decisions": sub.get("notify_decisions", True)
                            }
                        })
            except Exception:
                pass
        
        return {
            "recipients": recipients,
            "period": period,
            "total_count": len(recipients)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get recipients: {str(e)}")