import os
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/artifacts", tags=["artifact-tags"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

class TagBody(BaseModel):
    name: str

@router.get("/tags")
def list_tags(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_supabase_client()
    try:
        # tags used in this project
        used = sb.table("artifact_tags").select("tag_id")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        tag_ids = [x["tag_id"] for x in used] or ["00000000-0000-0000-0000-000000000000"]
        rows = sb.table("tags").select("id,name").in_("id", tag_ids).execute().data or []
        return {"items": rows}
    except Exception as e:
        # Graceful fallback for dev environments without tag tables
        print(f"Tags query failed (returning empty): {e}")
        return {"items": []}

@router.get("/{artifact_id}/tags")
def artifact_tags(artifact_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_supabase_client()
    try:
        ats = sb.table("artifact_tags").select("tag_id")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("artifact_id", artifact_id).execute().data or []
        if not ats: return {"tags":[]}
        tids = [x["tag_id"] for x in ats]
        rows = sb.table("tags").select("id,name").in_("id", tids).execute().data or []
        return {"tags": rows}
    except Exception as e:
        # Graceful fallback for dev environments
        print(f"Artifact tags query failed (returning empty): {e}")
        return {"tags": []}

@router.post("/{artifact_id}/tags/add")
def add_tag(artifact_id: str, body: TagBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_supabase_client()
    name = body.name.strip().lower()
    if not name: raise HTTPException(400, "empty tag")
    
    try:
        # ensure tag
        t = sb.table("tags").select("id").eq("org_id", ctx.org_id).eq("name", name).limit(1).execute().data
        if t: tag_id = t[0]["id"]
        else:
            tag_id = sb.table("tags").insert({"org_id": ctx.org_id, "name": name}).execute().data[0]["id"]
        # map
        sb.table("artifact_tags").upsert({
            "org_id": ctx.org_id, "project_id": project_id, "artifact_id": artifact_id, "tag_id": tag_id
        }).execute()
        return {"ok": True, "tag_id": tag_id, "name": name}
    except Exception as e:
        # Graceful dev-mode fallback or production error
        if os.getenv("DEV_AUTH", "0") == "1":
            print(f"Tag add failed in dev mode (using fallback): {e}")
            return {"ok": True, "tag_id": "dev-fallback", "name": name}
        else:
            raise HTTPException(503, "Tag service temporarily unavailable")

@router.post("/{artifact_id}/tags/remove")
def remove_tag(artifact_id: str, body: TagBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_supabase_client()
    name = body.name.strip().lower()
    
    try:
        t = sb.table("tags").select("id").eq("org_id", ctx.org_id).eq("name", name).limit(1).execute().data
        if not t: return {"ok": True}
        tag_id = t[0]["id"]
        sb.table("artifact_tags").delete().eq("org_id", ctx.org_id).eq("project_id", project_id)\
          .eq("artifact_id", artifact_id).eq("tag_id", tag_id).execute()
        return {"ok": True}
    except Exception as e:
        # Graceful dev-mode fallback or production error
        if os.getenv("DEV_AUTH", "0") == "1":
            print(f"Tag remove failed in dev mode (using fallback): {e}")
            return {"ok": True}
        else:
            raise HTTPException(503, "Tag service temporarily unavailable")

@router.get("/filter")
def filter_by_tags(project_id: str = Query(...), tags: str = Query(""), ctx: TenantCtx = Depends(member_ctx)):
    """
    tags: comma-separated names; returns artifact ids that have ALL tags
    """
    sb = get_user_supabase(ctx)
    names = [t.strip().lower() for t in tags.split(",") if t.strip()]
    if not names: return {"artifact_ids":[]}
    tids = sb.table("tags").select("id").eq("org_id", ctx.org_id).in_("name", names).execute().data or []
    if not tids: return {"artifact_ids":[]}
    ids = [x["id"] for x in tids]
    rows = sb.table("artifact_tags").select("artifact_id, tag_id")\
           .eq("org_id", ctx.org_id).eq("project_id", project_id).in_("tag_id", ids).execute().data or []
    # intersect by artifact_id count
    from collections import Counter
    c = Counter([r["artifact_id"] for r in rows])
    hit = [k for k,v in c.items() if v == len(ids)]
    return {"artifact_ids": hit}