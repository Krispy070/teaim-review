from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_supabase_client
import os

router = APIRouter(prefix="/api/cr_digest", tags=["changes"])

@router.post("/daily")
def daily(project_id: str = Query(...), ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    """Send daily CR digest to owners and assignees"""
    sb = get_supabase_client()
    sent = 0
    try:
        # Get CRs not closed/deployed
        crs = sb.table("changes").select("id,title,area,priority,status,due_date,assignee")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        open_cr = [c for c in crs if (c.get("status") or "").lower() not in ("deployed", "closed")]

        # Get recipients: owners per area + assignees  
        owners = sb.table("area_admins").select("area,user_id").eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        area_to_owners = {}
        for r in owners:
            area_to_owners.setdefault(r["area"], set()).add(r["user_id"])
        
        profiles = sb.table("users_profile").select("user_id,email").execute().data or []
        uid_to_email = {p["user_id"]: p.get("email") for p in profiles if p.get("user_id")}
        
        # Build recipient set by resolving assignees and area owners to emails
        recips = set()
        for c in open_cr:
            # Add assignee email (resolve user_id if needed)
            assignee = c.get("assignee")
            if assignee:
                if "@" in assignee:
                    recips.add(assignee)  # Already an email
                else:
                    assignee_email = uid_to_email.get(assignee)
                    if assignee_email:
                        recips.add(assignee_email)
            
            # Add area owner emails
            for uid in area_to_owners.get(c.get("area") or "", []):
                em = uid_to_email.get(uid)
                if em:
                    recips.add(em)

        if not recips:
            return {"ok": True, "sent": 0}

        # Send digest emails
        from ..email.util import mailgun_send_html, send_guard
        base = os.getenv("APP_BASE_URL", "").rstrip("/")
        
        for em in recips:
            ok, _ = send_guard(sb, ctx.org_id, project_id, "cr_owner_assignee_digest", em)
            if not ok:
                continue
                
            body = "<h3>Change Requests (open)</h3><ul>"
            
            # Find CRs owned by this recipient (assignee or area owner)
            def get_assignee_email(cr):
                assignee = cr.get("assignee")
                if not assignee:
                    return None
                if "@" in assignee:
                    return assignee
                return uid_to_email.get(assignee)
            
            def is_area_owner(cr, email):
                area = cr.get("area")
                if not area or area not in area_to_owners:
                    return False
                for uid in area_to_owners[area]:
                    if uid_to_email.get(uid) == email:
                        return True
                return False
            
            owned = [c for c in open_cr if (
                get_assignee_email(c) == em or is_area_owner(c, em)
            )]
            
            if not owned:
                body += "<li>None</li>"
            else:
                for c in owned[:50]:
                    link = f"{base}/projects/{project_id}/changes/list"
                    body += f"<li><b>{c.get('title')}</b> — {c.get('area')} • P:{c.get('priority')} • due {c.get('due_date') or 'n/a'} • {c.get('status')} • <a href='{link}'>open</a></li>"
            body += "</ul>"
            
            try:
                mailgun_send_html(em, "[TEAIM] Daily CR Digest", body)
                # Log successful send
                from ..email.util import log_send
                log_send(sb, ctx.org_id, project_id, "cr_owner_assignee_digest", em, "success", subject="[TEAIM] Daily CR Digest")
                sent += 1
            except Exception:
                pass
                
        return {"ok": True, "sent": sent}
        
    except Exception:
        return {"ok": False, "sent": sent}