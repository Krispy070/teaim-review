import asyncio
import datetime as dt
from zoneinfo import ZoneInfo
import io, zipfile, json
import os
import mimetypes
import requests
import pytz
from .supabase_client import get_supabase_client
from .routers.digest import _iso_week_key, _month_key, _send_digest
from .deps import get_service_supabase

INTERVAL = int(float(__import__("os").getenv("SCHEDULER_INTERVAL_SEC","60")))  # 1 min
RETENTION_DAYS = int(float(__import__("os").getenv("BACKUP_RETENTION_DAYS","14")))

# Reindex worker configuration
REINDEX_INTERVAL_SEC = int(float(os.getenv("REINDEX_INTERVAL_SEC","10")))
REINDEX_MAX_ATTEMPTS = int(float(os.getenv("REINDEX_MAX_ATTEMPTS","4")))

async def digest_scheduler(app):
    """Background scheduler that runs digest sends based on org settings"""
    from .db import get_conn
    from .deps import get_service_supabase
    while True:
        try:
            now_utc = dt.datetime.now(dt.timezone.utc)
            
            # Get active projects using local database
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, org_id, lifecycle_status, code 
                        FROM projects 
                        WHERE lifecycle_status = 'active'
                    """)
                    proj = [dict(zip([desc[0] for desc in cur.description], row)) for row in cur.fetchall()]
            except Exception as e:
                print(f"Digest scheduler: Cannot query projects table - {e}")
                await asyncio.sleep(INTERVAL)  # Wait before trying again
                continue
                
            # Pull org settings once for efficiency using local database
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute("SELECT * FROM org_comms_settings")
                    rows = cur.fetchall()
                    cols = [desc[0] for desc in cur.description]
                    settings = {row[cols.index("org_id")]: dict(zip(cols, row)) for row in rows}
            except Exception as e:
                print(f"Digest scheduler: Cannot query org_comms_settings - {e}")
                await asyncio.sleep(INTERVAL)  # Wait before trying again  
                continue

            for p in proj:
                s = settings.get(p["org_id"], {})
                tz = ZoneInfo(s.get("tz","America/Los_Angeles"))
                local = now_utc.astimezone(tz)

                # --- Weekly digest scheduling ---
                if s.get("weekly_enabled", True):
                    wday = int(s.get("weekly_day", 4))   # 0=Mon, 4=Fri
                    whour= int(s.get("weekly_hour", 9))  # 09:00 local
                    if local.weekday()==wday and local.hour==whour and local.minute<1:
                        period_key = _iso_week_key(local)
                        # Check for dedupe using local database
                        try:
                            with get_conn() as conn, conn.cursor() as cur:
                                cur.execute("""
                                    SELECT id FROM comms_send_log 
                                    WHERE org_id = %s AND project_id = %s AND kind = 'digest' AND period_key = %s
                                """, (p["org_id"], p["id"], period_key))
                                sent = cur.fetchall()
                            
                            if len(sent) == 0:
                                # Send weekly digest - use service client for storage operations  
                                service_sb = get_service_supabase()
                                _send_digest(service_sb, p["org_id"], p["id"], period_key)
                        except Exception as e:
                            print(f"Digest dedup check failed: {e}")

                # --- Monthly digest scheduling ---
                if s.get("monthly_enabled", False):
                    mday = int(s.get("monthly_day", 1))   # 1st of month
                    mhour= int(s.get("monthly_hour", 9))  # 09:00 local
                    if local.day==mday and local.hour==mhour and local.minute<1:
                        period_key = _month_key(local)
                        # Check for dedupe using local database
                        try:
                            with get_conn() as conn, conn.cursor() as cur:
                                cur.execute("""
                                    SELECT id FROM comms_send_log 
                                    WHERE org_id = %s AND project_id = %s AND kind = 'digest' AND period_key = %s
                                """, (p["org_id"], p["id"], period_key))
                                sent = cur.fetchall()
                            
                            if len(sent) == 0:
                                # Send monthly digest - use service client for storage operations
                                service_sb = get_service_supabase()
                                _send_digest(service_sb, p["org_id"], p["id"], period_key)
                        except Exception as e:
                            print(f"Digest dedup check failed: {e}")

                # --- NIGHTLY BACKUP 02:00 local ---
                if local.hour == 2 and local.minute < 1:
                    try:
                        # Build ZIP in-memory: artifacts + manifest using local database for artifacts query
                        with get_conn() as conn, conn.cursor() as cur:
                            cur.execute("""
                                SELECT id, name, storage_bucket, storage_path, created_at 
                                FROM artifacts 
                                WHERE org_id = %s AND project_id = %s
                            """, (p["org_id"], p["id"]))
                            artifact_rows = cur.fetchall()
                            cols = [desc[0] for desc in cur.description]
                            arts = [dict(zip(cols, row)) for row in artifact_rows]
                        
                        buf = io.BytesIO()
                        zf = zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED)
                        manifest = {
                            "org_id": p["org_id"], "project_id": p["id"], "project_code": p.get("code"),
                            "generated_at": now_utc.isoformat(), "artifacts_count": len(arts)
                        }
                        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
                        
                        # Use service client for storage operations
                        service_sb = get_service_supabase()
                        storage = service_sb.storage
                        for a in arts:
                            try:
                                b = storage.from_(a["storage_bucket"]).download(a["storage_path"])
                                zf.writestr(f"artifacts/{a['name'] or a['id']}", b)
                            except Exception as e:
                                zf.writestr(f"artifacts/_missing_{a['id']}.txt", f"Could not download: {e}")
                        zf.close(); buf.seek(0)

                        ymd = local.strftime("%Y%m%d")
                        key = f"org/{p['org_id']}/project/{p['id']}/{ymd}.zip"
                        try:
                            storage.from_("backups").upload(key, buf.read())
                        except Exception as e:
                            print(f"Backup upload failed: {e}")

                        # Retention: delete older than N days
                        try:
                            lst = storage.from_("backups").list(f"org/{p['org_id']}/project/{p['id']}/") or []
                            cutoff = (local - dt.timedelta(days=RETENTION_DAYS)).date()
                            for obj in lst:
                                # filenames like 20250919.zip
                                base = (obj.get("name") or "").split(".")[0]
                                try:
                                    fdate = dt.datetime.strptime(base, "%Y%m%d").date()
                                    if fdate < cutoff:
                                        storage.from_("backups").remove([f"org/{p['org_id']}/project/{p['id']}/{obj['name']}"])
                                except Exception:
                                    continue
                        except Exception as e:
                            print(f"Backup retention cleanup failed: {e}")
                    except Exception as e:
                        print(f"Backup process failed: {e}")

        except Exception as e:
            # Log exceptions but keep scheduler running
            print(f"Digest scheduler error: {e}")
            pass
        await asyncio.sleep(INTERVAL)

async def reindex_worker(app):
    """Background worker to process reindex queue for re-embedding restored files"""
    from .db import get_conn
    while True:
        job = None  # Initialize to prevent UnboundLocalError
        try:
            # fetch next pending using local database
            q = []
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        SELECT * FROM reindex_queue 
                        WHERE status = 'pending' 
                        ORDER BY scheduled_at ASC 
                        LIMIT 1
                    """)
                    rows = cur.fetchall()
                    if rows:
                        # Convert to dict format matching Supabase response
                        cols = [desc[0] for desc in cur.description]
                        q = [dict(zip(cols, row)) for row in rows]
            except Exception as e:
                print(f"Reindex queue query failed: {e}")
                
            if not q:
                await asyncio.sleep(REINDEX_INTERVAL_SEC)
                continue
            job = q[0]
            org_id = job["org_id"]; project_id = job["project_id"]
            artifact_id = job.get("artifact_id"); stored_key = job.get("stored_key")

            # mark running using local database
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        UPDATE reindex_queue 
                        SET status = 'running', updated_at = %s 
                        WHERE id = %s
                    """, (dt.datetime.now(dt.timezone.utc), job["id"]))
            except Exception as e:
                print(f"Failed to update reindex job status: {e}")

            # (A) if we only have stored_key, download the bytes from artifacts
            file_bytes = None; filename = None; mime = None
            if stored_key:
                try:
                    # Use storage-only client for file downloads
                    from .deps import get_service_supabase
                    storage_client = get_service_supabase()
                    file_bytes = storage_client.storage.from_("artifacts").download(stored_key)
                    filename = os.path.basename(stored_key)
                    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
                except Exception as e:
                    raise RuntimeError(f"download fail: {e}")

            # (B) call your own ingest-sync (same pattern as backups)
            base = os.getenv("FASTAPI_URL","http://127.0.0.1:8000")
            url = f"{base}/ingest-sync?project_id={project_id}"
            headers = {}
            if os.getenv("DEV_AUTH","0") == "1":
                headers["X-Dev-User"] = "reindex-worker"
                headers["X-Dev-Org"]  = org_id
                headers["X-Dev-Role"] = "admin"
            else:
                token = os.getenv("INTERNAL_API_BEARER")
                if token: headers["Authorization"] = f"Bearer {token}"

            files = None
            if file_bytes is not None:
                files = {"file": (filename or "file", file_bytes, mime or "application/octet-stream")}
            elif artifact_id:
                # Fetch artifact info from local database and download from storage
                try:
                    with get_conn() as conn, conn.cursor() as cur:
                        cur.execute("""
                            SELECT storage_bucket, storage_path, name 
                            FROM artifacts 
                            WHERE org_id = %s AND project_id = %s AND id = %s 
                            LIMIT 1
                        """, (org_id, project_id, artifact_id))
                        art_row = cur.fetchone()
                        
                    if art_row:
                        bucket, path, name = art_row
                        # Use storage-only client for file downloads
                        from .deps import get_service_supabase
                        storage_client = get_service_supabase()
                        file_bytes = storage_client.storage.from_(bucket).download(path)
                        filename = name or os.path.basename(path)
                        mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
                        files = {"file": (filename, file_bytes, mime)}
                except Exception as e:
                    print(f"Failed to fetch artifact {artifact_id}: {e}")

            if not files:
                raise RuntimeError("nothing to reindex (no stored_key nor resolvable artifact)")

            data = {"org_id": org_id, "project_id": project_id, "source": "restore"}
            r = requests.post(url, files=files, data=data, headers=headers, timeout=120)
            if not r.ok:
                raise RuntimeError(f"ingest-sync returned {r.status_code}: {r.text[:250]}")
            artifact_id_new = None
            try:
                data = r.json()
                artifact_id_new = data.get("artifact_id") or (data.get("artifacts") or [{}])[0].get("id")
            except Exception:
                pass

            # success - update using local database
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    # Update reindex queue status
                    cur.execute("""
                        UPDATE reindex_queue 
                        SET status = 'done', updated_at = %s, artifact_id = %s 
                        WHERE id = %s
                    """, (dt.datetime.now(dt.timezone.utc), artifact_id_new or artifact_id, job["id"]))
                    
                    # Insert audit event
                    import json
                    details = {"job_id": job["id"], "artifact_id": artifact_id_new or artifact_id, "stored_key": stored_key}
                    cur.execute("""
                        INSERT INTO audit_events (org_id, project_id, actor_id, kind, details, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (org_id, project_id, None, "reindex.completed", json.dumps(details), dt.datetime.now(dt.timezone.utc)))
            except Exception as e:
                print(f"Failed to update reindex job success: {e}")

        except Exception as e:
            # backoff & record using local database - guard against job not being set
            if not job:
                print(f"Reindex worker error before job assignment: {e}")
            else:
                try:
                    attempts = (job.get("attempts") or 0) + 1
                    delay_s = min(30, 2 ** attempts)  # 2,4,8,16,30 seconds
                    next_at = dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=delay_s)
                    status = "pending" if attempts < REINDEX_MAX_ATTEMPTS else "failed"
                    
                    with get_conn() as conn, conn.cursor() as cur:
                        cur.execute("""
                            UPDATE reindex_queue 
                            SET status = %s, attempts = %s, last_error = %s, 
                                scheduled_at = %s, updated_at = %s 
                            WHERE id = %s
                        """, (status, attempts, str(e), next_at, dt.datetime.now(dt.timezone.utc), job["id"]))
                        if attempts >= REINDEX_MAX_ATTEMPTS:
                            # Insert audit event for failed reindex
                            import json
                            details = {"job_id": job["id"], "error": str(e), "stored_key": job.get("stored_key")}
                            cur.execute("""
                                INSERT INTO audit_events (org_id, project_id, actor_id, kind, details, created_at)
                                VALUES (%s, %s, %s, %s, %s, %s)
                            """, (job["org_id"], job["project_id"], None, "reindex.failed", json.dumps(details), dt.datetime.now(dt.timezone.utc)))
                except Exception:
                    pass
        finally:
            await asyncio.sleep(REINDEX_INTERVAL_SEC)

async def integrations_tick(app):
    """Background task to monitor integrations and update last_checked timestamp"""
    from .db import get_conn
    while True:
        try:
            # Get project integrations using local database
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT id, org_id, project_id, schedule, status 
                    FROM project_integrations
                """)
                rows = cur.fetchall()
                cols = [desc[0] for desc in cur.description]
                integrations = [dict(zip(cols, row)) for row in rows]
            
            # Update last_checked timestamp for integrations with schedules
            if integrations:
                now = dt.datetime.now(dt.timezone.utc)
                with get_conn() as conn, conn.cursor() as cur:
                    for r in integrations:
                        if r.get("schedule"):
                            cur.execute("""
                                UPDATE project_integrations 
                                SET last_checked = %s 
                                WHERE id = %s
                            """, (now, r["id"]))
        except Exception as e:
            print(f"Integrations tick error: {e}")
        await asyncio.sleep(int(os.getenv("INTEGRATIONS_TICK_SEC","300")))

async def reminders_tick(app):
    """Background task to send reminders for overdue actions"""
    from .db import get_conn
    while True:
        try:
            now = dt.datetime.now(dt.timezone.utc).date()
            
            # Get overdue actions using local database
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT id, org_id, project_id, title, owner, due_date, status 
                    FROM actions 
                    WHERE status != 'done' AND due_date IS NOT NULL AND due_date <= %s
                """, (now,))
                rows = cur.fetchall()
                cols = [desc[0] for desc in cur.description]
                actions = [dict(zip(cols, row)) for row in rows]
            
            for a in actions:
                org = a["org_id"]; proj = a["project_id"]
                # resolve owner email if you store it (users_profile/contacts); else fallback to DIGEST_TEST_EMAIL
                email = os.getenv("DIGEST_TEST_EMAIL")
                if not email: continue
                
                # For send_guard, we'll need to implement a local database version or skip the guard for now
                # TODO: Migrate send_guard to use local database
                
                # Send reminder email directly for now
                try:
                    from .email.util import mailgun_send_html
                    html = f"<p>Action Overdue: <b>{a['title']}</b> (due {a['due_date']})</p>"
                    mailgun_send_html(email, "TEAIM Reminder: Action Overdue", html)
                    
                    # Log send and audit using local database
                    import json
                    with get_conn() as conn, conn.cursor() as cur:
                        # Insert comms_send_log
                        cur.execute("""
                            INSERT INTO comms_send_log (org_id, project_id, kind, to_email, created_at)
                            VALUES (%s, %s, %s, %s, %s)
                        """, (org, proj, "reminder", email, dt.datetime.now(dt.timezone.utc)))
                        
                        # Insert audit event
                        details = {"action_id": a["id"], "email": email}
                        cur.execute("""
                            INSERT INTO audit_events (org_id, project_id, actor_id, kind, details, created_at)
                            VALUES (%s, %s, %s, %s, %s, %s)
                        """, (org, proj, None, "reminder.sent", json.dumps(details), dt.datetime.now(dt.timezone.utc)))
                    
                    # Emit webhook event for reminder sent
                    try:
                        import importlib
                        events_module = importlib.import_module("server.utils.events")
                        events_module.emit_event(
                            org_id=org,
                            project_id=proj,
                            kind="reminder.sent",
                            details={
                                "action_id": a["id"],
                                "action_title": a["title"],
                                "due_date": str(a["due_date"]),
                                "email": email
                            }
                        )
                    except Exception as e:
                        # Don't fail reminder process if webhook fails - now silent to avoid log spam
                        pass
                        
                except Exception as e:
                    print(f"Failed to send reminder for action {a['id']}: {e}")
                    
        except Exception as e:
            print(f"Reminders tick error: {e}")
        await asyncio.sleep(int(os.getenv("REMINDERS_TICK_SEC","600")))  # every 10m

async def revoke_expired_nightly():
    """Runs once every 24h, revokes expired sign-off tokens across orgs. Dev-safe."""
    from .db import get_conn
    while True:
        try:
            # revoke all expired (used_at null, revoked_at null, expires_at < now) using local database
            now = dt.datetime.now(dt.timezone.utc)
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        UPDATE signoff_doc_tokens 
                        SET revoked_at = %s 
                        WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at < %s
                    """, (now, now))
                    revoked_count = cur.rowcount
                    if revoked_count > 0:
                        print(f"Revoked {revoked_count} expired signoff tokens")
            except Exception as e:
                print(f"Failed to revoke expired tokens: {e}")
        except Exception as e:
            print(f"Revoke expired nightly error: {e}")
        await asyncio.sleep(24*60*60)  # run daily

async def process_comms_queue():
    """Every 5 minutes: send queued reminders due now; dev-safe."""
    from .db import get_conn
    while True:
        try:
            now = dt.datetime.now(dt.timezone.utc)
            # fetch due items using local database
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, org_id, project_id, kind, to_token, to_email, details 
                        FROM comms_queue 
                        WHERE not_before <= %s AND sent_at IS NULL 
                        LIMIT 50
                    """, (now,))
                    rows = cur.fetchall()
                    cols = [desc[0] for desc in cur.description]
                    qs = [dict(zip(cols, row)) for row in rows]
            except Exception as e:
                print(f"Failed to fetch comms_queue: {e}")
                qs = []
            for q in qs:
                # Handle cr_nudge_bulk queue items
                if q.get("kind") == "cr_nudge_bulk":
                    try:
                        to = q.get("to_email"); det = q.get("details") or {}
                        if not to: 
                            with get_conn() as conn, conn.cursor() as cur:
                                cur.execute("UPDATE comms_queue SET sent_at = %s WHERE id = %s", (now, q["id"]))
                            continue
                        # throttle using local database
                        mhb = int(det.get("min_hours_between", 12))
                        with get_conn() as conn, conn.cursor() as cur:
                            cur.execute("""
                                SELECT created_at FROM comms_send_log 
                                WHERE org_id = %s AND project_id = %s AND kind = 'cr_nudge' AND to_email = %s 
                                ORDER BY created_at DESC LIMIT 1
                            """, (q["org_id"], q.get("project_id"), to))
                            last_row = cur.fetchone()
                            last = [{"created_at": last_row[0]}] if last_row else []
                        ok_throttle = True
                        if last:
                            # last[0]["created_at"] is already a datetime object from the database
                            dt_last = last[0]["created_at"]
                            # Ensure it's timezone-aware
                            if dt_last.tzinfo is None:
                                dt_last = dt_last.replace(tzinfo=dt.timezone.utc)
                            ok_throttle = (dt.datetime.now(dt.timezone.utc) - dt_last) >= dt.timedelta(hours=mhb)
                        if ok_throttle:
                            from .email.util import mailgun_send_html
                            # TODO: Implement send_guard with local database - for now send directly
                            try:
                                subj = det.get("subject") or f"[Nudge] CR '{(det.get('title') or '')}'"
                                html = (det.get("html") or "<p>{{TITLE}} — due {{DUE}}</p>").replace("{{TITLE}}", det.get("title") or "")\
                                       .replace("{{DUE}}", det.get("due") or "n/a").replace("{{PRIO}}", det.get("priority") or "n/a")
                                mailgun_send_html(to, subj, html)
                                
                                # Log send using local database
                                import json
                                with get_conn() as conn, conn.cursor() as cur:
                                    cur.execute("""
                                        INSERT INTO comms_send_log (org_id, project_id, kind, to_email, details, created_at)
                                        VALUES (%s, %s, %s, %s, %s, %s)
                                    """, (q["org_id"], q.get("project_id"), "cr_nudge", to, 
                                          json.dumps({"id": det.get("id"), "queued": True}), now))
                            except Exception as e:
                                print(f"Failed to send cr_nudge: {e}")
                        
                        # Mark as sent using local database
                        with get_conn() as conn, conn.cursor() as cur:
                            cur.execute("UPDATE comms_queue SET sent_at = %s WHERE id = %s", (now, q["id"]))
                    except Exception as e:
                        print(f"Failed to process cr_nudge_bulk: {e}")
                        with get_conn() as conn, conn.cursor() as cur:
                            cur.execute("UPDATE comms_queue SET sent_at = %s WHERE id = %s", (now, q["id"]))
                    continue
                
                # Handle owner_digest_morning queue items
                if q.get("kind") == "owner_digest_morning":
                    try:
                        # For now, just mark as sent - digest logic can be implemented later
                        org, pid = q["org_id"], q.get("project_id")
                        # TODO: Implement owner digest morning logic with local database
                        print(f"Skipping owner_digest_morning for org {org}, project {pid}")
                        
                        # Mark as sent using local database
                        with get_conn() as conn, conn.cursor() as cur:
                            cur.execute("UPDATE comms_queue SET sent_at = %s WHERE id = %s", (now, q["id"]))
                    except Exception as e:
                        print(f"Failed to process owner_digest_morning: {e}")
                        with get_conn() as conn, conn.cursor() as cur:
                            cur.execute("UPDATE comms_queue SET sent_at = %s WHERE id = %s", (now, q["id"]))
                    continue
                
                try:
                    # resolve token -> signer email using local database
                    with get_conn() as conn, conn.cursor() as cur:
                        cur.execute("""
                            SELECT signer_email FROM signoff_doc_tokens 
                            WHERE org_id = %s AND token = %s AND used_at IS NULL AND revoked_at IS NULL
                        """, (q["org_id"], q["to_token"]))
                        tok_row = cur.fetchone()
                        
                    if not tok_row or not tok_row[0]:
                        # mark sent anyway to avoid loops
                        with get_conn() as conn, conn.cursor() as cur:
                            cur.execute("UPDATE comms_queue SET sent_at = %s WHERE id = %s", (now, q["id"]))
                        continue
                    email = tok_row[0]

                    # throttle by min_hours_between using local database
                    mhb = int((q.get("details") or {}).get("min_hours_between", 12))
                    with get_conn() as conn, conn.cursor() as cur:
                        cur.execute("""
                            SELECT created_at FROM comms_send_log 
                            WHERE org_id = %s AND project_id = %s AND kind = 'signoff_reminder' AND to_email = %s 
                            ORDER BY created_at DESC LIMIT 1
                        """, (q["org_id"], q.get("project_id"), email))
                        last_row = cur.fetchone()
                        last = [{"created_at": last_row[0]}] if last_row else []
                    ok_throttle = True
                    if last:
                        # last[0]["created_at"] is already a datetime object from the database
                        dt_last = last[0]["created_at"] 
                        # Ensure it's timezone-aware
                        if dt_last.tzinfo is None:
                            dt_last = dt_last.replace(tzinfo=dt.timezone.utc)
                        if (dt.datetime.now(dt.timezone.utc) - dt_last) < dt.timedelta(hours=mhb):
                            ok_throttle = False

                    if ok_throttle:
                        from .email.util import mailgun_send_html
                        # TODO: Implement send_guard with local database - for now send directly
                        try:
                            base = os.getenv("APP_BASE_URL","").rstrip("/")
                            link = f"{base}/signoff/doc/{q['to_token']}"
                            mailgun_send_html([email], "[Reminder] Sign-off request", f"<p>Your sign-off link: <a href='{link}'>Open</a></p>")
                            
                            # Log send using local database
                            import json
                            with get_conn() as conn, conn.cursor() as cur:
                                cur.execute("""
                                    INSERT INTO comms_send_log (org_id, project_id, kind, to_email, details, created_at)
                                    VALUES (%s, %s, %s, %s, %s, %s)
                                """, (q["org_id"], q.get("project_id"), "signoff_reminder", email,
                                      json.dumps({"token": q["to_token"], "queued": True}), now))
                        except Exception as e:
                            print(f"Failed to send signoff reminder: {e}")
                    
                    # mark sent regardless (prevents repeat send) using local database
                    with get_conn() as conn, conn.cursor() as cur:
                        cur.execute("UPDATE comms_queue SET sent_at = %s WHERE id = %s", (now, q["id"]))
                except Exception as e:
                    # mark and continue using local database
                    print(f"Failed to process signoff reminder: {e}")
                    with get_conn() as conn, conn.cursor() as cur:
                        cur.execute("UPDATE comms_queue SET sent_at = %s WHERE id = %s", (now, q["id"]))
        except Exception:
            ...
        await asyncio.sleep(300)  # every 5 min

async def process_cr_sla_assignee_nightly():
    """Nightly CR SLA assignee alerts - dev-safe no-op if tables missing"""
    sbs = get_service_supabase()
    while True:
        try:
            # Check at 08:00 local time daily (similar to digest scheduler pattern)
            now_utc = dt.datetime.now(dt.timezone.utc)
            # naive: iterate all projects you can see (dev-safe: if table missing, skip)
            try:
                projs = sbs.table("projects").select("id,org_id").eq("lifecycle_status","active").limit(1000).execute().data or []
            except Exception:
                projs=[]
            from .routers.changes_sla import _sla_state  # ensure module import works
            
            # Make API calls to both SLA endpoints for each active project
            base_url = os.getenv("FASTAPI_URL", "http://127.0.0.1:8000")
            headers = {}
            if os.getenv("DEV_MODE"):
                headers.update({
                    "X-Dev-User": os.getenv("VITE_DEV_USER", ""),
                    "X-Dev-Org": os.getenv("VITE_DEV_ORG", ""),
                    "X-Dev-Role": "admin"
                })
            
            for p in projs:
                try:
                    # POST to both SLA alert endpoints
                    proj_params = {"project_id": p["id"]}
                    # SLA alerts for watchers
                    requests.post(f"{base_url}/api/changes/sla_alerts", params=proj_params, headers=headers, timeout=30)
                    # SLA alerts for assignees
                    requests.post(f"{base_url}/api/changes/sla_alerts_assignee", params=proj_params, headers=headers, timeout=30)
                except Exception: ...
        except Exception: ...
        await asyncio.sleep(24*60*60)

async def schedule_breach_soon_nudges_nightly():
    """Each night: queue morning nudges for CRs in breach-soon/overdue (assignees). Dev-safe."""
    sbs = get_service_supabase()
    while True:
        try:
            # iterate projects (dev-safe)
            try:
                projs = sbs.table("projects").select("id,org_id").limit(1000).execute().data or []
            except Exception:
                projs=[]
            for p in projs:
                pid = p["id"]; org = p["org_id"]
                # timezone
                tzname = "UTC"
                try:
                    tzname = (sbs.table("org_comms_settings").select("timezone").eq("org_id", org).single().execute().data or {}).get("timezone") or "UTC"
                except Exception: ...
                tz = pytz.timezone(tzname)
                local_now = dt.datetime.now(tz)
                due_utc = (local_now + dt.timedelta(days=1)).replace(hour=9,minute=0,second=0,microsecond=0).astimezone(pytz.UTC).isoformat()

                # breach soon / overdue (filter out closed/deployed)
                try:
                    crs = sbs.table("changes").select("id,title,priority,due_date,assignee,status")\
                           .eq("org_id",org).eq("project_id",pid).execute().data or []
                    # Filter out closed/deployed CRs
                    crs = [c for c in crs if (c.get("status") or "").lower() not in ("deployed", "closed")]
                except Exception:
                    crs=[]
                def sla_state(due,prio):
                    if not due: return "none", None
                    try:
                        dd = dt.datetime.fromisoformat(due).date()
                        today = dt.datetime.now(dt.timezone.utc).date()
                        days = (dd - today).days
                        thr = {"urgent":2,"high":3,"medium":5,"low":7}.get((prio or "medium").lower(),5)
                        if days < 0: return "overdue", days
                        if days <= thr: return "breach_soon", days
                        return "ok", days
                    except Exception:
                        return "none", None
                # Get user email mapping for assignee resolution
                try:
                    profiles = sbs.table("users_profile").select("user_id,email").execute().data or []
                    uid_to_email = {p["user_id"]: p.get("email") for p in profiles if p.get("user_id")}
                except Exception:
                    uid_to_email = {}
                
                # Check existing queue items for today to prevent duplicates
                today_start = local_now.replace(hour=0,minute=0,second=0,microsecond=0).astimezone(pytz.UTC).isoformat()
                today_end = local_now.replace(hour=23,minute=59,second=59,microsecond=999999).astimezone(pytz.UTC).isoformat()
                try:
                    existing_queue = sbs.table("comms_queue").select("details")\
                                     .eq("org_id",org).eq("project_id",pid).eq("kind","cr_nudge_bulk")\
                                     .gte("not_before",today_start).lte("not_before",today_end).execute().data or []
                    existing_cr_ids = {q.get("details",{}).get("id") for q in existing_queue if q.get("details",{}).get("id")}
                except Exception:
                    existing_cr_ids = set()
                
                for c in crs:
                    assignee = c.get("assignee")
                    if not assignee: continue
                    
                    # Resolve assignee to email
                    if "@" in assignee:
                        assignee_email = assignee
                    else:
                        assignee_email = uid_to_email.get(assignee)
                        if not assignee_email: continue
                    
                    st,_ = sla_state(c.get("due_date"), c.get("priority"))
                    if st not in ("overdue","breach_soon"): continue
                    
                    # Skip if already queued today
                    if c["id"] in existing_cr_ids: continue
                    
                    try:
                        sbs.table("comms_queue").insert({
                            "org_id": org, "project_id": pid,
                            "kind": "cr_nudge_bulk", "to_email": assignee_email,
                            "not_before": due_utc,
                            "details": {"id": c["id"], "title": c.get("title"), "due": c.get("due_date"),
                                        "priority": c.get("priority"), "min_hours_between": 12}
                        }).execute()
                    except Exception: ...
        except Exception:
            ...
        await asyncio.sleep(24*60*60)

async def schedule_owner_digest_morning():
    """Every night: queue owner digests for 08:00 local per org. Dev-safe."""
    sbs = get_service_supabase()
    while True:
        try:
            # projects / org timezones (dev-safe)
            try:
                projs = sbs.table("projects").select("id,org_id").limit(1000).execute().data or []
            except Exception:
                projs=[]
            for p in projs:
                pid, org = p["id"], p["org_id"]
                try:
                    tzname = (sbs.table("org_comms_settings").select("timezone")
                              .eq("org_id", org).single().execute().data or {}).get("timezone") or "UTC"
                except Exception:
                    tzname = "UTC"
                tz = pytz.timezone(tzname)
                local_now = dt.datetime.now(tz)
                due_utc = (local_now + dt.timedelta(days=1)).replace(hour=8,minute=0,second=0,microsecond=0).astimezone(pytz.UTC).isoformat()
                # queue single owner digest (one per project)
                try:
                    sbs.table("comms_queue").insert({
                        "org_id": org, "project_id": pid,
                        "kind": "owner_digest_morning",
                        "not_before": due_utc,
                        "details": {}
                    }).execute()
                except Exception: ...
        except Exception:
            ...
        await asyncio.sleep(24*60*60)

async def auto_archive_closed_crs_nightly():
    """Nightly auto-archive for closed & deployed CRs > 30 days. Dev-safe."""
    sbs = get_service_supabase()
    while True:
        try:
            now = dt.datetime.now(dt.timezone.utc)
            # Get all closed and deployed CRs from all projects (dev-safe)
            try:
                rows = sbs.table("changes").select("id,org_id,project_id,status,updated_at")\
                       .in_("status", ["closed", "deployed"]).execute().data or []
            except Exception:
                rows = []
            
            for r in rows:
                try:
                    # Parse updated_at timestamp
                    if not r.get("updated_at"):
                        continue
                    dtup = dt.datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00"))
                    
                    # Archive if closed/deployed > 30 days
                    if (now - dtup).days >= 30 and (r.get("status") in ("closed","deployed")):
                        try:
                            sbs.table("changes").update({"status":"archived"})\
                               .eq("org_id",r["org_id"]).eq("project_id",r["project_id"]).eq("id",r["id"]).execute()
                        except Exception: ...
                except Exception: ...
        except Exception:
            ...
        await asyncio.sleep(24*60*60)