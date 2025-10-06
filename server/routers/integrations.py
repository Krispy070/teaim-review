from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/integrations", tags=["integrations"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

class IntegrationUpsert(BaseModel):
    id: str | None = None
    name: str
    transport: str | None = None
    schedule: str | None = None
    status: str = "not_started"
    owner_email: str | None = None
    notes: str | None = None

@router.get("/list")
def list_integrations(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    r = sb.table("project_integrations").select("*")\
        .eq("org_id", ctx.org_id).eq("project_id", project_id).order("created_at", desc=False).execute()
    return {"items": r.data or []}

@router.post("/upsert")
def upsert_integration(body: IntegrationUpsert, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    rec = {
      "org_id": ctx.org_id, "project_id": project_id,
      "name": body.name, "transport": body.transport, "schedule": body.schedule,
      "status": body.status, "owner_email": body.owner_email, "notes": body.notes
    }
    if body.id:
        # Security: Ensure updates are scoped to the correct org and project
        sb.table("project_integrations").update(rec)\
            .eq("id", body.id)\
            .eq("org_id", ctx.org_id)\
            .eq("project_id", project_id)\
            .execute()
        return {"ok": True, "id": body.id}
    try:
        out = sb.table("project_integrations").insert(rec).execute()
        return {"ok": True, "id": out.data[0]["id"]}
    except Exception as e:
        # Handle duplicate name constraint violation
        if "unique_project_integration_name" in str(e) or "duplicate key" in str(e).lower():
            raise HTTPException(409, f"Integration '{body.name}' already exists in this project")
        raise e

@router.post("/check-now")
def check_now_integrations(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Manually trigger integration status checks for all integrations in a project"""
    sb = get_user_supabase(ctx)
    try:
        # Get all integrations for the project
        integrations = sb.table("project_integrations").select("id,name,status")\
                        .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        
        now = datetime.now(timezone.utc).isoformat()
        checked_count = 0
        
        for integration in integrations:
            # For now, just update last_checked. In future this could do actual connectivity checks
            # and update status based on actual health checks
            sb.table("project_integrations").update({
                "last_checked": now,
                # Simulate status updates - in real implementation this would be based on actual checks
                "status": integration.get("status", "not_started")
            }).eq("id", integration["id"]).execute()
            checked_count += 1
        
        return {"ok": True, "checked_count": checked_count, "checked_at": now}
    except Exception as e:
        raise HTTPException(500, f"Failed to check integrations: {str(e)}")

@router.get("/status")
def get_integration_status(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Get integration status with last checked timestamps"""
    sb = get_user_supabase(ctx)
    try:
        integrations = sb.table("project_integrations").select("id,name,status,last_checked,transport,owner_email")\
                        .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                        .order("created_at", desc=False).execute().data or []
        
        return {"items": integrations}
    except Exception as e:
        return {"items": []}