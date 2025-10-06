from fastapi import APIRouter, Depends, Query, Header
from pydantic import BaseModel
import os, json
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/areas", tags=["areas"])

class InMsg(BaseModel):
  project_id: str
  area: str | None = None
  channel: str | None = None   # e.g., "hcm", "payroll"
  actor: str | None = None     # email or any string
  text: str

@router.post("/webhook_incoming")
def webhook_incoming(body: InMsg, token: str | None = Header(default=None)):
  EXPECT = os.getenv("INCOMING_WEBHOOK_TOKEN", "")
  if EXPECT and token != EXPECT: 
    return {"ok": False, "reason": "unauthorized"}

  sbs = get_supabase_client()
  # channel -> area map (JSON env: {"hcm":"HCM","payroll":"Payroll"})
  try:
    amap = json.loads(os.getenv("INCOMING_AREA_MAP","{}") or "{}")
  except Exception:
    amap = {}
  area = body.area or amap.get((body.channel or "").lower()) or "General"

  # enrich actor: if email matches users_profile
  actor = body.actor or "webhook"
  try:
    if body.actor and "@" in body.actor:
      pr = sbs.table("users_profile").select("user_id,email").eq("email", body.actor).limit(1).execute().data or []
      if pr and pr[0].get("user_id"):
        actor = f"{body.actor} (User: {pr[0]['user_id']})"
  except Exception:
    pass  # fallback to original actor
  
  # Dev-safe return (no DB writes)
  return {
    "ok": True, 
    "area": area, 
    "actor": actor, 
    "text": body.text[:200] + ("..." if len(body.text) > 200 else ""),
    "message": f"Webhook received for area '{area}' from '{actor}' (dev mode)"
  }