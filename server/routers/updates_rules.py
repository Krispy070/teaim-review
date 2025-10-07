from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/updates", tags=["updates"])
ADMIN = require_role({"owner","admin"})

class RulesBody(BaseModel):
    auto_apply_updates: bool
    auto_apply_min_conf: float

@router.get("/rules")
def get_rules(ctx: TenantCtx = Depends(ADMIN)):
    sb = get_user_supabase(ctx)
    s = sb.table("org_comms_settings").select("auto_apply_updates,auto_apply_min_conf")\
        .eq("org_id", ctx.org_id).single().execute().data or {}
    return s

@router.post("/rules")
def set_rules(body: RulesBody, ctx: TenantCtx = Depends(ADMIN)):
    sb = get_user_supabase(ctx)
    sb.table("org_comms_settings").upsert({
        "org_id": ctx.org_id,
        "auto_apply_updates": body.auto_apply_updates,
        "auto_apply_min_conf": body.auto_apply_min_conf,
    }, on_conflict="org_id").execute()
    return {"ok": True}