"""
Bulk operations for documents/artifacts management
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/documents/bulk", tags=["documents", "bulk"])
# Alias router with /api prefix for frontend consistency
router_api = APIRouter(prefix="/api/documents/bulk", tags=["documents", "bulk", "api"])

class BulkUpdateAreaInput(BaseModel):
    artifact_ids: List[str]
    area: Optional[str] = None  # None to clear area

class BulkUpdateAreaResponse(BaseModel):
    updated_count: int
    failed_ids: List[str] = Field(default_factory=list)

def _bulk_update_area_impl(
    body: BulkUpdateAreaInput,
    project_id: str, 
    ctx: TenantCtx
) -> BulkUpdateAreaResponse:
    """
    Shared implementation for bulk update area endpoint.
    """
    if not body.artifact_ids:
        # Return success with 0 updates for empty artifact list
        return BulkUpdateAreaResponse(updated_count=0, failed_ids=[])
    
    if len(body.artifact_ids) > 100:
        raise HTTPException(400, "Cannot update more than 100 documents at once")
    
    sb = get_user_supabase(ctx)
    updated_count = 0
    failed_ids = []
    
    try:
        # Verify all artifacts belong to the project and organization
        verify_result = sb.table("artifacts").select("id")\
            .eq("org_id", ctx.org_id)\
            .eq("project_id", project_id)\
            .in_("id", body.artifact_ids)\
            .execute()
        
        verified_ids = [row["id"] for row in (verify_result.data or [])]
        failed_ids = [aid for aid in body.artifact_ids if aid not in verified_ids]
        
        if verified_ids:
            # Perform bulk update
            update_result = sb.table("artifacts")\
                .update({"area": body.area})\
                .eq("org_id", ctx.org_id)\
                .eq("project_id", project_id)\
                .in_("id", verified_ids)\
                .execute()
            
            updated_count = len(verified_ids)
        
        return BulkUpdateAreaResponse(
            updated_count=updated_count,
            failed_ids=failed_ids
        )
        
    except Exception as e:
        raise HTTPException(500, f"Failed to update document areas: {str(e)}")

@router.post("/update-area")
def bulk_update_area(
    body: BulkUpdateAreaInput,
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(member_ctx)
) -> BulkUpdateAreaResponse:
    """
    Bulk update area tags for multiple documents/artifacts.
    Requires member access to the project.
    """
    return _bulk_update_area_impl(body, project_id, ctx)

@router_api.post("/update-area")
def bulk_update_area_api(
    body: BulkUpdateAreaInput,
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(member_ctx)
) -> BulkUpdateAreaResponse:
    """
    Bulk update area tags for multiple documents/artifacts.
    Requires member access to the project.
    """
    return _bulk_update_area_impl(body, project_id, ctx)

class BulkGetAreasInput(BaseModel):
    artifact_ids: List[str]

class ArtifactAreaInfo(BaseModel):
    id: str
    title: str
    area: Optional[str]

class BulkGetAreasResponse(BaseModel):
    artifacts: List[ArtifactAreaInfo]

def _bulk_get_areas_impl(
    body: BulkGetAreasInput,
    project_id: str, 
    ctx: TenantCtx
) -> BulkGetAreasResponse:
    """
    Get current area assignments for multiple documents/artifacts.
    Useful for displaying current state before bulk updates.
    """
    if not body.artifact_ids:
        return BulkGetAreasResponse(artifacts=[])
    
    if len(body.artifact_ids) > 100:
        raise HTTPException(400, "Cannot query more than 100 documents at once")
    
    sb = get_user_supabase(ctx)
    
    try:
        result = sb.table("artifacts").select("id,title,area")\
            .eq("org_id", ctx.org_id)\
            .eq("project_id", project_id)\
            .in_("id", body.artifact_ids)\
            .order("title")\
            .execute()
        
        artifacts = [
            ArtifactAreaInfo(
                id=row["id"],
                title=row["title"],
                area=row.get("area")
            )
            for row in (result.data or [])
        ]
        
        return BulkGetAreasResponse(artifacts=artifacts)
        
    except Exception as e:
        raise HTTPException(500, f"Failed to get document areas: {str(e)}")

@router.post("/get-areas")
def bulk_get_areas(
    body: BulkGetAreasInput,
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(member_ctx)
) -> BulkGetAreasResponse:
    """
    Get current area assignments for multiple documents/artifacts.
    Useful for displaying current state before bulk updates.
    """
    return _bulk_get_areas_impl(body, project_id, ctx)

@router_api.post("/get-areas")
def bulk_get_areas_api(
    body: BulkGetAreasInput,
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(member_ctx)
) -> BulkGetAreasResponse:
    """
    Get current area assignments for multiple documents/artifacts.
    Useful for displaying current state before bulk updates.
    """
    return _bulk_get_areas_impl(body, project_id, ctx)

def _get_available_areas_impl(
    project_id: str, 
    ctx: TenantCtx
) -> List[str]:
    """
    Get list of available project areas from existing actions, risks, and decisions.
    This helps users pick from existing areas rather than creating inconsistent names.
    """
    try:
        sb = get_user_supabase(ctx)
    except Exception:
        # Fallback for development mode when JWT is not available
        import os
        if os.getenv("NODE_ENV") == "development":
            from ..supabase_client import get_supabase_client
            sb = get_supabase_client()
            print("🔧 [Bulk Documents] Using service client fallback in development mode")
        else:
            raise HTTPException(401, "User authentication required")
    areas = set()
    
    # Collect areas from actions, risks, and decisions
    for table in ["actions", "risks", "decisions"]:
        try:
            result = sb.table(table).select("area")\
                .eq("org_id", ctx.org_id)\
                .eq("project_id", project_id)\
                .not_.is_("area", "null")\
                .execute()
            
            for row in (result.data or []):
                if row.get("area"):
                    areas.add(row["area"])
        except Exception:
            continue  # Skip if table doesn't exist or fails
    
    # Also check artifacts for existing areas
    try:
        result = sb.table("artifacts").select("area")\
            .eq("org_id", ctx.org_id)\
            .eq("project_id", project_id)\
            .not_.is_("area", "null")\
            .execute()
        
        for row in (result.data or []):
            if row.get("area"):
                areas.add(row["area"])
    except Exception:
        pass
    
    return sorted(list(areas))

@router.get("/available-areas")
def get_available_areas(
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(member_ctx)
) -> List[str]:
    """
    Get list of available project areas from existing actions, risks, and decisions.
    This helps users pick from existing areas rather than creating inconsistent names.
    """
    return _get_available_areas_impl(project_id, ctx)

@router_api.get("/available-areas")
def get_available_areas_api(
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(member_ctx)
) -> List[str]:
    """
    Get list of available project areas from existing actions, risks, and decisions.
    This helps users pick from existing areas rather than creating inconsistent names.
    """
    return _get_available_areas_impl(project_id, ctx)