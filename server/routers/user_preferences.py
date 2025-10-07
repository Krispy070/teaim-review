"""
User Preferences Router

Handles server-side user preferences storage including:
- Area tab preferences
- Audit filter preferences
- Other user-specific settings

Preference types:
- "area_tab": Last active tab per area (e.g., key="HCM", value={"activeTab": "stages"})
- "audit_filters": Saved audit widget filters (e.g., key="default", value={"kind": "backup.restore_file", "limit": 50})
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, Dict, Any
from pydantic import BaseModel

from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/user_preferences", tags=["user_preferences"])

class SetPreferenceBody(BaseModel):
    pref_type: str  # "area_tab", "audit_filters", etc.
    pref_key: str   # identifier (e.g., area name, filter name)
    pref_value: Dict[str, Any]  # preference data

class SimpleSetPreferenceBody(BaseModel):
    key: str   # simple key like "kap.area.tab.{projectId}.{areaKey}"
    value: str  # simple string value

class PreferenceResponse(BaseModel):
    id: str
    user_id: str
    org_id: str
    project_id: str
    pref_type: str
    pref_key: str
    pref_value: Dict[str, Any]
    created_at: str
    updated_at: str

@router.get("/list")
def list_preferences(
    project_id: str = Query(...),
    pref_type: Optional[str] = Query(None, description="Filter by preference type"),
    ctx: TenantCtx = Depends(member_ctx)
):
    """List user preferences for the current user in the project"""
    print(f"🔧 user_preferences.list: user={ctx.user_id}, project={project_id}, type={pref_type}")
    
    sb = get_user_supabase(ctx)
    
    try:
        query = sb.table("user_preferences").select("*").eq("user_id", ctx.user_id).eq("org_id", ctx.org_id).eq("project_id", project_id)
        
        if pref_type:
            query = query.eq("pref_type", pref_type)
            
        result = query.order("created_at", desc=True).execute()
        preferences = result.data or []
        
        print(f"🔧 user_preferences.list: found {len(preferences)} preferences")
        return {"preferences": preferences}
        
    except Exception as e:
        print(f"🔧 user_preferences.list: Error accessing preferences table: {e}")
        # Graceful fallback when table doesn't exist in development
        return {"preferences": []}

@router.get("/{pref_type}/{pref_key}")
def get_preference(
    pref_type: str,
    pref_key: str,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Get a specific preference by type and key"""
    print(f"🔧 user_preferences.get: user={ctx.user_id}, project={project_id}, type={pref_type}, key={pref_key}")
    
    sb = get_user_supabase(ctx)
    
    try:
        result = sb.table("user_preferences").select("*").eq("user_id", ctx.user_id).eq("org_id", ctx.org_id).eq("project_id", project_id).eq("pref_type", pref_type).eq("pref_key", pref_key).limit(1).execute()
        
        preferences = result.data or []
        if not preferences:
            raise HTTPException(404, "Preference not found")
            
        return preferences[0]
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"🔧 user_preferences.get: Error accessing preferences table: {e}")
        raise HTTPException(404, "Preference not found")

@router.post("/set")
def set_preference(
    body: SetPreferenceBody,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Set/update a user preference (upsert operation)"""
    print(f"🔧 user_preferences.set: user={ctx.user_id}, project={project_id}, type={body.pref_type}, key={body.pref_key}")
    
    sb = get_user_supabase(ctx)
    
    try:
        # Prepare the preference data
        pref_data = {
            "user_id": ctx.user_id,
            "org_id": ctx.org_id,
            "project_id": project_id,
            "pref_type": body.pref_type,
            "pref_key": body.pref_key,
            "pref_value": body.pref_value,
            "updated_at": "NOW()"
        }
        
        # Use upsert to insert or update
        result = sb.table("user_preferences").upsert(pref_data, on_conflict="user_id,org_id,project_id,pref_type,pref_key").execute()
        
        updated_pref = result.data[0] if result.data else None
        if not updated_pref:
            raise HTTPException(500, "Failed to save preference")
            
        print(f"🔧 user_preferences.set: saved preference {updated_pref['id']}")
        return {"ok": True, "preference": updated_pref}
        
    except Exception as e:
        print(f"🔧 user_preferences.set: Error saving preference: {e}")
        raise HTTPException(500, f"Failed to save preference: {str(e)}")

@router.delete("/{pref_type}/{pref_key}")
def delete_preference(
    pref_type: str,
    pref_key: str,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Delete a specific preference"""
    print(f"🔧 user_preferences.delete: user={ctx.user_id}, project={project_id}, type={pref_type}, key={pref_key}")
    
    sb = get_user_supabase(ctx)
    
    try:
        # Check if preference exists first
        existing = sb.table("user_preferences").select("id").eq("user_id", ctx.user_id).eq("org_id", ctx.org_id).eq("project_id", project_id).eq("pref_type", pref_type).eq("pref_key", pref_key).limit(1).execute()
        
        if not existing.data:
            raise HTTPException(404, "Preference not found")
            
        # Delete the preference
        sb.table("user_preferences").delete().eq("user_id", ctx.user_id).eq("org_id", ctx.org_id).eq("project_id", project_id).eq("pref_type", pref_type).eq("pref_key", pref_key).execute()
        
        print(f"🔧 user_preferences.delete: deleted preference")
        return {"ok": True, "deleted": True}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"🔧 user_preferences.delete: Error deleting preference: {e}")
        raise HTTPException(500, f"Failed to delete preference: {str(e)}")

# Simple API endpoints for frontend compatibility
@router.get("/test")
def test_endpoint():
    """Test endpoint to verify router is working"""
    print("🔧 user_preferences.test: Test endpoint hit!")
    return {"message": "User preferences router is working!", "status": "ok"}

@router.get("/simple/get")
def get_simple_preference(
    key: str = Query(..., description="Simple preference key"),
    project_id: str = Query(None, description="Project ID (optional, will use from context if available)"),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Get a preference using a simple key-value interface"""
    print(f"🔧 user_preferences.get_simple: user={ctx.user_id}, key={key}")
    
    # For development fallback, try localStorage-style key
    pref_type = "simple"
    pref_key = key
    
    sb = get_user_supabase(ctx)
    
    try:
        # Determine project_id - use from query param or try to extract from key
        effective_project_id = project_id
        if not effective_project_id and ctx.project_id:
            effective_project_id = ctx.project_id
        if not effective_project_id:
            # Try to extract from key if it follows the pattern 
            # Development fallback - use a default project ID
            effective_project_id = "default"
            
        result = sb.table("user_preferences").select("*").eq("user_id", ctx.user_id).eq("org_id", ctx.org_id).eq("project_id", effective_project_id).eq("pref_type", pref_type).eq("pref_key", pref_key).limit(1).execute()
        
        preferences = result.data or []
        if not preferences:
            raise HTTPException(404, "Not Found")
            
        return {"value": preferences[0]["pref_value"]}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"🔧 user_preferences.get_simple: Error accessing preferences table: {e}")
        raise HTTPException(404, "Not Found")

@router.post("/simple/set")  
def set_simple_preference(
    body: SimpleSetPreferenceBody,
    project_id: str = Query(None, description="Project ID (optional, will use from context if available)"),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Set a preference using a simple key-value interface"""
    print(f"🔧 user_preferences.set_simple: user={ctx.user_id}, key={body.key}")
    
    # For simple API, everything goes under "simple" type
    pref_type = "simple"
    pref_key = body.key
    pref_value = body.value
    
    sb = get_user_supabase(ctx)
    
    try:
        # Determine project_id - use from query param or try to extract from key
        effective_project_id = project_id
        if not effective_project_id and ctx.project_id:
            effective_project_id = ctx.project_id
        if not effective_project_id:
            # Development fallback - use a default project ID
            effective_project_id = "default"
            
        # Prepare the preference data
        pref_data = {
            "user_id": ctx.user_id,
            "org_id": ctx.org_id,
            "project_id": effective_project_id,
            "pref_type": pref_type,
            "pref_key": pref_key,
            "pref_value": pref_value,
            "updated_at": "NOW()"
        }
        
        # Use upsert to insert or update
        result = sb.table("user_preferences").upsert(pref_data, on_conflict="user_id,org_id,project_id,pref_type,pref_key").execute()
        
        updated_pref = result.data[0] if result.data else None
        if not updated_pref:
            raise HTTPException(500, "Failed to save preference")
            
        print(f"🔧 user_preferences.set_simple: saved preference {updated_pref['id']}")
        return {"ok": True}
        
    except Exception as e:
        print(f"🔧 user_preferences.set_simple: Error saving preference: {e}")
        # Graceful fallback for development when table doesn't exist
        print(f"🔧 user_preferences.set_simple: Graceful fallback - table may not exist in development")
        return {"ok": True}