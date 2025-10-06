from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/comms", tags=["comms"])
ADMIN_OR_OWNER = require_role({"owner","admin"})

class CommsSettings(BaseModel):
    tz: str = "America/Los_Angeles"
    quiet_start: str = "21:00:00+00:00"
    quiet_end: str = "07:00:00+00:00"
    daily_send_cap: int = 200
    weekly_enabled: bool = True
    weekly_day: int = 4
    weekly_hour: int = 9
    monthly_enabled: bool = False
    monthly_day: int = 1
    monthly_hour: int = 9
    # SLA Thresholds
    sla_due_soon_days: int = 3
    sla_critical_days: int = 1
    sla_overdue_hours: int = 24
    # Sharing Policy
    sharing_enabled: bool = True
    default_share_expires_sec: int = 3600

@router.get("/settings")
def get_settings(ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    sb = get_user_supabase(ctx)
    try:
        r = sb.table("org_comms_settings").select("*").eq("org_id", ctx.org_id).single().execute()
        if r.data: 
            return r.data
        return CommsSettings().model_dump()
    except Exception as e:
        # If table doesn't exist or missing columns, return defaults
        print(f"Settings query error (using defaults): {e}")
        return CommsSettings().model_dump()

@router.post("/settings")
def upsert_settings(body: CommsSettings, ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("org_comms_settings").upsert({
            "org_id": ctx.org_id, **body.model_dump()
        }, on_conflict="org_id").execute()
        return {"ok": True}
    except Exception as e:
        error_msg = str(e).lower()
        if "column" in error_msg and ("weekly_enabled" in error_msg or "monthly_enabled" in error_msg):
            raise HTTPException(
                status_code=500, 
                detail="Database schema migration needed. Please apply the digest scheduler schema updates."
            )
        else:
            raise HTTPException(status_code=500, detail=f"Settings update failed: {str(e)}")

@router.post("/dryrun/start")
def start_dryrun(to_email: str = Query(...), days: int = Query(7), ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    sb = get_user_supabase(ctx)
    try:
        until = datetime.now(timezone.utc) + timedelta(days=days)
        sb.table("org_comms_settings").upsert({
            "org_id": ctx.org_id,
            "digest_dry_run_to_email": to_email,
            "digest_dry_run_until": until.isoformat()
        }, on_conflict="org_id").execute()
        return {"ok": True, "until": until.isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dry run start failed: {str(e)}")

@router.post("/dryrun/stop")
def stop_dryrun(ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("org_comms_settings").update({
            "digest_dry_run_to_email": None,
            "digest_dry_run_until": None
        }).eq("org_id", ctx.org_id).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dry run stop failed: {str(e)}")