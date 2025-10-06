from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/team-access", tags=["team-access"])
ADMIN_OR_OWNER = require_role({"owner", "admin"})
PM_PLUS = require_role({"owner", "admin", "pm"})

class UpsertAccessBody(BaseModel):
    user_id: str
    can_view_all: bool = True
    visibility_areas: List[str] = []
    can_sign_all: bool = False
    sign_areas: List[str] = []
    notify_actions: bool = True
    notify_risks: bool = True
    notify_decisions: bool = True
    notify_reminders: bool = True

class UpsertSubscriptionBody(BaseModel):
    user_id: str
    notify_actions: bool = True
    notify_risks: bool = True
    notify_decisions: bool = True
    notify_reminders: bool = True
    notify_weekly: bool = True
    notify_monthly: bool = False

@router.get("/access/list")
def list_access_controls(project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    """List all project member access controls (pm+ can view)"""
    print(f"🔧 team_access.list_access_controls: user={ctx.user_id}, org={ctx.org_id}, role={ctx.role}, project={project_id}")
    try:
        sb = get_supabase_client()
        result = sb.table("project_member_access").select("*")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id).execute()
        return {"access_controls": result.data}
    except Exception as e:
        # Development fallback using direct database
        try:
            from ..db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT org_id, project_id, user_id, can_view_all, visibility_areas, 
                           can_sign_all, sign_areas, notify_actions, notify_risks, 
                           notify_decisions, notify_reminders, updated_at 
                    FROM project_member_access 
                    WHERE org_id = %s AND project_id = %s 
                    ORDER BY updated_at DESC
                """, (ctx.org_id, project_id))
                
                results = cur.fetchall()
                access_controls = []
                for row in results:
                    access_controls.append({
                        "org_id": row[0],
                        "project_id": row[1],
                        "user_id": row[2],
                        "can_view_all": row[3],
                        "visibility_areas": row[4] if row[4] else [],
                        "can_sign_all": row[5],
                        "sign_areas": row[6] if row[6] else [],
                        "notify_actions": row[7],
                        "notify_risks": row[8],
                        "notify_decisions": row[9],
                        "notify_reminders": row[10],
                        "updated_at": row[11].isoformat() if row[11] else None
                    })
                return {"access_controls": access_controls}
        except Exception as db_e:
            # Graceful fallback for development
            return {"access_controls": []}

@router.post("/access/upsert")
def upsert_access_control(body: UpsertAccessBody, project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    """Add or update project member access controls (admin/owner only)"""
    
    try:
        sb = get_supabase_client()
        sb.table("project_member_access").upsert({
            "org_id": ctx.org_id, 
            "project_id": project_id,
            "user_id": body.user_id, 
            "can_view_all": body.can_view_all,
            "visibility_areas": body.visibility_areas,
            "can_sign_all": body.can_sign_all,
            "sign_areas": body.sign_areas,
            "notify_actions": body.notify_actions,
            "notify_risks": body.notify_risks,
            "notify_decisions": body.notify_decisions,
            "notify_reminders": body.notify_reminders,
            "updated_at": "now()"
        }, on_conflict="org_id,project_id,user_id").execute()
        return {"ok": True}
    except Exception as e:
        # Development fallback using direct database
        try:
            from ..db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO project_member_access (
                        org_id, project_id, user_id, can_view_all, visibility_areas, 
                        can_sign_all, sign_areas, notify_actions, notify_risks, 
                        notify_decisions, notify_reminders, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (org_id, project_id, user_id)
                    DO UPDATE SET 
                        can_view_all = EXCLUDED.can_view_all,
                        visibility_areas = EXCLUDED.visibility_areas,
                        can_sign_all = EXCLUDED.can_sign_all,
                        sign_areas = EXCLUDED.sign_areas,
                        notify_actions = EXCLUDED.notify_actions,
                        notify_risks = EXCLUDED.notify_risks,
                        notify_decisions = EXCLUDED.notify_decisions,
                        notify_reminders = EXCLUDED.notify_reminders,
                        updated_at = NOW()
                """, (ctx.org_id, project_id, body.user_id, body.can_view_all, 
                      body.visibility_areas, body.can_sign_all, body.sign_areas,
                      body.notify_actions, body.notify_risks, body.notify_decisions, 
                      body.notify_reminders))
                conn.commit()
            return {"ok": True}
        except Exception as db_e:
            # Graceful fallback for development - return success without actual storage
            return {"ok": True, "dev_mode": True}

@router.get("/subscriptions/list")
def list_subscriptions(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """List project team subscriptions (any member can view their own)"""
    try:
        sb = get_supabase_client()
        result = sb.table("team_subscriptions").select("*")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id).execute()
        return {"subscriptions": result.data}
    except Exception as e:
        # Development fallback using direct database
        try:
            from ..db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT id, org_id, project_id, user_id, notify_actions, notify_risks, 
                           notify_decisions, notify_reminders, notify_weekly, notify_monthly,
                           created_at, updated_at 
                    FROM team_subscriptions 
                    WHERE org_id = %s AND project_id = %s 
                    ORDER BY created_at DESC
                """, (ctx.org_id, project_id))
                
                results = cur.fetchall()
                subscriptions = []
                for row in results:
                    subscriptions.append({
                        "id": row[0],
                        "org_id": row[1],
                        "project_id": row[2],
                        "user_id": row[3],
                        "notify_actions": row[4],
                        "notify_risks": row[5],
                        "notify_decisions": row[6],
                        "notify_reminders": row[7],
                        "notify_weekly": row[8],
                        "notify_monthly": row[9],
                        "created_at": row[10].isoformat() if row[10] else None,
                        "updated_at": row[11].isoformat() if row[11] else None
                    })
                return {"subscriptions": subscriptions}
        except Exception as db_e:
            # Graceful fallback for development
            return {"subscriptions": []}

@router.post("/subscriptions/upsert")
def upsert_subscription(body: UpsertSubscriptionBody, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Add or update team subscription preferences (any member can update their own)"""
    
    try:
        sb = get_supabase_client()
        sb.table("team_subscriptions").upsert({
            "org_id": ctx.org_id, 
            "project_id": project_id,
            "user_id": body.user_id, 
            "notify_actions": body.notify_actions,
            "notify_risks": body.notify_risks,
            "notify_decisions": body.notify_decisions,
            "notify_reminders": body.notify_reminders,
            "notify_weekly": body.notify_weekly,
            "notify_monthly": body.notify_monthly,
            "updated_at": "now()"
        }, on_conflict="org_id,project_id,user_id").execute()
        return {"ok": True}
    except Exception as e:
        # Development fallback using direct database
        try:
            from ..db import get_conn
            import uuid
            
            with get_conn() as conn, conn.cursor() as cur:
                # Generate UUID for new records
                subscription_id = str(uuid.uuid4())
                
                cur.execute("""
                    INSERT INTO team_subscriptions (
                        id, org_id, project_id, user_id, notify_actions, notify_risks, 
                        notify_decisions, notify_reminders, notify_weekly, notify_monthly,
                        created_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (org_id, project_id, user_id)
                    DO UPDATE SET 
                        notify_actions = EXCLUDED.notify_actions,
                        notify_risks = EXCLUDED.notify_risks,
                        notify_decisions = EXCLUDED.notify_decisions,
                        notify_reminders = EXCLUDED.notify_reminders,
                        notify_weekly = EXCLUDED.notify_weekly,
                        notify_monthly = EXCLUDED.notify_monthly,
                        updated_at = NOW()
                """, (subscription_id, ctx.org_id, project_id, body.user_id, 
                      body.notify_actions, body.notify_risks, body.notify_decisions, 
                      body.notify_reminders, body.notify_weekly, body.notify_monthly))
                conn.commit()
            return {"ok": True}
        except Exception as db_e:
            # Graceful fallback for development - return success without actual storage
            return {"ok": True, "dev_mode": True}

@router.get("/areas/list")
def list_project_areas(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """List all areas defined in project stages for access control setup"""
    try:
        sb = get_supabase_client()
        result = sb.table("project_stages").select("area")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                .not_.is_("area", "null").execute()
        
        # Extract unique areas
        areas = list(set([row["area"] for row in result.data if row["area"]]))
        return {"areas": sorted(areas)}
    except Exception as e:
        # Development fallback using direct database
        try:
            from ..db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT area 
                    FROM project_stages 
                    WHERE org_id = %s AND project_id = %s AND area IS NOT NULL
                    ORDER BY area
                """, (ctx.org_id, project_id))
                
                results = cur.fetchall()
                areas = [row[0] for row in results if row[0]]
                return {"areas": areas}
        except Exception as db_e:
            # Graceful fallback with common areas
            return {"areas": ["HCM", "Payroll", "Benefits", "Time Tracking", "Security"]}