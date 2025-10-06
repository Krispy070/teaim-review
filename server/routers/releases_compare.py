from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List, Dict, Any
import datetime as dt
from ..guards import require_role, member_ctx
from ..supabase_client import get_supabase_client
from ..tenant import TenantCtx

router = APIRouter()

@router.get("/compare")
def compare_releases(
    project_id: str = Query(...),
    release_a: str = Query(..., description="First release ID or version"),
    release_b: str = Query(..., description="Second release ID or version"),
    format: str = Query("json", description="Output format: json or html"),
    ctx: TenantCtx = Depends(require_role({"admin", "owner", "pm"}))
):
    """Compare two releases and show differences in changes, deployments, and features"""
    sb = get_supabase_client()
    
    try:
        # Get release A details
        release_a_data = sb.table("releases").select("""
            id, version, title, description, status, planned_date, actual_date,
            created_at, updated_at
        """).eq("org_id", ctx.org_id).eq("project_id", project_id)\
           .or_(f"id.eq.{release_a},version.eq.{release_a}").limit(1).execute().data
        
        # Get release B details  
        release_b_data = sb.table("releases").select("""
            id, version, title, description, status, planned_date, actual_date,
            created_at, updated_at
        """).eq("org_id", ctx.org_id).eq("project_id", project_id)\
           .or_(f"id.eq.{release_b},version.eq.{release_b}").limit(1).execute().data
        
        if not release_a_data or not release_b_data:
            raise HTTPException(404, "One or both releases not found")
        
        rel_a = release_a_data[0]
        rel_b = release_b_data[0]
        
        # Get changes for each release
        changes_a = sb.table("changes").select("""
            id, title, status, priority, assignee, area, created_at, updated_at
        """).eq("org_id", ctx.org_id).eq("project_id", project_id)\
           .eq("target_release", rel_a["version"]).execute().data or []
        
        changes_b = sb.table("changes").select("""
            id, title, status, priority, assignee, area, created_at, updated_at  
        """).eq("org_id", ctx.org_id).eq("project_id", project_id)\
           .eq("target_release", rel_b["version"]).execute().data or []
        
        # Compare changes
        changes_a_ids = {cr["id"] for cr in changes_a}
        changes_b_ids = {cr["id"] for cr in changes_b}
        
        added_changes = [cr for cr in changes_b if cr["id"] not in changes_a_ids]
        removed_changes = [cr for cr in changes_a if cr["id"] not in changes_b_ids]
        common_changes = [cr for cr in changes_b if cr["id"] in changes_a_ids]
        
        # Calculate timeline differences
        a_planned = rel_a.get("planned_date")
        a_actual = rel_a.get("actual_date")
        b_planned = rel_b.get("planned_date")
        b_actual = rel_b.get("actual_date")
        
        timeline_diff = {}
        if a_planned and b_planned:
            timeline_diff["planned_shift_days"] = _date_diff_days(a_planned, b_planned)
        if a_actual and b_actual:
            timeline_diff["actual_shift_days"] = _date_diff_days(a_actual, b_actual)
        
        comparison = {
            "release_a": rel_a,
            "release_b": rel_b,
            "changes_summary": {
                "added_count": len(added_changes),
                "removed_count": len(removed_changes), 
                "common_count": len(common_changes),
                "total_a": len(changes_a),
                "total_b": len(changes_b)
            },
            "changes_added": added_changes,
            "changes_removed": removed_changes,
            "changes_common": common_changes,
            "timeline_diff": timeline_diff
        }
        
        if format == "html":
            html = _generate_comparison_html(comparison)
            return {"html": html}
        
        return comparison
        
    except Exception as e:
        # Dev-safe: return empty comparison if tables don't exist
        if "not found" in str(e).lower() or "relation" in str(e).lower():
            return {
                "release_a": {"version": release_a},
                "release_b": {"version": release_b},
                "changes_summary": {"error": "Release data not available"},
                "changes_added": [],
                "changes_removed": [],
                "changes_common": [],
                "timeline_diff": {}
            }
        raise HTTPException(500, f"Comparison failed: {str(e)}")

@router.get("/notes")
def generate_release_notes(
    project_id: str = Query(...),
    release_id: str = Query(..., description="Release ID or version"),
    format: str = Query("html", description="Output format: html or markdown"),
    include_sections: List[str] = Query(["features", "fixes", "breaking"], description="Sections to include"),
    ctx: TenantCtx = Depends(require_role({"admin", "owner", "pm"}))
):
    """Generate release notes HTML for a specific release"""
    sb = get_supabase_client()
    
    try:
        # Get release details
        release_data = sb.table("releases").select("""
            id, version, title, description, status, planned_date, actual_date,
            created_at, updated_at
        """).eq("org_id", ctx.org_id).eq("project_id", project_id)\
           .or_(f"id.eq.{release_id},version.eq.{release_id}").limit(1).execute().data
        
        if not release_data:
            raise HTTPException(404, "Release not found")
        
        release = release_data[0]
        
        # Get changes for this release
        changes = sb.table("changes").select("""
            id, title, description, status, priority, assignee, area, risk,
            created_at, updated_at
        """).eq("org_id", ctx.org_id).eq("project_id", project_id)\
           .eq("target_release", release["version"]).execute().data or []
        
        # Categorize changes
        features = [cr for cr in changes if _is_feature(cr)]
        fixes = [cr for cr in changes if _is_fix(cr)]
        breaking_changes = [cr for cr in changes if _is_breaking(cr)]
        other_changes = [cr for cr in changes if not (_is_feature(cr) or _is_fix(cr) or _is_breaking(cr))]
        
        # Generate release notes
        notes_data = {
            "release": release,
            "features": features if "features" in include_sections else [],
            "fixes": fixes if "fixes" in include_sections else [],
            "breaking_changes": breaking_changes if "breaking" in include_sections else [],
            "other_changes": other_changes if "other" in include_sections else [],
            "total_changes": len(changes),
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat()
        }
        
        if format == "html":
            html = _generate_release_notes_html(notes_data)
            return {"html": html}
        elif format == "markdown":
            md = _generate_release_notes_markdown(notes_data)
            return {"markdown": md}
        
        return notes_data
        
    except Exception as e:
        # Dev-safe fallback
        if "not found" in str(e).lower() or "relation" in str(e).lower():
            return {
                "release": {"version": release_id},
                "features": [],
                "fixes": [],
                "breaking_changes": [],
                "other_changes": [],
                "total_changes": 0,
                "error": "Release data not available"
            }
        raise HTTPException(500, f"Release notes generation failed: {str(e)}")

@router.get("/list")
def list_releases(
    project_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    ctx: TenantCtx = Depends(require_role({"admin", "owner", "pm"}))
):
    """List releases for comparison selection"""
    sb = get_supabase_client()
    
    try:
        query = sb.table("releases").select("""
            id, version, title, status, planned_date, actual_date, created_at
        """).eq("org_id", ctx.org_id).eq("project_id", project_id)
        
        if status:
            query = query.eq("status", status)
        
        releases = query.order("created_at", desc=True).limit(limit).execute().data or []
        
        return {"releases": releases}
        
    except Exception:
        # Dev-safe fallback
        return {"releases": []}

# Helper functions
def _date_diff_days(date_a: str, date_b: str) -> int:
    """Calculate difference in days between two date strings"""
    try:
        dt_a = dt.datetime.fromisoformat(date_a.replace("Z", "+00:00"))
        dt_b = dt.datetime.fromisoformat(date_b.replace("Z", "+00:00"))
        return (dt_b.date() - dt_a.date()).days
    except Exception:
        return 0

def _is_feature(cr: Dict[str, Any]) -> bool:
    """Determine if a change request is a feature"""
    title = (cr.get("title") or "").lower()
    desc = (cr.get("description") or "").lower()
    return any(keyword in title or keyword in desc for keyword in [
        "feature", "enhancement", "add", "new", "implement"
    ])

def _is_fix(cr: Dict[str, Any]) -> bool:
    """Determine if a change request is a fix"""
    title = (cr.get("title") or "").lower()
    desc = (cr.get("description") or "").lower()
    return any(keyword in title or keyword in desc for keyword in [
        "fix", "bug", "resolve", "repair", "correct"
    ])

def _is_breaking(cr: Dict[str, Any]) -> bool:
    """Determine if a change request is a breaking change"""
    title = (cr.get("title") or "").lower()
    desc = (cr.get("description") or "").lower()
    priority = (cr.get("priority") or "").lower()
    return "breaking" in title or "breaking" in desc or priority == "urgent"

def _generate_comparison_html(comparison: Dict[str, Any]) -> str:
    """Generate HTML for release comparison"""
    rel_a = comparison["release_a"]
    rel_b = comparison["release_b"]
    summary = comparison["changes_summary"]
    
    html = f"""
    <div class="release-comparison">
        <h2>Release Comparison</h2>
        <div class="releases-header">
            <div class="release-info">
                <h3>{rel_a.get("version", "Unknown")} - {rel_a.get("title", "")}</h3>
                <p>Status: {rel_a.get("status", "Unknown")}</p>
                <p>Planned: {rel_a.get("planned_date", "Not set")}</p>
            </div>
            <div class="vs">VS</div>
            <div class="release-info">
                <h3>{rel_b.get("version", "Unknown")} - {rel_b.get("title", "")}</h3>
                <p>Status: {rel_b.get("status", "Unknown")}</p>
                <p>Planned: {rel_b.get("planned_date", "Not set")}</p>
            </div>
        </div>
        
        <div class="changes-summary">
            <h3>Changes Summary</h3>
            <ul>
                <li>Added: {summary["added_count"]} changes</li>
                <li>Removed: {summary["removed_count"]} changes</li>
                <li>Common: {summary["common_count"]} changes</li>
            </ul>
        </div>
        
        <div class="added-changes">
            <h3>Added Changes ({summary["added_count"]})</h3>
            {_format_changes_list(comparison["changes_added"])}
        </div>
        
        <div class="removed-changes">
            <h3>Removed Changes ({summary["removed_count"]})</h3>
            {_format_changes_list(comparison["changes_removed"])}
        </div>
    </div>
    """
    
    return html

def _generate_release_notes_html(notes_data: Dict[str, Any]) -> str:
    """Generate HTML release notes"""
    release = notes_data["release"]
    
    html = f"""
    <div class="release-notes">
        <h1>Release {release.get("version", "Unknown")}</h1>
        <h2>{release.get("title", "")}</h2>
        <p class="release-date">Released: {release.get("actual_date") or release.get("planned_date", "TBD")}</p>
        
        {release.get("description", "")}
        
        <h3>✨ New Features ({len(notes_data["features"])})</h3>
        {_format_changes_list(notes_data["features"])}
        
        <h3>🐛 Bug Fixes ({len(notes_data["fixes"])})</h3>
        {_format_changes_list(notes_data["fixes"])}
        
        <h3>💥 Breaking Changes ({len(notes_data["breaking_changes"])})</h3>
        {_format_changes_list(notes_data["breaking_changes"])}
        
        <p class="generated-info">Generated {len(notes_data.get('other_changes', []))} total changes at {notes_data["generated_at"]}</p>
    </div>
    """
    
    return html

def _generate_release_notes_markdown(notes_data: Dict[str, Any]) -> str:
    """Generate Markdown release notes"""
    release = notes_data["release"]
    
    md = f"""# Release {release.get("version", "Unknown")}

## {release.get("title", "")}

**Released:** {release.get("actual_date") or release.get("planned_date", "TBD")}

{release.get("description", "")}

## ✨ New Features ({len(notes_data["features"])})

{_format_changes_markdown(notes_data["features"])}

## 🐛 Bug Fixes ({len(notes_data["fixes"])})

{_format_changes_markdown(notes_data["fixes"])}

## 💥 Breaking Changes ({len(notes_data["breaking_changes"])})

{_format_changes_markdown(notes_data["breaking_changes"])}

---
*Generated {len(notes_data.get('other_changes', []))} total changes at {notes_data["generated_at"]}*
"""
    
    return md

def _format_changes_list(changes: List[Dict[str, Any]]) -> str:
    """Format changes as HTML list"""
    if not changes:
        return "<p>No changes</p>"
    
    html = "<ul>"
    for change in changes:
        title = change.get("title", "Untitled")
        status = change.get("status", "unknown")
        priority = change.get("priority", "medium")
        assignee = change.get("assignee", "Unassigned")
        
        html += f"""
        <li>
            <strong>{title}</strong>
            <span class="status-{status}">{status}</span>
            <span class="priority-{priority}">{priority}</span>
            <span class="assignee">@{assignee}</span>
        </li>
        """
    
    html += "</ul>"
    return html

def _format_changes_markdown(changes: List[Dict[str, Any]]) -> str:
    """Format changes as Markdown list"""
    if not changes:
        return "No changes"
    
    md = ""
    for change in changes:
        title = change.get("title", "Untitled")
        status = change.get("status", "unknown")
        priority = change.get("priority", "medium")
        assignee = change.get("assignee", "Unassigned")
        
        md += f"- **{title}** _{status}_ `{priority}` @{assignee}\n"
    
    return md