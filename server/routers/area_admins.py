from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/areas", tags=["areas"])

class AdminBody(BaseModel):
    area: str
    user_id: str  # or email

@router.get("/admins")
def list_admins(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        rows = sb.table("area_admins").select("area,user_id")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).limit(2000).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}

PM_PLUS = require_role({"owner","admin","pm"})

@router.post("/admins/add")
def add_admin(body: AdminBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("area_admins").upsert({
            "org_id": ctx.org_id, "project_id": project_id,
            "area": body.area, "user_id": body.user_id
        }, on_conflict="org_id,project_id,area,user_id").execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.post("/admins/remove")
def remove_admin(area: str = Query(...), user_id: str = Query(...),
                 project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("area_admins").delete().eq("org_id", ctx.org_id).eq("project_id", project_id)\
          .eq("area", area).eq("user_id", user_id).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}