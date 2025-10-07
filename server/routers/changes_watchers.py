from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/changes", tags=["changes"])

@router.get("/watchers")
def watchers(id: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("changes").select("watchers").eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", id).single().execute().data or {}
        return {"items": r.get("watchers") or []}
    except Exception:
        return {"items": []}

class WatchBody(BaseModel):
    id: str
    watchers: List[str]

PM_PLUS = require_role({"owner","admin","pm"})

@router.post("/watchers/set")
def watchers_set(body: WatchBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("changes").update({"watchers": body.watchers}).eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", body.id).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}