# server/routers/router_bp.py
from fastapi import APIRouter, Query, Path, Body, HTTPException, Depends
from typing import Annotated
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

bp_router = APIRouter(tags=["business_processes"])
PM_PLUS = require_role({"owner", "admin", "pm"})

# ---------- Schemas ----------
class BpItem(BaseModel):
    id: str
    projectId: str
    areaId: str
    code: str
    name: str
    type: str
    owner: Optional[str] = None
    status: str
    createdAt: Optional[datetime] = None

class BpCreate(BaseModel):
    code: str = Field(..., max_length=80)
    name: str = Field(..., max_length=200)
    type: str = Field("task", description="task|approval|sub-process|integration")
    owner: Optional[str] = None
    status: str = Field("in_scope")

class BpChange(BaseModel):
    changeType: str = Field("modify", description="add|modify|remove")
    description: str
    driver: Optional[str] = None
    configPath: Optional[str] = None
    impactedSecurity: List[str] = []
    integrationsTouched: List[str] = []
    testCases: List[str] = []
    effectiveDate: Optional[datetime] = None

# ---------- Helpers ----------
def get_area(ctx: TenantCtx, project_uuid: str, area_key: str) -> Optional[dict]:
    sb = get_user_supabase(ctx)
    try:
        result = sb.table("areas").select("id").eq("org_id", ctx.org_id).eq("project_id", project_uuid).eq("key", area_key).single().execute()
        if result.data:
            return {"id": result.data["id"]}
    except Exception:
        pass
    return None

# ---------- Endpoints ----------
@bp_router.get("/areas/{area_key}/bps")
def list_bps(
    area_key: str = Path(..., description="Area key, e.g. HCM"),
    projectId: Optional[str] = Query(None, description="Project UUID (camelCase)"),
    project_id: Optional[str] = Query(None, description="Project UUID (snake_case)"),
    ctx: TenantCtx = Depends(member_ctx)
):
    # Accept both parameter naming conventions - try projectId first, fallback to project_id
    project_uuid = projectId if projectId else project_id
    if not project_uuid:
        raise HTTPException(422, detail="Query parameter 'projectId' or 'project_id' is required")
    
    # Validate area belongs to this tenant/project
    area = get_area(ctx, project_uuid, area_key)
    if not area:
        return {"ok": True, "items": []}
    
    sb = get_user_supabase(ctx)
    try:
        result = sb.table("business_processes").select(
            "id, project_id, area_id, code, name, type, owner, status, created_at"
        ).eq("org_id", ctx.org_id).eq("project_id", project_uuid).eq("area_id", area["id"]).order("name").execute()
        
        items = []
        for item in result.data or []:
            # Convert to camelCase for frontend
            items.append({
                "id": item["id"],
                "projectId": item["project_id"],
                "areaId": item["area_id"],
                "code": item["code"],
                "name": item["name"],
                "type": item["type"],
                "owner": item["owner"],
                "status": item["status"],
                "createdAt": item["created_at"]
            })
        return {"ok": True, "items": items}
    except Exception:
        return {"ok": True, "items": []}

@bp_router.post("/areas/{area_key}/bps")
def create_bp(
    area_key: str,
    payload: BpCreate = Body(...),
    projectId: Optional[str] = Query(None, description="Project UUID (camelCase)"),
    project_id: Optional[str] = Query(None, description="Project UUID (snake_case)"),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    # Accept both parameter naming conventions - try projectId first, fallback to project_id
    project_uuid = projectId if projectId else project_id
    if not project_uuid:
        raise HTTPException(422, detail="Query parameter 'projectId' or 'project_id' is required")
    
    # Validate area belongs to this tenant/project
    area = get_area(ctx, project_uuid, area_key)
    if not area:
        raise HTTPException(404, detail="area not found")

    sb = get_user_supabase(ctx)
    try:
        sb.table("business_processes").insert({
            "org_id": ctx.org_id,
            "project_id": project_uuid,
            "area_id": area["id"],
            "code": payload.code,
            "name": payload.name,
            "type": payload.type,
            "owner": payload.owner,
            "status": payload.status
        }).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@bp_router.get("/bps/{bp_id}/changes")
def list_bp_changes(
    bp_id: str,
    ctx: TenantCtx = Depends(member_ctx)
):
    # First verify BP belongs to this tenant
    sb = get_user_supabase(ctx)
    try:
        bp_check = sb.table("business_processes").select("id").eq("org_id", ctx.org_id).eq("id", bp_id).single().execute()
        if not bp_check.data:
            raise HTTPException(404, detail="BP not found")
    except Exception:
        raise HTTPException(404, detail="BP not found")
    
    try:
        result = sb.table("bp_changes").select(
            "id, bp_id, change_type, description, driver, config_path, impacted_security, integrations_touched, test_cases, effective_date, created_at"
        ).eq("bp_id", bp_id).order("created_at", desc=True).execute()
        
        items = []
        for item in result.data or []:
            # Convert to camelCase for frontend
            items.append({
                "id": item["id"],
                "bpId": item["bp_id"],
                "changeType": item["change_type"],
                "description": item["description"],
                "driver": item["driver"],
                "configPath": item["config_path"],
                "impactedSecurity": item["impacted_security"],
                "integrationsTouched": item["integrations_touched"],
                "testCases": item["test_cases"],
                "effectiveDate": item["effective_date"],
                "createdAt": item["created_at"]
            })
        return {"ok": True, "items": items}
    except Exception:
        return {"ok": True, "items": []}

@bp_router.post("/bps/{bp_id}/changes")
def add_bp_change(
    bp_id: str,
    payload: BpChange = Body(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    # First verify BP belongs to this tenant
    sb = get_user_supabase(ctx)
    try:
        bp_check = sb.table("business_processes").select("id").eq("org_id", ctx.org_id).eq("id", bp_id).single().execute()
        if not bp_check.data:
            raise HTTPException(404, detail="BP not found")
    except Exception:
        raise HTTPException(404, detail="BP not found")
    
    try:
        sb.table("bp_changes").insert({
            "org_id": ctx.org_id,
            "bp_id": bp_id,
            "change_type": payload.changeType,
            "description": payload.description,
            "driver": payload.driver,
            "config_path": payload.configPath,
            "impacted_security": payload.impactedSecurity,
            "integrations_touched": payload.integrationsTouched,
            "test_cases": payload.testCases,
            "effective_date": payload.effectiveDate
        }).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, detail=str(e))