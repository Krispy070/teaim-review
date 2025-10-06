from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/user_prefs", tags=["user_prefs"])

class PrefBody(BaseModel):
    key: str
    val: str
    scope: str | None = None  # optional (area, route, etc.)

@router.get("/get")
def get_pref(key: str = Query(...), project_id: str | None = None,
             scope: str | None = None, ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("user_prefs").select("val").eq("user_id", ctx.user_id).eq("key", key)
        if project_id: q = q.eq("project_id", project_id)
        if scope: q = q.eq("scope", scope)
        r = q.single().execute().data or {}
        return {"val": r.get("val")}
    except Exception:
        return {"val": None}

@router.post("/set")
def set_pref(body: PrefBody, project_id: str | None = None, ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("user_prefs").upsert({
            "user_id": ctx.user_id, "project_id": project_id, "key": body.key,
            "scope": body.scope, "val": body.val
        }, on_conflict="user_id,project_id,key,scope").execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}