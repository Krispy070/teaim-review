from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any
from datetime import datetime, timedelta
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/stages", tags=["stages"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

class ShiftStagesBody(BaseModel):
    area: str
    weeks: int  # Can be positive or negative

def shift_date(date_str: str, days: int) -> str:
    """Shift a date by the given number of days"""
    try:
        date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        shifted_date = date_obj + timedelta(days=days)
        return shifted_date.isoformat()
    except (ValueError, TypeError):
        return date_str  # Return original if parsing fails

@router.post("/shift_area_weeks")
def shift_area_weeks(body: ShiftStagesBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    """Shift all stages in an area by the specified number of weeks"""
    sb = get_user_supabase(ctx)
    
    days = body.weeks * 7
    if not days:
        return {"ok": True, "message": "No shift applied", "updated": 0}
    
    try:
        # Get all stages for the area
        stages = sb.table("project_stages").select("id,title,start_date,end_date")\
                   .eq("org_id", ctx.org_id)\
                   .eq("project_id", project_id)\
                   .eq("area", body.area)\
                   .execute().data or []
        
        updated_count = 0
        for stage in stages:
            patch: Dict[str, Any] = {}
            
            # Shift start_date if present
            if stage.get("start_date"):
                patch["start_date"] = shift_date(stage["start_date"], days)
            
            # Shift end_date if present  
            if stage.get("end_date"):
                patch["end_date"] = shift_date(stage["end_date"], days)
            
            # Update the stage if there are changes
            if patch:
                sb.table("project_stages").update(patch)\
                  .eq("id", stage["id"]).execute()
                updated_count += 1
        
        direction = f"+{body.weeks}" if body.weeks > 0 else str(body.weeks)
        message = f"{body.area}: shifted start/end dates by {direction} week(s)"
        
        return {
            "ok": True, 
            "message": message,
            "updated": updated_count,
            "area": body.area,
            "weeks": body.weeks
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to shift stages: {str(e)}")