from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client
import os, datetime as dt

router = APIRouter(prefix="/api/admin", tags=["admin"])
ADMIN_ONLY = require_role({"owner","admin"})

@router.get("/health")
def health(project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_ONLY)):
    sb = get_user_supabase(ctx)
    sbs = get_supabase_client()

    checks = []

    # Env
    env_ok = all([os.getenv(k) for k in ("SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","FASTAPI_URL")])
    checks.append({"name":"env.supabase/fastapi","ok":env_ok})

    # Buckets
    try:
        sbs.storage.from_("artifacts").list()
        sbs.storage.from_("backups").list()
        checks.append({"name":"storage.buckets","ok":True})
    except Exception as e:
        checks.append({"name":"storage.buckets","ok":False,"err":str(e)})

    # Digest settings present
    try:
        s = sb.table("org_comms_settings").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
        checks.append({"name":"comms.settings","ok":bool(s)})
    except Exception as e:
        checks.append({"name":"comms.settings","ok":False,"err":str(e)})

    # Queue (reindex)
    try:
        pend = sb.table("reindex_queue").select("id").eq("org_id", ctx.org_id).eq("project_id", project_id).eq("status","pending").execute()
        count = len(pend.data) if pend.data else 0
        checks.append({"name":"reindex.pending","ok":True,"count":count})
    except Exception as e:
        checks.append({"name":"reindex.pending","ok":False,"err":str(e)})

    # Last digest send
    try:
        last = sb.table("comms_send_log").select("created_at").order("created_at", desc=True)\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("kind","digest").limit(1).execute().data
        checks.append({"name":"digest.last_send","ok":True,"value":(last and last[0]["created_at"]) or None})
    except Exception as e:
        checks.append({"name":"digest.last_send","ok":False,"err":str(e)})

    return {"ok": all(c.get("ok") for c in checks if "ok" in c), "checks": checks}