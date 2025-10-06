from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from ..tenant import TenantCtx
from ..guards import require_role, member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/changes", tags=["changes"])

class TplBody(BaseModel):
    subject: str
    html: str

@router.get("/resend_template")
def get_tpl(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("ops_kv").select("val").eq("key", f"cr_resend_tpl:{ctx.org_id}:{project_id}").single().execute().data or {}
        return r.get("val") or {"subject":"[Nudge] CR status","html":"<p>{{TITLE}} — due {{DUE}}</p>"}
    except Exception:
        return {"subject":"[Nudge] CR status","html":"<p>{{TITLE}} — due {{DUE}}</p>"}

@router.post("/resend_template")
def set_tpl(body: TplBody, project_id: str = Query(...), ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    try:
        sb.table("ops_kv").upsert({"key":f"cr_resend_tpl:{ctx.org_id}:{project_id}","val":{"subject":body.subject,"html":body.html}}).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}