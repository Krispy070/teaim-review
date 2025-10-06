"""
Sign-off documents management router
Handles creation, viewing, and management of sign-off documents with e-signature capture
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Query, Form
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase, get_supabase_client
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/signoff-docs", tags=["signoff-docs"])
PM_PLUS = require_role({"owner", "admin", "pm", "lead"})


class SignoffDocCreate(BaseModel):
    name: str
    stage_id: Optional[str] = None
    kind: str = "document"
    html: Optional[str] = None
    storage_path: Optional[str] = None
    signer_email: Optional[str] = None


class SignoffDocUpdate(BaseModel):
    name: Optional[str] = None
    html: Optional[str] = None
    signer_email: Optional[str] = None
    # Note: status removed - only signing endpoints can change status


class SignoffDocSign(BaseModel):
    signed_name: str
    signature_data: Optional[dict] = None  # Browser info, etc.


@router.get("/list")
def list_signoff_docs(
    project_id: str = Query(...),
    status: Optional[str] = Query(None),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """List sign-off documents for a project"""
    sb = get_user_supabase(ctx)
    
    query = sb.table("signoff_docs").select("*")\
             .eq("org_id", ctx.org_id)\
             .eq("project_id", project_id)\
             .order("created_at", desc=True)
    
    if status:
        query = query.eq("status", status)
    
    try:
        result = query.execute()
        return {"documents": result.data or []}
    except Exception as e:
        logging.error(f"Failed to fetch sign-off documents: {e}")
        return {"documents": []}


@router.post("/create")
def create_signoff_doc(
    body: SignoffDocCreate,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Create a new sign-off document"""
    sb = get_user_supabase(ctx)
    
    doc_data = {
        "org_id": ctx.org_id,
        "project_id": project_id,
        "name": body.name,
        "kind": body.kind,
        "html": body.html,
        "storage_path": body.storage_path,
        "signer_email": body.signer_email,
        "created_by": ctx.user_id,
        "status": "draft"
    }
    
    if body.stage_id:
        doc_data["stage_id"] = body.stage_id
    
    try:
        result = sb.table("signoff_docs").insert(doc_data).execute()
        doc = result.data[0] if result.data else None
        
        if not doc:
            raise HTTPException(500, "Failed to create document")
        
        # Log audit event
        sb.table("audit_events").insert({
            "org_id": ctx.org_id,
            "project_id": project_id,
            "actor_id": ctx.user_id,
            "kind": "signoff_doc.created",
            "details": {"doc_id": doc["id"], "name": body.name}
        }).execute()
        
        return {"ok": True, "document": doc}
    except Exception as e:
        logging.error(f"Failed to create sign-off document: {e}")
        raise HTTPException(500, "Failed to create document")


@router.get("/{doc_id}")
def get_signoff_doc(
    doc_id: str,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Get a specific sign-off document"""
    sb = get_user_supabase(ctx)
    
    try:
        result = sb.table("signoff_docs").select("*")\
                  .eq("id", doc_id)\
                  .eq("org_id", ctx.org_id)\
                  .eq("project_id", project_id)\
                  .single().execute()
        
        if not result.data:
            raise HTTPException(404, "Document not found")
        
        return {"document": result.data}
    except Exception as e:
        logging.error(f"Failed to fetch sign-off document: {e}")
        raise HTTPException(404, "Document not found")


@router.patch("/{doc_id}")
def update_signoff_doc(
    doc_id: str,
    body: SignoffDocUpdate,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Update a sign-off document"""
    sb = get_user_supabase(ctx)
    
    # Prepare update data (status cannot be changed via PATCH)
    update_data = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.html is not None:
        update_data["html"] = body.html
    if body.signer_email is not None:
        update_data["signer_email"] = body.signer_email
    
    if not update_data:
        return {"ok": True}
    
    try:
        result = sb.table("signoff_docs").update(update_data)\
                  .eq("id", doc_id)\
                  .eq("org_id", ctx.org_id)\
                  .eq("project_id", project_id)\
                  .execute()
        
        if not result.data:
            raise HTTPException(404, "Document not found")
        
        # Log audit event
        sb.table("audit_events").insert({
            "org_id": ctx.org_id,
            "project_id": project_id,
            "actor_id": ctx.user_id,
            "kind": "signoff_doc.updated",
            "details": {"doc_id": doc_id, "changes": list(update_data.keys())}
        }).execute()
        
        return {"ok": True, "document": result.data[0]}
    except Exception as e:
        logging.error(f"Failed to update sign-off document: {e}")
        raise HTTPException(500, "Failed to update document")


@router.post("/{doc_id}/sign")
def sign_document(
    doc_id: str,
    body: SignoffDocSign,
    request: Request,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Sign a document with e-signature capture"""
    sb = get_user_supabase(ctx)
    
    # Get client IP address
    client_ip = getattr(request.client, 'host', 'unknown') if request.client else 'unknown'
    if hasattr(request, 'headers') and 'x-forwarded-for' in request.headers:
        client_ip = request.headers['x-forwarded-for'].split(',')[0].strip()
    
    # Prepare signature metadata
    signed_meta = {
        "user_agent": request.headers.get("user-agent", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "signature_data": body.signature_data or {}
    }
    
    try:
        # Update document with signature, but only if not already signed
        result = sb.table("signoff_docs").update({
            "status": "signed",
            "signed_by": ctx.user_id,
            "signed_name": body.signed_name,
            "signed_ip": client_ip,
            "signed_meta": signed_meta,
            "signed_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", doc_id)\
          .eq("org_id", ctx.org_id)\
          .eq("project_id", project_id)\
          .in_("status", ["draft", "sent"])\
          .execute()
        
        if not result.data:
            raise HTTPException(400, "Document not found or already signed")
        
        # Mark ALL tokens for this document as used to prevent external signing after internal signature
        sb.table("signoff_doc_tokens").update({
            "used_at": datetime.now(timezone.utc).isoformat()
        }).eq("doc_id", doc_id).execute()
        
        # Log audit event
        sb.table("audit_events").insert({
            "org_id": ctx.org_id,
            "project_id": project_id,
            "actor_id": ctx.user_id,
            "kind": "signoff_doc.signed",
            "details": {
                "doc_id": doc_id,
                "signed_name": body.signed_name,
                "ip_address": client_ip
            }
        }).execute()
        
        # Emit webhook event for signoff document signed
        try:
            from ..utils.events import emit_event
            emit_event(
                org_id=ctx.org_id,
                project_id=project_id,
                kind="signoff.doc.signed",
                details={
                    "doc_id": doc_id,
                    "signed_name": body.signed_name,
                    "signed_by": ctx.user_id,
                    "ip_address": client_ip
                }
            )
        except Exception as e:
            # Don't fail signing process if webhook fails
            print(f"Failed to emit signoff.doc.signed event: {e}")
        
        # Create notification for document signed
        try:
            from ..supabase_client import get_supabase_client
            sbs = get_supabase_client()
            sbs.table("notifications").insert({
                "org_id": ctx.org_id, 
                "project_id": project_id,
                "kind": "signoff.doc.signed", 
                "title": "Document signed",
                "body": {"doc_id": doc_id, "email": ctx.user_id, "name": body.signed_name},
                "link": f"/projects/{project_id}/signoff/docs"
            }).execute()
        except Exception as e:
            # Don't fail signing process if notification fails
            print(f"Failed to create notification for signoff.doc.signed: {e}")
        
        return {"ok": True, "document": result.data[0]}
    except Exception as e:
        logging.error(f"Failed to sign document: {e}")
        raise HTTPException(500, "Failed to sign document")


@router.delete("/{doc_id}")
def delete_signoff_doc(
    doc_id: str,
    project_id: str = Query(...),
    ctx: TenantCtx = Depends(PM_PLUS)
):
    """Delete a sign-off document"""
    sb = get_user_supabase(ctx)
    
    try:
        # First check if document exists
        existing = sb.table("signoff_docs").select("id,name")\
                    .eq("id", doc_id)\
                    .eq("org_id", ctx.org_id)\
                    .eq("project_id", project_id)\
                    .single().execute()
        
        if not existing.data:
            raise HTTPException(404, "Document not found")
        
        # Delete the document
        sb.table("signoff_docs").delete()\
          .eq("id", doc_id)\
          .eq("org_id", ctx.org_id)\
          .eq("project_id", project_id)\
          .execute()
        
        # Log audit event
        sb.table("audit_events").insert({
            "org_id": ctx.org_id,
            "project_id": project_id,
            "actor_id": ctx.user_id,
            "kind": "signoff_doc.deleted",
            "details": {"doc_id": doc_id, "name": existing.data["name"]}
        }).execute()
        
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to delete sign-off document: {e}")
        raise HTTPException(500, "Failed to delete document")


# Public endpoints for document viewing and signing
@router.get("/docs/token/{token}", response_class=HTMLResponse)
def open_doc(token: str):
    """Public endpoint to view a sign-off document via token"""
    sb = get_supabase_client()
    
    try:
        # Get document by token
        doc_token = sb.table("signoff_doc_tokens").select("*")\
                     .eq("token", token)\
                     .single().execute()
        
        if not doc_token.data:
            raise HTTPException(404, "Document not found")
        
        # Check if token is expired or used
        token_data = doc_token.data
        if token_data.get("used_at"):
            raise HTTPException(400, "Document already signed")
        
        # Get the actual document
        doc = sb.table("signoff_docs").select("*")\
               .eq("id", token_data["doc_id"])\
               .single().execute()
        
        if not doc.data:
            raise HTTPException(404, "Document not found")
        
        d = doc.data
        sbs = sb.table("org_branding").select("*")\
                .eq("org_id", d["org_id"]).execute()
        
        bheader = export_header_html(sbs.data[0] if sbs.data else {}, d.get("project_code"))
        html = d.get("html", "<p>Document content not available</p>")
        
        return HTMLResponse(f"""
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Arial, sans-serif; max-width:880px; margin:auto }}
    .btn {{ padding:10px 14px; border:1px solid #ccc; border-radius:6px; cursor:pointer }}
    .btn:hover {{ box-shadow: 0 0 14px rgba(29,228,255,.35) }}
    @media print {{
      body {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
      .btn, form {{ display: none !important; }} /* hide controls on print */
    }}
    .export-header {{ display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #111;padding:8px 0; }}
    .export-header .left,.export-header .right {{ display:flex;align-items:center;gap:8px; }}
  </style>
</head>
<body>
  {bheader}
  {html}
  <hr/>
  <form method="POST" action="/api/signoff/docs/token-sign?token={token}">
    <label>Name: <input name="signed_name" required/></label>
    <label style="margin-left:10px;"><input type="checkbox" name="confirm" required/> I agree and sign.</label>
    <br/><br/>
    <input class="btn" type="submit" value="I acknowledge and sign"/>
  </form>
</body></html>
        """)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to open document: {e}")
        raise HTTPException(500, "Failed to load document")


@router.post("/docs/token-sign")
def token_sign(token: str = Query(...), signed_name: str = Form(...), confirm: str = Form(...)):
    """Public endpoint to sign a document via token"""
    sb = get_supabase_client()
    
    try:
        # Get and validate token
        doc_token = sb.table("signoff_doc_tokens").select("*")\
                     .eq("token", token)\
                     .single().execute()
        
        if not doc_token.data:
            raise HTTPException(404, "Invalid token")
        
        token_data = doc_token.data
        if token_data.get("used_at"):
            raise HTTPException(400, "Document already signed")
        
        # Mark token as used and update document
        sb.table("signoff_doc_tokens").update({
            "used_at": datetime.now(timezone.utc).isoformat(),
            "signed_name": signed_name
        }).eq("id", token_data["id"]).execute()
        
        # Update the document status
        sb.table("signoff_docs").update({
            "status": "signed",
            "signed_at": datetime.now(timezone.utc).isoformat(),
            "signed_name": signed_name
        }).eq("id", token_data["doc_id"]).execute()
        
        # Fetch stage_id from doc to record a proper stage signed metric
        doc_info = sb.table("signoff_docs").select("stage_id,org_id,project_id")\
                     .eq("id", token_data["doc_id"]).limit(1).execute().data
        stg = doc_info and doc_info[0]
        if stg and stg.get("stage_id"):
            try:
                sb.table("method_metrics").insert({
                  "org_id": stg["org_id"], 
                  "project_id": stg["project_id"],
                  "kind": "stage.signed", 
                  "stage_id": stg.get("stage_id"),
                  "stage_title": None, 
                  "stage_area": None, 
                  "value": None,
                  "meta": {"doc_id": token_data["doc_id"], "event":"signoff.doc.signed"}
                }).execute()
            except Exception:
                pass  # Don't fail the signing process if metrics fail
        
        # Return success page with confetti
        return HTMLResponse("""
<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh }
  .card { text-align:center; }
  .confetti { position:fixed; inset:0; pointer-events:none; }
</style></head>
<body>
  <canvas class="confetti" id="c"></canvas>
  <div class="card">
    <h2>Thank you — signed!</h2>
    <div style="color:#666">Your acknowledgment has been recorded.</div>
  </div>
<script>
  // tiny confetti
  const canvas = document.getElementById('c'); const ctx = canvas.getContext('2d');
  let w, h, pieces=[]; function resize(){ w=canvas.width=window.innerWidth; h=canvas.height=window.innerHeight }
  window.addEventListener('resize', resize); resize();
  for(let i=0;i<120;i++) pieces.push({x:Math.random()*w, y:Math.random()*-h, r:2+Math.random()*4, c:`hsl(${Math.random()*360},80%,60%)`, s:1+Math.random()*2});
  function tick(){ ctx.clearRect(0,0,w,h); pieces.forEach(p=>{ p.y+=p.s; p.x+=Math.sin(p.y/20); if(p.y>h) p.y=-10; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();}); requestAnimationFrame(tick); }
  tick();
  setTimeout(()=>{document.querySelector('.confetti').remove();}, 4000);
</script>
</body></html>
        """)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to sign document: {e}")
        raise HTTPException(500, "Failed to sign document")