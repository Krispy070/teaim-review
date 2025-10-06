from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/stages", tags=["stages"])
PM_PLUS = require_role({"owner","admin","pm"})

class StageUpdate(BaseModel):
    title: Optional[str] = None
    area: Optional[str] = None
    start_date: Optional[str] = None  # ISO date
    end_date: Optional[str] = None

@router.get("/list")
def list_stages(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        out = sb.table("project_stages").select("id,title,area,start_date,end_date,status,created_at")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).order("created_at", desc=False).execute().data or []
    except Exception:
        # Graceful fallback for missing database tables in development
        out = []
    return {"items": out}

@router.post("/update")
def update_stage(stage_id: str, body: StageUpdate, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    patch = {k:v for k,v in body.dict().items() if v is not None}
    if not patch: return {"ok": True}
    sb.table("project_stages").update(patch)\
      .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", stage_id).execute()
    return {"ok": True}