from fastapi import APIRouter, Body, Query, Depends
from server.supabase_client import get_supabase_client
from .guards import ANY_MEMBER, PM_PLUS
from .tenant import TenantCtx

sb = get_supabase_client()

router = APIRouter()

STEP_KEYS = ["metrics", "team", "logistics", "training", "integrations", "testing", "ocm", "data", "financials"]

@router.get("/team/contacts")
def list_contacts(project_id: str = Query(...), ctx: TenantCtx = Depends(ANY_MEMBER)):
    """List all active contacts for a project"""
    rows = sb.table("project_contacts").select("*") \
            .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("is_active", True) \
            .order("created_at").execute().data or []
    return {"contacts": rows}

@router.post("/team/contacts/upsert")
def upsert_contact(project_id: str = Query(...), name: str = Body(...), email: str = Body(...),
                   role: str = Body(""), workstream: str = Body(""), ctx: TenantCtx = Depends(PM_PLUS)):
    """Add or update a project contact"""
    # Simple upsert by (org_id, project_id, email)
    existing = sb.table("project_contacts").select("id") \
                .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("email", email) \
                .limit(1).execute().data
    
    if existing:
        # Update existing contact
        sb.table("project_contacts").update({
            "name": name, "role": role, "workstream": workstream, "is_active": True
        }).eq("id", existing[0]["id"]).execute()
        return {"ok": True, "id": existing[0]["id"], "mode": "update"}
    else:
        # Insert new contact
        ins = sb.table("project_contacts").insert({
            "org_id": ctx.org_id, "project_id": project_id, "name": name, 
            "email": email, "role": role, "workstream": workstream
        }).execute().data[0]
        return {"ok": True, "id": ins["id"], "mode": "insert"}

@router.get("/team/subscriptions")
def get_subscriptions(project_id: str = Query(...), ctx: TenantCtx = Depends(ANY_MEMBER)):
    """Get contact subscription matrix for onboarding steps"""
    contacts = sb.table("project_contacts").select("id,name,email,role,workstream") \
               .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("is_active", True) \
               .execute().data or []
    
    subs = sb.table("onboarding_subscriptions").select("contact_id,step_key,is_enabled") \
           .eq("org_id", ctx.org_id).eq("project_id", project_id) \
           .execute().data or []
    
    return {"contacts": contacts, "subs": subs, "steps": STEP_KEYS}

@router.post("/team/subscriptions/set")
def set_subscriptions(project_id: str = Query(...), items: list[dict] = Body(...), 
                      ctx: TenantCtx = Depends(PM_PLUS)):
    """Set subscription matrix - items: [{contact_id, step_key, is_enabled}]"""
    count = 0
    for item in items:
        cid = item["contact_id"]
        step = item["step_key"] 
        enabled = bool(item.get("is_enabled"))
        
        if enabled:
            # Insert subscription (will be unique by constraint)
            try:
                sb.table("onboarding_subscriptions").insert({
                    "org_id": ctx.org_id, "project_id": project_id, 
                    "contact_id": cid, "step_key": step, "is_enabled": True
                }).execute()
            except:
                # Subscription already exists - update it
                sb.table("onboarding_subscriptions").update({"is_enabled": True}) \
                  .eq("org_id", ctx.org_id).eq("project_id", project_id) \
                  .eq("contact_id", cid).eq("step_key", step).execute()
        else:
            # Remove subscription
            sb.table("onboarding_subscriptions").delete() \
              .eq("org_id", ctx.org_id).eq("project_id", project_id) \
              .eq("contact_id", cid).eq("step_key", step).execute()
        count += 1
    
    return {"ok": True, "count": count}