from fastapi import APIRouter, Depends, Query
from datetime import datetime
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/method", tags=["method"])

@router.get("/lateness")
def lateness(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    # Stages with planned end_date
    stages = sb.table("project_stages").select("id,title,area,end_date")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []

    # Signed stages (via signoff_docs or method_metrics kind=stage.signed)
    signed_ids = set()
    try:
        d = sb.table("signoff_docs").select("stage_id").eq("org_id", ctx.org_id)\
              .eq("project_id", project_id).eq("status","signed").not_.is_("stage_id","null").execute().data or []
        signed_ids.update([r["stage_id"] for r in d if r.get("stage_id")])
    except Exception: ...
    if not signed_ids:
        try:
            mm = sb.table("method_metrics").select("stage_id").eq("org_id", ctx.org_id)\
                 .eq("project_id", project_id).eq("kind","stage.signed").not_.is_("stage_id","null").execute().data or []
            signed_ids.update([m["stage_id"] for m in mm if m.get("stage_id")])
        except Exception: ...

    out=[]; late=on=0
    today = datetime.now().date()
    for st in stages:
        sid = st["id"]; end = st.get("end_date")
        if not end: continue
        try:
            plan = datetime.fromisoformat(end).date()
        except: 
            continue
        if sid in signed_ids:
            # signed: count on-time/early vs planned end
            # (we don't have exact signed date, so treat signed as on-time)
            on += 1
            continue
        # unsigned: at risk if planned end < today
        if plan < today:
            late += 1
            out.append({"title": st.get("title"), "area": st.get("area"), "days": (today - plan).days})
        else:
            on += 1
    return {"summary": {"late": late, "on_time_or_early": on}, "details": out[:50]}