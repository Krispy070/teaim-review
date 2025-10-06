from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/search", tags=["search"])
# Alias router without /api prefix for routing resilience
router_no_api = APIRouter(prefix="/search", tags=["search-no-api"])

@router.get("")
def search(q: str = Query(..., min_length=2, max_length=80),
           project_id: str = Query(...),
           limit: int = 12,
           ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    qlike = f"%{q}%"

    results = []

    # Artifacts (names only to keep it cheap)
    try:
        arts = sb.table("artifacts").select("id,title,created_at")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)\
            .ilike("title", qlike).limit(limit).execute().data or []
        results += [{"type":"artifact","id":a["id"],"title":a["title"],"snippet":"","ts":a["created_at"]} for a in arts]
    except Exception:
        pass

    # Actions / Risks / Decisions (generic table names assumed)
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    def pull(table, tname, has_area_column=True):
        try:
            query = sb.table(table).select("id,title,created_at")\
                      .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                      .or_(f"title.ilike.{qlike},body.ilike.{qlike}")\
                      .limit(limit)
            
            # Apply visibility filtering for tables with area columns
            if has_area_column:
                query = apply_area_visibility_filter(query, visibility_ctx, "area")
            
            r = query.execute().data or []
            return [{"type":tname,"id":x["id"],"title":x.get("title") or tname.capitalize(), "snippet":"", "ts":x["created_at"]} for x in r]
        except Exception:
            return []
    
    results += pull("actions","action", True)
    results += pull("risks","risk", True) 
    results += pull("decisions","decision", True)

    # Memories (timeline/decision/procedural…)
    try:
        mems = sb.table("mem_entries").select("id,type,created_at,body")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id)\
            .limit(limit).execute().data or []
        for m in mems:
            body = m.get("body")
            text = body if isinstance(body, str) else (body and str(body)) or ""
            if q.lower() in text.lower():
                results.append({"type":f"mem:{m['type']}", "id":m["id"], "title":m["type"], "snippet":"", "ts":m["created_at"]})
    except Exception:
        pass

    # simple rank: newest first, trim
    results = sorted(results, key=lambda x: x["ts"], reverse=True)[:limit]
    return {"items": results}

# Alias endpoint without /api prefix for routing resilience
@router_no_api.get("")
def search_no_api(q: str = Query(..., min_length=2, max_length=80),
                  project_id: str = Query(...),
                  limit: int = 12,
                  ctx: TenantCtx = Depends(member_ctx)):
    return search(q, project_id, limit, ctx)