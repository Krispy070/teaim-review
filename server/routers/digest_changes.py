from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx, require_project_member
from ..supabase_client import get_supabase_client as get_service_supabase

router = APIRouter(prefix="/digest", tags=["digest"])

@router.get("/changes")
def changes(
    project_id: str = Query(...), 
    org_id: str = Query(...),
    days: int = Query(7, description="Number of days to look back"),
    ctx: TenantCtx = Depends(require_project_member)
):
    sb = get_service_supabase()
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=max(1,days))
    out=[]
    try:
        a = sb.table("actions").select("id,title,owner,area,created_at")\
             .eq("org_id", org_id).eq("project_id", project_id).gte("created_at", start.isoformat()).limit(200).execute().data or []
        out += [{"table":"actions","id":x["id"],"title":x.get("title"),"owner":x.get("owner"),"area":x.get("area")} for x in a]
    except Exception: ...
    try:
        r = sb.table("risks").select("id,title,owner,area,created_at")\
             .eq("org_id", org_id).eq("project_id", project_id).gte("created_at", start.isoformat()).limit(200).execute().data or []
        out += [{"table":"risks","id":x["id"],"title":x.get("title"),"owner":x.get("owner"),"area":x.get("area")} for x in r]
    except Exception: ...
    try:
        d = sb.table("decisions").select("id,title,decided_by,area,created_at")\
             .eq("org_id", org_id).eq("project_id", project_id).gte("created_at", start.isoformat()).limit(200).execute().data or []
        out += [{"table":"decisions","id":x["id"],"title":x.get("title"),"owner":x.get("decided_by"),"area":x.get("area")} for x in d]
    except Exception: ...
    return {"items": out[:300]}