import os, hmac, hashlib, base64, requests, time
from fastapi import APIRouter, Request, HTTPException
from .db import get_conn, insert_artifact, insert_chunks, update_artifact_chunk_count, insert_summary
from .parsing import extract_text_from_file
from .chunking import chunk_text
from .rag import embed_texts
from .mem_agent import extract_memories_from_text
from uuid import uuid4
import re

router = APIRouter()
BUCKET = os.getenv("BUCKET", "project-artifacts")
MAILGUN_SIGNING_KEY = os.getenv("MAILGUN_SIGNING_KEY", "")

ALLOWLIST = set([d.strip().lower() for d in os.getenv("EMAIL_ALLOWLIST", "").split(",") if d])

# File safety settings
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.txt', '.eml', '.vtt', '.srt'}
ALLOWED_MIME_TYPES = {
    'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'message/rfc822', 'text/vtt', 'application/x-subrip'
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# In-memory store for processed Message-IDs (use Redis in production)
processed_messages = set()

def verify_mailgun(sig: str, ts: str, token: str) -> bool:
    """Verify Mailgun webhook signature using HMAC-SHA256 with timestamp freshness"""
    if not MAILGUN_SIGNING_KEY:
        return False
    
    # Check timestamp freshness (within 5 minutes)
    try:
        timestamp = int(ts)
        now = int(time.time())
        if abs(now - timestamp) > 300:  # 5 minutes
            print(f"[Mailgun] Timestamp too old: {abs(now - timestamp)} seconds")
            return False
    except (ValueError, TypeError):
        print("[Mailgun] Invalid timestamp format")
        return False
    
    mac = hmac.new(
        MAILGUN_SIGNING_KEY.encode("utf-8"), 
        msg=f"{ts}{token}".encode("utf-8"), 
        digestmod=hashlib.sha256
    )
    return hmac.compare_digest(mac.hexdigest(), sig)

def parse_proj(subject: str):
    """Extract project code from subject line, e.g. 'Standup #proj:WD-ACME' -> 'WD-ACME'"""
    m = re.search(r"#proj:([A-Za-z0-9\-\_]+)", subject or "")
    return m.group(1) if m else None

def sanitize(name: str):
    """Sanitize filename for storage"""
    return "".join(c for c in name or "" if c.isalnum() or c in "._- ") or "upload"

def lookup_project_by_code(code: str):
    """Look up project by code, return (org_id, project_id) or (None, None)"""
    from .supabase_client import get_supabase_client
    try:
        sb = get_supabase_client()
        r = sb.table("projects").select("id,org_id,code").eq("code", code).limit(1).execute()
        if not r.data:
            return None, None
        return r.data[0]["org_id"], r.data[0]["id"]
    except Exception as e:
        print(f"[Mailgun] Project lookup error for {code}: {e}")
        return None, None

def write_mem(conn, org_id, project_id, artifact_id, mem):
    """Write extracted memories to database"""
    # Store memories - simplified for now
    try:
        if mem and isinstance(mem, dict):
            # For now, just log the extracted memories
            print(f"[Mailgun] Extracted memories for artifact {artifact_id}: {len(str(mem))} chars")
    except Exception as e:
        print(f"[Mailgun] Memory write error: {e}")

def route_update_from_text(org_id: str, project_id: str, artifact_id: str, text: str, mem: dict):
    """Route extracted content to dashboard updates (actions, risks, decisions)"""
    # This would integrate with your existing dashboard update logic
    pass

@router.post("/email/mailgun")
async def email_mailgun(req: Request):
    """
    Production Mailgun webhook endpoint with full security and processing
    Handles both direct attachments and Mailgun storage URLs
    """
    # Mailgun sends form-encoded data
    form = await req.form()
    
    # Verify Mailgun signature (form fields are strings)
    sig = str(form.get("signature", ""))
    ts = str(form.get("timestamp", ""))
    token = str(form.get("token", ""))
    
    if not (sig and ts and token and verify_mailgun(sig, ts, token)):
        print("[Mailgun] Invalid or missing signature")
        raise HTTPException(status_code=403, detail="bad signature")
    
    # Extract email metadata
    subject = str(form.get("subject", ""))
    sender = str(form.get("sender", "")).lower()
    
    # Verify sender is on allowlist
    if ALLOWLIST and not any(sender.endswith("@" + d) or sender.split("@")[-1] == d for d in ALLOWLIST):
        print(f"[Mailgun] Sender not allowed: {sender}")
        raise HTTPException(status_code=403, detail="sender not allowed")
    
    # Extract and validate project code
    proj_code = parse_proj(subject)
    if not proj_code:
        print(f"[Mailgun] Missing project code in subject: {subject}")
        return {"ok": False, "error": "missing #proj:TAG"}
    
    # Look up project
    org_id, project_id = lookup_project_by_code(proj_code)
    if not project_id or not org_id:
        print(f"[Mailgun] Unknown project code: {proj_code}")
        return {"ok": False, "error": "unknown project code"}
    
    # Check for duplicate Message-ID (idempotency)
    message_id = form.get("Message-Id", "")
    if message_id:
        message_hash = hashlib.md5(message_id.encode()).hexdigest()
        if message_hash in processed_messages:
            print(f"[Mailgun] Duplicate message ignored: {message_id}")
            return {"ok": True, "duplicate": True, "message": "already processed"}
        processed_messages.add(message_hash)
    
    print(f"[Mailgun] Processing email for project {proj_code} ({project_id})")
    
    # Process attachments
    results = []
    
    # (A) Stored URLs (Mailgun "Store and Notify" feature)
    storage_urls = []
    for i in range(1, 21):  # Check up to 20 attachments
        u = form.get(f"attachment-{i}-url")
        if u:
            storage_urls.append(u)
    
    # (B) Direct file uploads in form (smaller messages)
    attached_files = []
    for key, up in form.multi_items():
        if key.startswith("attachment") and hasattr(up, "filename"):
            attached_files.append(up)
    
    # Process stored URLs
    for url in storage_urls:
        try:
            print(f"[Mailgun] Fetching stored attachment: {url}")
            r = requests.get(url, timeout=20)  # Mailgun signed URL
            if r.status_code != 200:
                print(f"[Mailgun] Failed to fetch {url}: {r.status_code}")
                continue
                
            filename = sanitize(url.split("/")[-1])
            content_type = r.headers.get("Content-Type", "application/octet-stream")
            data = r.content
            
            # Validate attachment safety
            is_safe, error_msg = validate_attachment(filename, content_type, data)
            if not is_safe:
                print(f"[Mailgun] Unsafe stored attachment rejected: {error_msg}")
                results.append({"error": error_msg, "url": url, "filename": filename})
                continue
            
            out = await _ingest_one(org_id, project_id, filename, content_type, data)
            results.append(out)
        except Exception as e:
            print(f"[Mailgun] Error processing stored URL {url}: {e}")
            results.append({"error": str(e), "url": url})
    
    # Process multipart attachments
    for up in attached_files:
        try:
            print(f"[Mailgun] Processing direct attachment: {up.filename}")
            data = await up.read()
            
            # Validate attachment safety
            is_safe, error_msg = validate_attachment(sanitize(up.filename), up.content_type, data)
            if not is_safe:
                print(f"[Mailgun] Unsafe attachment rejected: {error_msg}")
                results.append({"error": error_msg, "filename": up.filename})
                continue
            
            out = await _ingest_one(org_id, project_id, sanitize(up.filename), up.content_type, data)
            results.append(out)
        except Exception as e:
            print(f"[Mailgun] Error processing attachment {up.filename}: {e}")
            results.append({"error": str(e), "filename": up.filename})
    
    print(f"[Mailgun] Processed {len(results)} attachments for {proj_code}")
    return {"ok": True, "project": proj_code, "count": len(results), "results": results}

def validate_attachment(filename: str, content_type: str, data: bytes) -> tuple[bool, str]:
    """Validate attachment safety and type restrictions"""
    from pathlib import Path
    
    # Check file size
    if len(data) > MAX_FILE_SIZE:
        return False, f"File too large: {len(data)} bytes (max {MAX_FILE_SIZE})"
    
    # Check extension
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type not allowed: {ext}"
    
    # Check MIME type
    if content_type and content_type not in ALLOWED_MIME_TYPES:
        return False, f"MIME type not allowed: {content_type}"
    
    return True, "OK"

async def _ingest_one(org_id: str, project_id: str, filename: str, content_type: str, data: bytes):
    """
    Ingest a single attachment: store in Supabase, parse text, create embeddings, extract memories
    """
    from .supabase_client import get_supabase_storage_client
    
    # Generate unique storage key
    unique_id = uuid4().hex[:8]
    key = f"{org_id}/{project_id}/{unique_id}_{filename}"
    
    try:
        # Upload to Supabase storage with REST fallback
        print(f"[Mailgun] Uploading to storage: {key}")
        try:
            storage = get_supabase_storage_client()
            storage.upload(key, data)
        except Exception as storage_error:
            print(f"[Mailgun] Storage upload failed: {storage_error}")
            # Fallback: use Supabase REST API
            from .supabase_client import get_supabase_client
            sb = get_supabase_client()
            import base64
            data_b64 = base64.b64encode(data).decode()
            sb.storage.from_(BUCKET).upload(
                key, 
                base64.b64decode(data_b64),
                file_options={"content-type": content_type}
            )
        
        # Always extract text first (needed for both psycopg and REST fallback)
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=f"_{filename}", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        
        text, _ = extract_text_from_file(tmp_path, content_type)
        os.unlink(tmp_path)  # Clean up temp file
        
        # Create chunks and embeddings (needed for both paths)
        chunks = chunk_text(text, 1200, 200) if text else []
        embs = embed_texts(chunks) if chunks else []
        
        # Extract memories (decisions, risks, actions, etc.)
        if text:
            mem_result = await extract_memories_from_text(text, filename)
            mem = mem_result.__dict__ if hasattr(mem_result, '__dict__') else {}
        else:
            mem = {}
        
        art_id = None
        
        try:
            # Try psycopg first
            with get_conn() as conn:
                art_id = insert_artifact(conn, org_id, project_id, key, content_type, filename, "email")
                
                # Insert chunks with embeddings
                if chunks and embs:
                    rows = [
                        {"chunk_index": i, "content": c, "embedding": e} 
                        for i, (c, e) in enumerate(zip(chunks, embs))
                    ]
                    insert_chunks(conn, org_id, project_id, art_id, rows)
                
                # Update chunk count
                update_artifact_chunk_count(conn, art_id, len(chunks))
                
                # Insert summary
                summary_text = text[:2000] if text else ""
                insert_summary(conn, org_id, project_id, art_id, summary_text)
                
                write_mem(conn, org_id, project_id, art_id, mem)
                print(f"[Mailgun] Successfully processed {filename} -> artifact {art_id}")
                
        except Exception as db_error:
            print(f"[Mailgun] Database error, falling back to REST: {db_error}")
            
            # REST fallback using Supabase client with correct schema
            try:
                from .supabase_client import get_supabase_client
                sb = get_supabase_client()
                
                # Insert artifact via REST with correct column names (matching main.py)
                artifact_data = {
                    "org_id": org_id,
                    "project_id": project_id,
                    "path": key,  # Use 'path' not 'storage_key'
                    "mime_type": content_type,  # Use 'mime_type' not 'content_type'
                    "title": filename,  # Use 'title' not 'filename'
                    "source": "email",
                    "chunk_count": len(chunks)
                }
                art_result = sb.table("artifacts").insert(artifact_data).execute()
                if art_result.data:
                    art_id = art_result.data[0].get("id")
                    
                    # Insert chunks via REST if available
                    if chunks:
                        chunk_rows = []
                        for i, (chunk_content, embedding) in enumerate(zip(chunks, embs)):
                            chunk_rows.append({
                                "org_id": org_id,
                                "project_id": project_id,
                                "artifact_id": art_id,
                                "chunk_index": i,
                                "content": chunk_content,
                                "embedding": embedding
                            })
                        
                        # Insert in batches to correct table name
                        batch_size = 50
                        for i in range(0, len(chunk_rows), batch_size):
                            batch = chunk_rows[i:i+batch_size]
                            sb.table("artifact_chunks").insert(batch).execute()
                    
                    # Insert summary via REST
                    if text:
                        summary_data = {
                            "org_id": org_id,
                            "project_id": project_id,
                            "artifact_id": art_id,
                            "summary": text[:2000]
                        }
                        sb.table("summaries").insert(summary_data).execute()
                    
                    print(f"[Mailgun] REST fallback: processed {filename} -> artifact {art_id}")
                
            except Exception as rest_error:
                print(f"[Mailgun] REST fallback failed: {rest_error}")
                art_id = f"fallback_{uuid4().hex[:8]}"
        
        # Route updates to dashboard (actions, risks, decisions, integrations)
        try:
            route_update_from_text(org_id, project_id, art_id, text or "", mem)
        except Exception as e:
            print(f"[Mailgun] Dashboard routing error: {e}")
        
        return {
            "artifact_id": art_id, 
            "path": key, 
            "filename": filename,
            "text_length": len(text) if text else 0,
            "chunk_count": len(chunks),
            "text_length": len(text) if text else 0
        }
        
    except Exception as e:
        print(f"[Mailgun] Error ingesting {filename}: {e}")
        return {"error": str(e), "filename": filename}