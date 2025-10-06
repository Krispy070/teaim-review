# /server/meetings_api.py
from fastapi import APIRouter, Query, Depends
from .supabase_client import get_supabase_client
from .tenant import TenantCtx
from .guards import member_ctx

sb = get_supabase_client()

router = APIRouter()
BUCKET = "project-artifacts"

def signed_url(path: str):
    try:
        r = sb.storage.from_(BUCKET).create_signed_url(path, 3600)
        return r.get("signedURL") or r.get("signed_url")
    except Exception:
        return None

def _filter_summary_json_by_areas(summary_data: dict, can_view_all: bool, visibility_areas: list) -> dict:
    """Filter JSON content within summaries based on user's visibility areas"""
    if can_view_all:
        return summary_data
    
    filtered_summary = summary_data.copy()
    
    # Filter risks JSON array
    if 'risks' in filtered_summary and filtered_summary['risks']:
        filtered_risks = []
        for risk in filtered_summary['risks']:
            risk_area = risk.get('area') if isinstance(risk, dict) else None
            if not risk_area or risk_area in visibility_areas:
                filtered_risks.append(risk)
        filtered_summary['risks'] = filtered_risks
    
    # Filter decisions JSON array
    if 'decisions' in filtered_summary and filtered_summary['decisions']:
        filtered_decisions = []
        for decision in filtered_summary['decisions']:
            decision_area = decision.get('area') if isinstance(decision, dict) else None
            if not decision_area or decision_area in visibility_areas:
                filtered_decisions.append(decision)
        filtered_summary['decisions'] = filtered_decisions
    
    # Filter actions JSON array
    if 'actions' in filtered_summary and filtered_summary['actions']:
        filtered_actions = []
        for action in filtered_summary['actions']:
            action_area = action.get('area') if isinstance(action, dict) else None
            if not action_area or action_area in visibility_areas:
                filtered_actions.append(action)
        filtered_summary['actions'] = filtered_actions
    
    return filtered_summary

@router.get("/meetings")
def list_meetings(project_id: str = Query(...), q: str = "", limit: int = 50, ctx: TenantCtx = Depends(member_ctx)):
    from .visibility_guard import get_visibility_context
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    # pick up artifacts that look like transcripts or minutes, *or* anything with an artifact-level summary
    arts = sb.table("artifacts").select("id,title,source,meeting_date,created_at,path") \
        .eq("org_id", ctx.org_id).eq("project_id", project_id).order("created_at", desc=True).limit(limit).execute().data or []

    ids = [a["id"] for a in arts]
    # Guard against empty artifacts array to prevent PostgREST .in() error
    if ids:
        sums = sb.table("summaries").select("artifact_id,summary,risks,decisions,actions,created_at") \
            .in_("artifact_id", ids).execute().data or []
    else:
        sums = []
    by_art = { s["artifact_id"]: s for s in sums }

    out = []
    for a in arts:
        s = by_art.get(a["id"], {})
        if q and q.lower() not in (a.get("title","")+s.get("summary","")).lower(): 
            continue
        
        # Apply visibility filtering to JSON content within summaries
        filtered_summary = _filter_summary_json_by_areas(
            s, visibility_ctx.can_view_all, visibility_ctx.visibility_areas
        )
        
        out.append({
            "artifact_id": a["id"],
            "title": a.get("title"),
            "source": a.get("source"),
            "meeting_date": a.get("meeting_date"),
            "created_at": a.get("created_at"),
            "summary": filtered_summary.get("summary",""),
            "risks_count": len(filtered_summary.get("risks") or []),
            "decisions_count": len(filtered_summary.get("decisions") or []),
            "actions_count": len(filtered_summary.get("actions") or []),
            "url": signed_url(a["path"])
        })
    return {"items": out}

@router.get("/meetings/{artifact_id}")
def meeting_detail(artifact_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    from .visibility_guard import get_visibility_context
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    
    a = sb.table("artifacts").select("id,title,source,meeting_date,created_at,path") \
        .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", artifact_id).limit(1).execute().data
    if not a: return {"ok": False, "error": "not found"}
    a = a[0]
    sums = sb.table("summaries").select("*").eq("artifact_id", artifact_id).limit(1).execute().data
    s = sums[0] if sums else {}
    
    # Apply visibility filtering to JSON content within summaries
    filtered_summary = _filter_summary_json_by_areas(
        s, visibility_ctx.can_view_all, visibility_ctx.visibility_areas
    )
    
    return {
        "artifact": {**a, "url": signed_url(a["path"])},
        "summary": filtered_summary.get("summary",""),
        "risks": filtered_summary.get("risks") or [],
        "decisions": filtered_summary.get("decisions") or [],
        "actions": filtered_summary.get("actions") or []
    }