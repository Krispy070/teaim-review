from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from ..tenant import TenantCtx
from ..guards import require_role, member_ctx
from ..supabase_client import get_user_supabase
import io, csv

router = APIRouter(prefix="/api/releases", tags=["releases"])
PM_PLUS = require_role({"owner","admin","pm"})

class Release(BaseModel):
    id: Optional[str] = None
    name: str
    window_start: Optional[str] = None
    window_end: Optional[str] = None
    notes: Optional[str] = None
    cr_ids: Optional[List[str]] = []

@router.get("/list")
def list_releases(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        rows = sb.table("releases").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id).order("window_start", desc=True).limit(500).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}

@router.post("/upsert")
def upsert_release(body: Release, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        data = body.model_dump(); data.update({"org_id": ctx.org_id, "project_id": project_id})
        sb.table("releases").upsert(data, on_conflict="org_id,project_id,id").execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.get("/notes.csv")
def notes_csv(project_id: str = Query(...), id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("releases").select("name,cr_ids").eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",id).single().execute().data or {}
        crids = r.get("cr_ids") or []
        if not crids: raise Exception()
        cr = sb.table("changes").select("id,title,area,status").eq("org_id",ctx.org_id).eq("project_id",project_id).in_("id", crids).execute().data or []
    except Exception:
        cr=[]
    s=io.StringIO(); w=csv.writer(s); w.writerow(["id","title","area","status"])
    for c in cr: w.writerow([c.get("id"),c.get("title"),c.get("area"),c.get("status")])
    s.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(iter([s.read()]), media_type="text/csv",
      headers={"Content-Disposition": 'attachment; filename="release_notes.csv"'})

class AttachRequest(BaseModel):
    cr_ids: List[str]

@router.post("/attach")
def attach(body: AttachRequest, project_id: str = Query(...), id: str = Query(...),
           ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        row = sb.table("releases").select("cr_ids").eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",id).single().execute().data or {}
        cur = set(row.get("cr_ids") or [])
        nxt = list(cur.union(set(body.cr_ids)))
        sb.table("releases").update({"cr_ids": nxt}).eq("org_id",ctx.org_id).eq("project_id",project_id).eq("id",id).execute()
        return {"ok": True, "cr_ids": nxt}
    except Exception:
        return {"ok": False}

@router.get("/month")
def month(project_id: str = Query(...), year:int = Query(...), month:int = Query(...),
          ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        from calendar import monthrange
        start=f"{year:04d}-{month:02d}-01"
        last=monthrange(year,month)[1]
        end=f"{year:04d}-{month:02d}-{last:02d}"
        rows = sb.table("releases").select("id,name,window_start,window_end")\
               .eq("org_id",ctx.org_id).eq("project_id",project_id)\
               .gte("window_end", start).lte("window_start", end).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}