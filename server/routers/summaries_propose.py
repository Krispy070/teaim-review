from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Literal, Optional, Dict, Any
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase
import requests, os

router = APIRouter(prefix="/summaries", tags=["summaries"])

class ItemRef(BaseModel):
  artifact_id: str
  kind: Literal["action","risk","decision"]
  index: int                      # index inside summary JSON array
  confidence: float = 0.8
  area: Optional[str] = None

class ProposeBody(BaseModel):
  items: List[ItemRef]

def _enqueue(base:str, headers:dict, project_id:str, change_type:str, target_table:str, payload:dict, conf:float):
  requests.post(f"{base}/api/updates/enqueue?project_id={project_id}", headers=headers, json={
    "change_type": change_type, "operation": "insert", "target_table": target_table,
    "payload": payload, "confidence": conf, "created_by":"summary"
  }, timeout=20)

@router.post("/propose")
def propose(body: ProposeBody, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
  sb = get_user_supabase(ctx)
  # fetch summaries per artifact
  ids = list({i.artifact_id for i in body.items})
  smap: Dict[str, Dict[str, Any]] = {}
  for aid in ids:
    s = sb.table("summaries").select("artifact_id,risks,decisions,actions").eq("org_id", ctx.org_id)\
         .eq("project_id", project_id).eq("artifact_id", aid).single().execute().data
    if s: smap[aid] = s

  base = os.getenv("FASTAPI_URL", "http://127.0.0.1:5000")
  headers = {}
  if os.getenv("DEV_AUTH","0")=="1":
    headers = {"X-Dev-User": ctx.user_id or "dev-user", "X-Dev-Org": ctx.org_id, "X-Dev-Role": ctx.role or "admin"}
  elif os.getenv("INTERNAL_API_BEARER"):
    headers = {"Authorization": f"Bearer {os.getenv('INTERNAL_API_BEARER')}"}

  for it in body.items:
    s = smap.get(it.artifact_id)
    if not s: continue
    arr = s.get(f"{it.kind}s") or []
    if it.index < 0 or it.index >= len(arr): continue
    rec = arr[it.index] or {}
    # map fields
    if it.kind == "action":
      payload = {
        "org_id": ctx.org_id, "project_id": project_id,
        "title": rec.get("title") or rec.get("text") or "Action",
        "owner": rec.get("owner"),
        "status": "todo",
        "area": it.area or rec.get("area")
      }
      _enqueue(base, headers, project_id, "action", "actions", payload, it.confidence)
    elif it.kind == "risk":
      payload = {
        "org_id": ctx.org_id, "project_id": project_id,
        "title": rec.get("title") or rec.get("text") or "Risk",
        "severity": rec.get("severity") or "Medium",
        "owner": rec.get("owner"),
        "area": it.area or rec.get("area")
      }
      _enqueue(base, headers, project_id, "risk", "risks", payload, it.confidence)
    elif it.kind == "decision":
      payload = {
        "org_id": ctx.org_id, "project_id": project_id,
        "title": rec.get("title") or rec.get("text") or "Decision",
        "decided_by": rec.get("decided_by"),
        "area": it.area or rec.get("area")
      }
      _enqueue(base, headers, project_id, "decision", "decisions", payload, it.confidence)

  return {"ok": True}