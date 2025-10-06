from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import os, io, zipfile, html

from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..db import get_conn
from ..supabase_client import get_user_supabase, get_supabase_client as get_service_supabase
from ..email.util import mailgun_send_html, send_guard, log_send
from .signoff_external import request_external, RequestExternalBody
from ..brand.export_header import export_header_html
import base64

router = APIRouter(prefix="/api/signoff/package", tags=["signoff-package"])
# Alias router without /api prefix to match Express proxy rewriting
router_no_api = APIRouter(prefix="/signoff/package", tags=["signoff-package-no-api"])
PM_PLUS = require_role({"owner","admin","pm","lead"})

class PackageInput(BaseModel):
    stage_title: str
    artifact_ids: List[str] = []
    include_actions: bool = True
    include_risks: bool = True
    include_decisions: bool = True
    message: Optional[str] = None
    email_to: Optional[str] = None  # for /send only

def _fetch_lists(sb, ctx: TenantCtx, org_id: str, project_id: str, want: PackageInput):
    from ..visibility_guard import get_visibility_context, apply_area_visibility_filter
    
    data = {"actions": [], "risks": [], "decisions": []}
    
    # Get user's visibility context for area-based filtering
    visibility_ctx = get_visibility_context(ctx, project_id)
    if want.include_actions:
        try:
            query = sb.table("actions").select("id,title,owner,status,area,due_date,created_at,updated_at")\
                      .eq("org_id", org_id).eq("project_id", project_id).order("created_at", desc=False)
            
            # Apply visibility filtering based on user's area permissions
            query = apply_area_visibility_filter(query, visibility_ctx, "area")
            
            rs = query.execute().data or []
            data["actions"] = rs
        except Exception: ...
    if want.include_risks:
        try:
            query = sb.table("risks").select("id,title,severity,owner,area,status,created_at,updated_at")\
                      .eq("org_id", org_id).eq("project_id", project_id).order("created_at", desc=False)
            
            # Apply visibility filtering based on user's area permissions
            query = apply_area_visibility_filter(query, visibility_ctx, "area")
            
            rs = query.execute().data or []
            data["risks"] = rs
        except Exception: ...
    if want.include_decisions:
        try:
            query = sb.table("decisions").select("id,title,description,decided_by,area,status,created_at,updated_at")\
                      .eq("org_id", org_id).eq("project_id", project_id).order("created_at", desc=False)
            
            # Apply visibility filtering based on user's area permissions
            query = apply_area_visibility_filter(query, visibility_ctx, "area")
                
            rs = query.execute().data or []
            data["decisions"] = rs
        except Exception: ...
    return data

def _fetch_branding(org_id: str) -> Optional[dict]:
    """Fetch branding settings including base64-encoded logos for HTML embedding"""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM org_branding WHERE org_id = %s",
                (org_id,)
            )
            row = cur.fetchone()
            if not row or not cur.description:
                return None
                
            columns = [desc[0] for desc in cur.description]
            branding = dict(zip(columns, row))
            
            # Fetch logo files and encode as base64 for HTML embedding
            sbs = get_service_supabase()
            bucket = os.getenv("BRANDING_BUCKET") or os.getenv("ARTIFACTS_BUCKET") or "artifacts"
            
            for logo_field, b64_field in [('customer_logo_path', 'customer_logo_b64'), ('vendor_logo_path', 'vendor_logo_b64')]:
                if branding.get(logo_field):
                    try:
                        logo_data = sbs.storage.from_(bucket).download(branding[logo_field])
                        branding[b64_field] = base64.b64encode(logo_data).decode('utf-8')
                    except Exception:
                        branding[b64_field] = None
                        
            return branding
    except Exception:
        return None

def _html_package(proj_code: str, stage_title: str, pkg: PackageInput, lists: dict, artifacts: list, branding: Optional[dict] = None):
    def esc(x): return html.escape(str(x) if x is not None else "")
    def section(title, rows, cols):
        if not rows: return ""
        head = "".join([f"<th style='text-align:left;padding:6px;border-bottom:1px solid #ddd'>{esc(c)}</th>" for c in cols])
        body = ""
        for r in rows:
            body += "<tr>" + "".join([f"<td style='padding:6px;border-bottom:1px solid #eee'>{esc(r.get(c,''))}</td>" for c in cols]) + "</tr>"
        return f"<h3 style='margin:16px 0 8px'>{esc(title)}</h3><table style='width:100%;border-collapse:collapse'>{head and '<thead><tr>'+head+'</tr></thead>'}<tbody>{body}</tbody></table>"

    arts = ""
    if artifacts:
        arts = "<ul>" + "".join([f"<li>{esc(a.get('name') or a.get('id'))}</li>" for a in artifacts]) + "</ul>"

    # Generate branding header with logos and custom text
    branding_header = ""
    if branding and (branding.get('customer_logo_path') or branding.get('vendor_logo_path') or branding.get('customer_name')):
        logos = []
        if branding.get('customer_logo_path'):
            logos.append(f"<img src='data:image/png;base64,{branding.get('customer_logo_b64', '')}' alt='{esc(branding.get('customer_name', 'Customer'))} logo' style='height:32px;width:auto;max-width:120px;object-fit:contain;' />")
        if branding.get('vendor_logo_path'):
            logos.append(f"<img src='data:image/png;base64,{branding.get('vendor_logo_b64', '')}' alt='{esc(branding.get('vendor_name', 'Vendor'))} logo' style='height:32px;width:auto;max-width:120px;object-fit:contain;' />")
        
        logo_section = f"<div style='display:flex;align-items:center;gap:12px;margin-bottom:24px;'>{''.join(logos)}</div>" if logos else ""
        
        title_color = f"color:{branding.get('theme_color', '#111')}" if branding.get('theme_color') else ""
        header_text = branding.get('header_text') or (
            f"{branding.get('customer_name', '')} & {branding.get('vendor_name', '')} Implementation Hub" if branding.get('customer_name') and branding.get('vendor_name')
            else f"{branding.get('customer_name', '')} Implementation Hub" if branding.get('customer_name')
            else "Workday Implementation Hub"
        )
        
        branding_header = f"{logo_section}<h1 style='margin:0 0 8px;{title_color};font-size:28px;font-weight:600;'>{esc(branding.get('customer_name') or 'TEAIM')}</h1><p style='margin:0 0 24px;color:#666;font-size:14px;'>{esc(header_text)}</p>"
    
    # Generate footer with branding
    footer_brand = branding.get('customer_name') or "TEAIM" if branding else "TEAIM"
    
    return f"""
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;max-width:880px;margin:auto;padding:20px;">
      {branding_header}
      <h2>Sign-Off Package — {esc(proj_code)} / {esc(stage_title)}</h2>
      {f"<p>{esc(pkg.message)}</p>" if pkg.message else ""}
      <h3>Included Artifacts</h3>
      {arts or "<p><i>No documents attached.</i></p>"}
      {section("Decisions", lists.get('decisions',[]), ["title","decided_by","created_at"])}
      {section("Risks",     lists.get('risks',[]),     ["title","severity","owner"])}
      {section("Actions",   lists.get('actions',[]),   ["title","owner","status"])}
      <p style="color:#888;font-size:12px;margin-top:16px">
        Generated by {esc(footer_brand)} — {datetime.now(timezone.utc).isoformat()}
      </p>
    </div>
    """

@router.post("/preview")
def preview(body: PackageInput, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    try:
        proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
        proj_code = proj["code"] if proj else project_id
    except Exception:
        # Graceful fallback for missing database tables in development
        proj_code = project_id

    # pull artifact names
    arts = []
    if body.artifact_ids:
        arts = sb.table("artifacts").select("id,name")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .in_("id", body.artifact_ids).execute().data or []

    lists = _fetch_lists(sb, ctx, ctx.org_id, project_id, body)
    
    org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
    html_out = export_header_html(org, proj_code) + _html_package(proj_code, body.stage_title, body, lists, arts)
    return {"ok": True, "html": html_out}

@router.post("/send")
def send(body: PackageInput, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    if not body.email_to:
        raise HTTPException(400, "email_to required")

    sb = get_user_supabase(ctx)
    try:
        proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
        proj_code = proj["code"] if proj else project_id
    except Exception:
        # Graceful fallback for missing database tables in development
        proj_code = project_id

    arts = []
    if body.artifact_ids:
        arts = sb.table("artifacts").select("id,name")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .in_("id", body.artifact_ids).execute().data or []

    lists = _fetch_lists(sb, ctx, ctx.org_id, project_id, body)
    branding = _fetch_branding(ctx.org_id)
    html_out = _html_package(proj_code, body.stage_title, body, lists, arts, branding)

    # Request external sign-off token
    # Create a stage if missing (Discovery by default), or match by provided stage_title
    stage = sb.table("project_stages").select("id,title")\
            .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("title", body.stage_title)\
            .limit(1).execute().data
    if not stage:
        ins = sb.table("project_stages").insert({
            "org_id": ctx.org_id, "project_id": project_id, "title": body.stage_title,
            "status": "in_review"
        }).execute().data[0]
        stage_id = ins["id"]
    else:
        stage_id = stage[0]["id"]

    # External token
    ext = request_external(RequestExternalBody(stage_id=stage_id, email_to=body.email_to, message=body.message or ""), project_id, ctx)
    token_link = ext.get("token_link")

    # Send summary email (quiet hours / caps applied)
    ok, reason = send_guard(sb, ctx.org_id, project_id, "signoff", body.email_to)
    if not ok:
        raise HTTPException(429, f"Cannot send email: {reason}")
    
    subj = f"Sign-Off Requested — {proj_code} / {body.stage_title}"
    html_mail = f"{html_out}<p><a href='{html.escape(token_link or '#')}' style='display:inline-block;padding:10px 14px;background:#111;color:#fff;border-radius:6px;text-decoration:none'>Review & Sign</a></p>"
    mailgun_send_html(body.email_to, subj, html_mail)
    log_send(sb, ctx.org_id, project_id, "signoff", body.email_to)

    # audit (redact token for security)
    try:
        token_suffix = token_link.split('/')[-1][-6:] if token_link else "unknown"
        sb.table("audit_events").insert({
            "org_id": ctx.org_id, "project_id": project_id, "actor_id": ctx.user_id,
            "kind": "signoff.package_sent",
            "details": {"stage_id": stage_id, "email_to": body.email_to, "token_suffix": f"...{token_suffix}",
                        "artifacts": [a["id"] for a in arts], "options": body.dict()}
        }).execute()
    except Exception: ...

    return {"ok": True, "token_link": token_link}

@router.post("/resend")
def resend_package(
    audit_event_id: str = Query(...),
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Resend a previously sent sign-off package using audit event details"""
    sb = get_user_supabase(ctx)
    
    # Get the original audit event
    try:
        audit = sb.table("audit_events").select("*")\
                 .eq("id", audit_event_id)\
                 .eq("org_id", ctx.org_id)\
                 .eq("project_id", project_id)\
                 .eq("kind", "signoff.package_sent")\
                 .single().execute().data
        if not audit:
            raise HTTPException(404, "Original sign-off package not found")
    except Exception:
        raise HTTPException(404, "Original sign-off package not found")
    
    details = audit.get("details", {})
    original_options = details.get("options", {})
    stage_id = details.get("stage_id")
    email_to = details.get("email_to")
    
    if not email_to or not stage_id:
        raise HTTPException(400, "Invalid original package data")
    
    # Recreate the package input from stored options
    try:
        package_input = PackageInput(
            stage_title=original_options.get("stage_title", ""),
            artifact_ids=original_options.get("artifact_ids", []),
            include_actions=original_options.get("include_actions", True),
            include_risks=original_options.get("include_risks", True),
            include_decisions=original_options.get("include_decisions", True),
            message=original_options.get("message"),
            email_to=email_to
        )
    except Exception as e:
        raise HTTPException(400, f"Failed to recreate package: {str(e)}")
    
    # Get project code
    try:
        proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
        proj_code = proj["code"] if proj else project_id
    except Exception:
        # Graceful fallback for missing database tables in development
        proj_code = project_id
    
    # Fetch current artifacts (ids might have changed)
    arts = []
    if package_input.artifact_ids:
        arts = sb.table("artifacts").select("id,name")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .in_("id", package_input.artifact_ids).execute().data or []
    
    # Fetch current lists
    lists = _fetch_lists(sb, ctx, ctx.org_id, project_id, package_input)
    html_out = _html_package(proj_code, package_input.stage_title, package_input, lists, arts)
    
    # Create a new external sign-off token (previous may be expired)
    ext = request_external(RequestExternalBody(
        stage_id=stage_id, 
        email_to=email_to, 
        message=f"Resending: {package_input.message or ''}"
    ), project_id, ctx)
    token_link = ext.get("token_link")
    
    # Send email (respecting quiet hours/caps)
    ok, reason = send_guard(sb, ctx.org_id, project_id, "signoff", email_to)
    if not ok:
        raise HTTPException(429, f"Cannot send email: {reason}")
    
    subj = f"[RESEND] Sign-Off Requested — {proj_code} / {package_input.stage_title}"
    html_mail = f"{html_out}<p><a href='{html.escape(token_link or '#')}' style='display:inline-block;padding:10px 14px;background:#111;color:#fff;border-radius:6px;text-decoration:none'>Review & Sign</a></p>"
    mailgun_send_html(email_to, subj, html_mail)
    log_send(sb, ctx.org_id, project_id, "signoff", email_to)
    
    # Log resend audit event (redact token for security)
    try:
        token_suffix = token_link.split('/')[-1][-6:] if token_link else "unknown"
        sb.table("audit_events").insert({
            "org_id": ctx.org_id, 
            "project_id": project_id, 
            "actor_id": ctx.user_id,
            "kind": "signoff.package_resent",
            "details": {
                "original_audit_id": audit_event_id,
                "stage_id": stage_id, 
                "email_to": email_to, 
                "token_suffix": f"...{token_suffix}",
                "artifacts": [a["id"] for a in arts], 
                "options": package_input.dict()
            }
        }).execute()
    except Exception: 
        pass  # Don't fail on audit logging
    
    return {"ok": True, "token_link": token_link, "resent_to": email_to}

@router.get("/sent-history")
def get_sent_history(
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Get history of sent sign-off packages"""
    sb = get_user_supabase(ctx)
    
    try:
        events = sb.table("audit_events").select("*")\
                   .eq("org_id", ctx.org_id)\
                   .eq("project_id", project_id)\
                   .in_("kind", ["signoff.package_sent", "signoff.package_resent"])\
                   .order("created_at", desc=True)\
                   .limit(50).execute().data or []
        
        # Format the events for display
        history = []
        for event in events:
            details = event.get("details", {})
            options = details.get("options", {})
            
            history.append({
                "id": event["id"],
                "created_at": event["created_at"],
                "kind": event["kind"],
                "stage_title": options.get("stage_title", "Unknown"),
                "email_to": details.get("email_to", "Unknown"),
                "actor_id": event.get("actor_id"),
                "can_resend": event["kind"] == "signoff.package_sent",  # Only allow resend of original sends
                "artifact_count": len(details.get("artifacts", [])),
                "original_audit_id": details.get("original_audit_id")  # For resend events
            })
        
        return {"history": history}
        
    except Exception as e:
        return {"history": [], "error": str(e)}

@router.post("/zip")
def zip_package(body: PackageInput, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    sb = get_user_supabase(ctx)
    sbs = get_service_supabase()
    try:
        proj = sb.table("projects").select("code").eq("id", project_id).single().execute().data
        proj_code = proj["code"] if proj else project_id
    except Exception:
        # Graceful fallback for missing database tables in development
        proj_code = project_id

    # artifacts to include
    arts = []
    if body.artifact_ids:
        arts = sb.table("artifacts").select("id,name,storage_bucket,storage_path")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id)\
               .in_("id", body.artifact_ids).execute().data or []

    lists = _fetch_lists(sb, ctx, ctx.org_id, project_id, body)
    html_out = _html_package(proj_code, body.stage_title, body, lists, arts)

    org = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
    html_out = export_header_html(org, proj_code) + html_out  # prepend brand header

    # Build zip in-memory
    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED)
    zf.writestr("README.html", html_out)
    zf.writestr("manifest.json", str({
        "project_code": proj_code, "stage_title": body.stage_title,
        "artifact_ids": body.artifact_ids, "options": body.dict(),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }))
    for a in arts:
        try:
            b = sbs.storage.from_(a["storage_bucket"]).download(a["storage_path"])
            zf.writestr(f"documents/{a.get('name') or a['id']}", b)
        except Exception as e:
            zf.writestr(f"documents/_missing_{a['id']}.txt", f"Could not download: {e}")
    zf.close(); buf.seek(0)

    from fastapi.responses import StreamingResponse
    filename = f"signoff_{proj_code}_{body.stage_title.replace(' ','_')}.zip"
    return StreamingResponse(iter([buf.getvalue()]), media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})

# GET shim for dev/testing (works if the UI accidentally does GET)
@router.get("/zip")
def zip_package_get(project_id: str = Query(...),
                    artifact_ids: str = "", stage_title: str = "Discovery",
                    include_actions: bool = True, include_risks: bool = True, include_decisions: bool = True,
                    message: str = "", ctx: TenantCtx = Depends(PM_PLUS)):
    body = PackageInput(stage_title=stage_title,
                        artifact_ids=[x for x in artifact_ids.split(",") if x],
                        include_actions=include_actions, include_risks=include_risks,
                        include_decisions=include_decisions, message=message)
    return zip_package(body, project_id, ctx)

# Add no-api aliases for Express proxy compatibility
@router_no_api.post("/preview")
def preview_no_api(body: PackageInput, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    return preview(body, project_id, ctx)

@router_no_api.post("/send")
def send_no_api(body: PackageInput, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    return send(body, project_id, ctx)

@router_no_api.post("/resend")
def resend_package_no_api(audit_event_id: str = Query(...), project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    return resend_package(audit_event_id, project_id, ctx)

@router_no_api.get("/sent-history")
def get_sent_history_no_api(project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    return get_sent_history(project_id, ctx)

@router_no_api.post("/zip")
def zip_package_no_api_post(body: PackageInput, project_id: str = Query(...), ctx: TenantCtx = Depends(PM_PLUS)):
    return zip_package(body, project_id, ctx)

@router_no_api.get("/zip")
def zip_package_no_api_get(project_id: str = Query(...),
                           artifact_ids: str = "", stage_title: str = "Discovery",
                           include_actions: bool = True, include_risks: bool = True, include_decisions: bool = True,
                           message: str = "", ctx: TenantCtx = Depends(PM_PLUS)):
    body = PackageInput(stage_title=stage_title,
                        artifact_ids=[x for x in artifact_ids.split(",") if x],
                        include_actions=include_actions, include_risks=include_risks,
                        include_decisions=include_decisions, message=message)
    return zip_package(body, project_id, ctx)