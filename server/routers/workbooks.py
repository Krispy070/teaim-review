from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException, Body
from fastapi.responses import StreamingResponse, Response
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel
import csv, io, zipfile, json
from io import StringIO

from ..tenant import TenantCtx
from ..guards import member_ctx, PM_PLUS
from ..supabase_client import get_user_supabase

router = APIRouter()

class Workbook(BaseModel):
    id: Optional[str] = None
    name: str
    area: Optional[str] = None
    intro_date: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    asof_date: Optional[str] = None
    iterations_planned: Optional[int] = None
    iterations_done: Optional[int] = None
    status: str = "planned"
    notes: Optional[str] = None
    late_reason: Optional[str] = None

@router.post("/import_csv")
def import_csv(project_id: str = Query(...), file: UploadFile = File(...),
               ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        raw = (file.file.read()).decode("utf-8", errors="ignore")
        rdr = csv.DictReader(io.StringIO(raw))
        cols = {"name","area","intro_date","start_date","asof_date","due_date","iterations_planned","status","notes"}
        n=0
        for row in rdr:
            data = {k: row.get(k) for k in cols if k in row}
            if not (data.get("name") or "").strip():
                continue
            # coerce ints
            try:
                val = data.get("iterations_planned")
                if val not in (None, ""):
                    data["iterations_planned"] = int(str(val))
            except: data["iterations_planned"] = 0
            data.update({"org_id": ctx.org_id, "project_id": project_id})
            try: sb.table("workbooks").insert(data).execute(); n+=1
            except Exception: ...
        return {"ok": True, "imported": n}
    except Exception:
        return {"ok": False, "imported": 0}

@router.get("/runs/summary")
def runs_summary(workbook_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        rows = sb.table("workbook_runs").select("status")\
               .eq("org_id", ctx.org_id).eq("workbook_id", workbook_id).execute().data or []
    except Exception:
        rows = []
    out = {"pulled":0,"validated":0,"loaded":0,"failed":0}
    for r in rows:
        s = (r.get("status") or "pulled").lower()
        if s in out: out[s]+=1
    return {"counts": out}

@router.get("/metrics")
def metrics(project_id: str = Query(...), upcoming_days: int = 14, ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        wbs = sb.table("workbooks").select("id,name,area,due_date,asof_date,iterations_planned,iterations_done,status")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
    except Exception:
        wbs = []
    total = len(wbs)
    done = len([w for w in wbs if (w.get("status") or "")=="done"])
    inprog = len([w for w in wbs if (w.get("status") or "")=="in_progress"])
    blocked = len([w for w in wbs if (w.get("status") or "")=="blocked"])

    today = datetime.utcnow().date()
    overdue = [w for w in wbs if w.get("due_date") and _is_overdue(str(w.get("due_date", "")), today)]
    upcoming = [w for w in wbs if _is_upcoming(w.get("due_date"), today, upcoming_days)]
    at_risk = [w for w in wbs if _is_at_risk(w, today)]

    return {"summary":{"total":total,"in_progress":inprog,"done":done,"blocked":blocked,
                       "overdue": len(overdue), "at_risk": len(at_risk)},
            "upcoming": upcoming[:10]}

def _is_overdue(due: str, today: date):
    try:
        d = datetime.fromisoformat(due).date()
        return d < today
    except: return False

def _is_upcoming(due: str|None, today: date, window: int):
    try:
        if not due: return False
        d = datetime.fromisoformat(due).date()
        return 0 <= (d - today).days <= window
    except: return False

@router.get("/list")
def workbooks_list(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Get workbooks list for the Reporting page"""
    sb = get_user_supabase(ctx)
    try:
        wbs = sb.table("workbooks").select("*")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id)\
              .order("name").execute().data or []
        return {"items": wbs}
    except Exception:
        # Dev-safe: return empty list if table doesn't exist
        return {"items": []}

@router.get("/export.csv")
def workbooks_export_csv(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Export workbooks as CSV"""
    sb = get_user_supabase(ctx)
    try:
        wbs = sb.table("workbooks").select("*")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id)\
              .order("name").execute().data or []
        
        # Create CSV content
        output = StringIO()
        if wbs:
            fieldnames = wbs[0].keys()
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            for wb in wbs:
                writer.writerow(wb)
        
        csv_content = output.getvalue()
        output.close()
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=workbooks.csv"}
        )
    except Exception:
        # Dev-safe: return empty CSV if table doesn't exist
        return Response(
            content="name,area,status\n",
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=workbooks.csv"}
        )

def _is_at_risk(w, today: date):
    # simplistic: in progress but due within 3d or iteration shortfall
    try:
        if (w.get("status") or "") == "in_progress":
            if w.get("due_date"):
                d = datetime.fromisoformat(w.get("due_date")).date()
                if 0 <= (d - today).days <= 3:
                    return True
            p = int(w.get("iterations_planned") or 0)
            d = int(w.get("iterations_done") or 0)
            return p>0 and d < p and (w.get("asof_date") and datetime.fromisoformat(w.get("asof_date")).date() < today)
    except: ...
    return False

@router.post("/runs/update")
def update_run(workbook_id: str = Query(...), run_no: int = Query(...),
               status: str = Query(...), rows: int | None = None,
               project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("workbook_runs").update({"status": status, "rows": rows})\
          .eq("org_id", ctx.org_id).eq("project_id", project_id)\
          .eq("workbook_id", workbook_id).eq("run_no", run_no).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.post("/runs/delete")
def delete_run(workbook_id: str = Query(...), run_no: int = Query(...),
               project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        sb.table("workbook_runs").delete()\
          .eq("org_id", ctx.org_id).eq("project_id", project_id)\
          .eq("workbook_id", workbook_id).eq("run_no", run_no).execute()
        # recompute iterations_done = max(run_no)
        try:
            r = sb.table("workbook_runs").select("run_no")\
                 .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                 .eq("workbook_id", workbook_id).order("run_no", desc=True).limit(1).execute().data or []
            max_no = r[0]["run_no"] if r else 0
            sb.table("workbooks").update({"iterations_done": max_no})\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", workbook_id).execute()
        except Exception: ...
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.get("/export_last_runs.zip")
def export_last_runs(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    buf = io.BytesIO(); z = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)
    try:
        wbs = sb.table("workbooks").select("id,name,area,asof_date,due_date,iterations_done,status")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).limit(2000).execute().data or []
    except Exception:
        wbs = []
    manifest = {"generated_at": datetime.now(datetime.now().astimezone().tzinfo).isoformat(),
                "project_id": project_id, "count": len(wbs)}
    z.writestr("manifest.json", json.dumps(manifest, indent=2))

    for w in wbs:
        try:
            rid = w["id"]
            last = sb.table("workbook_runs").select("run_no,pulled_on,rows,status")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .eq("workbook_id", rid).order("run_no", desc=True).limit(5).execute().data or []
            s=io.StringIO(); c=csv.writer(s); c.writerow(["run_no","pulled_on","rows","status"])
            for r in last: c.writerow([r.get("run_no"), r.get("pulled_on"), r.get("rows"), r.get("status")])
            z.writestr(f"workbooks/{w.get('name') or rid}_last_runs.csv", s.getvalue())
        except Exception: ...
    z.close(); buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename=\"migration_package.zip\"'})

@router.get("/runs/aggregate_summary")
def runs_aggregate_summary(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    out = {"pulled":0,"validated":0,"loaded":0,"failed":0}
    try:
        rows = sb.table("workbook_runs").select("status")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        for r in rows:
            s = (r.get("status") or "pulled").lower()
            if s in out: out[s]+=1
    except Exception:
        ...
    return {"counts": out}


@router.post("/upsert")
def upsert_workbook(project_id: str = Query(...), workbook: Workbook = Body(...), 
                    ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        data = workbook.model_dump(exclude_unset=True)
        data.update({"org_id": ctx.org_id, "project_id": project_id})
        
        if workbook.id:
            # Update existing workbook
            result = sb.table("workbooks").update(data)\
                      .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                      .eq("id", workbook.id).execute()
        else:
            # Insert new workbook
            result = sb.table("workbooks").insert(data).execute()
        
        return {"ok": True, "data": result.data}
    except Exception as e:
        return {"ok": False, "error": str(e)}