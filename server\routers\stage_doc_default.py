from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/stages", tags=["stages"])
PM_PLUS = require_role({"owner","admin","pm"})

class DocBody(BaseModel):
    url: str

@router.get("/doc_default")
def get_doc_default(project_id: str = Query(...), stage_id: str = Query(...),
                    ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("stage_doc_defaults").select("url").eq("org_id", ctx.org_id)\
              .eq("project_id", project_id).eq("stage_id", stage_id).single().execute().data
        return {"url": (r or {}).get("url")}
    except Exception:
        return {"url": None}

@router.post("/doc_default")
def set_doc_default(body: DocBody, project_id: str = Query(...), stage_id: str = Query(...),
                    ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("stage_doc_defaults").upsert({
            "org_id": ctx.org_id, "project_id": project_id, "stage_id": stage_id, "url": body.url
        }, on_conflict="org_id,project_id,stage_id").execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}