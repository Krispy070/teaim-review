from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/updates", tags=["updates"])

@router.get("/feed")
def feed(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    out = {}
    def upd(table, area=False):
        try:
            q = sb.table(table).select("created_at").eq("org_id", ctx.org_id).eq("project_id", project_id)\
                .order("created_at", desc=True).limit(1).execute().data or []
            return q and q[0].get("created_at")
        except Exception:
            return None
    # coarse route keys
    out["dashboard"]   = upd("audit_events") or upd("actions") or upd("risks") or upd("decisions")
    out["timeline"]    = upd("project_stages")
    out["documents"]   = upd("artifacts")
    out["meetings"]    = upd("meetings")
    out["actions"]     = upd("actions")
    out["risks"]       = upd("risks")
    out["decisions"]   = upd("decisions")
    out["reporting"]   = upd("workbooks") or upd("reports")
    out["signoff"]     = upd("signoff_doc_tokens") or upd("signoff_docs")
    return {"items": out}