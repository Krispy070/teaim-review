from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client
from datetime import datetime, timedelta, timezone
import os, io, csv

router = APIRouter(prefix="/api/signoff", tags=["signoff"])

@router.get("/pending_count")
def pending_count(project_id: str = Query(...), stage_id: str | None = None,
                  ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("signoff_doc_tokens").select("id")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).is_("used_at","null")\
              .is_("revoked_at","null")
        if stage_id:
            # join via signoff_docs
            d = sb.table("signoff_docs").select("id").eq("org_id", ctx.org_id)\
                 .eq("project_id", project_id).eq("stage_id", stage_id).limit(1).execute().data or []
            if not d: return {"count": 0}
            q = q.eq("doc_id", d[0]["id"])
        c = len(q.execute().data or [])
        return {"count": c}
    except Exception:
        return {"count": 0}

@router.get("/pending_list")
def pending_list(
    project_id: str = Query(...),
    stage_id: str | None = None,
    within_hours: int = 48,
    q: str | None = None,
    domain: str | None = None,   # NEW
    page: int = 1, page_size: int = 50,
    ctx: TenantCtx = Depends(member_ctx)
):
    sb = get_user_supabase(ctx)
    try:
        doc_ids=[]
        if stage_id:
            d = sb.table("signoff_docs").select("id").eq("org_id", ctx.org_id)\
                 .eq("project_id", project_id).eq("stage_id", stage_id).limit(1).execute().data or []
            if not d: return {"items": [], "total": 0}
            doc_ids=[d[0]["id"]]
        qbase = sb.table("signoff_doc_tokens").select("token,doc_id,signer_email,created_at,expires_at")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                .is_("used_at","null").is_("revoked_at","null")
        if doc_ids: qbase = qbase.in_("doc_id", doc_ids)
        if q: qbase = qbase.ilike("signer_email", f"%{q}%")
        if domain: qbase = qbase.ilike("signer_email", f"%@{domain}%")
        # count
        total = qbase.execute().data or []
        total_count = len(total)
        # page
        rows = sorted(total, key=lambda r: r.get("created_at") or "", reverse=True)[(page-1)*page_size: page*page_size]
        # expiring badge
        now = datetime.now(timezone.utc)
        for r in rows:
            exp = r.get("expires_at")
            try:
                if exp:
                    ed = datetime.fromisoformat(exp.replace("Z","+00:00"))
                    r["expiring_soon"] = (ed - now) <= timedelta(hours=within_hours)
                    r["hours_left"] = round(((ed - now).total_seconds())/3600, 1)
                else:
                    r["expiring_soon"], r["hours_left"] = False, None
            except Exception:
                r["expiring_soon"], r["hours_left"] = False, None
        return {"items": rows, "total": total_count, "page": page, "page_size": page_size}
    except Exception:
        return {"items": [], "total": 0, "page": 1, "page_size": page_size}

@router.get("/pending_export.csv")
def pending_export(project_id: str = Query(...), stage_id: str | None = None, ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        doc_ids=[]
        if stage_id:
            d = sb.table("signoff_docs").select("id").eq("org_id", ctx.org_id)\
                 .eq("project_id", project_id).eq("stage_id", stage_id).limit(1).execute().data or []
            if not d: 
                s=io.StringIO(); csv.writer(s).writerow(["token","signer_email","created_at","expires_at"]); s.seek(0)
                from fastapi.responses import StreamingResponse
                return StreamingResponse(iter([s.read()]), media_type="text/csv",
                   headers={"Content-Disposition": 'attachment; filename="pending.csv"'})
            doc_ids=[d[0]["id"]]
        qbase = sb.table("signoff_doc_tokens").select("token,signer_email,created_at,expires_at")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id).is_("used_at","null").is_("revoked_at","null")
        if doc_ids: qbase=qbase.in_("doc_id", doc_ids)
        rows = qbase.order("created_at", desc=True).limit(2000).execute().data or []
    except Exception:
        rows=[]
    s=io.StringIO(); w=csv.writer(s); w.writerow(["token","signer_email","created_at","expires_at"])
    for r in rows: w.writerow([r.get("token"), r.get("signer_email"), r.get("created_at"), r.get("expires_at")])
    s.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(iter([s.read()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="pending.csv"'})

class ResendBody(BaseModel):
    tokens: List[str]
    subject: str | None = None
    html: str | None = None
    min_hours_between: int = 12

@router.post("/revoke_expired")
def revoke_expired(project_id: str = Query(...), stage_id: str | None = None,
                   ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    try:
        q = sb.table("signoff_doc_tokens").update({"revoked_at":"now()"})\
             .eq("org_id", ctx.org_id).eq("project_id", project_id)\
             .is_("used_at","null").lt("expires_at", datetime.now(timezone.utc).isoformat())
        if stage_id:
            d = sb.table("signoff_docs").select("id").eq("org_id", ctx.org_id)\
                 .eq("project_id", project_id).eq("stage_id", stage_id).limit(1).execute().data or []
            if not d: return {"ok": True, "updated": 0}
            q = q.eq("doc_id", d[0]["id"])
        r = q.execute()
        return {"ok": True, "updated": getattr(r, "count", None)}
    except Exception:
        return {"ok": False, "updated": 0}

@router.post("/resend_selected_custom")
def resend_selected_custom(body: ResendBody, project_id: str = Query(...), ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    base = os.getenv("APP_BASE_URL","").rstrip("/")
    sent=0
    try:
        rows = sb.table("signoff_doc_tokens").select("token,signer_email")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .in_("token", body.tokens).is_("used_at","null").is_("revoked_at","null").execute().data or []
        now = datetime.now(timezone.utc)
        from ..email.util import mailgun_send_html, send_guard
        for r in rows:
            email=r.get("signer_email"); 
            if not email: continue
            # throttle
            try:
                last = sb.table("comms_send_log").select("created_at")\
                       .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                       .eq("kind","signoff_reminder").eq("to_email", email)\
                       .order("created_at", desc=True).limit(1).execute().data
                if last:
                    dt_last = datetime.fromisoformat(last[0]["created_at"].replace("Z","+00:00"))
                    if (now - dt_last) < timedelta(hours=body.min_hours_between): 
                        continue
            except Exception: ...
            # send with override
            ok,_ = send_guard(sb, ctx.org_id, project_id, "signoff_reminder", email)
            if ok:
                link = f"{base}/signoff/doc/{r['token']}"
                subj = body.subject or "[Reminder] Sign-off request pending"
                html = body.html or f"<p>Your sign-off link: <a href='{link}'>Open</a></p>"
                html = html.replace("{{LINK}}", link)
                try: mailgun_send_html(email, subj, html); sent+=1
                except Exception: ...
        return {"ok": True, "sent": sent}
    except Exception:
        return {"ok": False, "sent": sent}

@router.post("/revoke_token")
def revoke_token(token: str = Query(...), ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    try:
        revoked_at = datetime.now(timezone.utc).isoformat()
        sb.table("signoff_doc_tokens").update({"revoked_at": revoked_at})\
          .eq("org_id", ctx.org_id).eq("token", token).execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.post("/revoke_all")
def revoke_all(project_id: str = Query(...), stage_id: str = Query(...),
               ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx)
    try:
        d = sb.table("signoff_docs").select("id").eq("org_id", ctx.org_id)\
             .eq("project_id", project_id).eq("stage_id", stage_id).limit(1).execute().data or []
        if not d: return {"ok": True}
        revoked_at = datetime.now(timezone.utc).isoformat()
        sb.table("signoff_doc_tokens").update({"revoked_at": revoked_at})\
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("doc_id", d[0]["id"]).is_("used_at","null").execute()
        return {"ok": True}
    except Exception:
        return {"ok": False}

@router.post("/resend_token")
def resend_token(token: str = Query(...), ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    sb = get_user_supabase(ctx); sbs = get_supabase_client()
    try:
        row = sb.table("signoff_doc_tokens").select("doc_id,signer_email,project_id").eq("org_id", ctx.org_id).eq("token", token).single().execute().data
        if not row: return {"ok": False}
        # create a new token; old one will remain but the receiver gets a fresh link
        new = sbs.table("signoff_doc_tokens").insert({
            "org_id": ctx.org_id, "project_id": row["project_id"],
            "doc_id": row["doc_id"], "signer_email": row["signer_email"]
        }).execute().data
        # best-effort email (dev-safe)
        try:
            base = os.getenv("APP_BASE_URL","").rstrip("/")
            link = f"{base}/signoff/doc/{new[0]['token']}" if new and new[0].get("token") else base
            from ..email.util import mailgun_send_html, send_guard
            ok,_ = send_guard(sb, ctx.org_id, None, "signoff_resend", row["signer_email"])
            if ok: mailgun_send_html(row["signer_email"], "[Resend] Sign-off request", f"<p>Your sign-off link: <a href='{link}'>Open</a></p>")
        except Exception: ...
        return {"ok": True}
    except Exception:
        return {"ok": False}