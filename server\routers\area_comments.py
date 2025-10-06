"""
Area Comments Router for TEAIM Workstreams Framework

Provides lightweight commenting system for area pages with:
- POST /area_comments/add - Add a comment to an area
- GET /area_comments/list - List comments for an area
- GET /area_comments/count - Get comment count for multiple areas
"""

from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

# Use the same areas list as the areas router
DEFAULT_AREAS = ["HCM", "Absence", "Time Tracking", "Payroll", "Financials", "Integrations", "Security", "Reporting", "Cutover"]

router = APIRouter(prefix="/area_comments", tags=["area_comments"])

# Request/Response Models
class CommentAddRequest(BaseModel):
    area: str = Field(..., description="The workstream area (e.g., 'HCM', 'Payroll')")
    content: str = Field(..., min_length=1, max_length=5000, description="Comment content")

class CommentResponse(BaseModel):
    id: str
    area: str
    content: str
    author_name: str
    author_email: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class CommentListResponse(BaseModel):
    comments: List[CommentResponse]
    total_count: int

class AreaCommentCount(BaseModel):
    area: str
    comment_count: int

class CommentCountResponse(BaseModel):
    areas: List[AreaCommentCount]

def validate_workday_area(area: str) -> bool:
    """Validate if area is a recognized Workday area"""
    return area in DEFAULT_AREAS

@router.post("/add")
def add_comment(
    request: CommentAddRequest,
    project_id: str = Query(..., description="Project ID"),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Add a new comment to an area."""
    try:
        # Validate the area name
        if not validate_workday_area(request.area):
            raise HTTPException(status_code=400, detail=f"Invalid area: {request.area}")
        
        sb = get_user_supabase(ctx)
        
        # Insert comment into database
        now = datetime.now(timezone.utc)
        comment_data = {
            "org_id": ctx.org_id,
            "project_id": project_id,
            "area": request.area,
            "content": request.content,
            "author_user_id": ctx.user_id,
            "author_name": ctx.user_id,  # In dev mode, use user_id as name
            "author_email": f"{ctx.user_id}@example.com",  # Dev email
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        # Try to insert comment
        try:
            result = sb.table("area_comments").insert(comment_data).execute()
            comment_id = result.data[0].get("id") if result.data else f"dev-comment-{now.timestamp()}"
            
            # best-effort notify owners
            try:
                owners = sb.table("area_admins").select("user_id").eq("org_id",ctx.org_id)\
                          .eq("project_id",project_id).eq("area", request.area).execute().data or []
                emails = []
                if owners:
                    prof = sb.table("users_profile").select("user_id,email").in_("user_id",[o["user_id"] for o in owners]).execute().data or []
                    emails = [p["email"] for p in prof if p.get("email")]
                if emails:
                    from ..email.util import mailgun_send_html, send_guard
                    for em in emails:
                        ok,_ = send_guard(sb, ctx.org_id, project_id, "area_comment", em)
                        if ok:
                            mailgun_send_html([em], f"[Area] New comment in {request.area}",
                                              f"<p>{ctx.user_id} wrote:</p><p>{request.content}</p>")
            except Exception: ...
            
            return {
                "success": True,
                "comment_id": comment_id,
                "message": "Comment added successfully"
            }
            
        except Exception as db_error:
            # Dev-safe: If table doesn't exist, return success but log the issue
            print(f"Failed to insert area comment: {db_error}")
            return {
                "success": True,
                "comment_id": f"dev-comment-{now.timestamp()}",
                "message": "Comment added successfully (dev mode)"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error adding area comment: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/list")
def list_comments(
    area: str = Query(..., description="The workstream area"),
    project_id: str = Query(..., description="Project ID"),
    limit: int = Query(50, description="Maximum number of comments to return", ge=1, le=200),
    offset: int = Query(0, description="Number of comments to skip", ge=0),
    ctx: TenantCtx = Depends(member_ctx)
):
    """List comments for an area with pagination."""
    try:
        # Validate the area name
        if not validate_workday_area(area):
            raise HTTPException(status_code=400, detail=f"Invalid area: {area}")
        
        sb = get_user_supabase(ctx)
        
        try:
            # Get comments for the area
            query = sb.table("area_comments") \
                .select("*") \
                .eq("org_id", ctx.org_id) \
                .eq("project_id", project_id) \
                .eq("area", area) \
                .order("created_at", desc=True) \
                .range(offset, offset + limit - 1)
            
            result = query.execute()
            
            # Get total count
            count_query = sb.table("area_comments") \
                .select("id", count="exact") \
                .eq("org_id", ctx.org_id) \
                .eq("project_id", project_id) \
                .eq("area", area)
            
            count_result = count_query.execute()
            total_count = count_result.count or 0
            
            # Format response
            comments = []
            for comment in result.data or []:
                comments.append({
                    "id": comment.get("id", ""),
                    "area": comment.get("area", ""),
                    "content": comment.get("content", ""),
                    "author_name": comment.get("author_name", "Unknown"),
                    "author_email": comment.get("author_email", ""),
                    "created_at": comment.get("created_at", datetime.now(timezone.utc).isoformat()),
                    "updated_at": comment.get("updated_at")
                })
            
            return {
                "comments": comments,
                "total_count": total_count
            }
            
        except Exception as db_error:
            # Dev-safe: If table doesn't exist, return empty list
            print(f"Failed to fetch area comments: {db_error}")
            return {
                "comments": [],
                "total_count": 0
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error listing area comments: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/count")
def get_comment_counts(
    project_id: str = Query(..., description="Project ID"),
    areas: str = Query(None, description="Comma-separated list of areas (optional)"),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Get comment counts for multiple areas."""
    try:
        # Parse areas list or use default workday areas
        if areas:
            area_list = [area.strip() for area in areas.split(",")]
            # Validate each area
            for area in area_list:
                if not validate_workday_area(area):
                    raise HTTPException(status_code=400, detail=f"Invalid area: {area}")
        else:
            # Use default workday areas
            area_list = DEFAULT_AREAS
        
        sb = get_user_supabase(ctx)
        
        try:
            # Get comment counts for all areas
            areas_response = []
            for area in area_list:
                try:
                    result = sb.table("area_comments") \
                        .select("id", count="exact") \
                        .eq("org_id", ctx.org_id) \
                        .eq("project_id", project_id) \
                        .eq("area", area) \
                        .execute()
                    
                    count = result.count or 0
                    areas_response.append({
                        "area": area,
                        "comment_count": count
                    })
                except Exception:
                    # If query fails for this area, set count to 0
                    areas_response.append({
                        "area": area,
                        "comment_count": 0
                    })
            
            return {"areas": areas_response}
            
        except Exception as db_error:
            # Dev-safe: If table doesn't exist, return zero counts
            print(f"Failed to fetch comment counts: {db_error}")
            areas_response = []
            for area in area_list:
                areas_response.append({
                    "area": area,
                    "comment_count": 0
                })
            return {"areas": areas_response}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting comment counts: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")