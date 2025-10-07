from fastapi import APIRouter, Body
from server.supabase_client import get_supabase_client
from server.email_send import mg_send

sb = get_supabase_client()
router = APIRouter()

def resolve_template(org_id: str, project_id: str, key: str):
    """Resolve email template with hierarchy: project > org > global"""
    # Try project-specific template first
    proj = sb.table("email_templates").select("*") \
            .eq("org_id", org_id).eq("project_id", project_id).eq("key", key) \
            .eq("is_active", True).limit(1).execute().data
    if proj:
        return proj[0]
    
    # Try org-level template
    org = sb.table("email_templates").select("*") \
          .eq("org_id", org_id).is_("project_id", None).eq("key", key) \
          .eq("is_active", True).limit(1).execute().data
    if org:
        return org[0]
    
    # Fall back to global template
    glob = sb.table("email_templates").select("*") \
           .is_("org_id", None).is_("project_id", None).eq("key", key) \
           .eq("is_active", True).limit(1).execute().data
    return glob[0] if glob else None

@router.post("/admin/emails/send")
def admin_send(org_id: str = Body(...), project_id: str = Body(...),
               template_key: str = Body(...), to_emails: list[str] = Body(...),
               variables: dict | None = Body(None)):
    """Send email to multiple recipients using specified template"""
    
    # Resolve template using hierarchy
    tpl = resolve_template(org_id, project_id, template_key)
    if not tpl:
        return {"ok": False, "error": "template not found"}
    
    def render_variables(text: str):
        """Simple variable substitution - {{variable_name}}"""
        if not variables:
            return text
        result = text
        for key, value in variables.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result
    
    # Render subject and body with variables
    subject = render_variables(tpl["subject"])
    body = render_variables(tpl["body"])
    
    sent = []
    failed = []
    
    # Send to each recipient and log results
    for email in to_emails:
        try:
            result = mg_send(email, subject, body)  # raises on failure
            
            # Log successful send
            sb.table("email_log").insert({
                "org_id": org_id,
                "project_id": project_id, 
                "template_key": template_key,
                "to_email": email,
                "subject": subject,
                "status": "sent",
                "provider_id": result.get("id")
            }).execute()
            
            sent.append(email)
            
        except Exception as e:
            # Log failed send
            sb.table("email_log").insert({
                "org_id": org_id,
                "project_id": project_id,
                "template_key": template_key, 
                "to_email": email,
                "subject": subject,
                "status": "failed",
                "error": str(e)
            }).execute()
            
            failed.append(email)
    
    return {"ok": True, "sent": sent, "failed": failed}

@router.get("/admin/emails/log")
def email_log(org_id: str, project_id: str, limit: int = 50):
    """Get email send log for audit trail"""
    rows = sb.table("email_log").select("*") \
           .eq("org_id", org_id).eq("project_id", project_id) \
           .order("created_at", desc=True).limit(limit).execute().data or []
    return {"items": rows}

@router.get("/admin/emails/templates")
def list_templates(org_id: str, project_id: str):
    """List available email templates with hierarchy resolution"""
    # Get project-specific overrides
    proj = sb.table("email_templates").select("*") \
           .eq("org_id", org_id).eq("project_id", project_id) \
           .eq("is_active", True).execute().data or []
    
    # Get org-level templates
    org = sb.table("email_templates").select("*") \
          .eq("org_id", org_id).is_("project_id", None) \
          .eq("is_active", True).execute().data or []
    
    # Get global templates  
    glob = sb.table("email_templates").select("*") \
           .is_("org_id", None).is_("project_id", None) \
           .eq("is_active", True).execute().data or []
    
    # Resolve by key (project > org > global)
    best = {}
    for rowset in [glob, org, proj]:
        for template in rowset:
            best[template["key"]] = template
    
    return {"items": list(best.values())}