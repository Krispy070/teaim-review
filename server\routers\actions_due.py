from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from datetime import date
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase
from ..visibility_guard import get_visibility_context

router = APIRouter(prefix="/actions", tags=["actions"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

class DueBody(BaseModel):
    due_date: date | None

@router.post("/set-due")
def set_due(action_id: str, body: DueBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    
    # Get action to check its area for visibility enforcement
    action_result = sb.table("actions").select("area")\
        .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", action_id)\
        .limit(1).execute()
    
    if not action_result.data:
        raise HTTPException(404, "Action not found")
    
    action_area = action_result.data[0].get("area")
    
    # Check if user has visibility access to this action's area
    visibility_ctx = get_visibility_context(ctx, project_id)
    if not visibility_ctx.can_view_all:
        # User has limited visibility - check if they can access this action's area
        if action_area and action_area not in visibility_ctx.visibility_areas:
            raise HTTPException(404, "Action not found")
    
    sb.table("actions").update({"due_date": body.due_date})\
      .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", action_id).execute()
    return {"ok": True}