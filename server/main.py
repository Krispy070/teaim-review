import os
import tempfile
import asyncio
import logging
import json
import datetime as dt
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request, Query, Body, Depends
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import aiofiles

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

from .models import (
    AskRequest, AskResponse, WellnessPulseRequest, ActionNudgeRequest, 
    ActionNudgeResponse, DigestResponse
)
from .supabase_client import get_supabase_client, get_supabase_storage_client
from .db import get_conn
from .tenant import TenantCtx, require_project_member, require_project_admin
from .parsing import extract_text_from_file, validate_file_safety
from .chunking import chunk_text
from .mem_agent import extract_memories_from_text, generate_summary_with_extractions, calculate_wellness_score, should_create_wellness_signal
from .rag import answer_with_citations, embed_texts
from .onboarding_send import send_onboarding_email, ONBOARDING_TEMPLATES
from .email_send import get_mailgun_status
from .classifier import classify_text
from .updater import apply_updates
from .scheduler import digest_scheduler

app = FastAPI(title="TEAIM API", description="Workday Implementation Hub API")

# Mount Mailgun email router
from .email_mailgun import router as email_router
app.include_router(email_router, prefix="")

# Mount team management and admin email routers
from .team_api import router as team_router
from .admin_email_api import router as admin_email_router
from .meetings_api import router as meetings_router
from .mem_api import router as mem_router
from .routers.comms import router as comms_router
from .routers.digest import router as digest_router
from .routers.digest_compact import router as digest_compact_router
from .routers.digest_preview import router as digest_preview_router
from .routers.digest_changes import router as digest_changes_router
from .routers.review import router as review_router
from .routers.audit import router as audit_router, router_api as audit_router_api
from .routers.dev_seed import router as dev_seed_router
from .routers.admin_seed import router as admin_seed_router
from .routers.sentinel import router as sentinel_router
from .routers.team_access import router as team_access_router
from .routers.updates import router as updates_router, router_api as updates_router_api
from .routers.stages_manage import router as stages_manage_router
from .routers.stages_owners import router as stages_owners_router
from .routers.updates_status import router as updates_status_router, router_no_api as updates_status_router_no_api
from .routers.updates_rules import router as updates_rules_router
from .routers.webhooks import router as webhooks_router
from .routers.invite_seeding import router as invite_seeding_router
from .routers.classifier_ingest import router as classifier_ingest_router
from .routers.visibility_guard import router as visibility_guard_router
from .routers.signoff_docs_gen import router as signoff_docs_gen_router
from .routers.invite_token import router as invite_token_router
from .routers.stages_batch import router as stages_batch_router
from .routers.summaries_propose import router as summaries_propose_router
from .routers.schema_doctor import router as schema_doctor_router
from .routers.stages_templates import router as stages_templates_router
from .routers.stages_template_apply import router as stages_template_apply_router
from .routers.router_bp import bp_router
from .routers.router_test_review import test_review_router
from .routers.seed_staging_tests import seed_tests_router
from .routers.tests_library import router as tests_library_router
from .routers.corrections import router as corrections_router
from .routers.ingest import router as ingest_router
from .routers.notifications import router as notifications_router
from .routers.export_dataroom import router as export_dataroom_router
from .routers.branding import router as branding_router
from .routers.wellness import router as wellness_router
from .routers.wellness_export import router as wellness_export_router
from .routers.wellness_user import router as wellness_user_router
from .routers.wellness_trend_by_csv import router as wellness_trend_by_csv_router
from .routers.stages_signed import router as stages_signed_router
from .routers.meetings_export import router as meetings_export_router
from .routers.projects_list import router as projects_list_router
from .routers.wellness_rollup import router as wellness_rollup_router
from .routers.method_lateness import router as method_lateness_router
from .routers.stages_request_sign import router as stages_request_sign_router
from .routers.signoff_pending import router as signoff_pending_router
from .routers.artifacts_last import router as artifacts_last_router
from .routers.artifacts_by_stage import router as artifacts_by_stage_router
from .routers.export_csv_bundle import router as export_csv_bundle_router
from .routers.stage_doc_default import router as stage_doc_default_router
from .routers.signoff_tokens_admin import router as signoff_tokens_admin_router
from .routers.wellness_top_export_html import router as wellness_top_export_html_router
from .routers.stages_guardrails import router as stages_guardrails_router
from .routers.stages_shift import router as stages_shift_router
from .routers.workbooks import router as workbooks_router
from .routers.reports import router as reports_router
from .routers.reports_registry import router as reports_registry_router
from .routers.ops_scheduler import router as ops_scheduler_router
from .routers.guides import router as guides_router
from .routers.user_prefs import router as user_prefs_router
from .routers.areas import router as areas_router
from .routers.area_comments import router as area_comments_router
from .routers.actions_by_area import router as actions_by_area_router
from .routers.area_tools import router as area_tools_router, areas_router as area_tools_areas_router
from .routers.areas_webhook import router as areas_webhook_router
from .routers import releases_ics
from .routers.meetings_recent import router as meetings_recent_router
from .routers.actions_small import router as actions_small_router
from .routers.updates_feed import router as updates_feed_router
from .routers import area_admins
from .routers import changes
from .routers import releases
from .routers import releases_health
from .routers import changes_watchers
from .routers import changes_sla
from .routers import changes_bulk
from .routers import changes_nudge
from .routers import changes_nudge_schedule
from .routers import owner_digest
from .routers import releases_compare
from .routers import ops_audit_feed
from .routers import cr_digest
from .routers import presence
from .routers import changes_templates
from .routers import releases_ics
from .routers import area_audit
from .routers import updates_seen
from .routers.users_self_service import router as users_self_service_router
app.include_router(team_router, prefix="")
app.include_router(admin_email_router, prefix="")
app.include_router(review_router, prefix="")
app.include_router(audit_router, prefix="")
app.include_router(audit_router_api, prefix="")
app.include_router(dev_seed_router, prefix="")
app.include_router(admin_seed_router, prefix="")
app.include_router(meetings_router, prefix="")
app.include_router(mem_router, prefix="")
app.include_router(comms_router, prefix="")
app.include_router(digest_router, prefix="")
app.include_router(digest_compact_router, prefix="")
app.include_router(digest_preview_router, prefix="")
app.include_router(digest_changes_router, prefix="")
app.include_router(owner_digest.router, prefix="/api/owner_digest")
app.include_router(releases_compare.router, prefix="/api/releases_compare")
app.include_router(cr_digest.router)
app.include_router(presence.router)
app.include_router(ops_audit_feed.router, prefix="/api/ops_audit")
app.include_router(sentinel_router, prefix="")
app.include_router(team_access_router, prefix="")
app.include_router(updates_router, prefix="")
app.include_router(updates_router_api, prefix="")
app.include_router(stages_manage_router, prefix="")
app.include_router(stages_owners_router, prefix="")
app.include_router(updates_status_router, prefix="")
app.include_router(updates_status_router_no_api, prefix="")
app.include_router(updates_rules_router, prefix="")
app.include_router(webhooks_router, prefix="")
app.include_router(invite_seeding_router, prefix="")
app.include_router(classifier_ingest_router, prefix="")
app.include_router(visibility_guard_router, prefix="")
app.include_router(signoff_docs_gen_router, prefix="")
app.include_router(invite_token_router, prefix="")
app.include_router(stages_batch_router, prefix="")
app.include_router(summaries_propose_router, prefix="")
app.include_router(schema_doctor_router, prefix="")
app.include_router(stages_templates_router, prefix="")
app.include_router(stages_template_apply_router, prefix="")
app.include_router(bp_router, prefix="")
app.include_router(test_review_router, prefix="")
app.include_router(seed_tests_router, prefix="")
app.include_router(tests_library_router, prefix="")
app.include_router(corrections_router, prefix="")
app.include_router(ingest_router, prefix="")
app.include_router(notifications_router)
app.include_router(export_dataroom_router, prefix="")
app.include_router(branding_router, prefix="")
app.include_router(wellness_router, prefix="")
app.include_router(wellness_export_router, prefix="")
app.include_router(wellness_user_router, prefix="")
app.include_router(wellness_trend_by_csv_router, prefix="/api/wellness")
app.include_router(stages_signed_router, prefix="")
app.include_router(meetings_export_router, prefix="")
app.include_router(projects_list_router, prefix="")
app.include_router(wellness_rollup_router, prefix="")
app.include_router(method_lateness_router, prefix="")
app.include_router(stages_request_sign_router, prefix="")
app.include_router(signoff_pending_router, prefix="")
app.include_router(artifacts_last_router, prefix="")
app.include_router(artifacts_by_stage_router, prefix="")
app.include_router(export_csv_bundle_router, prefix="")
app.include_router(stage_doc_default_router, prefix="")
app.include_router(signoff_tokens_admin_router, prefix="")
app.include_router(wellness_top_export_html_router, prefix="")
app.include_router(stages_guardrails_router, prefix="")
app.include_router(stages_shift_router, prefix="")
app.include_router(workbooks_router, prefix="/workbooks")
app.include_router(reports_router, prefix="/reports")
app.include_router(reports_registry_router, prefix="/reports")
app.include_router(ops_scheduler_router, prefix="")
app.include_router(guides_router, prefix="")
app.include_router(user_prefs_router, prefix="")
app.include_router(areas_router, prefix="")
app.include_router(area_comments_router, prefix="")
app.include_router(actions_by_area_router, prefix="")
app.include_router(area_tools_router, prefix="")
app.include_router(area_tools_areas_router, prefix="")
app.include_router(areas_webhook_router, prefix="")
app.include_router(meetings_recent_router, prefix="")
app.include_router(actions_small_router, prefix="")
app.include_router(updates_feed_router, prefix="")
app.include_router(area_admins.router)
app.include_router(changes.router)
app.include_router(releases.router)
app.include_router(releases_health.router)
app.include_router(changes_watchers.router)
app.include_router(changes_sla.router)
app.include_router(changes_bulk.router)
app.include_router(changes_nudge.router)
app.include_router(changes_nudge_schedule.router)
app.include_router(changes_templates.router)
app.include_router(releases_ics.router)
app.include_router(area_audit.router)
app.include_router(updates_seen.router)
app.include_router(users_self_service_router, prefix="")


# Mount project management routers
from .onboarding_wizard import router as wizard_router
from .export_api import router as export_router
from .archive_api import router as archive_router
app.include_router(wizard_router, prefix="")
app.include_router(export_router, prefix="")
app.include_router(archive_router, prefix="")

# Mount SOW bootstrap and timeline routers
from .sow_bootstrap import router as sow_router
from .timeline_api import router as timeline_router
app.include_router(sow_router, prefix="")
app.include_router(timeline_router, prefix="")

# Mount stages management router
from .stages_api import router as stages_router
app.include_router(stages_router, prefix="")

# Mount members management router
from .routers.members import router as members_router
from .routers.members_signers import router as members_signers_router
app.include_router(members_router, prefix="")
app.include_router(members_signers_router, prefix="")

# Security sentinel router already mounted above

# Mount External Signer Tokens router for Sprint 1
from .routers.signoff_external import router as signoff_external_router
app.include_router(signoff_external_router, prefix="")

# Mount Sign-Off Document Management routers for Next Big Build
from .routers.signoff_docs import router as signoff_docs_router
from .routers.signoff_tokens import router as signoff_tokens_router
app.include_router(signoff_docs_router, prefix="")
app.include_router(signoff_tokens_router, prefix="")

# Mount streaming export router for Sprint 2
from .routers.export_stream import router as export_stream_router
from .routers.backups import router as backups_router
from .routers.reindex import router as reindex_router
from .routers.search import router as search_router, router_no_api as search_router_no_api
from .routers.admin_health import router as admin_health_router
from .routers.queue_status import router as queue_status_router
from .routers.integrations import router as integrations_router
from .routers.artifact_tags import router as artifact_tags_router
from .routers.csv_export import router as csv_export_router
from .routers.actions_status import router as actions_status_router
from .routers.signoff_package import router as signoff_package_router, router_no_api as signoff_package_router_no_api
from .routers._debug_routes import router as debug_routes_router
from .routers.documents_list import router as documents_list_router
from .routers.analytics import router as analytics_router, router_no_api as analytics_router_no_api
from .routers.actions_due import router as actions_due_router
from .routers.actions_list import router as actions_list_router
from .routers.actions_assign import router as actions_assign_router
from .routers.bulk_export import router as bulk_export_router
from .routers.documents_bulk import router as documents_bulk_router, router_api as documents_bulk_router_api
from .routers.rls_selftest import router as rls_selftest_router, router_api as rls_selftest_router_api
from .routers.artifact_share import router as artifact_share_router
from .routers.share_links import router as share_links_router, pub as share_links_pub_router
from .routers.share_links_export import router as share_links_export_router
from .routers.audit_export import router as audit_export_router
app.include_router(export_stream_router, prefix="")
app.include_router(backups_router, prefix="")
app.include_router(reindex_router, prefix="")
app.include_router(search_router, prefix="")
app.include_router(search_router_no_api, prefix="")
app.include_router(admin_health_router, prefix="")
app.include_router(queue_status_router, prefix="")
app.include_router(integrations_router, prefix="")
app.include_router(artifact_tags_router, prefix="")
app.include_router(csv_export_router, prefix="")
app.include_router(actions_status_router, prefix="")
app.include_router(signoff_package_router, prefix="")
app.include_router(signoff_package_router_no_api, prefix="")
app.include_router(debug_routes_router, prefix="")
app.include_router(documents_list_router, prefix="")
app.include_router(analytics_router, prefix="")
app.include_router(analytics_router_no_api, prefix="")
app.include_router(actions_due_router, prefix="")
app.include_router(actions_list_router, prefix="")
app.include_router(actions_assign_router, prefix="")
app.include_router(bulk_export_router, prefix="")
app.include_router(documents_bulk_router, prefix="")
app.include_router(documents_bulk_router_api, prefix="")
app.include_router(rls_selftest_router, prefix="")
app.include_router(rls_selftest_router_api, prefix="")
app.include_router(artifact_share_router, prefix="")

# Mount share links router without prefix (Express forwards /api/share-links/* to /share-links/*)
app.include_router(share_links_router, prefix="")

# Mount share links export router
app.include_router(share_links_export_router, prefix="")

# Mount audit export router
app.include_router(audit_export_router, prefix="")


# Mount public share links router with /api prefix (so /api/share/{token} works)
app.include_router(share_links_pub_router, prefix="/api")

# Add the new rate limiting middleware first  
from .rate_limit import RateLimitMiddleware
app.add_middleware(RateLimitMiddleware)

# CORS middleware - restrict origins for security
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://127.0.0.1:5000"],  # Only allow Express server
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Rate limiting storage (in production, use Redis)
request_counts = {}

def check_rate_limit(client_ip: str, endpoint: str, limit: int = 10) -> bool:
    """Simple rate limiting - replace with proper solution in production"""
    key = f"{client_ip}:{endpoint}"
    now = datetime.now()
    hour_key = now.strftime("%Y%m%d%H")
    full_key = f"{key}:{hour_key}"
    
    count = request_counts.get(full_key, 0)
    if count >= limit:
        return False
    
    request_counts[full_key] = count + 1
    return True

async def log_audit(org_id: str = None, project_id: str = None, user_id: str = None, 
                   action: str = "", details: Dict = None, ip_address: str = "", user_agent: str = ""):
    """Log audit trail"""
    try:
        supabase = get_supabase_client()
        supabase.table("audit_log").insert({
            "org_id": org_id,
            "project_id": project_id,
            "user_id": user_id,
            "action": action,
            "details": details or {},
            "ip_address": ip_address,
            "user_agent": user_agent
        }).execute()
    except Exception as e:
        print(f"Audit log error: {e}")

@app.get("/")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "TEAIM API"}

@app.post("/ingest")
async def ingest_document(
    background_tasks: BackgroundTasks,
    request: Request,
    org_id: str = Form(...),
    project_id: str = Form(...),
    file: UploadFile = File(...)
):
    """Ingest and process uploaded documents"""
    
    # Rate limiting
    client_ip = request.client.host
    if not check_rate_limit(client_ip, "ingest", limit=5):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    try:
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        # Validate file safety
        is_safe, error_msg = validate_file_safety(tmp_path)
        if not is_safe:
            os.unlink(tmp_path)
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Upload to Supabase storage
        storage = get_supabase_storage_client()
        bucket_path = f"{org_id}/{project_id}/{file.filename}"
        
        with open(tmp_path, 'rb') as f:
            storage.upload(bucket_path, f.read())
        
        # Parse meeting date from filename (YYYY-MM-DD or YYYY_MM_DD format)
        import re
        import datetime as dt
        meeting_date = None
        if file.filename:
            # Look for date patterns in filename
            m = re.search(r'(20\d{2})[-_](\d{2})[-_](\d{2})', file.filename)
            if m:
                try:
                    meeting_date = dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
                except:
                    pass  # Invalid date, leave as None
        
        # Create artifact record
        supabase = get_supabase_client()
        artifact_result = supabase.table("artifacts").insert({
            "org_id": org_id,
            "project_id": project_id,
            "title": file.filename,
            "path": bucket_path,
            "mime_type": file.content_type,
            "size": len(content),
            "uploaded_by": "00000000-0000-0000-0000-000000000000",  # TODO: Get from auth
            "meeting_date": meeting_date
        }).execute()
        
        artifact_id = artifact_result.data[0]["id"]
        
        # Schedule background processing
        background_tasks.add_task(
            process_document_background,
            tmp_path, artifact_id, org_id, project_id, file.filename, file.content_type
        )
        
        await log_audit(
            org_id=org_id,
            project_id=project_id,
            action="document_upload",
            details={"filename": file.filename, "size": len(content)},
            ip_address=client_ip
        )
        
        return {"artifact_id": artifact_id, "status": "uploaded", "processing": "background"}
        
    except Exception as e:
        if 'tmp_path' in locals():
            os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest-sync")
async def ingest_sync(
    org_id: str = Form(...),
    project_id: str = Form(...),
    source: str = Form("doc"),
    file: UploadFile = File(...)
):
    """Ingest and process document synchronously (no background jobs)"""
    try:
        from uuid import uuid4
        
        # Read file data
        data = await file.read()
        
        # Setup storage with unique key to prevent conflicts
        supabase = get_supabase_client()
        BUCKET = os.environ.get("BUCKET", "project-artifacts")
        safe_filename = file.filename.replace(" ", "_").replace("/", "_")
        key = f"{project_id}/{uuid4().hex}_{safe_filename}"
        
        # 1) Store file (v2 signature with unique key)
        supabase.storage.from_(BUCKET).upload(
            path=key,
            file=data,
            file_options={"content-type": file.content_type or "application/octet-stream"}
        )
        
        # 2) Parse -> chunk -> embed first
        # Create temporary file for text extraction (function expects file path)
        import tempfile
        from pathlib import Path
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            tmp_file.write(data)
            tmp_path = tmp_file.name
        
        try:
            text, error = extract_text_from_file(tmp_path, file.content_type or "application/octet-stream")
            if error:
                raise HTTPException(status_code=400, detail=f"Text extraction failed: {error}")
            
            # Load PII policy and apply redaction
            from .pii_redaction import redact, PiiPolicy
            from .db import get_conn
            pii_mode = "strict"
            allow_domains = []
            had_pii = False
            pii_summary = {}
            
            try:
                with get_conn() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT pii_mode, allow_email_domains FROM project_settings WHERE project_id = %s",
                            (project_id,)
                        )
                        row = cur.fetchone()
                        if row:
                            pii_mode = row[0] or "strict"
                            allow_domains = row[1] if row[1] else []
            except:
                pass  # Use defaults if policy not found
            
            policy = PiiPolicy(mode=pii_mode, allow_email_domains=allow_domains)
            redacted_text, pii_summary, had_pii = redact(text, policy)
            
            # Use redacted text for chunking and embedding
            chunks = chunk_text(redacted_text, 1200, 200)
            # Extract text content from tuples (chunks are returned as (content, index))
            chunk_texts = [chunk[0] for chunk in chunks] if chunks else []
            embs = embed_texts(chunk_texts) if chunk_texts else []
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass
        
        # 3) Parse meeting date from filename (YYYY-MM-DD or YYYY_MM_DD format)
        import re
        import datetime as dt
        meeting_date = None
        if file.filename:
            # Look for date patterns in filename
            m = re.search(r'(20\d{2})[-_](\d{2})[-_](\d{2})', file.filename)
            if m:
                try:
                    meeting_date = dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
                except:
                    pass  # Invalid date, leave as None
        
        # 4) DB writes - use psycopg to bypass PostgREST schema cache issues
        WRITE_MODE = "psycopg"  # Force psycopg due to PostgREST schema cache issues
        
        if WRITE_MODE == "rest":
            # REST writes via PostgREST with automatic fallback
            try:
                art = supabase.table("artifacts").insert({
                    "org_id": org_id,
                    "project_id": project_id,
                    "path": key,
                    "mime_type": file.content_type,
                    "title": file.filename,
                    "source": source,
                    "size": len(data),
                    "uploaded_by": "00000000-0000-0000-0000-000000000000",
                    "meeting_date": meeting_date
                }).execute().data[0]
                
                artifact_id = art["id"]
            except Exception as rest_error:
                # Automatic fallback to psycopg if PostgREST fails
                logging.warning(f"PostgREST failed, falling back to psycopg: {rest_error}")
                WRITE_MODE = "psycopg"
            
            if WRITE_MODE == "rest":
                # Insert chunks in batches via PostgREST
                rows = [{
                    "org_id": org_id,
                    "project_id": project_id,
                    "artifact_id": artifact_id,
                    "chunk_index": chunk[1],  # Use actual chunk index from tuple
                    "content": chunk[0],      # Use chunk content from tuple
                    "embedding": e
                } for chunk, e in zip(chunks, embs)]
                
                if rows:
                    for i in range(0, len(rows), 200):
                        supabase.table("artifact_chunks").insert(rows[i:i+200]).execute()
                
                # Update artifact with chunk count
                supabase.table("artifacts").update({"chunk_count": len(rows)}).eq("id", artifact_id).execute()
                
                # Create summary
                supabase.table("summaries").insert({
                    "org_id": org_id,
                    "project_id": project_id,
                    "artifact_id": artifact_id,
                    "level": "artifact",
                    "summary": text[:2000]
                }).execute()
            
        if WRITE_MODE == "psycopg":
            # psycopg writes (bypass PostgREST)
            from .db import get_conn, insert_artifact, update_artifact_chunk_count, insert_chunks, insert_summary
            
            with get_conn() as conn:
                artifact_id = insert_artifact(
                    conn, org_id, project_id, key, file.content_type, file.filename, source, meeting_date
                )
                
                # Prepare chunk rows for psycopg  
                rows = [{
                    "chunk_index": chunk[1],  # Use actual chunk index from tuple
                    "content": chunk[0],      # Use chunk content from tuple
                    "embedding": e
                } for chunk, e in zip(chunks, embs)]
                
                if rows:
                    insert_chunks(conn, org_id, project_id, artifact_id, rows)
                update_artifact_chunk_count(conn, artifact_id, len(rows))
                
                # Create summary (use redacted text)
                insert_summary(conn, org_id, project_id, artifact_id, redacted_text[:2000])
                
                # Store PII audit if PII was detected
                if had_pii:
                    import json
                    with conn.cursor() as cur:
                        cur.execute(
                            "INSERT INTO pii_audit (project_id, doc_id, summary) VALUES (%s, %s, %s)",
                            (project_id, artifact_id, json.dumps(pii_summary))
                        )
        
        # 4) Document classification and dashboard updates
        try:
            # Extract structured project updates using GPT classification
            project_code = f"WD-{project_id[:8]}"
            updates = classify_text(text, project_code)
            
            # Apply updates to project dashboard (high confidence -> direct publish, low confidence -> review queue)
            apply_updates(org_id, project_id, artifact_id, project_code, updates)
            
            # Log classification audit
            supabase.table("ingestion_audit").insert({
                "org_id": org_id,
                "project_id": project_id, 
                "artifact_id": artifact_id,
                "doc_type": updates.get("doc_type", "other"),
                "status": "classified"
            }).execute()
            
        except Exception as e:
            logging.error(f"Classification failed for {file.filename}: {e}")
        
        # SOW-driven bootstrap functionality (legacy)
        try:
            if file.filename.lower().startswith("sow") or "statement of work" in (text[:300].lower()):
                # call your bootstrap endpoint directly (without HTTP)
                CANDIDATES = ["HCM","Recruiting","Talent","Compensation","Benefits","Time & Absence",
                              "Payroll","Finance","Projects","Procurement","Expenses",
                              "Security","Integrations","Reporting/Prism","Change Management",
                              "Training","Cutover","Data Conversion","Testing"]
                found = [{"name": c} for c in CANDIDATES if c.split("&")[0].split("/")[0].strip().lower() in text.lower()]
                if not found:
                    found = [{"name": n} for n in ["HCM","Payroll","Finance","Integrations","Security","Reporting","Cutover"]]
                # persist with fallback
                _ws_upsert_psycopg(org_id, project_id, found[:30])
        except Exception:
            pass
        
        return {"ok": True, "artifact_id": artifact_id, "chunks": len(rows)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/diag/db")
def diag_db():
    """Test database connectivity"""
    try:
        from .db import get_conn
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("select 1")
            ok = cur.fetchone()[0] == 1
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/diag/storage")
def diag_storage():
    """Test storage connectivity"""
    try:
        import time
        supabase = get_supabase_client()
        BUCKET = os.environ.get("BUCKET", "project-artifacts")
        key = f"diag/{int(time.time())}.txt"
        content = b"teaim-storage-smoke"
        
        # Upload file (v2 signature)
        supabase.storage.from_(BUCKET).upload(
            path=key,
            file=content,
            file_options={"content-type": "text/plain"}
        )
        
        # Create signed URL
        signed = supabase.storage.from_(BUCKET).create_signed_url(key, 600)
        url = signed.get("signedURL") or signed.get("signed_url")
        
        return {"ok": True, "key": key, "signed_url": url}
    except Exception as e:
        return {"ok": False, "error": str(e)}

async def process_document_background(tmp_path: str, artifact_id: str, org_id: str, 
                                    project_id: str, filename: str, content_type: str):
    """Background task to process uploaded document"""
    try:
        # Extract text
        text, error = extract_text_from_file(tmp_path, content_type)
        if error:
            print(f"Text extraction error for {filename}: {error}")
            return
        
        # Generate chunks
        chunks = chunk_text(text)
        
        # Generate embeddings and store chunks
        supabase = get_supabase_client()
        chunk_count = 0
        
        for chunk_text, chunk_index in chunks:
            try:
                embedding = embed_texts([chunk_text])[0]
                
                supabase.table("artifact_chunks").insert({
                    "org_id": org_id,
                    "project_id": project_id,
                    "artifact_id": artifact_id,
                    "content": chunk_text,
                    "chunk_index": chunk_index,
                    "embedding": embedding
                }).execute()
                
                chunk_count += 1
            except Exception as e:
                print(f"Error processing chunk {chunk_index}: {e}")
        
        # Generate summary
        summary_data = await generate_summary_with_extractions(text, filename)
        
        supabase.table("summaries").insert({
            "org_id": org_id,
            "project_id": project_id,
            "artifact_id": artifact_id,
            "summary": summary_data["summary"],
            "risks": summary_data["risks"],
            "decisions": summary_data["decisions"],
            "actions": summary_data["actions"],
            "provenance": summary_data["provenance"]
        }).execute()
        
        # Extract and store actions
        for action_data in summary_data["actions"]:
            supabase.table("actions").insert({
                "org_id": org_id,
                "project_id": project_id,
                "artifact_id": artifact_id,
                "title": action_data["action"],
                "description": action_data.get("description", ""),
                "owner": action_data.get("owner"),
                "verb": action_data.get("verb"),
                "due_date": action_data.get("due_date"),
                "extracted_from": filename
            }).execute()
        
        # Extract memories
        memories = await extract_memories_from_text(text, filename)
        
        # Store memory entries and chunks
        for mem_type, mem_list in memories.dict().items():
            for mem_data in mem_list:
                # Create memory entry
                mem_result = supabase.table("mem_entries").insert({
                    "org_id": org_id,
                    "project_id": project_id,
                    "type": mem_type,
                    "content": mem_data,
                    "artifact_id": artifact_id
                }).execute()
                
                mem_entry_id = mem_result.data[0]["id"]
                
                # Create searchable chunk for this memory
                mem_text = str(mem_data)
                mem_embedding = embed_texts([mem_text])[0]
                
                supabase.table("mem_chunks").insert({
                    "org_id": org_id,
                    "project_id": project_id,
                    "mem_entry_id": mem_entry_id,
                    "content": mem_text,
                    "embedding": mem_embedding
                }).execute()
        
        # 5) Document classification and dashboard updates (background processing)
        try:
            # Extract structured project updates using GPT classification
            project_code = f"WD-{project_id[:8]}"
            updates = classify_text(text, project_code)
            
            # Apply updates to project dashboard
            apply_updates(org_id, project_id, artifact_id, project_code, updates)
            
            # Log classification audit
            supabase.table("ingestion_audit").insert({
                "org_id": org_id,
                "project_id": project_id,
                "artifact_id": artifact_id,
                "doc_type": updates.get("doc_type", "other"),
                "status": "classified"
            }).execute()
            
            print(f"Document classified: {updates.get('doc_type')} with {len(updates.get('actions', []))} actions, {len(updates.get('risks', []))} risks")
            
        except Exception as e:
            print(f"Classification failed for {filename}: {e}")
        
        # Update artifact with chunk count
        supabase.table("artifacts").update({
            "chunk_count": chunk_count
        }).eq("id", artifact_id).execute()
        
    except Exception as e:
        print(f"Background processing error for {filename}: {e}")
    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except:
            pass

@app.get("/artifacts")
def list_artifacts(org_id: str = Query(...), project_id: str = Query(...), limit: int = 50):
    # list artifacts and include signed download URLs
    supabase = get_supabase_client()
    storage = get_supabase_storage_client()
    BUCKET = os.environ.get("BUCKET", "project-artifacts")
    
    rows = []
    try:
        # Try PostgREST first
        rows = supabase.table("artifacts")\
            .select("id,title,path,mime_type,chunk_count,created_at")\
            .eq("org_id", org_id).eq("project_id", project_id)\
            .order("created_at", desc=True).limit(limit).execute().data or []
    except Exception as e:
        print(f"PostgREST error in artifacts: {e}")
        # Fallback to psycopg
        try:
            from .db import get_conn
            conn = get_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        select id, title, path, mime_type, chunk_count, created_at
                        from artifacts
                        where org_id = %s and project_id = %s
                        order by created_at desc
                        limit %s
                        """,
                        (org_id, project_id, limit),
                    )
                    rows = [{"id": str(r[0]), "title": r[1], "path": r[2], "mime_type": r[3], "chunk_count": r[4], "created_at": str(r[5])} for r in cur.fetchall()]
            finally:
                conn.close()
        except Exception as e2:
            print(f"Psycopg fallback error: {e2}")
            rows = []
    
    out = []
    for r in rows:
        # 60-min signed URL
        try:
            signed = storage.create_signed_url(r["path"], 3600)
            r["signed_url"] = signed.get("signedURL") or signed.get("signed_url")
        except Exception:
            r["signed_url"] = None
        out.append(r)
    return {"artifacts": out}

@app.post("/ask", response_model=AskResponse)
async def ask_question(request: Request, ask_request: AskRequest):
    """Ask questions with RAG over project artifacts and memories"""
    
    # Rate limiting
    client_ip = request.client.host
    if not check_rate_limit(client_ip, "ask", limit=20):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    try:
        # Use the new answer_with_citations function with fallback
        answer, chunks = answer_with_citations(
            ask_request.org_id, 
            ask_request.project_id, 
            ask_request.question, 
            k=ask_request.k
        )
        
        # Create citations from chunks
        citations = []
        for i, chunk in enumerate(chunks):
            citations.append({
                "id": f"Artifact-{i+1}",
                "type": "artifact", 
                "title": chunk.get('title', 'Unknown Document'),
                "artifact_id": chunk.get('artifact_id')
            })
        
        # Audit logging with safer error handling
        try:
            supabase = get_supabase_client()
            supabase.table("audit_log").insert({
                "org_id": ask_request.org_id,
                "project_id": ask_request.project_id,
                "action": "ask",
                "details": {"q": ask_request.question, "hits": len(chunks)}
            }).execute()
        except Exception:
            logging.exception("audit_log insert failed")
        
        return AskResponse(
            answer=answer,
            citations=citations,
            context_sufficient=len(chunks) > 0
        )
        
    except Exception:
        logging.exception("/ask crashed")
        return AskResponse(
            answer="Server error while answering. Check logs.",
            citations=[],
            context_sufficient=False
        )

@app.get("/diag/index-stats")
def index_stats(org_id: str = Query(...), project_id: str = Query(...)):
    """Get index statistics for debugging"""
    try:
        supabase = get_supabase_client()
        a = supabase.table("artifacts").select("id", count="exact").eq("org_id", org_id).eq("project_id", project_id).execute()
        c = supabase.table("artifact_chunks").select("id", count="exact").eq("org_id", org_id).eq("project_id", project_id).execute()
        return {"artifacts": a.count or 0, "chunks": c.count or 0, "via": "postgrest"}
    except Exception:
        # psycopg fallback
        try:
            from .db import get_conn
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("select count(*) from artifacts where org_id=%s and project_id=%s", (org_id, project_id))
                art = cur.fetchone()[0]
                cur.execute("select count(*) from artifact_chunks where org_id=%s and project_id=%s", (org_id, project_id))
                chk = cur.fetchone()[0]
                return {"artifacts": art, "chunks": chk, "via": "psycopg"}
        except Exception as e:
            return {"error": str(e), "artifacts": -1, "chunks": -1, "via": "error"}

@app.get("/diag/openai")
def diag_openai():
    """Test OpenAI connectivity"""
    try:
        # a tiny embed check with a 5s timeout override
        from openai import OpenAI
        client = OpenAI(timeout=5)
        _ = client.embeddings.create(model=os.getenv("EMBEDDING_MODEL","text-embedding-3-large"), input=["ping"])
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/wellness/pulse")
async def wellness_pulse(request: Request, pulse_request: WellnessPulseRequest):
    """Submit anonymous wellness pulse data"""
    
    try:
        # Calculate wellness score
        score = calculate_wellness_score(pulse_request.buckets)
        total_responses = sum(pulse_request.buckets.values())
        
        supabase = get_supabase_client()
        
        # Get previous scores for signal detection
        previous_result = supabase.table("mem_stats")\
            .select("avg_score")\
            .eq("org_id", pulse_request.org_id)\
            .eq("project_id", pulse_request.project_id)\
            .order("created_at", desc=True)\
            .limit(5)\
            .execute()
        
        previous_scores = [row["avg_score"] for row in previous_result.data]
        
        # Store aggregated stats
        supabase.table("mem_stats").insert({
            "org_id": pulse_request.org_id,
            "project_id": pulse_request.project_id,
            "week_label": pulse_request.week_label,
            "very_negative": pulse_request.buckets.get("very_negative", 0),
            "negative": pulse_request.buckets.get("negative", 0),
            "neutral": pulse_request.buckets.get("neutral", 0),
            "positive": pulse_request.buckets.get("positive", 0),
            "very_positive": pulse_request.buckets.get("very_positive", 0),
            "total_responses": total_responses,
            "avg_score": score
        }).execute()
        
        # Check if we should create a wellness signal
        if should_create_wellness_signal(score, previous_scores):
            supabase.table("mem_signals").insert({
                "org_id": pulse_request.org_id,
                "project_id": pulse_request.project_id,
                "signal_type": "wellness_decline",
                "severity": "medium" if score <= 2 else "low",
                "message": f"Team wellness has declined to {score}/5. Consider checking in with the team."
            }).execute()
        
        await log_audit(
            org_id=pulse_request.org_id,
            project_id=pulse_request.project_id,
            action="wellness_pulse",
            details={"week": pulse_request.week_label, "score": score},
            ip_address=request.client.host
        )
        
        return {"status": "recorded", "score": score, "total_responses": total_responses}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/actions/nudge-draft", response_model=ActionNudgeResponse)
async def action_nudge_draft(nudge_request: ActionNudgeRequest):
    """Generate follow-up email draft for action items"""
    
    try:
        supabase = get_supabase_client()
        
        # Get action details
        action_result = supabase.table("actions")\
            .select("*, projects(name)")\
            .eq("id", nudge_request.action_id)\
            .eq("org_id", nudge_request.org_id)\
            .eq("project_id", nudge_request.project_id)\
            .execute()
        
        if not action_result.data:
            raise HTTPException(status_code=404, detail="Action not found")
        
        action = action_result.data[0]
        project_name = action["projects"]["name"] if action["projects"] else "Unknown Project"
        
        # Generate email draft
        email_data = await generate_action_nudge_email(action, project_name)
        
        return ActionNudgeResponse(**email_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/digest/{digest_type}")
async def get_digest(digest_type: str, org_id: str, project_id: str):
    """Generate daily or weekly digest"""
    
    if digest_type not in ["daily", "weekly"]:
        raise HTTPException(status_code=400, detail="Digest type must be 'daily' or 'weekly'")
    
    try:
        supabase = get_supabase_client()
        
        # Get recent data based on digest type
        days_back = 1 if digest_type == "daily" else 7
        
        # Get recent actions, artifacts, and wellness data (handle missing tables gracefully)
        # This is a simplified version - would need more complex queries in production
        
        try:
            recent_actions = supabase.table("actions")\
                .select("*")\
                .eq("org_id", org_id)\
                .eq("project_id", project_id)\
                .gte("created_at", f"now() - interval '{days_back} days'")\
                .execute()
        except Exception as e:
            print(f"Actions table query failed: {e}")
            recent_actions = type('obj', (object,), {'data': []})()
        
        try:
            recent_artifacts = supabase.table("artifacts")\
                .select("*")\
                .eq("org_id", org_id)\
                .eq("project_id", project_id)\
                .gte("created_at", f"now() - interval '{days_back} days'")\
                .execute()
        except Exception as e:
            print(f"Artifacts table query failed: {e}")
            recent_artifacts = type('obj', (object,), {'data': []})()
        
        digest_data = {
            "type": digest_type,
            "period": f"Last {days_back} day(s)",
            "actions": recent_actions.data,
            "artifacts": recent_artifacts.data,
            "generated_at": datetime.now().isoformat()
        }
        
        # Simple HTML template
        html_template = f"""
        <html>
        <body>
            <h1>{digest_type.title()} Digest</h1>
            <p>Period: {digest_data['period']}</p>
            <h2>Recent Actions ({len(digest_data['actions'])})</h2>
            <ul>
                {''.join([f"<li>{action['title']} - {action['owner']}</li>" for action in digest_data['actions']])}
            </ul>
            <h2>Recent Documents ({len(digest_data['artifacts'])})</h2>
            <ul>
                {''.join([f"<li>{artifact['title']}</li>" for artifact in digest_data['artifacts']])}
            </ul>
        </body>
        </html>
        """
        
        return DigestResponse(json_data=digest_data, html_template=html_template)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/digest/send")
async def send_digest_email(request_body: dict):
    """Manually send digest email to specified recipients"""
    try:
        # Parse request body
        org_id = request_body.get("org_id")
        project_id = request_body.get("project_id") 
        digest_type = request_body.get("digest_type", "weekly")
        to_emails = request_body.get("to_emails", [])
        
        if not org_id or not project_id:
            raise HTTPException(status_code=400, detail="org_id and project_id are required")
        if not to_emails:
            raise HTTPException(status_code=400, detail="to_emails list is required")
        if digest_type not in ["daily", "weekly"]:
            raise HTTPException(status_code=400, detail="digest_type must be 'daily' or 'weekly'")
        
        # Generate digest content using existing logic
        supabase = get_supabase_client()
        days_back = 1 if digest_type == "daily" else 7
        
        # Get recent actions and artifacts (handle missing tables gracefully)
        try:
            recent_actions = supabase.table("actions")\
                .select("*")\
                .eq("org_id", org_id)\
                .eq("project_id", project_id)\
                .gte("created_at", f"now() - interval '{days_back} days'")\
                .execute()
        except Exception as e:
            print(f"Actions table query failed: {e}")
            recent_actions = type('obj', (object,), {'data': []})()
        
        try:
            recent_artifacts = supabase.table("artifacts")\
                .select("*")\
                .eq("org_id", org_id)\
                .eq("project_id", project_id)\
                .gte("created_at", f"now() - interval '{days_back} days'")\
                .execute()
        except Exception as e:
            print(f"Artifacts table query failed: {e}")
            recent_artifacts = type('obj', (object,), {'data': []})()
        
        # Get project info for context (handle missing project gracefully)
        try:
            project_info = supabase.table("projects")\
                .select("code, title")\
                .eq("id", project_id)\
                .single().execute()
            
            project_code = project_info.data.get("code", "Project") if project_info.data else "Project"
            project_title = project_info.data.get("title", "Workday Implementation") if project_info.data else "Workday Implementation"
        except Exception as e:
            print(f"Projects table query failed: {e}")
            project_code = "Project"
            project_title = "Workday Implementation"
        
        # Create enhanced digest data
        digest_data = {
            "type": digest_type,
            "period": f"Last {days_back} day(s)",
            "project_code": project_code,
            "project_title": project_title,
            "actions": recent_actions.data,
            "artifacts": recent_artifacts.data,
            "generated_at": datetime.now().isoformat()
        }
        
        # Create professional HTML email template
        html_template = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>{digest_type.title()} Digest - {project_code}</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8fafc; }}
                .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
                .header {{ background: #1e293b; color: white; padding: 24px; }}
                .header h1 {{ margin: 0; font-size: 24px; font-weight: 600; }}
                .header p {{ margin: 8px 0 0; opacity: 0.9; }}
                .content {{ padding: 24px; }}
                .section {{ margin-bottom: 32px; }}
                .section h2 {{ color: #1e293b; font-size: 18px; font-weight: 600; margin: 0 0 16px; }}
                .item {{ background: #f8fafc; border-radius: 6px; padding: 16px; margin-bottom: 12px; border-left: 4px solid #3b82f6; }}
                .item h3 {{ color: #374151; font-size: 16px; font-weight: 600; margin: 0 0 8px; }}
                .item p {{ color: #6b7280; margin: 0; font-size: 14px; }}
                .footer {{ background: #f8fafc; padding: 20px 24px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }}
                .no-items {{ color: #9ca3af; font-style: italic; padding: 16px; text-align: center; background: #f9fafb; border-radius: 6px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>{digest_type.title()} Digest</h1>
                    <p>{project_title} ({project_code}) • {digest_data['period']}</p>
                </div>
                <div class="content">
                    <div class="section">
                        <h2>📋 Recent Actions ({len(digest_data['actions'])})</h2>
                        {''.join([f'''
                        <div class="item">
                            <h3>{action.get('title', 'Untitled Action')}</h3>
                            <p>Owner: {action.get('owner', 'Unassigned')} • Status: {action.get('status', 'Unknown')}</p>
                        </div>
                        ''' for action in digest_data['actions']]) if digest_data['actions'] else '<div class="no-items">No recent actions</div>'}
                    </div>
                    
                    <div class="section">
                        <h2>📄 Recent Documents ({len(digest_data['artifacts'])})</h2>
                        {''.join([f'''
                        <div class="item">
                            <h3>{artifact.get('title', 'Untitled Document')}</h3>
                            <p>Type: {artifact.get('file_type', 'Unknown')} • Uploaded: {artifact.get('created_at', '').split('T')[0] if artifact.get('created_at') else 'Unknown'}</p>
                        </div>
                        ''' for artifact in digest_data['artifacts']]) if digest_data['artifacts'] else '<div class="no-items">No recent documents</div>'}
                    </div>
                </div>
                <div class="footer">
                    Generated by TEAIM on {digest_data['generated_at'].split('T')[0]} • This is an automated digest email.
                </div>
            </div>
        </body>
        </html>
        """
        
        # Import email utilities
        from server.email.util import send_guard, log_send, mailgun_send_html
        
        sent_count = 0
        failed_count = 0
        results = []
        
        # Send to each recipient with guard checks
        for email in to_emails:
            try:
                # Check send guard (quiet hours and daily caps)
                can_send, reason = send_guard(supabase, org_id, project_id, "digest", email)
                
                if not can_send:
                    results.append({"email": email, "status": "blocked", "reason": reason})
                    failed_count += 1
                    continue
                
                # Send HTML email
                subject = f"{digest_type.title()} Digest - {project_code}"
                
                send_result = mailgun_send_html(
                    to_email=email,
                    subject=subject,
                    html=html_template
                )
                
                # Log successful send
                log_send(supabase, org_id, project_id, "digest", email, subject)
                
                results.append({"email": email, "status": "sent", "mailgun_id": send_result.get("id")})
                sent_count += 1
                
            except Exception as e:
                results.append({"email": email, "status": "failed", "error": str(e)})
                failed_count += 1
        
        return {
            "success": True,
            "digest_type": digest_type,
            "project_code": project_code,
            "sent_count": sent_count,
            "failed_count": failed_count,
            "total_actions": len(digest_data['actions']),
            "total_artifacts": len(digest_data['artifacts']),
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send digest: {str(e)}")

# Email webhook endpoint (stubbed)
@app.post("/webhooks/email")
async def email_webhook(request: Request):
    """
    Inbound email webhook endpoint
    TODO: Implement DKIM/DMARC validation, sender allowlist, project code extraction
    """
    
    # Rate limiting
    client_ip = request.client.host
    if not check_rate_limit(client_ip, "email_webhook", limit=50):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    try:
        body = await request.json()
        
        # TODO: Implement email validation logic
        # 1. Verify DKIM/DMARC
        # 2. Check sender against allowlist
        # 3. Extract project code from subject (#proj:WD-XXX)
        # 4. Parse email content and attachments
        # 5. Process similar to document upload
        
        await log_audit(
            action="email_received",
            details={"from": body.get("from"), "subject": body.get("subject")},
            ip_address=client_ip
        )
        
        return {"status": "received", "message": "Email processing not yet implemented"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _safe_json(x):
    if isinstance(x, str):
        try: return json.loads(x)
        except: return {}
    return x or {}

@app.get("/dashboard/overview")
def dashboard_overview(
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(require_project_member)
) -> Dict[str, Any]:
    # counts
    sb = get_supabase_client()
    try:
        arts = sb.table("artifacts").select("id,created_at,source,title").eq("project_id", project_id).execute().data or []
        sums = sb.table("summaries").select("id,artifact_id,level,summary,risks,decisions,actions,created_at").eq("project_id", project_id).execute().data or []
        acts = sb.table("actions").select("id,status,due_date,owner_email,source_artifact").eq("project_id", project_id).execute().data or []
    except Exception:
        # Return default/empty data when PostgREST fails
        arts, sums, acts = [], [], []
    sigs = []
    try:
        sigs = sb.table("mem_signals").select("signal,weight,observed_at").eq("project_id", project_id).execute().data or []
    except Exception:
        pass

    # derive KPIs
    total_artifacts = len(arts)
    total_actions = len(acts)
    overdue_actions = sum(1 for a in acts if a.get("status") in ("open","in_progress","overdue")
                          and a.get("due_date") and str(a["due_date"]) < str(dt.date.today()))
    high_risks = 0
    decisions_wk = 0
    week_ago = dt.datetime.utcnow() - dt.timedelta(days=7)
    for s in sums:
        risks = _safe_json(s.get("risks"))
        decisions = _safe_json(s.get("decisions"))
        if isinstance(risks, list):
            high_risks += sum(1 for r in risks if isinstance(r, dict) and str(r.get("severity","")).lower() in ("high","critical"))
        if isinstance(decisions, list):
            if s.get("created_at") and str(s["created_at"])[:10] >= week_ago.strftime("%Y-%m-%d"):
                decisions_wk += len(decisions)

    red_flags = []
    if overdue_actions: red_flags.append(f"{overdue_actions} action(s) overdue")
    if high_risks: red_flags.append(f"{high_risks} high-severity risk(s)")
    for sig in sigs:
        if sig.get("signal") == "morale_drop":
            red_flags.append("Wellness dip detected")

    # pending items (pull from actions open + decisions needing approval in summaries)
    pending = [f"{(a.get('owner_email') or 'Unassigned')} → {a.get('status','open')} due {a.get('due_date')}"
               for a in acts if a.get("status") in ("open","in_progress","overdue")][:10]

    return {
        "kpis": {
            "totalArtifacts": total_artifacts,
            "totalActions": total_actions,
            "overdueActions": overdue_actions,
            "decisionsLast7d": decisions_wk
        },
        "redFlags": red_flags,
        "pending": pending
    }

@app.get("/dashboard/workstreams")
def dashboard_workstreams(
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(require_project_member)
) -> Dict[str, Any]:
    sb = get_supabase_client()
    
    # Get configured workstreams from database
    try:
        configured = sb.table("workstreams").select("*")\
            .eq("project_id", project_id).eq("is_active", True)\
            .order("sort_order", desc=False).limit(30).execute().data or []
    except Exception:
        # Use default areas when workstreams table access fails
        configured = []

    # fall back to inferred names if none configured yet
    names = [w["name"] for w in configured] or ["HCM","Payroll","Finance","Integrations","Security","Reporting","Cutover"]
    ws = {n: {"name": n, "overdue": 0, "updated": None, "health": "green",
              "description": next((w.get("description","") for w in configured if w["name"]==n), "")}
          for n in names}

    # Get artifacts, actions, and summaries for health calculation
    try:
        arts = sb.table("artifacts").select("id,title,created_at").eq("project_id", project_id).execute().data or []
        acts = sb.table("actions").select("id,status,due_date").eq("project_id", project_id).execute().data or []
        sums = sb.table("summaries").select("id,summary,created_at,risks").eq("project_id", project_id).execute().data or []
    except Exception:
        # If tables don't exist yet, return basic structure
        arts, acts, sums = [], [], []

    def tag(title):
        t = (title or "").lower()
        if any(k in t for k in ["integration","sftp","api","interface"]): return "Integrations"
        if "payroll" in t: return "Payroll"
        if "security" in t: return "Security"
        if "report" in t or "dashboard" in t: return "Reporting"
        if "cutover" in t: return "Cutover"
        if "fin" in t or "gl" in t or "journal" in t: return "Finance"
        return "HCM"

    # Update timestamps based on artifacts
    for a in arts:
        area_name = tag(a.get("title"))
        if area_name in ws:
            w = ws[area_name]
            cur = w.get("updated")
            w["updated"] = max(str(a.get("created_at") or ""), cur or "") if a.get("created_at") else cur

    # Calculate overdue actions
    overdue = sum(1 for a in acts if a.get("status") in ("open","in_progress","overdue")
                  and a.get("due_date") and str(a["due_date"]) < str(dt.date.today()))
    # spread overdue across areas (simple distribution for now)
    if overdue > 0:
        for i, n in enumerate(ws.keys()):
            ws[n]["overdue"] = overdue if i == 0 else 0  # put all overdue on first area for now

    # set health amber/red if risks mention that stream
    for s in sums:
        risks = _safe_json(s.get("risks"))
        if isinstance(risks, list):
            for r in risks:
                txt = json.dumps(r).lower()
                for n in ws:
                    if n.lower() in txt:
                        ws[n]["health"] = "amber"

    return {"workstreams": list(ws.values())}

@app.get("/dashboard/integrations")
def dashboard_integrations(
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(require_project_member)
) -> Dict[str, Any]:
    # Try to infer integrations from mem_entries semantic/decision bodies or artifact titles
    items: List[Dict[str,Any]] = []
    sb = get_supabase_client()
    try:
        mems = sb.table("mem_entries").select("type,body,created_at").eq("project_id", project_id).execute().data or []
    except Exception:
        mems = []
    try:
        arts = sb.table("artifacts").select("title,created_at").eq("project_id", project_id).execute().data or []
    except Exception:
        arts = []

    def parse_pair(text: str):
        # find patterns like "ADP -> Workday" or "ADP → Workday"
        for arrow in ["->","→"]:
            if arrow in text:
                parts = [p.strip() for p in text.split(arrow)]
                if len(parts) == 2:
                    return parts[0], parts[1]
        return None, None

    seen = set()
    for x in mems:
        body = x.get("body") or ""
        if "->" in body or "→" in body:
            s,t = parse_pair(body)
            if s and t:
                key = (s,t)
                if key not in seen:
                    seen.add(key)
                    items.append({"name": f"{s} → {t}", "owner":"", "status":{"Discover":True}, "pending":[]})

    for a in arts:
        title = (a.get("title") or "")
        s,t = parse_pair(title)
        if s and t:
            key = (s,t)
            if key not in seen:
                seen.add(key)
                items.append({"name": f"{s} → {t}", "owner":"", "status":{"Discover":True}, "pending":[]})

    return {"integrations": items}

def _ws_upsert_psycopg(org_id, project_id, items):
    with get_conn() as conn, conn.cursor() as cur:
        # Soft-inactivate existing
        cur.execute("update workstreams set is_active=false where org_id=%s and project_id=%s",
                    (org_id, project_id))
        # Insert fresh actives (keep up to 30)
        for i,it in enumerate(items[:30]):
            cur.execute("""
              insert into workstreams (org_id, project_id, name, description, sort_order, is_active)
              values (%s,%s,%s,%s,%s,true)
            """, (org_id, project_id, it.get("name","")[:120], it.get("description","") or "", it.get("sort_order", i)))

@app.get("/workstreams")
def list_workstreams(
    project_id: str = Query(...), 
    ctx: TenantCtx = Depends(require_project_member)
):
    sb = get_supabase_client()
    try:
        rows = sb.table("workstreams").select("*")\
            .eq("project_id", project_id)\
            .order("sort_order", desc=False).limit(60).execute().data or []
        return {"items": [r for r in rows if r.get("is_active", True)]}
    except Exception as e:
        logging.info(f"PostgREST workstreams access failed, returning default areas: {e}")
        # Return default functional areas when table access fails
        default_areas = [
            {"name": "HCM", "description": "Core HR & business processes", "sort_order": 0, "is_active": True},
            {"name": "Payroll", "description": "Payroll processing", "sort_order": 1, "is_active": True},
            {"name": "Finance", "description": "Financial management", "sort_order": 2, "is_active": True},
            {"name": "Integrations", "description": "System integrations", "sort_order": 3, "is_active": True},
            {"name": "Security", "description": "Security & compliance", "sort_order": 4, "is_active": True},
            {"name": "Reporting", "description": "Analytics & reporting", "sort_order": 5, "is_active": True},
            {"name": "Cutover", "description": "Go-live activities", "sort_order": 6, "is_active": True}
        ]
        return {"items": default_areas}

@app.post("/workstreams/set")
def set_workstreams(
    project_id: str = Body(...), 
    items: list[dict] = Body(...),
    ctx: TenantCtx = Depends(require_project_admin)
):
    if len(items) > 30:
        return {"ok": False, "error": "Max 30 functional areas"}
    try:
        # try REST path first
        sb = get_supabase_client()
        sb.table("workstreams").update({"is_active": False}).eq("project_id", project_id).execute()
        for i,it in enumerate(items):
            sb.table("workstreams").insert({
              "project_id": project_id,
              "name": it.get("name","")[:120], "description": it.get("description","") or "",
              "sort_order": it.get("sort_order", i), "is_active": True
            }).execute()
        return {"ok": True, "count": len(items), "via": "rest"}
    except Exception:
        _ws_upsert_psycopg(None, project_id, items)
        return {"ok": True, "count": len(items), "via": "psycopg"}

@app.post("/workstreams/add")
def add_workstream(
    project_id: str = Body(...),
    name: str = Body(...), 
    description: Optional[str] = Body(None),
    sort_order: int = Body(0),
    ctx: TenantCtx = Depends(require_project_admin)
):
    try:
        sb = get_supabase_client()
        active = sb.table("workstreams").select("id", count="exact")\
            .eq("project_id", project_id).eq("is_active", True).execute()
        if (active.count or 0) >= 30:
            return {"ok": False, "error": "Max 30 functional areas"}
        sb.table("workstreams").insert({
          "project_id": project_id,
          "name": name[:120], "description": description or "", "sort_order": sort_order, "is_active": True
        }).execute()
        return {"ok": True, "via": "rest"}
    except Exception:
        _ws_upsert_psycopg(None, project_id, [{"name": name, "description": description, "sort_order": sort_order}])
        return {"ok": True, "via": "psycopg"}

@app.post("/workstreams/bootstrap-from-sow")
def bootstrap_from_sow(org_id: str = Body(...), project_id: str = Body(...),
                       text: str = Body(...)):
    try:
        # naive extraction: look for capitalized keywords; you can improve with LLM later
        CANDIDATES = ["HCM","Recruiting","Talent","Compensation","Benefits","Time & Absence",
                      "Payroll","Finance","Projects","Procurement","Expenses",
                      "Security","Integrations","Reporting/Prism","Audit/Controls",
                      "Change Management","Training","Cutover","Data Conversion","Testing"]
        found = []
        lower = text.lower()
        for c in CANDIDATES:
            key = c.lower().split("/")[0].split("&")[0].strip()
            if key in lower:
                found.append({"name": c})
        if not found:  # default minimal set
            found = [{"name": n} for n in ["HCM","Payroll","Finance","Integrations","Security","Reporting","Cutover"]]
        return set_workstreams(org_id=org_id, project_id=project_id, items=found)
    except Exception as e:
        logging.info(f"SOW bootstrap failed: {e}")
        return {"ok": False, "error": "Failed to process SOW text"}

# Email processing utilities
import uuid
import base64
import re

def parse_tag(subject: str, tag_type: str) -> Optional[str]:
    """Extract project code from subject line like #proj:WD-ACME"""
    pattern = rf"#{tag_type}:([A-Z0-9-]+)"
    match = re.search(pattern, subject, re.IGNORECASE)
    return match.group(1) if match else None

def lookup_project(project_code: str) -> tuple[str, str]:
    """Look up org_id and project_id from project code"""
    # For demo purposes, return our test IDs
    # In production, this would query the database
    return "d915376c-2bd7-4e79-b9c9-aab9d7fcb5a8", "dced0b98-87b4-46ff-b2a4-2cf8e627e8d2"

def sanitize_filename(filename: str) -> str:
    """Sanitize filename for storage"""
    return re.sub(r'[^\w\.-]', '_', filename)

def collect_attachments_dev(attachments: List[Dict]) -> List[Dict]:
    """Process attachments from dev JSON format"""
    results = []
    for att in attachments:
        if 'data_b64' in att:
            data = base64.b64decode(att['data_b64'])
        else:
            data = att.get('data', b'')
        
        results.append({
            'name': att['filename'],
            'data': data,
            'type': att.get('content_type', 'application/octet-stream')
        })
    return results

def classify_content(text: str) -> Dict[str, Any]:
    """Extract structured information from text content"""
    actions = []
    decisions = []
    risks = []
    integrations = []
    
    lines = text.split('\n')
    for line in lines:
        line_lower = line.lower().strip()
        
        # Extract actions
        if 'action:' in line_lower or line_lower.startswith('action '):
            actions.append({'text': line.strip(), 'extracted_from': 'email'})
        
        # Extract decisions
        if 'decision:' in line_lower or line_lower.startswith('decision '):
            decisions.append({'text': line.strip(), 'extracted_from': 'email'})
        
        # Extract risks
        if 'risk:' in line_lower or '(high)' in line_lower or '(medium)' in line_lower:
            severity = 'high' if '(high)' in line_lower else 'medium'
            risks.append({'text': line.strip(), 'severity': severity})
        
        # Extract integrations
        if '→' in line or '->' in line or 'integration' in line_lower:
            integrations.append({'text': line.strip(), 'type': 'integration'})
    
    return {
        'actions': actions,
        'decisions': decisions,
        'risks': risks,
        'integrations': integrations
    }

@app.post("/email/inbound-dev")
async def email_inbound_dev(request: Request):
    """Development endpoint for email inbound testing"""
    try:
        # Get JSON body
        body = await request.json()
        subject = body.get('subject', '')
        from_addr = body.get('from', '')
        attachments_data = body.get('attachments', [])
        
        # Parse project code
        proj = parse_tag(subject, "proj")
        if not proj:
            return {"ok": False, "error": "missing #proj:TAG in subject"}
        
        org_id, project_id = lookup_project(proj)
        processed_attachments = collect_attachments_dev(attachments_data)
        
        results = []
        
        for att in processed_attachments:
            # Generate unique key
            unique_id = str(uuid.uuid4())[:8]
            sanitized_name = sanitize_filename(att['name'])
            key = f"{org_id}/{project_id}/{unique_id}_{sanitized_name}"
            
            try:
                # Store in bucket
                storage = get_supabase_storage_client()
                storage.upload(
                    path=key,
                    file=att['data'],
                    file_options={"content-type": att['type']}
                )
                
                # Extract text - handle tuple return
                text_result = extract_text_from_file(att['name'], att['data'])
                text = text_result[0] if isinstance(text_result, tuple) else text_result
                
                # Create artifact record
                with get_conn() as conn:
                    cursor = conn.cursor()
                    
                    # Insert artifact
                    cursor.execute(
                        """
                        INSERT INTO artifacts (org_id, project_id, title, path, mime_type, source, chunk_count)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (org_id, project_id, att['name'], key, att['type'], 'email', 0)
                    )
                    art_result = cursor.fetchone()
                    art_id = art_result[0] if art_result else None
                    
                    if art_id and text:
                        # Process and chunk text
                        chunks = chunk_text(text, 1200, 200)
                        
                        if chunks:
                            # Generate embeddings
                            embeddings = embed_texts(chunks)
                            
                            # Insert chunks
                            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                                cursor.execute(
                                    """
                                    INSERT INTO artifact_chunks (org_id, project_id, artifact_id, content, chunk_index, embedding)
                                    VALUES (%s, %s, %s, %s, %s, %s)
                                    """,
                                    (org_id, project_id, art_id, chunk, i, embedding)
                                )
                            
                            # Update chunk count
                            cursor.execute(
                                "UPDATE artifacts SET chunk_count = %s WHERE id = %s",
                                (len(chunks), art_id)
                            )
                        
                        # Extract structured information
                        classified = classify_content(text)
                        
                        # Generate summary with extractions
                        try:
                            summary_data = await generate_summary_with_extractions(text)
                            
                            # Insert summary
                            cursor.execute(
                                """
                                INSERT INTO summaries (org_id, project_id, artifact_id, summary, risks, decisions, actions)
                                VALUES (%s, %s, %s, %s, %s, %s, %s)
                                """,
                                (org_id, project_id, art_id, summary_data.get('summary', ''), 
                                 json.dumps(classified['risks']), json.dumps(classified['decisions']), 
                                 json.dumps(classified['actions']))
                            )
                        except Exception as e:
                            print(f"Summary generation failed: {e}")
                        
                        # Extract memories
                        try:
                            memories_result = await extract_memories_from_text(text)
                            # Handle both list and single memory results
                            memories = memories_result if isinstance(memories_result, list) else [memories_result]
                            if memories and memories[0]:  # Check if we have actual memories
                                for mem in memories:
                                    if hasattr(mem, 'type'):  # Memory object
                                        cursor.execute(
                                            """
                                            INSERT INTO mem_entries (org_id, project_id, artifact_id, memory_type, content, context, confidence)
                                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                                            """,
                                            (org_id, project_id, art_id, mem.type or 'semantic',
                                             mem.content or '', json.dumps(mem.context or {}), 
                                             mem.confidence or 0.8)
                                        )
                                    elif isinstance(mem, dict):  # Dict format
                                        cursor.execute(
                                            """
                                            INSERT INTO mem_entries (org_id, project_id, artifact_id, memory_type, content, context, confidence)
                                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                                            """,
                                            (org_id, project_id, art_id, mem.get('type', 'semantic'),
                                             mem.get('content', ''), json.dumps(mem.get('context', {})), 
                                             mem.get('confidence', 0.8))
                                        )
                        except Exception as e:
                            print(f"Memory extraction failed: {e}")
                    
                    conn.commit()
                
                results.append({"artifact_id": art_id, "key": key, "processed": True})
                
            except Exception as e:
                print(f"Processing error for {att['name']}: {e}")
                results.append({"artifact_id": None, "key": key, "error": str(e)})
        
        return {"ok": True, "project": proj, "results": results}
        
    except Exception as e:
        error_msg = f"Email inbound error: {e}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e), "type": "email_inbound_error"}

@app.post("/onboarding/start")
async def start_onboarding(request: Request):
    """Start the 9-step onboarding workflow"""
    try:
        body = await request.json()
        org_id = body.get('org_id')
        project_id = body.get('project_id')
        
        with get_conn() as conn:
            cursor = conn.cursor()
            
            # Default steps for the 9-step PMO playbook
            default_steps = [
                {'key': 'metrics', 'name': 'Metrics for Success', 'description': '3 KPIs + mindset alignment', 'order_idx': 1},
                {'key': 'team', 'name': 'Team Roster', 'description': 'Names, roles, contact info, workstream ownership', 'order_idx': 2},
                {'key': 'logistics', 'name': 'Logistics & Communications', 'description': 'Meeting cadence, channels, links', 'order_idx': 3},
                {'key': 'data', 'name': 'Data & Reporting', 'description': 'Systems, owners, initial reports', 'order_idx': 4},
                {'key': 'training', 'name': 'Training Approach', 'description': 'Preferred approach + audiences', 'order_idx': 5},
                {'key': 'integrations', 'name': 'Integrations & Tech', 'description': 'Source/target systems, transports, owners', 'order_idx': 6},
                {'key': 'testing', 'name': 'Testing Strategy', 'description': 'Entry/exit criteria, defect severity rules', 'order_idx': 7},
                {'key': 'ocm', 'name': 'Change Management', 'description': 'Impacts, communications, champions', 'order_idx': 8},
                {'key': 'financials', 'name': 'Financials', 'description': 'Budget, hours reporting', 'order_idx': 9}
            ]
            
            # Create onboarding instances
            created_instances = []
            for step in default_steps:
                cursor.execute(
                    """
                    INSERT INTO onboarding_instances (org_id, project_id, step_key, status, due_date)
                    VALUES (%s, %s, %s, %s, NOW() + INTERVAL '5 days')
                    RETURNING id
                    """,
                    (org_id, project_id, step['key'], 'pending')
                )
                result = cursor.fetchone()
                instance_id = result[0] if result else None
                created_instances.append({'step_key': step['key'], 'instance_id': instance_id})
            
            conn.commit()
        
        return {"ok": True, "created_instances": created_instances}
        
    except Exception as e:
        error_msg = f"Onboarding start error: {e}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e), "type": "onboarding_start_error"}

@app.post("/onboarding/respond")
async def onboarding_respond(request: Request):
    """Handle onboarding step responses"""
    try:
        body = await request.json()
        org_id = body.get('org_id')
        project_id = body.get('project_id')
        step_key = body.get('step_key')
        answers = body.get('answers', {})
        
        with get_conn() as conn:
            cursor = conn.cursor()
            
            # Update onboarding instance
            cursor.execute(
                """
                UPDATE onboarding_instances 
                SET status = 'received', response_json = %s, last_email_at = NOW()
                WHERE org_id = %s AND project_id = %s AND step_key = %s
                """,
                (json.dumps(answers), org_id, project_id, step_key)
            )
            
            # Process specific step responses
            if step_key == 'metrics' and 'kpis' in answers:
                # Store KPIs in mem_entries
                kpis = answers['kpis']
                for i, kpi in enumerate(kpis[:3]):  # Store up to 3 KPIs
                    cursor.execute(
                        """
                        INSERT INTO mem_entries (org_id, project_id, memory_type, content, context, confidence)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (org_id, project_id, 'semantic', f"Success metric: {kpi}", 
                         json.dumps({'source': 'onboarding', 'step': 'metrics', 'index': i}), 0.9)
                    )
            
            elif step_key == 'team' and 'roster' in answers:
                # Process team roster
                roster = answers['roster']
                for member in roster:
                    cursor.execute(
                        """
                        INSERT INTO mem_entries (org_id, project_id, memory_type, content, context, confidence)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (org_id, project_id, 'semantic', f"Team member: {member.get('name', '')} - {member.get('role', '')}", 
                         json.dumps({'source': 'onboarding', 'step': 'team', 'contact': member.get('contact', '')}), 0.9)
                    )
            
            conn.commit()
        
        return {"ok": True, "step_key": step_key, "processed": True}
        
    except Exception as e:
        error_msg = f"Onboarding respond error: {e}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e), "type": "onboarding_respond_error"}

@app.post("/onboarding/send")
async def send_onboarding_email_endpoint(request: Request):
    """Send onboarding emails via Mailgun"""
    try:
        body = await request.json()
        org_id = body.get('org_id')
        project_id = body.get('project_id')
        template_key = body.get('template_key')  # metrics, team, logistics, reminder, complete
        to_email = body.get('to_email')
        first_name = body.get('first_name', 'team')
        project_code = body.get('project_code', 'WD-PROJ')
        
        if not all([org_id, project_id, template_key, to_email]):
            raise HTTPException(status_code=400, detail="Missing required fields: org_id, project_id, template_key, to_email")
        
        # Check Mailgun configuration
        status = get_mailgun_status()
        if not status['configured']:
            raise HTTPException(status_code=503, detail="Mailgun not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables.")
        
        # Send email using template
        result = send_onboarding_email(
            template_key=template_key,
            to_email=to_email,
            project_code=project_code,
            first_name=first_name,
            **body.get('template_params', {})  # Allow additional template parameters
        )
        
        # Update onboarding instance if relevant
        if template_key in ['metrics', 'team', 'logistics']:
            with get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE onboarding_instances 
                    SET last_email_at = NOW(), sent_count = sent_count + 1
                    WHERE org_id = %s AND project_id = %s AND step_key = %s
                    """,
                    (org_id, project_id, template_key)
                )
                conn.commit()
        
        # Log audit trail
        await log_audit(
            org_id=org_id,
            project_id=project_id,
            action="onboarding_email_sent",
            details={
                "template_key": template_key,
                "to_email": to_email,
                "mailgun_id": result.get('id'),
                "message": result.get('message')
            },
            ip_address=request.client.host if request.client else ""
        )
        
        return {
            "ok": True,
            "template_key": template_key,
            "to_email": to_email,
            "mailgun_response": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Onboarding send error: {e}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/onboarding/templates")
async def list_onboarding_templates():
    """List available onboarding email templates"""
    return {
        "ok": True,
        "templates": list(ONBOARDING_TEMPLATES.keys()),
        "mailgun_status": get_mailgun_status()
    }

# Startup event to launch the digest scheduler
@app.on_event("startup")
async def _start_sched():
    from .scheduler import reindex_worker, integrations_tick, reminders_tick, revoke_expired_nightly, process_comms_queue, schedule_breach_soon_nudges_nightly, schedule_owner_digest_morning, auto_archive_closed_crs_nightly
    asyncio.create_task(digest_scheduler(app))
    asyncio.create_task(reindex_worker(app))
    asyncio.create_task(integrations_tick(app))
    asyncio.create_task(reminders_tick(app))
    asyncio.create_task(revoke_expired_nightly())
    asyncio.create_task(process_comms_queue())
    asyncio.create_task(schedule_breach_soon_nudges_nightly())
    asyncio.create_task(schedule_owner_digest_morning())
    asyncio.create_task(auto_archive_closed_crs_nightly())

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
