from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/actions", tags=["actions"])
PM_PLUS = require_role({"owner","admin","pm"})

@router.post("/update_small")
def update_small(id: str = Query(...), project_id: str = Query(...),
                 owner: str | None = None, status: str | None = None, title: str | None = None,
                 ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    patch = {}
    if owner is not None: patch["owner"] = owner
    if status is not None: patch["status"] = status
    if title is not None: patch["title"] = title
    try:
        if not patch: return {"ok": True}
        sb.table("actions").update(patch).eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", id).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}