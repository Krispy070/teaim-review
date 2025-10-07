from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ..tenant import TenantCtx, DEV_AUTH
from ..guards import require_role, member_ctx
from ..supabase_client import get_user_supabase, get_supabase_client as get_service_supabase
from ..db import get_conn
import datetime as dt, logging, json

router = APIRouter(prefix="/stage-templates", tags=["stage-templates"])

# Role requirement: PM+ can manage templates
PM_PLUS = require_role({"owner", "admin", "pm"})

def _now_iso(): 
    return dt.datetime.now(dt.timezone.utc).isoformat()

class StageData(BaseModel):
    name: str
    area: Optional[str] = None
    duration_days: Optional[int] = None

class StageTemplate(BaseModel):
    name: str
    description: Optional[str] = None
    stages: List[StageData]

class StageTemplateResponse(BaseModel):
    id: str
    org_id: str
    name: str
    description: Optional[str]
    stages: List[Dict[str, Any]]
    created_at: str
    updated_at: str

@router.get("/list")
def list_templates(ctx: TenantCtx = Depends(member_ctx)) -> List[StageTemplateResponse]:
    """List all stage templates for the organization"""
    # Handle dev mode authentication
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT id, org_id, name, description, stages, created_at, updated_at 
                    FROM org_stage_templates 
                    WHERE org_id = %s 
                    ORDER BY name ASC
                """, (ctx.org_id,))
                rows = cur.fetchall()
                
                templates = []
                if rows and cur.description:
                    columns = [desc[0] for desc in cur.description]
                    for row in rows:
                        data = dict(zip(columns, row))
                        # Parse JSON stages
                        data['stages'] = json.loads(data['stages']) if data['stages'] else []
                        templates.append(StageTemplateResponse(**data))
                
                logging.info(f"🔧 DEV: Retrieved {len(templates)} stage templates for org {ctx.org_id}")
                return templates
        except Exception as e:
            logging.error(f"Failed to fetch stage templates: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        result = sb.table("org_stage_templates").select("*").eq("org_id", ctx.org_id).order("name").execute()
        
        templates = []
        for item in result.data or []:
            # Ensure stages is properly parsed
            if isinstance(item.get('stages'), str):
                item['stages'] = json.loads(item['stages'])
            templates.append(StageTemplateResponse(**item))
        
        return templates

@router.get("/{template_id}")
def get_template(template_id: str, ctx: TenantCtx = Depends(member_ctx)) -> StageTemplateResponse:
    """Get a specific stage template by ID"""
    # Handle dev mode authentication
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT id, org_id, name, description, stages, created_at, updated_at 
                    FROM org_stage_templates 
                    WHERE id = %s AND org_id = %s
                """, (template_id, ctx.org_id))
                row = cur.fetchone()
                
                if not row:
                    raise HTTPException(status_code=404, detail="Template not found")
                
                if cur.description:
                    columns = [desc[0] for desc in cur.description]
                    data = dict(zip(columns, row))
                    # Parse JSON stages
                    data['stages'] = json.loads(data['stages']) if data['stages'] else []
                    return StageTemplateResponse(**data)
                else:
                    raise HTTPException(status_code=500, detail="Database query failed")
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"Failed to fetch stage template: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        result = sb.table("org_stage_templates").select("*").eq("id", template_id).eq("org_id", ctx.org_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")
        
        data = result.data
        # Ensure stages is properly parsed
        if isinstance(data.get('stages'), str):
            data['stages'] = json.loads(data['stages'])
        
        return StageTemplateResponse(**data)

@router.post("/create")
def create_template(template: StageTemplate, ctx: TenantCtx = Depends(PM_PLUS)) -> StageTemplateResponse:
    """Create a new stage template"""
    # Convert stages to JSON format
    stages_json = json.dumps([stage.dict() for stage in template.stages])
    
    # Handle dev mode authentication
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO org_stage_templates (org_id, name, description, stages, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, org_id, name, description, stages, created_at, updated_at
                """, (ctx.org_id, template.name, template.description, stages_json, _now_iso(), _now_iso()))
                
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=500, detail="Failed to create template")
                
                if cur.description:
                    columns = [desc[0] for desc in cur.description]
                    data = dict(zip(columns, row))
                    # Parse JSON stages
                    data['stages'] = json.loads(data['stages']) if data['stages'] else []
                    logging.info(f"🔧 DEV: Created stage template '{template.name}' for org {ctx.org_id}")
                    return StageTemplateResponse(**data)
                else:
                    raise HTTPException(status_code=500, detail="Database query failed")
        except Exception as e:
            logging.error(f"Failed to create stage template: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database operation failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        result = sb.table("org_stage_templates").insert({
            "org_id": ctx.org_id,
            "name": template.name,
            "description": template.description,
            "stages": stages_json,
            "created_at": _now_iso(),
            "updated_at": _now_iso()
        }).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create template")
        
        data = result.data
        # Parse JSON stages
        data['stages'] = json.loads(data['stages']) if data['stages'] else []
        return StageTemplateResponse(**data)

@router.put("/{template_id}")
def update_template(template_id: str, template: StageTemplate, ctx: TenantCtx = Depends(PM_PLUS)) -> StageTemplateResponse:
    """Update an existing stage template"""
    # Convert stages to JSON format
    stages_json = json.dumps([stage.dict() for stage in template.stages])
    
    # Handle dev mode authentication
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    UPDATE org_stage_templates 
                    SET name = %s, description = %s, stages = %s, updated_at = %s
                    WHERE id = %s AND org_id = %s
                    RETURNING id, org_id, name, description, stages, created_at, updated_at
                """, (template.name, template.description, stages_json, _now_iso(), template_id, ctx.org_id))
                
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Template not found")
                
                if cur.description:
                    columns = [desc[0] for desc in cur.description]
                    data = dict(zip(columns, row))
                    # Parse JSON stages
                    data['stages'] = json.loads(data['stages']) if data['stages'] else []
                    logging.info(f"🔧 DEV: Updated stage template '{template.name}' for org {ctx.org_id}")
                    return StageTemplateResponse(**data)
                else:
                    raise HTTPException(status_code=500, detail="Database query failed")
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"Failed to update stage template: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database operation failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        result = sb.table("org_stage_templates").update({
            "name": template.name,
            "description": template.description,
            "stages": stages_json,
            "updated_at": _now_iso()
        }).eq("id", template_id).eq("org_id", ctx.org_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")
        
        data = result.data
        # Parse JSON stages
        data['stages'] = json.loads(data['stages']) if data['stages'] else []
        return StageTemplateResponse(**data)

@router.delete("/{template_id}")
def delete_template(template_id: str, ctx: TenantCtx = Depends(require_role({"owner", "admin"}))) -> dict:
    """Delete a stage template (admin only)"""
    # Handle dev mode authentication
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM org_stage_templates 
                    WHERE id = %s AND org_id = %s
                    RETURNING id
                """, (template_id, ctx.org_id))
                
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Template not found")
                
                logging.info(f"🔧 DEV: Deleted stage template {template_id} for org {ctx.org_id}")
                return {"ok": True, "deleted_id": template_id}
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"Failed to delete stage template: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database operation failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        result = sb.table("org_stage_templates").delete().eq("id", template_id).eq("org_id", ctx.org_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")
        
        return {"ok": True, "deleted_id": template_id}