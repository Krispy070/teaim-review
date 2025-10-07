from fastapi import APIRouter, Depends, Query, UploadFile, File
from typing import Optional
import csv, io

from ..tenant import TenantCtx
from ..guards import member_ctx, PM_PLUS
from ..supabase_client import get_user_supabase

router = APIRouter()

@router.post("/import_csv")
def import_csv(project_id: str = Query(...), file: UploadFile = File(...),
               ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        raw = (file.file.read()).decode("utf-8", errors="ignore")
        rdr = csv.DictReader(io.StringIO(raw))
        cols = {"name","legacy_system","owner","frequency","due_date","status","wd_type","wd_report_name","design_doc_url","sample_url","notes"}
        n=0
        for row in rdr:
            data = {k: row.get(k) for k in cols if k in row}
            if not (data.get("name") or "").strip():
                continue
            data.update({"org_id": ctx.org_id, "project_id": project_id})
            try: sb.table("reports").insert(data).execute(); n+=1
            except Exception: ...
        return {"ok": True, "imported": n}
    except Exception:
        return {"ok": False, "imported": 0}

@router.get("/list")
def reports_list(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Get reports list for the Reporting page"""
    sb = get_user_supabase(ctx)
    try:
        reports = sb.table("reports").select("*")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .order("name").execute().data or []
        return {"items": reports}
    except Exception:
        # Dev-safe: return empty list if table doesn't exist
        return {"items": []}

@router.get("/metrics")
def reports_metrics(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Get reports summary metrics for dashboard KPI tiles"""
    sb = get_user_supabase(ctx)
    try:
        reports = sb.table("reports").select("*")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        
        # Calculate status pipeline metrics
        summary = {
            "total": len(reports),
            "planned": len([r for r in reports if (r.get("status") or "planned").lower() == "planned"]),
            "mapped": len([r for r in reports if (r.get("status") or "").lower() == "mapped"]),
            "built": len([r for r in reports if (r.get("status") or "").lower() == "built"]),
            "validated": len([r for r in reports if (r.get("status") or "").lower() == "validated"]),
            "delivered": len([r for r in reports if (r.get("status") or "").lower() == "delivered"]),
            "blocked": len([r for r in reports if (r.get("status") or "").lower() == "blocked"])
        }
        
        return {"summary": summary}
        
    except Exception:
        # Dev-safe: return empty metrics if table doesn't exist
        return {
            "summary": {
                "total": 0,
                "planned": 0,
                "mapped": 0,
                "built": 0,
                "validated": 0,
                "delivered": 0,
                "blocked": 0
            }
        }

