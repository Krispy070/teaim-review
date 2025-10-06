from fastapi import APIRouter, Body, HTTPException, Depends
from pydantic import BaseModel, Field
from uuid import uuid4
import json
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="", tags=["corrections"])

class CorrectionBody(BaseModel):
    projectId: str = Field(..., alias="project_id")
    transcriptId: str = Field(..., alias="transcript_id")
    itemType: str = Field(..., alias="item_type")        # "test"
    itemId: str = Field(..., alias="item_id")           # library item id (tests_library.id)
    reason: str | None = None
    fields: dict         # fields to change (e.g., {"title": "...", "gherkin": "..."} )
    createdBy: str | None = Field(None, alias="created_by")

    class Config:
        allow_population_by_field_name = True

@router.post("/corrections")
async def apply_correction(body: CorrectionBody, ctx: TenantCtx = Depends(member_ctx)):
    """Apply correction to a test, creating new version with supersede history"""
    
    if body.itemType != "test":
        raise HTTPException(status_code=400, detail="Only itemType='test' supported in this phase")

    # Get supabase client
    sb = get_user_supabase(ctx)
    
    # 1) Load current library test
    try:
        result = sb.table("tests_library").select("*").eq("org_id", ctx.org_id).eq("project_id", body.projectId).eq("id", body.itemId).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Test not found")
            
        cur = result.data[0]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load test: {str(e)}")

    # 2) Prepare new record (version +1)  
    new_id = str(uuid4())
    new_ver = (cur.get("version", 0) or 0) + 1
    
    after = {
        **cur,
        "id": new_id,
        "version": new_ver,
        "title": body.fields.get("title", cur.get("title")),
        "gherkin": body.fields.get("gherkin", cur.get("gherkin")),
        "steps": body.fields.get("steps", cur.get("steps")),
        "priority": body.fields.get("priority", cur.get("priority")),
        "type": body.fields.get("type", cur.get("type")),
        "tags": body.fields.get("tags", cur.get("tags"))
    }

    # 3) Insert new version into tests_library
    try:
        sb.table("tests_library").insert({
            "id": new_id,
            "org_id": ctx.org_id, 
            "project_id": body.projectId,
            "area_key": cur.get("area_key"),
            "bp_code": cur.get("bp_code"),
            "title": after["title"],
            "version": new_ver,
            "gherkin": after["gherkin"], 
            "steps": after["steps"],
            "priority": after["priority"],
            "type": after["type"],
            "tags": after["tags"],
            "source_transcript_id": body.transcriptId,
            "created_by": body.createdBy
        }).execute()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create new test version: {str(e)}")

    # 4) Write history record
    diff_data = {
        "reason": body.reason,
        "correction": body.fields,
        "fromTranscript": body.transcriptId
    }
    
    try:
        sb.table("tests_history").insert({
            "id": str(uuid4()),
            "org_id": ctx.org_id,
            "project_id": body.projectId,
            "test_id": new_id,
            "version": new_ver,
            "diff": diff_data,
            "reason": body.reason or "Transcript correction",
            "source_transcript_id": body.transcriptId,
            "committed_by": body.createdBy
        }).execute()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create history record: {str(e)}")

    # 5) Write correction record
    correction_diff = {"before": cur, "after": after}
    
    try:
        sb.table("corrections").insert({
            "id": str(uuid4()),
            "org_id": ctx.org_id,
            "project_id": body.projectId,
            "transcript_id": body.transcriptId,
            "item_type": "test",
            "item_id": body.itemId,
            "reason": body.reason,
            "diff": correction_diff,
            "created_by": body.createdBy
        }).execute()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create correction record: {str(e)}")

    # 6) Write supersede record
    try:
        sb.table("supersedes").insert({
            "id": str(uuid4()),
            "org_id": ctx.org_id,
            "project_id": body.projectId,
            "item_type": "test",
            "old_id": body.itemId,
            "new_id": new_id,
            "reason": body.reason,
            "created_by": body.createdBy
        }).execute()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create supersede record: {str(e)}")

    return {
        "ok": True, 
        "newId": new_id, 
        "version": new_ver,
        "message": f"Test corrected successfully (v{new_ver})"
    }