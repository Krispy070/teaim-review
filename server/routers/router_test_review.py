# server/routers/router_test_review.py
from fastapi import APIRouter, Query, Body, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
import uuid
import hashlib

test_review_router = APIRouter(tags=["test_review"])
PM_PLUS = require_role({"owner", "admin", "pm"})

# ---------- Schemas ----------
class StagingTestItem(BaseModel):
    id: str
    transcriptId: Optional[str] = None
    dedupeKey: str
    title: str
    gherkin: str
    steps: List[str] = []
    areaKey: Optional[str] = None
    bpCode: Optional[str] = None
    priority: str = "P2"
    type: str = "happy"
    ownerHint: Optional[str] = None
    tags: List[str] = []
    trace: List[str] = []
    confidence: float
    createdAt: Optional[datetime] = None

class TestOverrides(BaseModel):
    areaKey: Optional[str] = None
    bpCode: Optional[str] = None
    priority: Optional[str] = None
    type: Optional[str] = None
    title: Optional[str] = None
    ownerHint: Optional[str] = None
    tags: Optional[List[str]] = None

class ApprovedTestItem(BaseModel):
    id: str
    overrides: Optional[TestOverrides] = None

class EditedTestItem(BaseModel):
    id: str
    title: Optional[str] = None
    gherkin: Optional[str] = None
    steps: Optional[List[str]] = None
    areaKey: Optional[str] = None
    bpCode: Optional[str] = None
    priority: Optional[str] = None
    type: Optional[str] = None
    tags: Optional[List[str]] = None

class TestCommitRequest(BaseModel):
    project_id: str = Field(..., description="Project UUID")
    approved: List[ApprovedTestItem] = []
    rejected: List[str] = []
    edited: List[EditedTestItem] = []

class TestLibraryItem(BaseModel):
    id: str
    areaKey: Optional[str] = None
    bpCode: Optional[str] = None
    title: str
    version: int
    gherkin: str
    steps: List[str]
    priority: str
    type: str
    tags: List[str]
    sourceTranscriptId: Optional[str] = None
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None

# ---------- Helper Functions ----------
def normalize_gherkin(title: str, gherkin: str, area_key: Optional[str], test_type: str) -> str:
    """Format gherkin into a clean template"""
    if not gherkin.strip():
        return f"""Feature: {area_key or 'General'} — {title}

Background:
  Given I am an authenticated user in the tenant

Scenario: {test_type.title()} — {title}
  Given the system is ready
  When I perform the test
  Then it should work as expected
"""
    
    # If it doesn't start with Feature, wrap it
    if not gherkin.strip().startswith("Feature:"):
        return f"""Feature: {area_key or 'General'} — {title}

Background:
  Given I am an authenticated user in the tenant

Scenario: {test_type.title()} — {title}
{gherkin}
"""
    
    return gherkin

def generate_dedupe_key(title: str, bp_code: Optional[str], area_key: Optional[str]) -> str:
    """Generate consistent dedupe key for tests"""
    normalized = f"{title.lower().strip()}|{bp_code or ''}|{area_key or ''}"
    return hashlib.md5(normalized.encode()).hexdigest()[:32]

# ---------- Endpoints ----------
@test_review_router.get("/admin/review/tests")
def list_staging_tests(
    project_id: str = Query(..., description="Project UUID"),
    ctx: TenantCtx = Depends(member_ctx)
):
    """List staged tests pending PM review"""
    sb = get_user_supabase(ctx)
    
    try:
        # Get staging tests for this project
        result = sb.table("staging_tests").select(
            "id, transcript_id, dedupe_key, title, gherkin, steps, area_key, bp_code, "
            "priority, type, owner_hint, tags, trace, confidence, created_at"
        ).eq("org_id", ctx.org_id).eq("project_id", project_id).order("confidence", desc=True).execute()
        
        if not result.data:
            return {"ok": True, "items": []}
        
        # Convert to response format
        items = []
        for row in result.data:
            items.append(StagingTestItem(
                id=row["id"],
                transcriptId=row.get("transcript_id"),
                dedupeKey=row["dedupe_key"],
                title=row["title"],
                gherkin=row["gherkin"],
                steps=row.get("steps", []),
                areaKey=row.get("area_key"),
                bpCode=row.get("bp_code"),
                priority=row.get("priority", "P2"),
                type=row.get("type", "happy"),
                ownerHint=row.get("owner_hint"),
                tags=row.get("tags", []),
                trace=row.get("trace", []),
                confidence=float(row["confidence"]),
                createdAt=row.get("created_at")
            ))
        
        return {"ok": True, "items": items}
        
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to load staging tests: {str(e)}")

@test_review_router.post("/admin/review/tests/commit")
def commit_test_reviews(
    payload: TestCommitRequest = Body(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Approve, edit, or reject test candidates"""
    sb = get_user_supabase(ctx)
    
    try:
        # Process approved tests
        applied_counts = {"approved": 0, "rejected": 0, "edited": 0}
        
        # Handle approvals with optional overrides
        for approved in payload.approved:
            # Get the original staging test
            staging_result = sb.table("staging_tests").select("*").eq(
                "id", approved.id
            ).eq("org_id", ctx.org_id).eq("project_id", payload.project_id).single().execute()
            
            if not staging_result.data:
                continue
            
            staging_test = staging_result.data
            
            # Apply overrides
            final_title = approved.overrides.title if approved.overrides and approved.overrides.title else staging_test["title"]
            final_area = approved.overrides.areaKey if approved.overrides and approved.overrides.areaKey else staging_test.get("area_key")
            final_bp = approved.overrides.bpCode if approved.overrides and approved.overrides.bpCode else staging_test.get("bp_code")
            final_priority = approved.overrides.priority if approved.overrides and approved.overrides.priority else staging_test.get("priority", "P2")
            final_type = approved.overrides.type if approved.overrides and approved.overrides.type else staging_test.get("type", "happy")
            final_tags = approved.overrides.tags if approved.overrides and approved.overrides.tags else staging_test.get("tags", [])
            
            # Normalize gherkin
            final_gherkin = normalize_gherkin(final_title, staging_test["gherkin"], final_area, final_type)
            
            # Check if test exists in library (by dedupe key)
            existing_result = sb.table("tests_library").select("id, version").eq(
                "org_id", ctx.org_id
            ).eq("project_id", payload.project_id).eq("area_key", final_area).eq("bp_code", final_bp).eq("title", final_title).execute()
            
            if existing_result.data:
                # Update existing test (increment version)
                existing_test = existing_result.data[0]
                new_version = existing_test["version"] + 1
                
                # Create history record
                sb.table("tests_history").insert({
                    "org_id": ctx.org_id,
                    "project_id": payload.project_id,
                    "test_id": existing_test["id"],
                    "version": new_version,
                    "diff": {
                        "before": {"version": existing_test["version"]},
                        "after": {"version": new_version, "updated_from_transcript": True}
                    },
                    "reason": "transcript_approval",
                    "source_transcript_id": staging_test.get("transcript_id"),
                    "committed_by": ctx.user_id
                }).execute()
                
                # Update test library
                sb.table("tests_library").update({
                    "version": new_version,
                    "gherkin": final_gherkin,
                    "steps": staging_test.get("steps", []),
                    "priority": final_priority,
                    "type": final_type,
                    "tags": final_tags,
                    "source_transcript_id": staging_test.get("transcript_id")
                }).eq("id", existing_test["id"]).execute()
                
            else:
                # Create new test in library
                sb.table("tests_library").insert({
                    "id": str(uuid.uuid4()),
                    "org_id": ctx.org_id,
                    "project_id": payload.project_id,
                    "area_key": final_area,
                    "bp_code": final_bp,
                    "title": final_title,
                    "version": 1,
                    "gherkin": final_gherkin,
                    "steps": staging_test.get("steps", []),
                    "priority": final_priority,
                    "type": final_type,
                    "tags": final_tags,
                    "source_transcript_id": staging_test.get("transcript_id"),
                    "created_by": ctx.user_id
                }).execute()
            
            # Remove from staging
            sb.table("staging_tests").delete().eq("id", approved.id).execute()
            applied_counts["approved"] += 1
        
        # Handle edited tests
        for edited in payload.edited:
            staging_result = sb.table("staging_tests").select("*").eq(
                "id", edited.id
            ).eq("org_id", ctx.org_id).eq("project_id", payload.project_id).single().execute()
            
            if not staging_result.data:
                continue
            
            # Update staging test with edits
            update_data = {}
            if edited.title: update_data["title"] = edited.title
            if edited.gherkin: update_data["gherkin"] = edited.gherkin
            if edited.steps is not None: update_data["steps"] = edited.steps
            if edited.areaKey: update_data["area_key"] = edited.areaKey
            if edited.bpCode: update_data["bp_code"] = edited.bpCode
            if edited.priority: update_data["priority"] = edited.priority
            if edited.type: update_data["type"] = edited.type
            if edited.tags is not None: update_data["tags"] = edited.tags
            
            if update_data:
                sb.table("staging_tests").update(update_data).eq("id", edited.id).execute()
                applied_counts["edited"] += 1
        
        # Handle rejections
        for rejected_id in payload.rejected:
            sb.table("staging_tests").delete().eq("id", rejected_id).eq(
                "org_id", ctx.org_id
            ).eq("project_id", payload.project_id).execute()
            applied_counts["rejected"] += 1
        
        return {
            "ok": True, 
            "appliedCounts": applied_counts,
            "notificationsQueued": 0  # Future: implement PM notifications
        }
        
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to commit test reviews: {str(e)}")

@test_review_router.get("/admin/tests/library")
def list_test_library(
    project_id: str = Query(..., description="Project UUID"),
    area_key: Optional[str] = Query(None, description="Filter by area"),
    ctx: TenantCtx = Depends(member_ctx)
):
    """List approved tests in the library"""
    sb = get_user_supabase(ctx)
    
    try:
        query = sb.table("tests_library").select(
            "id, area_key, bp_code, title, version, gherkin, steps, "
            "priority, type, tags, source_transcript_id, created_by, created_at"
        ).eq("org_id", ctx.org_id).eq("project_id", project_id)
        
        if area_key:
            query = query.eq("area_key", area_key)
        
        result = query.order("created_at.desc").execute()
        
        if not result.data:
            return {"ok": True, "items": []}
        
        # Convert to response format
        items = []
        for row in result.data:
            items.append(TestLibraryItem(
                id=row["id"],
                areaKey=row.get("area_key"),
                bpCode=row.get("bp_code"),
                title=row["title"],
                version=row["version"],
                gherkin=row["gherkin"],
                steps=row.get("steps", []),
                priority=row["priority"],
                type=row["type"],
                tags=row.get("tags", []),
                sourceTranscriptId=row.get("source_transcript_id"),
                createdBy=row.get("created_by"),
                createdAt=row.get("created_at")
            ))
        
        return {"ok": True, "items": items}
        
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to load test library: {str(e)}")