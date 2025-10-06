from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/stages", tags=["stages"])
PM_PLUS = require_role({"owner","admin","pm"})

class ApplyBody(BaseModel):
    area: str
    template_key: str
    baseline: str  # YYYY-MM-DD
    changes: dict   # { stage_id: {start_date, end_date} }

@router.post("/apply_template")
def apply_template(body: ApplyBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    updated = 0
    try:
        # apply changes
        for sid, dates in (body.changes or {}).items():
            try:
                sb.table("project_stages").update({"start_date": dates.get("start_date"), "end_date": dates.get("end_date")})\
                  .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", sid).execute()
                updated += 1
            except Exception: ...
        # persist last template
        try:
            sb.table("stage_template_last").upsert({
                "org_id": ctx.org_id, "project_id": project_id,
                "area": body.area, "template_key": body.template_key, "baseline": body.baseline
            }, on_conflict="org_id,project_id,area").execute()
        except Exception: ...
        # audit
        try:
            sb.table("audit_events").insert({
                "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
                "kind": "stage.apply_template",
                "details": {"area": body.area, "template_key": body.template_key, "baseline": body.baseline, "updated": updated}
            }).execute()
        except Exception: ...
        return {"ok": True, "updated": updated}
    except Exception:
        return {"ok": False, "updated": 0}

@router.get("/restore_last_template")
def restore_last_template(project_id: str = Query(...), area: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        data = sb.table("stage_template_last").select("template_key,baseline")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("area", area).single().execute().data
        return {"template_key": (data or {}).get("template_key"), "baseline": (data or {}).get("baseline")}
    except Exception:
        return {"template_key": None, "baseline": None}