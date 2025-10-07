from fastapi import APIRouter, Body, HTTPException, Query
from .supabase_client import get_supabase_client
from typing import List, Dict, Optional
import logging

router = APIRouter()

# Default workstreams for new projects
DEFAULT_WORKSTREAMS = [
    "HCM", "Payroll", "Finance", "Integrations", "Security", "Reporting", "Cutover"
]

@router.post("/projects/create")
def create_project(
    org_id: str = Body(...),
    name: str = Body(...),
    code: str = Body(...),
    client_name: str = Body(...)
):
    """Create a new project with default workstreams"""
    try:
        supabase = get_supabase_client()
        
        # Check if code already exists for this org (with fallback)
        try:
            existing = supabase.table("projects").select("id").eq("org_id", org_id).eq("code", code).limit(1).execute().data
            if existing:
                return {"ok": False, "error": "Project code already exists"}
        except Exception as check_error:
            # If schema cache issue, try direct SQL check
            logging.warning(f"PostgREST check failed, using direct SQL: {check_error}")
            from .db import get_conn
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("SELECT id FROM projects WHERE org_id = %s AND code = %s LIMIT 1", (org_id, code))
                if cur.fetchone():
                    return {"ok": False, "error": "Project code already exists"}
        
        # Create project (with PostgREST fallback)
        project = None
        try:
            project_result = supabase.table("projects").insert({
                "org_id": org_id,
                "name": name,
                "code": code,
                "client_name": client_name,
                "status": "discovery",
                "lifecycle_status": "active"
            }).execute()
            
            if project_result.data:
                project = project_result.data[0]
                
        except Exception as insert_error:
            # PostgREST fallback using direct SQL
            logging.warning(f"PostgREST insert failed, using direct SQL: {insert_error}")
            from .db import get_conn
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO projects (org_id, name, code, client_name, status, lifecycle_status)
                    VALUES (%s, %s, %s, %s, 'discovery', 'active')
                    RETURNING id, org_id, name, code, client_name, status, lifecycle_status, created_at
                """, (org_id, name, code, client_name))
                row = cur.fetchone()
                if row:
                    project = {
                        "id": str(row[0]),
                        "org_id": str(row[1]),
                        "name": row[2],
                        "code": row[3],
                        "client_name": row[4],
                        "status": row[5],
                        "lifecycle_status": row[6],
                        "created_at": row[7].isoformat() if row[7] else None
                    }
                    # Reload PostgREST schema cache
                    cur.execute("SELECT pg_notify('pgrst', 'reload schema')")
        
        if not project:
            return {"ok": False, "error": "Failed to create project"}
        
        # Seed with default workstreams (with fallback)
        for i, workstream_name in enumerate(DEFAULT_WORKSTREAMS):
            try:
                supabase.table("workstreams").insert({
                    "org_id": org_id,
                    "project_id": project["id"],
                    "name": workstream_name,
                    "sort_order": i,
                    "is_active": True
                }).execute()
            except Exception as ws_error:
                # Fallback to direct SQL
                logging.warning(f"PostgREST workstream insert failed, using direct SQL: {ws_error}")
                try:
                    from .db import get_conn
                    with get_conn() as conn, conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO workstreams (org_id, project_id, name, sort_order, is_active)
                            VALUES (%s, %s, %s, %s, %s)
                        """, (org_id, project["id"], workstream_name, i, True))
                except Exception as sql_error:
                    logging.warning(f"Failed to create workstream {workstream_name}: {sql_error}")
        
        return {"ok": True, "project": project}
        
    except Exception as e:
        logging.error(f"Failed to create project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/onboarding/seed")
def onboarding_seed(
    org_id: str = Body(...),
    project_id: str = Body(...),
    contacts: List[Dict] = Body(default=[]),
    sow_text: Optional[str] = Body(default=None),
    workstreams: List[Dict] = Body(default=[])
):
    """Seed project with contacts, custom workstreams, and SOW data"""
    try:
        supabase = get_supabase_client()
        
        # Add contacts
        for contact in contacts:
            try:
                supabase.table("project_contacts").insert({
                    "org_id": org_id,
                    "project_id": project_id,
                    "name": contact.get("name", ""),
                    "email": contact.get("email", ""),
                    "role": contact.get("role", ""),
                    "workstream": contact.get("workstream", "")
                }).execute()
            except Exception as e:
                logging.warning(f"Failed to add contact {contact.get('name')}: {e}")
        
        # Replace workstreams if provided
        if workstreams:
            try:
                # Deactivate existing workstreams
                supabase.table("workstreams").update({"is_active": False}).eq("org_id", org_id).eq("project_id", project_id).execute()
                
                # Add new workstreams
                for i, ws in enumerate(workstreams[:30]):  # Limit to 30
                    supabase.table("workstreams").insert({
                        "org_id": org_id,
                        "project_id": project_id,
                        "name": ws.get("name", ""),
                        "description": ws.get("description", ""),
                        "sort_order": i,
                        "is_active": True
                    }).execute()
            except Exception as e:
                logging.warning(f"Failed to update workstreams: {e}")
        
        # TODO: Process SOW text when SOW parser is available
        if sow_text:
            logging.info(f"SOW text provided for project {project_id}, length: {len(sow_text)}")
            # Future: parse_sow(sow_text) and extract workstreams/phases
        
        return {"ok": True, "contacts_added": len(contacts), "workstreams_updated": len(workstreams)}
        
    except Exception as e:
        logging.error(f"Failed to seed project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/projects/list")
def list_projects(org_id: str = Query(...)):
    """List all projects for an organization"""
    try:
        supabase = get_supabase_client()
        
        # Try PostgREST first
        try:
            projects = supabase.table("projects").select(
                "id,name,code,status,lifecycle_status,archived_at,client_name,created_at"
            ).eq("org_id", org_id).order("created_at", desc=True).execute().data or []
            
            return {"items": projects}
            
        except Exception as supabase_error:
            # PostgREST fallback using direct SQL
            logging.warning(f"PostgREST list failed, using direct SQL: {supabase_error}")
            from .db import get_conn
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT id, name, code, status, lifecycle_status, archived_at, client_name, created_at
                    FROM projects 
                    WHERE org_id = %s 
                    ORDER BY created_at DESC
                """, (org_id,))
                rows = cur.fetchall()
                
                projects = []
                for row in rows:
                    projects.append({
                        "id": str(row[0]),
                        "name": row[1],
                        "code": row[2],
                        "status": row[3],
                        "lifecycle_status": row[4],
                        "archived_at": row[5].isoformat() if row[5] else None,
                        "client_name": row[6],
                        "created_at": row[7].isoformat() if row[7] else None
                    })
                
                # Reload PostgREST schema cache
                cur.execute("SELECT pg_notify('pgrst', 'reload schema')")
                
                return {"items": projects}
        
    except Exception as e:
        logging.error(f"Failed to list projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))