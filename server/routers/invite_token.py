from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import secrets, os
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase, get_supabase_client as get_service_supabase

router = APIRouter(prefix="/invite", tags=["invite"])
ADMIN = require_role({"owner","admin"})

class InviteTokenBody(BaseModel):
  email: str
  role: str
  can_view_all: bool = True
  visibility_areas: list[str] = []
  can_sign_all: bool = False
  sign_areas: list[str] = []
  expires_hours: int = 72

@router.post("/create_token")
def create_token(body: InviteTokenBody, project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN)):
  sbs = get_service_supabase()
  token = secrets.token_urlsafe(32)
  exp = datetime.now(timezone.utc) + timedelta(hours=int(body.expires_hours))
  sbs.table("pending_invites").insert({
    "org_id": ctx.org_id, "project_id": project_id, "email": body.email, "role": body.role,
    "can_view_all": body.can_view_all, "visibility_areas": body.visibility_areas,
    "can_sign_all": body.can_sign_all, "sign_areas": body.sign_areas,
    "token": token, "expires_at": exp.isoformat()
  }).execute()
  link = f"{os.getenv('APP_BASE_URL','').rstrip('/')}/invite/accept/{token}"
  return {"ok": True, "link": link}

@router.get("/accept/{token}")
def accept_token(token: str):
  sbs = get_service_supabase()
  row = sbs.table("pending_invites").select("*").eq("token", token).limit(1).execute().data
  if not row: raise HTTPException(404, "Invalid token")
  r = row[0]
  if r.get("used_at"): raise HTTPException(400, "Token used")
  if datetime.now(timezone.utc) > datetime.fromisoformat(r["expires_at"]):
    raise HTTPException(400, "Token expired")
  # seed membership
  sbs.table("project_members").upsert({
    "org_id": r["org_id"], "project_id": r["project_id"], "user_id": r["email"], "role": r["role"]
  }, on_conflict="org_id,project_id,user_id").execute()
  sbs.table("project_member_access").upsert({
    "org_id": r["org_id"], "project_id": r["project_id"], "user_id": r["email"],
    "can_view_all": r["can_view_all"], "visibility_areas": r["visibility_areas"],
    "can_sign_all": r["can_sign_all"], "sign_areas": r["sign_areas"]
  }, on_conflict="org_id,project_id,user_id").execute()
  sbs.table("pending_invites").update({"used_at": datetime.now(timezone.utc).isoformat()}).eq("id", r["id"]).execute()
  return {"ok": True}