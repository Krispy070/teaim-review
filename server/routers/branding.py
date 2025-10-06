from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request, Response
from fastapi.responses import StreamingResponse
from ..tenant import TenantCtx, DEV_AUTH
from ..guards import require_role, member_ctx
from ..supabase_client import get_user_supabase, get_supabase_client as get_service_supabase
from ..db import get_conn
import os, datetime as dt, imghdr, mimetypes, io, hashlib, re, logging

router = APIRouter(prefix="/branding", tags=["branding"])  # prefix WITHOUT /api to match proxy
ADMIN = require_role({"owner","admin"})

def _now_iso(): return dt.datetime.now(dt.timezone.utc).isoformat()
def _bucket(): return os.getenv("BRANDING_BUCKET") or os.getenv("ARTIFACTS_BUCKET") or os.getenv("BUCKET", "project-artifacts")

def _validate_image(data: bytes, filename: str):
    typ = imghdr.what(None, h=data)
    if typ not in ("png","jpeg","jpg","gif","webp"):
        ext = (filename or "").split(".")[-1].lower()
        if ext not in ("png","jpg","jpeg","gif","webp"):
            raise HTTPException(400, "Invalid image file")
    return mimetypes.guess_type(filename)[0] or "image/png"

def _sanitize_filename(filename: str) -> str:
    """Sanitize filename by removing slashes and unsafe characters"""
    if not filename:
        return "logo"
    # Remove path separators and other unsafe characters
    sanitized = re.sub(r'[/\\\n\r\t]', '_', filename)
    # Keep only alphanumeric, dots, dashes, underscores
    sanitized = re.sub(r'[^a-zA-Z0-9._-]', '_', sanitized)
    return sanitized[:50]  # Limit length

def _upload_logo(file: UploadFile, key_prefix: str, ctx: TenantCtx):
    sbs = get_service_supabase()
    bucket = _bucket()
    raw = file.file.read()
    
    # Validate file size (5MB limit)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "File size must be less than 5MB")
    
    ctype = _validate_image(raw, file.filename or "logo.png")
    safe_filename = _sanitize_filename(file.filename or "logo")
    key = f"org/{ctx.org_id}/branding/{key_prefix}__{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d_%H%M%S')}__{safe_filename}"
    
    sbs.storage.from_(bucket).upload(path=key, file=raw)
    return bucket, key, ctype, raw

# ---------- ORG settings ----------
@router.get("/settings")
def get_settings(ctx: TenantCtx = Depends(member_ctx)):
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM org_branding WHERE org_id = %s",
                    (ctx.org_id,)
                )
                row = cur.fetchone()
                if row and cur.description:
                    columns = [desc[0] for desc in cur.description]
                    data = dict(zip(columns, row))
                else:
                    data = {"org_id": ctx.org_id, "theme_color": "#111111"}
                logging.info(f"🔧 DEV: Retrieved branding settings for org {ctx.org_id}")
                return data
        except Exception as e:
            logging.warning(f"🔧 DEV: Database fallback failed: {e}")
            return {"org_id": ctx.org_id, "theme_color": "#111111"}
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        r = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute()
        return r.data or {"org_id": ctx.org_id, "theme_color":"#111111"}

@router.post("/settings")
def set_settings(body: dict, ctx: TenantCtx = Depends(ADMIN)):
    # Whitelist allowed database columns (exclude logo bucket/path fields for security)
    allowed_fields = {
        'customer_name', 'vendor_name', 'theme_color', 'header_text'
    }
    
    # Filter request body to only include allowed database columns
    body = body or {}
    filtered_body = {k: v for k, v in body.items() if k in allowed_fields}
    filtered_body["org_id"] = ctx.org_id
    filtered_body["updated_at"] = _now_iso()
    
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                # Use PostgreSQL UPSERT (INSERT ... ON CONFLICT) for dev mode
                fields = list(filtered_body.keys())
                values = list(filtered_body.values())
                placeholders = ', '.join(['%s'] * len(values))
                field_names = ', '.join(fields)
                update_clause = ', '.join([f"{field} = EXCLUDED.{field}" for field in fields if field != 'org_id'])
                
                query = f"""
                    INSERT INTO org_branding ({field_names}) 
                    VALUES ({placeholders})
                    ON CONFLICT (org_id) DO UPDATE SET {update_clause}
                """
                
                cur.execute(query, values)
                logging.info(f"🔧 DEV: Saved branding settings for org {ctx.org_id}")
                return {"ok": True}
        except Exception as e:
            logging.error(f"Branding settings save failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        sb.table("org_branding").upsert(filtered_body, on_conflict="org_id").execute()
        return {"ok": True}

@router.post("/upload_customer")
def upload_customer(file: UploadFile = File(...), ctx: TenantCtx = Depends(ADMIN)):
    bucket, key, ctype, raw = _upload_logo(file, "customer", ctx)
    
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                # Use PostgreSQL UPSERT for dev mode
                cur.execute("""
                    INSERT INTO org_branding (org_id, customer_logo_bucket, customer_logo_path, updated_at) 
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (org_id) DO UPDATE SET 
                        customer_logo_bucket = EXCLUDED.customer_logo_bucket,
                        customer_logo_path = EXCLUDED.customer_logo_path,
                        updated_at = EXCLUDED.updated_at
                """, (ctx.org_id, bucket, key, _now_iso()))
                logging.info(f"🔧 DEV: Saved customer logo for org {ctx.org_id}")
        except Exception as e:
            logging.error(f"Customer logo save failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        sb.table("org_branding").upsert({
            "org_id": ctx.org_id, "customer_logo_bucket": bucket, "customer_logo_path": key,
            "updated_at": _now_iso()
        }, on_conflict="org_id").execute()
    
    _upsert_etag(ctx.org_id, f"org:customer", raw)
    return {"ok": True, "bucket": bucket, "path": key, "content_type": ctype}

@router.post("/upload_vendor")
def upload_vendor(file: UploadFile = File(...), ctx: TenantCtx = Depends(ADMIN)):
    bucket, key, ctype, raw = _upload_logo(file, "vendor", ctx)
    
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                # Use PostgreSQL UPSERT for dev mode
                cur.execute("""
                    INSERT INTO org_branding (org_id, vendor_logo_bucket, vendor_logo_path, updated_at) 
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (org_id) DO UPDATE SET 
                        vendor_logo_bucket = EXCLUDED.vendor_logo_bucket,
                        vendor_logo_path = EXCLUDED.vendor_logo_path,
                        updated_at = EXCLUDED.updated_at
                """, (ctx.org_id, bucket, key, _now_iso()))
                logging.info(f"🔧 DEV: Saved vendor logo for org {ctx.org_id}")
        except Exception as e:
            logging.error(f"Vendor logo save failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        sb.table("org_branding").upsert({
            "org_id": ctx.org_id, "vendor_logo_bucket": bucket, "vendor_logo_path": key,
            "updated_at": _now_iso()
        }, on_conflict="org_id").execute()
    
    _upsert_etag(ctx.org_id, f"org:vendor", raw)
    return {"ok": True, "bucket": bucket, "path": key, "content_type": ctype}

# ---------- PROJECT overrides ----------
@router.get("/project_settings")
def get_project_settings(project_id: str, ctx: TenantCtx = Depends(member_ctx)):
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                # Get project branding
                cur.execute(
                    "SELECT * FROM project_branding WHERE org_id = %s AND project_id = %s",
                    (ctx.org_id, project_id)
                )
                p_row = cur.fetchone()
                p = None
                if p_row and cur.description:
                    columns = [desc[0] for desc in cur.description]
                    p = dict(zip(columns, p_row))
                
                # Get org branding
                cur.execute(
                    "SELECT * FROM org_branding WHERE org_id = %s",
                    (ctx.org_id,)
                )
                o_row = cur.fetchone()
                o = {}
                if o_row and cur.description:
                    columns = [desc[0] for desc in cur.description]
                    o = dict(zip(columns, o_row))
        except Exception as e:
            logging.warning(f"🔧 DEV: Database fallback failed: {e}")
            p = None
            o = {}
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        p = sb.table("project_branding").select("*").eq("org_id", ctx.org_id).eq("project_id", project_id).single().execute().data
        o = sb.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute().data or {}
    
    # overlay p on o
    def pick(k): return (p or {}).get(k) or o.get(k)
    out = {
      "org_id": ctx.org_id, "project_id": project_id,
      "customer_name": pick("customer_name"),
      "customer_logo_bucket": pick("customer_logo_bucket"),
      "customer_logo_path": pick("customer_logo_path"),
      "vendor_name": pick("vendor_name"),
      "vendor_logo_bucket": pick("vendor_logo_bucket"),
      "vendor_logo_path": pick("vendor_logo_path"),
      "theme_color": pick("theme_color") or "#111111",
      "header_text": pick("header_text"),
      "source": "project" if p else "org"
    }
    return out

@router.post("/project_settings")
def set_project_settings(project_id: str, body: dict, ctx: TenantCtx = Depends(ADMIN)):
    # Whitelist allowed database columns (exclude logo bucket/path fields for security)
    allowed_fields = {
        'customer_name', 'vendor_name', 'theme_color', 'header_text'
    }
    
    # Filter request body to only include allowed database columns
    body = body or {}
    filtered_body = {k: v for k, v in body.items() if k in allowed_fields}
    filtered_body["org_id"] = ctx.org_id
    filtered_body["project_id"] = project_id
    filtered_body["updated_at"] = _now_iso()
    
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                # Use PostgreSQL UPSERT (INSERT ... ON CONFLICT) for dev mode
                fields = list(filtered_body.keys())
                values = list(filtered_body.values())
                placeholders = ', '.join(['%s'] * len(values))
                field_names = ', '.join(fields)
                update_clause = ', '.join([f"{field} = EXCLUDED.{field}" for field in fields if field not in ('org_id', 'project_id')])
                
                query = f"""
                    INSERT INTO project_branding ({field_names}) 
                    VALUES ({placeholders})
                    ON CONFLICT (org_id, project_id) DO UPDATE SET {update_clause}
                """
                
                cur.execute(query, values)
                logging.info(f"🔧 DEV: Saved project branding settings for org {ctx.org_id}, project {project_id}")
                return {"ok": True}
        except Exception as e:
            logging.error(f"Project branding settings save failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        sb.table("project_branding").upsert(filtered_body, on_conflict="org_id,project_id").execute()
        return {"ok": True}

@router.post("/project_upload_customer")
def project_upload_customer(project_id: str, file: UploadFile = File(...), ctx: TenantCtx = Depends(ADMIN)):
    bucket, key, ctype, raw = _upload_logo(file, f"proj_{project_id}_customer", ctx)
    
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                # Use PostgreSQL UPSERT for dev mode
                cur.execute("""
                    INSERT INTO project_branding (org_id, project_id, customer_logo_bucket, customer_logo_path, updated_at) 
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (org_id, project_id) DO UPDATE SET 
                        customer_logo_bucket = EXCLUDED.customer_logo_bucket,
                        customer_logo_path = EXCLUDED.customer_logo_path,
                        updated_at = EXCLUDED.updated_at
                """, (ctx.org_id, project_id, bucket, key, _now_iso()))
                logging.info(f"🔧 DEV: Saved project customer logo for org {ctx.org_id}, project {project_id}")
        except Exception as e:
            logging.error(f"Project customer logo save failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        sb.table("project_branding").upsert({
            "org_id": ctx.org_id, "project_id": project_id,
            "customer_logo_bucket": bucket, "customer_logo_path": key, "updated_at": _now_iso()
        }, on_conflict="org_id,project_id").execute()
    
    _upsert_etag(ctx.org_id, f"proj:{project_id}:customer", raw)
    return {"ok": True, "bucket": bucket, "path": key, "content_type": ctype}

@router.post("/project_upload_vendor")
def project_upload_vendor(project_id: str, file: UploadFile = File(...), ctx: TenantCtx = Depends(ADMIN)):
    bucket, key, ctype, raw = _upload_logo(file, f"proj_{project_id}_vendor", ctx)
    
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                # Use PostgreSQL UPSERT for dev mode
                cur.execute("""
                    INSERT INTO project_branding (org_id, project_id, vendor_logo_bucket, vendor_logo_path, updated_at) 
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (org_id, project_id) DO UPDATE SET 
                        vendor_logo_bucket = EXCLUDED.vendor_logo_bucket,
                        vendor_logo_path = EXCLUDED.vendor_logo_path,
                        updated_at = EXCLUDED.updated_at
                """, (ctx.org_id, project_id, bucket, key, _now_iso()))
                logging.info(f"🔧 DEV: Saved project vendor logo for org {ctx.org_id}, project {project_id}")
        except Exception as e:
            logging.error(f"Project vendor logo save failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")
    else:
        # Production mode - use JWT-authenticated Supabase client
        sb = get_user_supabase(ctx)
        sb.table("project_branding").upsert({
            "org_id": ctx.org_id, "project_id": project_id,
            "vendor_logo_bucket": bucket, "vendor_logo_path": key, "updated_at": _now_iso()
        }, on_conflict="org_id,project_id").execute()
    
    _upsert_etag(ctx.org_id, f"proj:{project_id}:vendor", raw)
    return {"ok": True, "bucket": bucket, "path": key, "content_type": ctype}

# ---------- ETag support + logo HEAD/GET ----------
def _upsert_etag(org_id: str, kind: str, data: bytes):
    etag = hashlib.md5(data).hexdigest()
    
    # Handle dev mode authentication - use direct database access when JWT unavailable
    if DEV_AUTH:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                # Use PostgreSQL UPSERT for dev mode
                cur.execute("""
                    INSERT INTO branding_etags (org_id, kind, etag, updated_at) 
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (org_id, kind) DO UPDATE SET 
                        etag = EXCLUDED.etag,
                        updated_at = EXCLUDED.updated_at
                """, (org_id, kind, etag, _now_iso()))
        except Exception:
            pass  # Silent fail for etags - not critical
    else:
        try:
            sbs = get_service_supabase()
            sbs.table("branding_etags").upsert({
              "org_id": org_id, "kind": kind, "etag": etag, "updated_at": _now_iso()
            }, on_conflict="org_id,kind").execute()
        except Exception:
            pass  # Silent fail for etags - not critical

def _lookup_logo(org_id: str, project_id: str | None, which: str):
    # project override first
    bucket = path = None
    if project_id:
        if DEV_AUTH:
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute(
                        "SELECT * FROM project_branding WHERE org_id = %s AND project_id = %s",
                        (org_id, project_id)
                    )
                    row = cur.fetchone()
                    if row and cur.description:
                        columns = [desc[0] for desc in cur.description]
                        p = dict(zip(columns, row))
                        bucket = p.get(f"{which}_logo_bucket")
                        path = p.get(f"{which}_logo_path")
            except Exception:
                pass
        else:
            try:
                sb = get_user_supabase(TenantCtx(org_id=org_id, user_id="", jwt="", role="admin"))
                p = sb.table("project_branding").select("*").eq("org_id", org_id).eq("project_id", project_id).single().execute().data
                if p:
                    bucket = p.get(f"{which}_logo_bucket")
                    path = p.get(f"{which}_logo_path")
            except Exception:
                pass
    
    if not bucket or not path:
        if DEV_AUTH:
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute(
                        "SELECT * FROM org_branding WHERE org_id = %s",
                        (org_id,)
                    )
                    row = cur.fetchone()
                    if row and cur.description:
                        columns = [desc[0] for desc in cur.description]
                        o = dict(zip(columns, row))
                        bucket = o.get(f"{which}_logo_bucket")
                        path = o.get(f"{which}_logo_path")
            except Exception:
                pass
        else:
            try:
                sb = get_user_supabase(TenantCtx(org_id=org_id, user_id="", jwt="", role="admin"))
                o = sb.table("org_branding").select("*").eq("org_id", org_id).single().execute().data or {}
                bucket = o.get(f"{which}_logo_bucket")
                path = o.get(f"{which}_logo_path")
            except Exception:
                pass
    
    if not bucket or not path: 
        return None, None, None
    
    try:
        sbs = get_service_supabase()
        data = sbs.storage.from_(bucket).download(path)
    except Exception:
        return None, None, None
    
    ctype = mimetypes.guess_type(path)[0] or "image/png"
    return data, path, ctype

@router.head("/logo")
def logo_head(which: str = Query(..., regex="^(customer|vendor)$"),
              project_id: str | None = None, ctx: TenantCtx = Depends(member_ctx)):
    # ETag lookup
    key = f"proj:{project_id}:{which}" if project_id else f"org:{which}"
    et = None
    
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT etag FROM branding_etags WHERE org_id = %s AND kind = %s",
                    (ctx.org_id, key)
                )
                row = cur.fetchone()
                if row:
                    et = row[0]
        except Exception:
            pass
    else:
        try:
            sb = get_user_supabase(ctx)
            r = sb.table("branding_etags").select("etag").eq("org_id", ctx.org_id).eq("kind", key).single().execute().data
            et = r and r.get("etag")
        except Exception:
            pass
    
    if et:
        return Response(status_code=200, headers={"ETag": str(et), "Cache-Control":"public, max-age=300"})
    
    # fallback to compute on first call
    data, path, _ = _lookup_logo(ctx.org_id, project_id, which)
    if not data: 
        raise HTTPException(404, "Logo not set")
    
    et = hashlib.md5(data).hexdigest()
    _upsert_etag(ctx.org_id, key, data)
    return Response(status_code=200, headers={"ETag": et, "Cache-Control":"public, max-age=300"})

@router.get("/logo")
def logo_get(which: str = Query(..., regex="^(customer|vendor)$"),
             project_id: str | None = None, request: Request = None, ctx: TenantCtx = Depends(member_ctx)):
    # ETag check
    key = f"proj:{project_id}:{which}" if project_id else f"org:{which}"
    inm = request.headers.get("If-None-Match") if request else None
    et = None
    
    if DEV_AUTH and not ctx.jwt:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT etag FROM branding_etags WHERE org_id = %s AND kind = %s",
                    (ctx.org_id, key)
                )
                row = cur.fetchone()
                if row:
                    et = row[0]
        except Exception:
            pass
    else:
        try:
            sb = get_user_supabase(ctx)
            r = sb.table("branding_etags").select("etag").eq("org_id", ctx.org_id).eq("kind", key).single().execute().data
            et = r and r.get("etag")
        except Exception:
            pass
    
    if et and inm and inm.strip('"') == et:
        return Response(status_code=304, headers={"Cache-Control":"public, max-age=300"})

    data, path, ctype = _lookup_logo(ctx.org_id, project_id, which)
    if not data: 
        raise HTTPException(404, "Logo not set")
    
    etag = et or hashlib.md5(data).hexdigest()
    
    # CRITICAL SECURITY: Validate that the path belongs to this org
    expected_bucket = _bucket()
    expected_path_prefix = f"org/{ctx.org_id}/branding/"
    
    if not path or not path.startswith(expected_path_prefix):
        logging.warning(f"🔒 Security: Invalid path access attempt: {path} not in {expected_path_prefix}")
        raise HTTPException(404, "Logo not found")
    
    # Optional signed URL redirect for production performance
    if os.getenv("BRAND_SIGNED_URLS","0")=="1":
        try:
            # Try create a short-lived signed URL and redirect
            sbs = get_service_supabase()
            res = sbs.storage.from_(expected_bucket).create_signed_url(path, 60)  # 60 sec
            url = res.get("signedURL") or res.get("signed_url")
            if url:
                from fastapi.responses import RedirectResponse
                return RedirectResponse(url, status_code=302)
        except Exception:
            pass
    
    return StreamingResponse(io.BytesIO(data), media_type=ctype,
                             headers={"ETag": f'"{etag}"', "Cache-Control": "public, max-age=3600"})