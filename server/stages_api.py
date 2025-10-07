from fastapi import APIRouter, HTTPException, Body, Query, Depends
from datetime import datetime, date
import logging
import os
import json
from typing import Optional

from .supabase_client import get_supabase_client
from .db import get_conn
from .tenant import tenant_ctx, TenantCtx
from .guards import member_ctx, PM_PLUS, SIGNER_OR_ADMIN, ANY_MEMBER, AREA_SIGNER
from .db_guard import project_scoped_db, ScopedDB

router = APIRouter()

def _send_mailgun_email(to_email: str, subject: str, html: str):
    """Send email via Mailgun (optional - requires MAILGUN_DOMAIN and MAILGUN_API_KEY)"""
    try:
        import requests
        MG_DOMAIN = os.getenv("MAILGUN_DOMAIN")
        MG_KEY = os.getenv("MAILGUN_API_KEY")
        if not (MG_DOMAIN and MG_KEY):
            logging.warning("Mailgun not configured - email not sent")
            return
        
        response = requests.post(
            f"https://api.mailgun.net/v3/{MG_DOMAIN}/messages",
            auth=("api", MG_KEY),
            data={
                "from": f"TEAIM <no-reply@{MG_DOMAIN}>",
                "to": [to_email],
                "subject": subject,
                "html": html
            },
            timeout=15
        )
        
        if response.status_code == 200:
            logging.info(f"Email sent successfully to {to_email}")
        else:
            logging.warning(f"Mailgun error: {response.status_code} - {response.text}")
            
    except Exception as e:
        logging.error(f"Failed to send email: {e}")

@router.post("/stages/create")
def create_stage(
    project_id: str = Query(...),
    title: str = Body(...),
    start_date: Optional[str] = Body(None),
    end_date: Optional[str] = Body(None),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Create a new stage for a project (requires PM/admin role)"""
    try:
        supabase = get_supabase_client()
        
        # Insert stage with PostgREST fallback
        stage_data = {
            "project_id": project_id,
            "title": title,
            "status": "pending"
        }
        
        if start_date:
            stage_data["start_date"] = start_date
        if end_date:
            stage_data["end_date"] = end_date
            
        try:
            result = supabase.table("project_stages").insert(stage_data).execute()
            if result.data:
                return {"ok": True, "stage": result.data[0]}
                
        except Exception as insert_error:
            # PostgREST fallback using direct SQL
            logging.warning(f"PostgREST insert failed, using direct SQL: {insert_error}")
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO project_stages (project_id, title, start_date, end_date, status)
                    VALUES (%s, %s, %s, %s, 'pending')
                    RETURNING id, project_id, title, start_date, end_date, status, created_at
                """, (project_id, title, start_date, end_date))
                row = cur.fetchone()
                if row:
                    stage = {
                        "id": str(row[0]),
                        "project_id": str(row[1]),
                        "title": row[2],
                        "start_date": row[3].isoformat() if row[3] else None,
                        "end_date": row[4].isoformat() if row[4] else None,
                        "status": row[5],
                        "created_at": row[6].isoformat()
                    }
                    return {"ok": True, "stage": stage}
        
        return {"ok": False, "error": "Failed to create stage"}
        
    except Exception as e:
        logging.error(f"Failed to create stage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stages/list")
def list_stages(
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(ANY_MEMBER)
):
    """List all stages for a project (requires project membership)"""
    try:
        supabase = get_supabase_client()
        
        try:
            result = supabase.table("project_stages").select("*").eq("project_id", project_id).order("sort_index").order("created_at").execute()
            return {"stages": result.data or []}
            
        except Exception as query_error:
            # PostgREST fallback using direct SQL
            logging.warning(f"PostgREST query failed, using direct SQL: {query_error}")
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT id, project_id, title, start_date, end_date, status, 
                           requested_by, requested_at, signoff_by, signoff_date, 
                           signoff_decision, signoff_notes, sort_index, created_at, updated_at
                    FROM project_stages 
                    WHERE project_id = %s 
                    ORDER BY sort_index, created_at
                """, (project_id,))
                
                stages = []
                for row in cur.fetchall():
                    stage = {
                        "id": str(row[0]),
                        "project_id": str(row[1]),
                        "title": row[2],
                        "start_date": row[3].isoformat() if row[3] else None,
                        "end_date": row[4].isoformat() if row[4] else None,
                        "status": row[5],
                        "requested_by": str(row[6]) if row[6] else None,
                        "requested_at": row[7].isoformat() if row[7] else None,
                        "signoff_by": str(row[8]) if row[8] else None,
                        "signoff_date": row[9].isoformat() if row[9] else None,
                        "signoff_decision": row[10],
                        "signoff_notes": row[11],
                        "sort_index": row[12],
                        "created_at": row[13].isoformat(),
                        "updated_at": row[14].isoformat()
                    }
                    stages.append(stage)
                
                return {"stages": stages}
        
    except Exception as e:
        logging.error(f"Failed to list stages: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stages/request-signoff")
def request_signoff(
    project_id: str = Query(...),
    stage_id: str = Body(...),
    email_to: str = Body(...),
    message: Optional[str] = Body(None),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Request sign-off for a stage (requires PM/admin role)"""
    try:
        supabase = get_supabase_client()
        
        # Update stage status to in_review
        try:
            supabase.table("project_stages").update({
                "status": "in_review",
                "requested_at": datetime.utcnow().isoformat()
            }).eq("id", stage_id).eq("project_id", project_id).execute()
            
        except Exception as update_error:
            # PostgREST fallback
            logging.warning(f"PostgREST update failed, using direct SQL: {update_error}")
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    UPDATE project_stages 
                    SET status = 'in_review', requested_at = NOW(), updated_at = NOW()
                    WHERE id = %s AND project_id = %s
                """, (stage_id, project_id))
        
        # Send sign-off email
        app_base_url = os.getenv("APP_BASE_URL", "http://localhost:5000")
        approve_url = f"{app_base_url}/signoff?stage_id={stage_id}&project_id={project_id}"
        
        html_content = f"""
        <html>
        <body>
            <p>Hello,</p>
            <p>Please review and sign off the stage: <b>{stage_id}</b>.</p>
            <p><a href="{approve_url}" style="background: #2563eb; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Open Sign-Off Page</a></p>
            {f'<p><strong>Message:</strong> {message}</p>' if message else ''}
            <p>— TEAIM</p>
        </body>
        </html>
        """
        
        _send_mailgun_email(email_to, "TEAIM: Stage sign-off requested", html_content)
        
        # Log audit event
        try:
            supabase.table("audit_events").insert({
                "org_id": ctx.org_id,
                "project_id": project_id,
                "actor_id": ctx.user_id,
                "kind": "stage.requested",
                "details": {"stage_id": stage_id, "email_to": email_to, "message": message}
            }).execute()
        except Exception as audit_error:
            # PostgREST fallback for audit
            logging.warning(f"Audit log PostgREST failed, using direct SQL: {audit_error}")
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO audit_events (org_id, project_id, actor_id, kind, details)
                    VALUES (%s, %s, %s, %s, %s)
                """, (ctx.org_id, project_id, ctx.user_id, 'stage.requested', json.dumps({"stage_id": stage_id, "email_to": email_to, "message": message})))
        
        return {"ok": True, "message": "Sign-off request sent"}
        
    except Exception as e:
        logging.error(f"Failed to request sign-off: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stages/decision")
def stage_decision(
    project_id: str = Query(...),
    stage_id: str = Body(...),
    decision: str = Body(...),
    notes: Optional[str] = Body(None),
    ctx: TenantCtx = Depends(SIGNER_OR_ADMIN)
):
    """Make a sign-off decision (approve/reject) for a stage (requires signer role)"""
    try:
        if decision not in ("approved", "rejected"):
            raise HTTPException(status_code=400, detail="Invalid decision - must be 'approved' or 'rejected'")
        
        supabase = get_supabase_client()
        status = "signed_off" if decision == "approved" else "rejected"
        
        # Enforce area authority when non-admin
        if ctx.role not in {"owner","admin"}:
            st = supabase.table("project_stages").select("area").eq("org_id", ctx.org_id).eq("project_id", project_id)\
                 .eq("id", stage_id).single().execute().data
            area = st and st.get("area")
            acc = supabase.table("project_member_access").select("can_sign_all,sign_areas")\
                  .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("user_id", ctx.user_id).limit(1).execute().data
            allowed = False
            if acc:
                a = acc[0]
                allowed = bool(a.get("can_sign_all")) or (area and area in (a.get("sign_areas") or []))
            if not allowed:
                # generic error to avoid info leak
                raise HTTPException(403, "Not authorized to sign this stage")
        
        # Update stage with decision
        try:
            supabase.table("project_stages").update({
                "status": status,
                "signoff_date": datetime.utcnow().isoformat(),
                "signoff_decision": decision,
                "signoff_notes": notes,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", stage_id).eq("project_id", project_id).execute()
            
        except Exception as update_error:
            # PostgREST fallback
            logging.warning(f"PostgREST update failed, using direct SQL: {update_error}")
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    UPDATE project_stages 
                    SET status = %s, signoff_date = NOW(), signoff_decision = %s, 
                        signoff_notes = %s, updated_at = NOW()
                    WHERE id = %s AND project_id = %s
                """, (status, decision, notes, stage_id, project_id))
        
        # Log audit event
        try:
            supabase.table("audit_events").insert({
                "org_id": ctx.org_id,
                "project_id": project_id,
                "actor_id": ctx.user_id,
                "kind": f"stage.{decision}",
                "details": {"stage_id": stage_id, "notes": notes}
            }).execute()
        except Exception as audit_error:
            # PostgREST fallback for audit
            logging.warning(f"Audit log PostgREST failed, using direct SQL: {audit_error}")
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO audit_events (org_id, project_id, actor_id, kind, details)
                    VALUES (%s, %s, %s, %s, %s)
                """, (ctx.org_id, project_id, ctx.user_id, f"stage.{decision}", json.dumps({"stage_id": stage_id, "notes": notes})))
        
        return {"ok": True, "status": status, "decision": decision}
        
    except Exception as e:
        logging.error(f"Failed to make stage decision: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stages/area-decision")
def stage_area_decision(
    project_id: str = Query(...),
    stage_id: str = Query(...),
    decision: str = Body(...),
    notes: Optional[str] = Body(None),
    ctx: TenantCtx = Depends(AREA_SIGNER)
):
    """Make an area-aware sign-off decision (approve/reject) for a stage with per-area authority checking"""
    try:
        if decision not in ("approved", "rejected"):
            raise HTTPException(status_code=400, detail="Invalid decision - must be 'approved' or 'rejected'")
        
        supabase = get_supabase_client()
        status = "signed_off" if decision == "approved" else "rejected"
        
        # Enforce area authority when non-admin (for area-decision route too)
        if ctx.role not in {"owner","admin"}:
            st = supabase.table("project_stages").select("area").eq("org_id", ctx.org_id).eq("project_id", project_id)\
                 .eq("id", stage_id).single().execute().data
            area = st and st.get("area")
            acc = supabase.table("project_member_access").select("can_sign_all,sign_areas")\
                  .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("user_id", ctx.user_id).limit(1).execute().data
            allowed = False
            if acc:
                a = acc[0]
                allowed = bool(a.get("can_sign_all")) or (area and area in (a.get("sign_areas") or []))
            if not allowed:
                # generic error to avoid info leak
                raise HTTPException(403, "Not authorized to sign this stage")
        
        # Get stage information including area for audit logging
        stage_area = None
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT area, title FROM project_stages 
                    WHERE id = %s AND project_id = %s AND org_id = %s
                    LIMIT 1
                """, (stage_id, project_id, ctx.org_id))
                
                stage_result = cur.fetchone()
                if stage_result:
                    stage_area, stage_title = stage_result
        except Exception:
            pass  # Continue without area info if query fails
        
        # Update stage with decision
        try:
            supabase.table("project_stages").update({
                "status": status,
                "signoff_date": datetime.utcnow().isoformat(),
                "signoff_decision": decision,
                "signoff_notes": notes,
                "signoff_by": ctx.user_id,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", stage_id).eq("project_id", project_id).eq("org_id", ctx.org_id).execute()
            
        except Exception as update_error:
            # PostgREST fallback
            logging.warning(f"PostgREST update failed, using direct SQL: {update_error}")
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    UPDATE project_stages 
                    SET status = %s, signoff_date = NOW(), signoff_decision = %s, 
                        signoff_notes = %s, signoff_by = %s, updated_at = NOW()
                    WHERE id = %s AND project_id = %s AND org_id = %s
                """, (status, decision, notes, ctx.user_id, stage_id, project_id, ctx.org_id))
        
        # Log audit event with area information
        audit_details = {
            "stage_id": stage_id, 
            "notes": notes, 
            "signoff_by": ctx.user_id,
            "area": stage_area,
            "authority_type": "area-based"
        }
        
        try:
            supabase.table("audit_events").insert({
                "org_id": ctx.org_id,
                "project_id": project_id,
                "actor_id": ctx.user_id,
                "kind": f"stage.{decision}",
                "details": audit_details
            }).execute()
        except Exception as audit_error:
            # PostgREST fallback for audit
            logging.warning(f"Audit log PostgREST failed, using direct SQL: {audit_error}")
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO audit_events (org_id, project_id, actor_id, kind, details)
                    VALUES (%s, %s, %s, %s, %s)
                """, (ctx.org_id, project_id, ctx.user_id, f"stage.{decision}", json.dumps(audit_details)))
        
        success_message = f"Stage {decision} successfully"
        if stage_area:
            success_message += f" (area: {stage_area})"
            
        return {"ok": True, "status": status, "decision": decision, "message": success_message, "area": stage_area}
        
    except Exception as e:
        logging.error(f"Failed to make area-based stage decision: {e}")
        raise HTTPException(status_code=500, detail=str(e))