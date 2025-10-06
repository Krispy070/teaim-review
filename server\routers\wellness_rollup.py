from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase
import math

router = APIRouter(prefix="/wellness", tags=["wellness"])

@router.get("/rollup")
def rollup(project_id: str = Query(...), ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=29)
    try:
        rows = sb.table("team_wellness").select("created_at,score")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .gte("created_at", start.isoformat()).execute().data or []
    except Exception:
        rows = []
    buckets = {}
    for r in rows:
        d = (r.get("created_at") or "")[:10]
        if not d: continue
        buckets.setdefault(d, []).append(float(r.get("score") or 0))
    out = []
    for i in range(30):
        day = (start + timedelta(days=i)).isoformat()
        arr = buckets.get(day) or []
        avg = round(sum(arr)/len(arr), 2) if arr else None
        out.append({"date": day, "avg": avg, "count": len(arr)})
    return {"items": out}