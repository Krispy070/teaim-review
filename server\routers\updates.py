from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import copy, os

from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client as get_service_supabase

router = APIRouter(prefix="/updates", tags=["updates"])
# Alias router for /api prefix compatibility
router_api = APIRouter(prefix="/api/updates", tags=["updates-api"])
PM_ONLY = require_role({"owner","admin","pm"})

# ---------- Models ----------
class EnqueueBody(BaseModel):
    change_type: str                # action|risk|decision|integration|...
    operation: str                  # insert|update|upsert|delete
    target_table: str               # 'actions'|'risks'|'decisions'|'project_integrations'...
    target_id: Optional[str] = None
    payload: Dict[str, Any]
    source_artifact_id: Optional[str] = None
    source_span: Optional[str] = None
    confidence: Optional[float] = 0.8
    created_by: Optional[str] = "system"

class EditApproveBody(BaseModel):
    payload: Dict[str, Any]

class BatchApproveBody(BaseModel):
    ids: List[str] = Field(default_factory=list)

# ---------- Helpers ----------
def _now():
    return datetime.now(timezone.utc).isoformat()

def _apply_change(sbs, org_id: str, project_id: str, change: Dict[str,Any]):
    """
    Apply proposed change to the appropriate table.
    Supports: actions, risks, decisions, project_integrations
    Returns (applied_record, old_snapshot).
    """
    table = change["target_table"]
    op = change["operation"]
    tid = change.get("target_id")
    pay = change.get("payload") or {}

    q = sbs.table(table)
    # ensure project scoping fields exist
    if op in ("insert","upsert") and "org_id" not in pay:
        pay["org_id"] = org_id
    if op in ("insert","upsert") and "project_id" not in pay:
        pay["project_id"] = project_id

    # capture old snapshot if updating/deleting
    old = None
    if tid and op in ("update","upsert","delete"):
        oldq = sbs.table(table).select("*").eq("org_id", org_id).eq("project_id", project_id).eq("id", tid).limit(1).execute().data
        old = oldq[0] if oldq else None

    if op == "insert":
        res = q.insert(pay).execute().data
        return res[0] if res else None, old
    elif op == "upsert":
        res = q.upsert(pay).execute().data
        return res[0] if res else None, old
    elif op == "update":
        if not tid: raise HTTPException(400, "target_id required for update")
        # optimistic concurrency (optional): only apply if updated_at matches payload
        if "updated_at" in pay:
            cur = sbs.table(table).select("updated_at").eq("org_id", org_id).eq("project_id", project_id).eq("id", tid).single().execute().data
            if cur and str(cur["updated_at"]) != str(pay["updated_at"]):
                raise HTTPException(409, "Record changed since propose; refresh and re-approve")
            pay.pop("updated_at", None)  # let DB set new updated_at
        res = q.update(pay).eq("org_id", org_id).eq("project_id", project_id).eq("id", tid).execute().data
        return res[0] if res else None, old
    elif op == "delete":
        if not tid: raise HTTPException(400, "target_id required for delete")
        q.delete().eq("org_id", org_id).eq("project_id", project_id).eq("id", tid).execute()
        return {"deleted_id": tid}, old
    else:
        raise HTTPException(400, f"Unsupported operation: {op}")

# ---------- Endpoints ----------
@router.get("/list")
def list_updates(project_id: str = Query(...), status: Optional[str] = None,
                 types: Optional[str] = None, ctx: TenantCtx = Depends(member_ctx)):
    print(f"🔧 updates.list_updates: user={ctx.user_id}, project={project_id}, status={status}, types={types}")
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("pending_updates").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id)
        if status: q = q.eq("status", status)
        if types:
            arr = [t.strip() for t in types.split(",") if t.strip()]
            if arr: q = q.in_("change_type", arr)
        res = q.order("created_at", desc=True).limit(500).execute().data or []
        print(f"🔧 updates.list_updates: found {len(res)} updates")
        return {"items": res}
    except Exception as e:
        # Handle missing table in development environment
        print(f"🔧 updates.list_updates: Table not found, returning empty: {e}")
        return {"items": []}

@router.get("/{update_id}")
def get_update(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    print(f"🔧 updates.get_update: user={ctx.user_id}, project={project_id}, update_id={update_id}")
    sb = get_user_supabase(ctx)
    try:
        res = sb.table("pending_updates").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", update_id).limit(1).execute().data
        if not res: raise HTTPException(404, "Not found")
        return res[0]
    except Exception as e:
        # Handle missing table in development environment
        print(f"🔧 updates.get_update: Table not found, returning empty: {e}")
        raise HTTPException(404, "Not found")

@router.post("/enqueue")
def enqueue_update(body: EnqueueBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    print(f"🔧 updates.enqueue_update: user={ctx.user_id}, project={project_id}, change_type={body.change_type}")
    sb = get_user_supabase(ctx)
    row = {
        "org_id": ctx.org_id, "project_id": project_id,
        "change_type": body.change_type, "operation": body.operation, "target_table": body.target_table,
        "target_id": body.target_id, "payload": body.payload,
        "source_artifact_id": body.source_artifact_id, "source_span": body.source_span,
        "confidence": body.confidence, "created_by": body.created_by
    }
    out = sb.table("pending_updates").insert(row).execute().data[0]
    # audit
    try:
        sb.table("audit_events").insert({
          "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
          "kind": "review.queued", "details": {"update_id": out["id"], "change_type": body.change_type}
        }).execute()
    except Exception: ...
    return {"ok": True, "update": out}

@router.post("/{update_id}/approve")
def approve_update(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    print(f"🔧 updates.approve_update: user={ctx.user_id}, project={project_id}, update_id={update_id}")
    # mark approved & attempt apply
    sbs = get_service_supabase()
    # fetch
    rowq = sbs.table("pending_updates").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", update_id).limit(1).execute().data
    if not rowq: raise HTTPException(404, "Not found")
    row = rowq[0]
    # apply
    try:
        applied, old = _apply_change(sbs, ctx.org_id, project_id, row)
        # Pack a few useful fields if available
        out_fields = {}
        try:
            if isinstance(applied, dict):
                for k in ("id","title","owner","status","area","severity","decided_by","name"):
                    if k in applied: out_fields[k] = applied[k]
        except Exception:
            pass
        
        sbs.table("pending_updates").update({
            "status": "applied", "approved_by": ctx.user_id, "approved_at": _now(),
            "applied_by": ctx.user_id, "applied_at": _now(), "old_snapshot": old, "error": None
        }).eq("id", update_id).execute()
        sbs.table("audit_events").insert({
          "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
          "kind": "review.applied", "details": {"update_id": update_id, "target_table": row["target_table"], "target_id": row.get("target_id")}
        }).execute()
        
        from ..utils.events import emit_event
        emit_event(ctx.org_id, project_id, "review.applied", {
          "update_id": update_id,
          "table": row["target_table"],
          "target_id": row.get("target_id") or (applied and applied.get("id")),
          **out_fields
        })
        
        return {"ok": True, "applied": applied}
    except Exception as e:
        sbs.table("pending_updates").update({
            "status":"failed", "approved_by": ctx.user_id, "approved_at": _now(), "error": str(e)
        }).eq("id", update_id).execute()
        raise HTTPException(500, f"Apply failed: {e}")

@router.post("/{update_id}/edit-approve")
def edit_and_approve(update_id: str, body: EditApproveBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    print(f"🔧 updates.edit_and_approve: user={ctx.user_id}, project={project_id}, update_id={update_id}")
    sbs = get_service_supabase()
    rowq = sbs.table("pending_updates").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", update_id).limit(1).execute().data
    if not rowq: raise HTTPException(404, "Not found")
    row = rowq[0]
    row["payload"] = body.payload
    try:
        applied, old = _apply_change(sbs, ctx.org_id, project_id, row)
        # Pack a few useful fields if available
        out_fields = {}
        try:
            if isinstance(applied, dict):
                for k in ("id","title","owner","status","area","severity","decided_by","name"):
                    if k in applied: out_fields[k] = applied[k]
        except Exception:
            pass
        
        sbs.table("pending_updates").update({
            "payload": body.payload, "status": "applied", "approved_by": ctx.user_id, "approved_at": _now(),
            "applied_by": ctx.user_id, "applied_at": _now(), "old_snapshot": old, "error": None
        }).eq("id", update_id).execute()
        sbs.table("audit_events").insert({
          "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
          "kind": "review.applied", "details": {"update_id": update_id}
        }).execute()
        
        from ..utils.events import emit_event
        emit_event(ctx.org_id, project_id, "review.applied", {
          "update_id": update_id,
          "table": row["target_table"],
          "target_id": row.get("target_id") or (applied and applied.get("id")),
          **out_fields
        })
        
        return {"ok": True, "applied": applied}
    except Exception as e:
        sbs.table("pending_updates").update({"status":"failed","error": str(e)}).eq("id", update_id).execute()
        raise HTTPException(500, f"Apply failed: {e}")

@router.post("/{update_id}/reject")
def reject_update(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    print(f"🔧 updates.reject_update: user={ctx.user_id}, project={project_id}, update_id={update_id}")
    sb = get_user_supabase(ctx)
    sb.table("pending_updates").update({
      "status":"rejected", "approved_by": ctx.user_id, "approved_at": _now()
    }).eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", update_id).execute()
    try:
        sb.table("audit_events").insert({
          "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
          "kind": "review.rejected", "details": {"update_id": update_id}
        }).execute()
    except Exception: ...
    return {"ok": True}

@router.post("/batch_approve")
def batch_approve(body: BatchApproveBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    print(f"🔧 updates.batch_approve: user={ctx.user_id}, project={project_id}, ids={body.ids}")
    results = []
    for uid in body.ids:
        try:
            results.append(approve_update(uid, project_id, ctx))  # reuse
        except Exception as e:
            results.append({"ok": False, "error": str(e), "id": uid})
    return {"results": results}

@router.post("/{update_id}/undo")
def undo_update(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    print(f"🔧 updates.undo_update: user={ctx.user_id}, project={project_id}, update_id={update_id}")
    sbs = get_service_supabase()
    rowq = sbs.table("pending_updates").select("*")\
        .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", update_id).limit(1).execute().data
    if not rowq: raise HTTPException(404, "Not found")
    row = rowq[0]
    old = row.get("old_snapshot")
    if not old: raise HTTPException(400, "No snapshot to undo")
    table = row["target_table"]
    tid = old.get("id")
    if not tid: raise HTTPException(400, "Snapshot missing id")
    sbs.table(table).upsert(old).execute()
    sbs.table("audit_events").insert({
      "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
      "kind": "review.undo", "details": {"update_id": update_id, "target_table": table, "target_id": tid}
    }).execute()
    return {"ok": True}

@router.post("/{update_id}/dry_run")
def dry_run(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    print(f"🔧 updates.dry_run: user={ctx.user_id}, project={project_id}, update_id={update_id}")
    sbs = get_service_supabase()
    rowq = sbs.table("pending_updates").select("*")\
        .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", update_id).limit(1).execute().data
    if not rowq: raise HTTPException(404, "Not found")
    row = rowq[0]
    table = row["target_table"]; tid = row.get("target_id"); pay = row.get("payload") or {}
    
    # Simulate the change without applying it
    try:
        # For insert/upsert, just validate payload structure
        if row["operation"] in ("insert", "upsert"):
            # Basic validation - ensure required project fields
            if "org_id" not in pay: pay["org_id"] = ctx.org_id
            if "project_id" not in pay: pay["project_id"] = project_id
            return {"ok": True, "preview": pay, "operation": row["operation"], "target_table": table}
        
        # For update/delete, check if target exists
        elif tid and row["operation"] in ("update", "delete"):
            existing = sbs.table(table).select("*").eq("org_id", ctx.org_id).eq("project_id", project_id).eq("id", tid).limit(1).execute().data
            if not existing:
                return {"ok": False, "error": "Target record not found"}
            
            if row["operation"] == "update":
                # Merge with existing for preview
                merged = {**existing[0], **pay}
                return {"ok": True, "preview": merged, "operation": "update", "target_table": table}
            else:  # delete
                return {"ok": True, "preview": existing[0], "operation": "delete", "target_table": table}
        
        return {"ok": False, "error": "Invalid operation or missing target_id"}
        
    except Exception as e:
        return {"ok": False, "error": f"Dry run failed: {e}"}


# API prefix alias endpoints for routing resilience
@router_api.get("/list")
def list_updates_api(project_id: str = Query(...), status: str = "pending", limit: int = 50, ctx: TenantCtx = Depends(member_ctx)):
    return list_updates(project_id=project_id, status=status, types=None, ctx=ctx)

@router_api.get("/{update_id}")
def get_update_api(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    return get_update(update_id, project_id, ctx)

@router_api.post("/enqueue")
def enqueue_update_api(body: EnqueueBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    return enqueue_update(body, project_id, ctx)

@router_api.post("/{update_id}/approve")
def approve_update_api(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    return approve_update(update_id, project_id, ctx)

@router_api.post("/{update_id}/edit-approve")
def edit_approve_update_api(update_id: str, body: EditApproveBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    return edit_and_approve(update_id, body, project_id, ctx)

@router_api.post("/{update_id}/reject")
def reject_update_api(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    return reject_update(update_id, project_id, ctx)

@router_api.post("/batch_approve")
def batch_approve_api(body: BatchApproveBody, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    return batch_approve(body, project_id, ctx)

@router_api.post("/{update_id}/undo")
def undo_update_api(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_ONLY)):
    return undo_update(update_id, project_id, ctx)

@router_api.post("/{update_id}/dry_run")
def dry_run_update_api(update_id: str, project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    return dry_run(update_id, project_id, ctx)