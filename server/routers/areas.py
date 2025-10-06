from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone
from typing import Optional
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

DEFAULT_AREAS = ["HCM","Absence","Time Tracking","Payroll","Financials","Integrations","Security","Reporting","Cutover"]

router = APIRouter(prefix="/areas", tags=["areas"])

@router.get("/list")
def list_areas(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    # future: read from org settings; dev-safe default list
    return {"items": DEFAULT_AREAS}

def _safe_count(sb, table, org_id, project_id, area_field="area", area:Optional[str]=None, where:dict|None=None):
    try:
        q = sb.table(table).select("id", count="exact").eq("org_id", org_id).eq("project_id", project_id)
        if area: q = q.eq(area_field, area)
        if where:
            for k,v in where.items(): q = q.eq(k, v)
        r = q.execute()
        return r.count or 0
    except Exception:
        return 0

def _last_update(sb, org_id, project_id, area:Optional[str]=None):
    ts = []
    try:
        r = sb.table("audit_events").select("created_at").eq("org_id", org_id).eq("project_id", project_id)\
             .order("created_at", desc=True).limit(1 if not area else 500).execute().data or []
        if area:
            # naive scan for area mention in details
            for e in r:
                ts.append(e.get("created_at"))
        else:
            return r and r[0].get("created_at")
    except Exception: ...
    # also look at actions/risks/decisions/worksheet runs
    for t in ["actions","risks","decisions","workbook_runs"]:
        try:
            q = sb.table(t).select("created_at").eq("org_id", org_id).eq("project_id", project_id).order("created_at", desc=True).limit(1)
            if area and t!="workbook_runs": q = q.eq("area", area)
            rr = q.execute().data or []
            if rr and rr[0].get("created_at"): ts.append(rr[0]["created_at"])
        except Exception: ...
    return max(ts) if ts else None

def _status(actions_open:int, days_to_due:Optional[int], risks_open:int):
    # simple rule-of-thumb status
    if risks_open>0 and (days_to_due is not None and days_to_due<=3): return "at_risk"
    if actions_open==0 and risks_open==0: return "green"
    if days_to_due is not None and days_to_due<0: return "late"
    return "yellow"

@router.get("/summary")
def summary(project_id: str = Query(...), area: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        actions_open = _safe_count(sb,"actions",ctx.org_id,project_id,area=area,where={"status":"open"})
        risks_open   = _safe_count(sb,"risks",ctx.org_id,project_id,area=area,where={"status":"open"})
        decisions    = _safe_count(sb,"decisions",ctx.org_id,project_id,area=area)
        # workbooks: planned vs done
        wb_total = _safe_count(sb,"workbooks",ctx.org_id,project_id,area=area)
        wb_done  = _safe_count(sb,"workbooks",ctx.org_id,project_id,area=area,where={"status":"done"})
        # next meeting: naive (latest from summaries/meetings)
        next_meeting = None
        try:
            r = sb.table("meetings").select("starts_at").eq("org_id",ctx.org_id).eq("project_id",project_id)\
                .order("starts_at",desc=False).limit(5).execute().data or []
            next_meeting = r and r[0].get("starts_at")
        except Exception: ...
        # days_to_due from nearest workbook due
        days_to_due = None
        try:
            w = sb.table("workbooks").select("due_date").eq("org_id",ctx.org_id).eq("project_id",project_id)\
                .eq("area",area).not_.is_("due_date","null").order("due_date",desc=False).limit(1).execute().data or []
            if w and w[0].get("due_date"):
                dd = datetime.fromisoformat(w[0]["due_date"]).date()
                today = datetime.now(timezone.utc).date()
                days_to_due = (dd - today).days
        except Exception: ...
        last_update = _last_update(sb, ctx.org_id, project_id, area)
        status = _status(actions_open, days_to_due, risks_open)
        return {"area": area, "metrics": {
            "actions_open": actions_open, "risks_open": risks_open, "decisions": decisions,
            "workbooks_done": wb_done, "workbooks_total": wb_total,
            "next_meeting": next_meeting, "days_to_due": days_to_due, "last_update": last_update, "status": status
        }}
    except Exception:
        return {"area": area, "metrics": {}}

@router.get("/summary_all")
def summary_all(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        out = []
        for area in DEFAULT_AREAS:
            try:
                # Duplicate summary logic instead of calling the function directly
                actions_open = _safe_count(sb,"actions",ctx.org_id,project_id,area=area,where={"status":"open"})
                risks_open   = _safe_count(sb,"risks",ctx.org_id,project_id,area=area,where={"status":"open"})
                decisions    = _safe_count(sb,"decisions",ctx.org_id,project_id,area=area)
                # workbooks: planned vs done
                wb_total = _safe_count(sb,"workbooks",ctx.org_id,project_id,area=area)
                wb_done  = _safe_count(sb,"workbooks",ctx.org_id,project_id,area=area,where={"status":"done"})
                # next meeting: naive (latest from summaries/meetings)
                next_meeting = None
                try:
                    r = sb.table("meetings").select("starts_at").eq("org_id",ctx.org_id).eq("project_id",project_id)\
                        .order("starts_at",desc=False).limit(5).execute().data or []
                    next_meeting = r and r[0].get("starts_at")
                except Exception: ...
                # days_to_due from nearest workbook due
                days_to_due = None
                try:
                    w = sb.table("workbooks").select("due_date").eq("org_id",ctx.org_id).eq("project_id",project_id)\
                        .eq("area",area).not_.is_("due_date","null").order("due_date",desc=False).limit(1).execute().data or []
                    if w and w[0].get("due_date"):
                        dd = datetime.fromisoformat(w[0]["due_date"]).date()
                        today = datetime.now(timezone.utc).date()
                        days_to_due = (dd - today).days
                except Exception: ...
                last_update = _last_update(sb, ctx.org_id, project_id, area)
                status = _status(actions_open, days_to_due, risks_open)
                out.append({"area": area, "metrics": {
                    "actions_open": actions_open, "risks_open": risks_open, "decisions": decisions,
                    "workbooks_done": wb_done, "workbooks_total": wb_total,
                    "next_meeting": next_meeting, "days_to_due": days_to_due, "last_update": last_update, "status": status
                }})
            except Exception:
                out.append({"area": area, "metrics": {}})
        return {"items": out}
    except Exception:
        return {"items": []}

@router.get("/last_updates")
def last_updates(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        data = {}
        for a in DEFAULT_AREAS:
            data[a] = _last_update(sb, ctx.org_id, project_id, a)
        # a coarse "page update" — latest audit
        data["_global"] = _last_update(sb, ctx.org_id, project_id, None)
        return {"items": data}
    except Exception:
        return {"items": {}}