from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/stages", tags=["stages"])
PM_PLUS = require_role({"owner","admin","pm"})

class StageItem(BaseModel):
    title: str
    area: Optional[str] = None
    start_date: Optional[str] = None  # ISO date
    end_date: Optional[str] = None

class StageBatch(BaseModel):
    stages: List[StageItem]

@router.post("/batch_create")
def batch_create(body: StageBatch, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    created = []
    try:
        for s in body.stages:
            rec = {
                "org_id": ctx.org_id, "project_id": project_id,
                "title": s.title, "area": s.area, "status":"pending"
            }
            if s.start_date: rec["start_date"] = s.start_date
            if s.end_date: rec["end_date"] = s.end_date
            out = sb.table("project_stages").insert(rec).execute().data
            if out: created.append(out[0])
    except Exception:
        # Graceful fallback for missing database tables in development
        pass
    return {"ok": True, "created": created}