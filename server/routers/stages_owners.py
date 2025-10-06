from fastapi import APIRouter, Depends, Query
from collections import Counter
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/stages", tags=["stages"])

@router.get("/owners_by_area")
def owners_by_area(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        rows = sb.table("actions").select("owner,area")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        mapc = {}
        by_area = {}
        for r in rows:
            a = (r.get("area") or "").strip()
            o = (r.get("owner") or "").strip()
            if not a or not o: continue
            by_area.setdefault(a, []).append(o)
        for a, owners in by_area.items():
            c = Counter(owners); mapc[a] = c.most_common(1)[0][0] if owners else None
        return {"owner_by_area": mapc}
    except Exception:
        return {"owner_by_area": {}}