from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import logging

from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
from ..visibility_guard import get_visibility_context, apply_area_visibility_filter

router = APIRouter(prefix="/visibility", tags=["visibility-guard"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

log = logging.getLogger("visibility_guard")

class RiskUpsertBody(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = None
    impact: Optional[str] = None
    probability: Optional[str] = None
    area: Optional[str] = None
    owner: Optional[str] = None
    status: str = "open"
    mitigation: Optional[str] = None

class DecisionUpsertBody(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = None
    context: Optional[str] = None
    area: Optional[str] = None
    owner: Optional[str] = None
    status: str = "pending"
    decision: Optional[str] = None
    rationale: Optional[str] = None

def _emit_mutation_event(org_id: str, project_id: str, operation: str, table: str, record_id: str, area: Optional[str]):
    """Emit webhook event for Risk/Decision mutations"""
    try:
        from ..utils.events import emit_event
        emit_event(
            org_id=org_id,
            project_id=project_id,
            kind=f"{table}.{operation}",
            details={
                "table": table,
                "operation": operation,
                "record_id": record_id,
                "area": area,
                "enforced_visibility": True
            }
        )
    except Exception as e:
        log.warning(f"Failed to emit mutation event: {e}")

@router.post("/risks/upsert")
def upsert_risk(body: RiskUpsertBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    """Create or update a risk with visibility guard enforcement"""
    
    sb = get_user_supabase(ctx)
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    # Check if user can access the area for this risk
    if body.area and not _can_access_area(visibility_ctx, body.area):
        raise HTTPException(403, f"Access denied to area: {body.area}")
    
    try:
        # Prepare risk data
        risk_data = {
            "org_id": ctx.org_id,
            "project_id": project_id,
            "title": body.title,
            "description": body.description,
            "impact": body.impact,
            "probability": body.probability,
            "area": body.area,
            "owner": body.owner,
            "status": body.status,
            "mitigation": body.mitigation,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        if body.id:
            # Update existing risk - check access first
            existing = sb.table("risks").select("id,area").eq("id", body.id)\
                        .eq("project_id", project_id).single().execute()
            
            if not existing.data:
                raise HTTPException(404, "Risk not found")
            
            # Check access to existing area
            existing_area = existing.data.get("area")
            if existing_area and not _can_access_area(visibility_ctx, existing_area):
                raise HTTPException(403, f"Access denied to existing risk area: {existing_area}")
            
            # Update the risk
            result = sb.table("risks").update(risk_data).eq("id", body.id).execute()
            operation = "updated"
            risk_id = body.id
        else:
            # Create new risk
            result = sb.table("risks").insert(risk_data).execute()
            operation = "created"
            risk_id = result.data[0]["id"] if result.data else None
        
        if not result.data:
            raise HTTPException(500, "Failed to save risk")
        
        # Emit webhook event
        _emit_mutation_event(ctx.org_id, project_id, operation, "risks", risk_id or "", body.area)
        
        log.info(f"Risk {operation}: {risk_id} in area {body.area} by user {ctx.user_id}")
        
        return {
            "ok": True,
            "risk": result.data[0],
            "operation": operation,
            "visibility_enforced": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to upsert risk: {e}")
        raise HTTPException(500, f"Failed to save risk: {str(e)}")

@router.post("/decisions/upsert")
def upsert_decision(body: DecisionUpsertBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    """Create or update a decision with visibility guard enforcement"""
    
    sb = get_user_supabase(ctx)
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    # Check if user can access the area for this decision
    if body.area and not _can_access_area(visibility_ctx, body.area):
        raise HTTPException(403, f"Access denied to area: {body.area}")
    
    try:
        # Prepare decision data
        decision_data = {
            "org_id": ctx.org_id,
            "project_id": project_id,
            "title": body.title,
            "description": body.description,
            "context": body.context,
            "area": body.area,
            "owner": body.owner,
            "status": body.status,
            "decision": body.decision,
            "rationale": body.rationale,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        if body.id:
            # Update existing decision - check access first
            existing = sb.table("decisions").select("id,area").eq("id", body.id)\
                        .eq("project_id", project_id).single().execute()
            
            if not existing.data:
                raise HTTPException(404, "Decision not found")
            
            # Check access to existing area
            existing_area = existing.data.get("area")
            if existing_area and not _can_access_area(visibility_ctx, existing_area):
                raise HTTPException(403, f"Access denied to existing decision area: {existing_area}")
            
            # Update the decision
            result = sb.table("decisions").update(decision_data).eq("id", body.id).execute()
            operation = "updated"
            decision_id = body.id
        else:
            # Create new decision
            result = sb.table("decisions").insert(decision_data).execute()
            operation = "created"
            decision_id = result.data[0]["id"] if result.data else None
        
        if not result.data:
            raise HTTPException(500, "Failed to save decision")
        
        # Emit webhook event
        _emit_mutation_event(ctx.org_id, project_id, operation, "decisions", decision_id or "", body.area)
        
        log.info(f"Decision {operation}: {decision_id} in area {body.area} by user {ctx.user_id}")
        
        return {
            "ok": True,
            "decision": result.data[0],
            "operation": operation,
            "visibility_enforced": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to upsert decision: {e}")
        raise HTTPException(500, f"Failed to save decision: {str(e)}")

@router.delete("/risks/{risk_id}")
def delete_risk(risk_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    """Delete a risk with visibility guard enforcement"""
    
    sb = get_user_supabase(ctx)
    
    # Get user's visibility context
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    try:
        # Check access to risk before deletion
        existing = sb.table("risks").select("id,area,title").eq("id", risk_id)\
                    .eq("project_id", project_id).single().execute()
        
        if not existing.data:
            raise HTTPException(404, "Risk not found")
        
        risk_area = existing.data.get("area")
        if risk_area and not _can_access_area(visibility_ctx, risk_area):
            raise HTTPException(403, f"Access denied to risk area: {risk_area}")
        
        # Delete the risk
        result = sb.table("risks").delete().eq("id", risk_id).execute()
        
        # Emit webhook event
        _emit_mutation_event(ctx.org_id, project_id, "deleted", "risks", risk_id, risk_area)
        
        log.info(f"Risk deleted: {risk_id} from area {risk_area} by user {ctx.user_id}")
        
        return {
            "ok": True,
            "deleted_risk_id": risk_id,
            "visibility_enforced": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to delete risk: {e}")
        raise HTTPException(500, f"Failed to delete risk: {str(e)}")

@router.delete("/decisions/{decision_id}")
def delete_decision(decision_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    """Delete a decision with visibility guard enforcement"""
    
    sb = get_user_supabase(ctx)
    
    # Get user's visibility context
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    try:
        # Check access to decision before deletion
        existing = sb.table("decisions").select("id,area,title").eq("id", decision_id)\
                    .eq("project_id", project_id).single().execute()
        
        if not existing.data:
            raise HTTPException(404, "Decision not found")
        
        decision_area = existing.data.get("area")
        if decision_area and not _can_access_area(visibility_ctx, decision_area):
            raise HTTPException(403, f"Access denied to decision area: {decision_area}")
        
        # Delete the decision
        result = sb.table("decisions").delete().eq("id", decision_id).execute()
        
        # Emit webhook event
        _emit_mutation_event(ctx.org_id, project_id, "deleted", "decisions", decision_id, decision_area)
        
        log.info(f"Decision deleted: {decision_id} from area {decision_area} by user {ctx.user_id}")
        
        return {
            "ok": True,
            "deleted_decision_id": decision_id,
            "visibility_enforced": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to delete decision: {e}")
        raise HTTPException(500, f"Failed to delete decision: {str(e)}")

@router.get("/test")
def test_visibility_access(project_id: str = Query(...), area: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Test if current user can access a specific area"""
    
    visibility_ctx = get_visibility_context(ctx, project_id)
    can_access = _can_access_area(visibility_ctx, area)
    
    return {
        "user_id": ctx.user_id,
        "project_id": project_id,
        "area": area,
        "can_access": can_access,
        "user_areas": visibility_ctx.visibility_areas if visibility_ctx else [],
        "visibility_enforced": True
    }

def _can_access_area(visibility_ctx, area: str) -> bool:
    """Check if user can access a specific area based on visibility context"""
    
    if not visibility_ctx:
        return True  # No visibility restrictions
    
    # If user can view all areas, allow access
    if visibility_ctx.can_view_all:
        return True
    
    # Check if user's areas include the target area
    return area in visibility_ctx.visibility_areas