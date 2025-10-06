from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
import io, csv, json
from typing import Optional
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/export", tags=["export"])

def _csv(rows, headers, filename):
    def sanitize_cell(cell):
        """Prevent CSV injection by neutralizing formula-starting characters"""
        if isinstance(cell, str) and cell and cell[0] in ['=', '+', '-', '@']:
            return ' ' + cell  # Prefix with space to neutralize
        return cell
    
    buf = io.StringIO(); w = csv.writer(buf); w.writerow(headers)
    for r in rows: 
        sanitized_row = [sanitize_cell(r.get(h,"")) for h in headers]
        w.writerow(sanitized_row)
    buf.seek(0)
    return StreamingResponse(iter([buf.read()]), media_type="text/csv",
      headers={"Content-Disposition": f'attachment; filename="{filename}"'})

def _get_rows_with_fallback(ctx: TenantCtx, table_name: str, columns: str, project_id: str):
    """Get rows from database with fallback to direct connection in dev mode"""
    try:
        # Try Supabase first (works in production)
        sb = get_user_supabase(ctx)
        rows = sb.table(table_name).select(columns)\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .order("created_at", desc=False).execute().data or []
        return rows
    except HTTPException as e:
        if e.status_code == 401 and ctx.jwt is None:
            # Development mode fallback - use direct database access
            try:
                from ..db import get_conn
                
                # Convert comma-separated columns to proper SQL
                column_list = [col.strip() for col in columns.split(',')]
                column_sql = ', '.join(column_list)
                
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute(f"""
                        SELECT {column_sql}
                        FROM {table_name}
                        WHERE org_id = %s AND project_id = %s
                        ORDER BY created_at ASC
                    """, (ctx.org_id, project_id))
                    
                    results = cur.fetchall()
                    rows = []
                    for row in results:
                        row_dict = {}
                        for i, col in enumerate(column_list):
                            value = row[i]
                            # Convert datetime to ISO string if needed
                            if hasattr(value, 'isoformat'):
                                value = value.isoformat()
                            row_dict[col] = value
                        rows.append(row_dict)
                    return rows
            except Exception as db_e:
                raise HTTPException(500, f"Failed to fetch {table_name}: {str(db_e)}")
        else:
            raise e

@router.get("/actions.csv")
def actions_csv(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    # Try to get actions from the actions table with visibility filtering
    try:
        sb = get_user_supabase(ctx)
        query = sb.table("actions").select("id,title,owner,status,area,due_date,created_at")\
                  .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                  .order("created_at", desc=False)
        
        # Apply visibility filtering based on user's area permissions
        query = apply_area_visibility_filter(query, visibility_ctx, "area")
        
        rows = query.execute().data or []
        return _csv(rows, ["id","title","owner","status","area","due_date","created_at"], "actions.csv")
    except Exception:
        # Fallback: try direct database access for development
        rows = _get_rows_with_fallback(ctx, "actions", "id,title,owner,status,area,due_date,created_at", project_id)
        
        # Apply client-side visibility filtering for fallback
        from ..visibility_guard import filter_by_visibility_areas
        can_view_all, visibility_areas = visibility_ctx.can_view_all, visibility_ctx.visibility_areas
        rows = filter_by_visibility_areas(rows, can_view_all, visibility_areas, "area")
        
        return _csv(rows, ["id","title","owner","status","area","due_date","created_at"], "actions.csv")

@router.get("/risks.csv")
def risks_csv(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    # Try to get risks from the risks table with visibility filtering
    try:
        sb = get_user_supabase(ctx)
        query = sb.table("risks").select("id,title,severity,owner,area,status,created_at")\
                  .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                  .order("created_at", desc=False)
        
        # Apply visibility filtering based on user's area permissions
        query = apply_area_visibility_filter(query, visibility_ctx, "area")
        
        rows = query.execute().data or []
        return _csv(rows, ["id","title","severity","owner","area","status","created_at"], "risks.csv")
    except Exception:
        # Fallback: try direct database access for development
        rows = _get_rows_with_fallback(ctx, "risks", "id,title,severity,owner,area,status,created_at", project_id)
        
        # Apply client-side visibility filtering for fallback
        from ..visibility_guard import filter_by_visibility_areas
        can_view_all, visibility_areas = visibility_ctx.can_view_all, visibility_ctx.visibility_areas
        rows = filter_by_visibility_areas(rows, can_view_all, visibility_areas, "area")
        
        return _csv(rows, ["id","title","severity","owner","area","status","created_at"], "risks.csv")

@router.get("/decisions.csv")
def decisions_csv(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    # Try to get decisions from the decisions table with visibility filtering
    try:
        sb = get_user_supabase(ctx)
        query = sb.table("decisions").select("id,title,description,decided_by,area,status,created_at")\
                  .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                  .order("created_at", desc=False)
        
        # Apply visibility filtering based on user's area permissions
        query = apply_area_visibility_filter(query, visibility_ctx, "area")
        
        rows = query.execute().data or []
        return _csv(rows, ["id","title","description","decided_by","area","status","created_at"], "decisions.csv")
    except Exception:
        # Fallback: try direct database access for development
        rows = _get_rows_with_fallback(ctx, "decisions", "id,title,description,decided_by,area,status,created_at", project_id)
        
        # Apply client-side visibility filtering for fallback
        from ..visibility_guard import filter_by_visibility_areas
        can_view_all, visibility_areas = visibility_ctx.can_view_all, visibility_ctx.visibility_areas
        rows = filter_by_visibility_areas(rows, can_view_all, visibility_areas, "area")
        
        return _csv(rows, ["id","title","description","decided_by","area","status","created_at"], "decisions.csv")

def _apply_meetings_filters(meeting_data, filtered_summary, owner=None, area=None, confidence=None):
    """Apply owner, area, and confidence filtering to meeting summaries and return filtered counts"""
    # Extract risks, decisions, actions for filtering
    risks = filtered_summary.get("risks") or []
    decisions = filtered_summary.get("decisions") or []
    actions = filtered_summary.get("actions") or []
    
    # Apply filtering to each category
    filtered_risks = []
    filtered_decisions = []
    filtered_actions = []
    
    for item_list, filtered_list in [(risks, filtered_risks), (decisions, filtered_decisions), (actions, filtered_actions)]:
        for item in item_list:
            if not isinstance(item, dict):
                continue
                
            # Apply owner filtering
            if owner:
                item_owner = item.get("owner") or item.get("decided_by", "")
                if not (item_owner and owner.lower() in item_owner.lower()):
                    continue
            
            # Apply area filtering
            if area:
                item_area = item.get("area", "")
                if not (item_area and area.lower() in item_area.lower()):
                    continue
            
            # Apply confidence filtering
            if confidence is not None:
                item_confidence = item.get("confidence", 0)
                if not (isinstance(item_confidence, (int, float)) and item_confidence >= confidence):
                    continue
            
            filtered_list.append(item)
    
    # Return meeting if any filtered items exist, along with filtered counts
    if not owner and not area and confidence is None:
        # No filters applied, include all meetings
        return True, len(risks), len(decisions), len(actions)
    elif filtered_risks or filtered_decisions or filtered_actions:
        # Has matching items
        return True, len(filtered_risks), len(filtered_decisions), len(filtered_actions)
    else:
        # No matching items
        return False, 0, 0, 0

@router.get("/meetings.csv")
def meetings_csv(
    project_id: str = Query(...), 
    owner: str = Query(None), 
    area: str = Query(None),
    confidence: float = Query(None),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Export meetings with filtering capabilities for owner, area, and confidence levels"""
    from ..visibility_guard import get_visibility_context
    from ..meetings_api import _filter_summary_json_by_areas
    from ..supabase_client import get_user_supabase
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    try:
        sb = get_user_supabase(ctx)
        
        # Get artifacts (meetings) with their summaries
        arts = sb.table("artifacts").select("id,title,source,meeting_date,created_at") \
            .eq("org_id", ctx.org_id).eq("project_id", project_id) \
            .order("created_at", desc=False).execute().data or []
        
        if not arts:
            return _csv([], ["artifact_id","title","source","meeting_date","created_at","summary","risks_count","decisions_count","actions_count"], "meetings.csv")
            
        ids = [a["id"] for a in arts]
        sums = sb.table("summaries").select("artifact_id,summary,risks,decisions,actions") \
            .in_("artifact_id", ids).execute().data or []
        
        by_art = {s["artifact_id"]: s for s in sums}
        
        # Build CSV rows with filtering
        csv_rows = []
        for a in arts:
            s = by_art.get(a["id"], {})
            
            # Apply visibility filtering to JSON content within summaries
            filtered_summary = _filter_summary_json_by_areas(
                s, visibility_ctx.can_view_all, visibility_ctx.visibility_areas
            )
            
            # Apply additional filtering and get filtered counts
            should_include, risks_count, decisions_count, actions_count = _apply_meetings_filters(
                a, filtered_summary, owner, area, confidence
            )
            
            if not should_include:
                continue
            
            csv_rows.append({
                "artifact_id": a["id"],
                "title": a.get("title", ""),
                "source": a.get("source", ""),
                "meeting_date": a.get("meeting_date", ""),
                "created_at": a.get("created_at", ""),
                "summary": filtered_summary.get("summary", "")[:500] + ("..." if len(filtered_summary.get("summary", "")) > 500 else ""),  # Truncate for CSV
                "risks_count": risks_count,
                "decisions_count": decisions_count,
                "actions_count": actions_count
            })
        
        headers = ["artifact_id", "title", "source", "meeting_date", "created_at", "summary", "risks_count", "decisions_count", "actions_count"]
        return _csv(csv_rows, headers, "meetings.csv")
        
    except HTTPException:
        raise
    except Exception as e:
        # Fallback for development mode using direct database access
        try:
            from ..db import get_conn
            
            with get_conn() as conn, conn.cursor() as cur:
                # Get artifacts (meetings)
                cur.execute("""
                    SELECT id, title, source, meeting_date, created_at
                    FROM artifacts
                    WHERE org_id = %s AND project_id = %s
                    ORDER BY created_at ASC
                """, (ctx.org_id, project_id))
                
                arts = []
                for row in cur.fetchall():
                    arts.append({
                        "id": row[0],
                        "title": row[1],
                        "source": row[2],
                        "meeting_date": row[3].isoformat() if row[3] else "",
                        "created_at": row[4].isoformat() if row[4] else ""
                    })
                
                if not arts:
                    return _csv([], ["artifact_id","title","source","meeting_date","created_at","summary","risks_count","decisions_count","actions_count"], "meetings.csv")
                
                # Get summaries
                ids = [a["id"] for a in arts]
                placeholders = ",".join(["%s"] * len(ids))
                cur.execute(f"""
                    SELECT artifact_id, summary, risks, decisions, actions
                    FROM summaries
                    WHERE artifact_id IN ({placeholders})
                """, ids)
                
                sums_data = cur.fetchall()
                by_art = {}
                for row in sums_data:
                    by_art[row[0]] = {
                        "summary": row[1] or "",
                        "risks": row[2] or [],
                        "decisions": row[3] or [],
                        "actions": row[4] or []
                    }
                
                # Build CSV rows with proper filtering for fallback mode
                csv_rows = []
                for a in arts:
                    s = by_art.get(a["id"], {})
                    
                    # Apply visibility filtering to JSON content within summaries
                    filtered_summary = _filter_summary_json_by_areas(
                        s, visibility_ctx.can_view_all, visibility_ctx.visibility_areas
                    )
                    
                    # Apply additional filtering and get filtered counts
                    should_include, risks_count, decisions_count, actions_count = _apply_meetings_filters(
                        a, filtered_summary, owner, area, confidence
                    )
                    
                    if not should_include:
                        continue
                    
                    csv_rows.append({
                        "artifact_id": a["id"],
                        "title": a.get("title", ""),
                        "source": a.get("source", ""),
                        "meeting_date": a.get("meeting_date", ""),
                        "created_at": a.get("created_at", ""),
                        "summary": filtered_summary.get("summary", "")[:500] + ("..." if len(filtered_summary.get("summary", "")) > 500 else ""),
                        "risks_count": risks_count,
                        "decisions_count": decisions_count,
                        "actions_count": actions_count
                    })
                
                headers = ["artifact_id", "title", "source", "meeting_date", "created_at", "summary", "risks_count", "decisions_count", "actions_count"]
                return _csv(csv_rows, headers, "meetings.csv")
                
        except Exception as db_e:
            raise HTTPException(500, f"Failed to fetch meetings: {str(db_e)}")