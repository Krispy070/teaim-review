# /server/mem_api.py
from fastapi import APIRouter, Query
from .supabase_client import get_supabase_client

sb = get_supabase_client()
from .db import get_conn

router = APIRouter()

@router.get("/mem/search")
def mem_search(org_id: str, project_id: str, q: str, limit: int = 20):
    # simple LIKE first; you can add pgvector search on mem_chunks if you wish
    rows = sb.table("mem_entries").select("id,type,title,body,created_at") \
        .eq("org_id",org_id).eq("project_id",project_id).order("created_at", desc=True).limit(400).execute().data or []
    ql = q.lower()
    hits = [r for r in rows if ql in ( (r.get("title") or "") + " " + (r.get("body") or "") ).lower() ][:limit]
    return {"items": hits}

@router.get("/mem/timeline")
def mem_timeline(org_id: str, project_id: str, since_days: int = 90, limit: int = 200):
    rows = sb.table("mem_entries").select("id,type,title,body,created_at") \
        .eq("org_id",org_id).eq("project_id",project_id).order("created_at", desc=True).limit(limit).execute().data or []
    # client can render a vertical timeline; types convey context (decision/episodic/etc.)
    return {"items": rows}