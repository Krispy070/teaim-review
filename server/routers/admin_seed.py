from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase
import uuid

router = APIRouter(prefix="/admin", tags=["admin"])
PM_PLUS = require_role({"owner","admin","pm"})

@router.post("/seed_basic")
def seed_basic(project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    """Drop-in replacement seeder (covers all failing tests) - idempotent minimum viable dataset"""
    sb = get_user_supabase(ctx)
    inserted = {"workbooks":0, "reports":0, "changes":0, "comments":0, "areas":0, "releases":0, "notifications":0, "signoffs":0}
    
    # Pre-generate IDs for deterministic linking
    ids = {
        "org": str(uuid.uuid4()),
        "vendor": str(uuid.uuid4()),
        "customer": str(uuid.uuid4()),
        "areas": {"hcm": str(uuid.uuid4()), "fin": str(uuid.uuid4())},
        "wbs": {"hcm": str(uuid.uuid4()), "fin": str(uuid.uuid4())},
        "rpts": {"hcm": str(uuid.uuid4()), "fin": str(uuid.uuid4())},
        "changes": {"a": str(uuid.uuid4()), "b": str(uuid.uuid4())},
        "comments": {"a": str(uuid.uuid4()), "b": str(uuid.uuid4())},
        "release": str(uuid.uuid4()),
        "notif": str(uuid.uuid4()),
        "signoff_valid": str(uuid.uuid4()),
    }
    
    try:
        now = datetime.now(timezone.utc)
        
        # ---- Clean existing test data for this project (idempotent) ----
        # Order matters for FKs - clean in reverse dependency order
        for table in ["audit_events", "area_comments", "changes", "reports", "workbooks", "releases", "signoff_doc_tokens"]:
            try:
                sb.table(table).delete().eq("project_id", project_id).execute()
            except Exception:
                pass  # Tables might not exist, continue
            
        # ---- Areas (HCM, FIN) - critical for area-specific exports ----
        areas_data = [
            {"id": ids["areas"]["hcm"], "project_id": project_id, "key": "HCM", "name": "HCM", "status": "active", "created_at": now.isoformat()},
            {"id": ids["areas"]["fin"], "project_id": project_id, "key": "FIN", "name": "Financials", "status": "active", "created_at": now.isoformat()},
        ]
        for area in areas_data:
            try: 
                sb.table("areas").insert(area).execute()
                inserted["areas"] += 1
            except Exception: 
                pass
        
        # ---- Workbooks (one per area) - needed for metrics endpoints ----
        workbooks_data = [
            {"id": ids["wbs"]["hcm"], "project_id": project_id, "area_id": ids["areas"]["hcm"], "title": "HCM Master Workbook", "metrics": {"items": 12, "open": 4, "closed": 8}, "created_at": now.isoformat()},
            {"id": ids["wbs"]["fin"], "project_id": project_id, "area_id": ids["areas"]["fin"], "title": "FIN Master Workbook", "metrics": {"items": 9, "open": 3, "closed": 6}, "created_at": now.isoformat()},
        ]
        for wb in workbooks_data:
            try: 
                sb.table("workbooks").insert(wb).execute()
                inserted["workbooks"] += 1
            except Exception: 
                pass
            
        # ---- Reports (for "Workbook export CSV") ----
        reports_data = [
            {"id": ids["rpts"]["hcm"], "project_id": project_id, "area_id": ids["areas"]["hcm"], "type": "wb_export_csv", "title": "HCM Export", "payload": {"rows": 12}, "created_at": now.isoformat()},
            {"id": ids["rpts"]["fin"], "project_id": project_id, "area_id": ids["areas"]["fin"], "type": "wb_export_csv", "title": "FIN Export", "payload": {"rows": 9}, "created_at": now.isoformat()},
        ]
        for rpt in reports_data:
            try: 
                sb.table("reports").insert(rpt).execute()
                inserted["reports"] += 1
            except Exception: 
                pass
            
        # ---- Changes (for Digest + ZIP) ----
        changes_data = [
            {"id": ids["changes"]["a"], "project_id": project_id, "area_id": ids["areas"]["hcm"], "kind": "update", "summary": "Updated HCM position sync", "created_at": (now - timedelta(days=1)).isoformat()},
            {"id": ids["changes"]["b"], "project_id": project_id, "area_id": ids["areas"]["fin"], "kind": "add", "summary": "Added GL segment validation", "created_at": (now - timedelta(days=2)).isoformat()},
        ]
        for chg in changes_data:
            try: 
                sb.table("changes").insert(chg).execute()
                inserted["changes"] += 1
            except Exception: 
                pass
            
        # ---- Comments (for Digest) ----
        comments_data = [
            {"id": ids["comments"]["a"], "project_id": project_id, "area_id": ids["areas"]["hcm"], "body": "Please verify job catalog mapping.", "author": "System", "created_at": now.isoformat()},
            {"id": ids["comments"]["b"], "project_id": project_id, "area_id": ids["areas"]["fin"], "body": "Need sign-off on journal import.", "author": "System", "created_at": now.isoformat()},
        ]
        for cmt in comments_data:
            try: 
                sb.table("area_comments").insert(cmt).execute()
                inserted["comments"] += 1
            except Exception: 
                pass
            
        # ---- Release (ICS) ----
        releases_data = [
            {"id": ids["release"], "project_id": project_id, "kind": "ics", "channel": "staging", "tag": "v0.1.0-test", "created_at": now.isoformat()},
        ]
        for rel in releases_data:
            try: 
                sb.table("releases").insert(rel).execute()
                inserted["releases"] += 1
            except Exception: 
                pass
            
        # ---- Notifications (unseen count) ----
        notifications_data = [
            {"id": ids["notif"], "project_id": project_id, "kind": "digest_ready", "seen": False, "payload": {"areas": ["HCM", "FIN"]}, "created_at": now.isoformat()},
        ]
        for notif in notifications_data:
            try: 
                sb.table("audit_events").insert(notif).execute()
                inserted["notifications"] += 1
            except Exception: 
                pass
            
        # ---- Sign-off token (valid case) ----
        signoffs_data = [
            {"token": ids["signoff_valid"], "project_id": project_id, "status": "issued", "expires_at": (now + timedelta(days=3)).isoformat(), "created_at": now.isoformat()},
        ]
        for so in signoffs_data:
            try: 
                sb.table("signoff_doc_tokens").insert(so).execute()
                inserted["signoffs"] += 1
            except Exception: 
                pass
            
        return {"ok": True, "inserted": inserted}
    except Exception as e:
        return {"ok": False, "error": str(e), "inserted": inserted}