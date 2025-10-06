"""
Visibility enforcement guard for area-based access control.

This module provides functions to check and enforce user visibility permissions
based on their assigned visibility areas in the projectMemberAccess table.
"""

from fastapi import HTTPException
from typing import List, Optional, Dict, Any
from .tenant import TenantCtx
from .supabase_client import get_supabase_client
import logging

def get_user_visibility_areas(ctx: TenantCtx, project_id: str) -> tuple[bool, List[str]]:
    """
    Get user's visibility permissions for a project.
    Returns (can_view_all, visibility_areas)
    """
    try:
        sb = get_supabase_client()
        result = sb.table("project_member_access").select("can_view_all, visibility_areas")\
            .eq("org_id", ctx.org_id)\
            .eq("project_id", project_id)\
            .eq("user_id", ctx.user_id)\
            .limit(1).execute()
        
        if result.data:
            access = result.data[0]
            can_view_all = access.get("can_view_all", False)
            visibility_areas = access.get("visibility_areas", []) or []
            return can_view_all, visibility_areas
        else:
            # FAIL-CLOSED: No access record = no visibility access by default
            logging.warning(f"No project access record found for user {ctx.user_id} in project {project_id}")
            return False, []
            
    except Exception as e:
        logging.warning(f"Failed to get user visibility areas: {e}")
        # Fallback: try direct database query for development
        try:
            from .db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT can_view_all, visibility_areas 
                    FROM project_member_access 
                    WHERE org_id = %s AND project_id = %s AND user_id = %s
                    LIMIT 1
                """, (ctx.org_id, project_id, ctx.user_id))
                
                result = cur.fetchone()
                if result:
                    return result[0] or False, result[1] or []
                else:
                    # FAIL-CLOSED: No access record in fallback DB query
                    logging.warning(f"No project access record found in DB fallback for user {ctx.user_id} in project {project_id}")
                    return False, []
        except Exception as e2:
            logging.error(f"Visibility check fallback failed: {e2}")
            # FAIL-CLOSED: On all errors, only admin/owner get access
            if ctx.role in {"owner", "admin"}:
                return True, []
            return False, []  # Default to NO ACCESS for security

def filter_by_visibility_areas(items: List[Dict[str, Any]], can_view_all: bool, visibility_areas: List[str], area_field: str = "area") -> List[Dict[str, Any]]:
    """
    Filter a list of items based on visibility areas.
    
    Args:
        items: List of data items to filter
        can_view_all: Whether user can view all areas
        visibility_areas: List of areas user can view (only relevant if can_view_all is False)
        area_field: Name of the field containing the area information
    
    Returns:
        Filtered list of items
    """
    if can_view_all:
        return items
        
    if not visibility_areas:
        # User has limited visibility but no specific areas assigned -> no access
        return []
    
    filtered_items = []
    for item in items:
        item_area = item.get(area_field)
        
        # If item has no area assigned, include it (general items)
        if not item_area:
            filtered_items.append(item)
        # If item's area is in user's visibility areas, include it
        elif item_area in visibility_areas:
            filtered_items.append(item)
    
    return filtered_items

class VisibilityContext:
    """Container for visibility permission information"""
    def __init__(self, can_view_all: bool, visibility_areas: List[str]):
        self.can_view_all = can_view_all
        self.visibility_areas = visibility_areas

def get_visibility_context(ctx: TenantCtx, project_id: str) -> VisibilityContext:
    """
    Get user's visibility context for a project.
    Returns VisibilityContext with permissions information.
    """
    # Admin/owner roles always have full visibility
    if ctx.role in {"owner", "admin"}:
        return VisibilityContext(can_view_all=True, visibility_areas=[])
    
    # Get user's visibility permissions
    can_view_all, visibility_areas = get_user_visibility_areas(ctx, project_id)
    return VisibilityContext(can_view_all=can_view_all, visibility_areas=visibility_areas)

def apply_area_visibility_filter(query, visibility_ctx: VisibilityContext, area_column: str = "area"):
    """
    Apply visibility filtering to a Supabase query based on user's visibility areas.
    
    Args:
        query: Supabase query object
        visibility_ctx: VisibilityContext with permission information
        area_column: Name of the database column containing area information
    
    Returns:
        Modified query with visibility filters applied
    """
    # Users with can_view_all permission see everything
    if visibility_ctx.can_view_all:
        return query
    
    if not visibility_ctx.visibility_areas:
        # User has limited visibility but no areas assigned -> only see items with no area
        return query.is_(area_column, None)
    
    # Filter to show items with no area OR items in user's visibility areas
    # Properly escape area names to prevent filter injection
    quoted_areas = [f'"{area.replace(chr(34), chr(34)+chr(34))}"' for area in visibility_ctx.visibility_areas if area]
    if quoted_areas:
        return query.or_(f"{area_column}.is.null,{area_column}.in.({','.join(quoted_areas)})")
    else:
        # If no valid areas after filtering, only show items with no area
        return query.is_(area_column, None)