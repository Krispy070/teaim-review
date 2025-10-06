from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import requests, json
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
ADMIN = require_role({"owner","admin"})

class WebhookBody(BaseModel):
    enabled: bool
    slack_url: str | None = None
    teams_url: str | None = None
    generic_url: str | None = None

@router.get("/settings")
def get_settings(ctx: TenantCtx = Depends(ADMIN)):
    sb = get_user_supabase(ctx)
    r = sb.table("org_webhooks").select("*").eq("org_id", ctx.org_id).single().execute()
    return r.data or {"org_id": ctx.org_id, "enabled": False, "slack_url": None, "teams_url": None, "generic_url": None}

@router.post("/settings")
def set_settings(body: WebhookBody, ctx: TenantCtx = Depends(ADMIN)):
    sb = get_user_supabase(ctx)
    sb.table("org_webhooks").upsert({
        "org_id": ctx.org_id,
        "enabled": body.enabled,
        "slack_url": body.slack_url,
        "teams_url": body.teams_url,
        "generic_url": body.generic_url
    }, on_conflict="org_id").execute()
    return {"ok": True}

@router.post("/test")
def test(ctx: TenantCtx = Depends(ADMIN)):
    from ..utils.events import emit_event
    emit_event(ctx.org_id, None, "webhook.test", {"msg":"Hello from TEAIM"})
    return {"ok": True}