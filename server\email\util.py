import os, requests, datetime as dt, hashlib, hmac
from zoneinfo import ZoneInfo

MG_DOMAIN = os.getenv("MAILGUN_DOMAIN")
MG_KEY = os.getenv("MAILGUN_API_KEY")

def in_quiet_hours(tz_name: str, quiet_start: str, quiet_end: str, now_utc: dt.datetime | None = None) -> bool:
    """Check if current time is within quiet hours in the organization's timezone"""
    now_utc = now_utc or dt.datetime.now(dt.timezone.utc)
    tz = ZoneInfo(tz_name)
    local = now_utc.astimezone(tz)
    
    # Parse quiet hours as naive times with robust handling
    try:
        # Handle HH:MM or HH:MM:SS format, strip any timezone info
        qs_str = quiet_start.strip()
        qe_str = quiet_end.strip()
        
        # Remove timezone offset if present (safer parsing)
        if '+' in qs_str:
            qs_str = qs_str.split('+')[0]
        if '-' in qs_str and qs_str.count('-') > 0:
            # Only remove if it looks like timezone offset, not negative time
            parts = qs_str.split('-')
            if len(parts) > 1 and parts[-1].isdigit():
                qs_str = '-'.join(parts[:-1])
        
        if '+' in qe_str:
            qe_str = qe_str.split('+')[0]
        if '-' in qe_str and qe_str.count('-') > 0:
            parts = qe_str.split('-')
            if len(parts) > 1 and parts[-1].isdigit():
                qe_str = '-'.join(parts[:-1])
        
        qs = dt.time.fromisoformat(qs_str)
        qe = dt.time.fromisoformat(qe_str)
    except (ValueError, AttributeError):
        # Fallback to safe defaults if parsing fails
        qs = dt.time(21, 0)  # 9 PM
        qe = dt.time(7, 0)   # 7 AM
    
    # Create naive current time (critical fix for timezone comparison)
    current_time = dt.time(local.hour, local.minute, local.second)
    
    # Handle midnight wrap
    if qs <= qe:
        return qs <= current_time <= qe
    return current_time >= qs or current_time <= qe

def send_guard(sb, org_id: str, project_id: str | None, kind: str, to_email: str) -> tuple[bool,str]:
    """Check if email can be sent (respects quiet hours and daily caps)"""
    # v2.10 specification: Get settings with new column names, fallback to legacy
    try:
        s = sb.table("org_comms_settings").select("quiet_hours_start,quiet_hours_end,timezone,daily_cap,tz,quiet_start,quiet_end,daily_send_cap")\
            .eq("org_id", org_id).single().execute().data or {}
    except Exception:
        s = {}
    
    # v2.10: Use new column names with fallback to legacy
    tz_name = s.get("timezone") or s.get("tz") or "UTC"
    qs = s.get("quiet_hours_start") or s.get("quiet_start")
    qe = s.get("quiet_hours_end") or s.get("quiet_end")
    cap = int(s.get("daily_cap") or s.get("daily_send_cap") or 500)
    
    # v2.10: Check quiet hours
    if qs and qe:
        try:
            tz = ZoneInfo(tz_name)
            now_local = dt.datetime.now(tz)
            t = now_local.time()
            
            # Parse time strings
            qs_time = dt.time.fromisoformat(qs.split('+')[0].split('-')[0] if '+' in qs or '-' in qs else qs)
            qe_time = dt.time.fromisoformat(qe.split('+')[0].split('-')[0] if '+' in qe or '-' in qe else qe)
            
            # Check if within quiet hours
            within = (qs_time <= t <= qe_time) if qs_time <= qe_time else (t >= qs_time or t <= qe_time)
            if within:
                return False, f"Quiet hours ({qs}–{qe} {tz_name})"
        except Exception:
            # If parsing fails, skip quiet hours check
            pass
    
    # v2.10: Check daily cap
    try:
        tz = ZoneInfo(tz_name)
        now_local = dt.datetime.now(tz)
        start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        
        count = sb.table("comms_send_log").select("id", count="exact")\
                .eq("org_id", org_id).eq("kind", kind)\
                .gte("created_at", start.isoformat()).execute().count or 0
        
        if count >= cap:
            return False, f"Daily cap reached ({cap})"
    except Exception:
        # If count query fails, allow send but log the issue
        pass
    
    return True, ""

def log_send(sb, org_id: str, project_id: str | None, kind: str, to_email: str, 
             status: str = "success", provider_id: str | None = None, 
             subject: str | None = None, error: str | None = None):
    """Log email send for rate limiting and audit purposes"""
    try:
        sb.table("comms_send_log").insert({
            "org_id": org_id, 
            "project_id": project_id, 
            "kind": kind, 
            "to_email": to_email,
            # Extended logging for compliance
            "status": status,
            "provider_id": provider_id,
            "subject": subject,
            "error": error
        }).execute()
    except Exception:
        # Don't fail email send if logging fails
        pass

def mailgun_send_html(to_email: str, subject: str, html: str) -> dict:
    """Send HTML email via Mailgun API with structured error handling"""
    if not (MG_DOMAIN and MG_KEY):
        return {"ok": False, "error": "Mailgun not configured"}
    
    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{MG_DOMAIN}/messages",
            auth=("api", MG_KEY),
            data={"from": f"TEAIM <no-reply@{MG_DOMAIN}>", "to": [to_email], "subject": subject, "html": html},
            timeout=20
        )
        
        if response.status_code in range(200, 300):
            result = response.json() if response.content else {}
            return {
                "ok": True,
                "provider_id": result.get("id"),
                "message": result.get("message", "Sent successfully")
            }
        else:
            return {
                "ok": False,
                "status_code": response.status_code,
                "error": response.text[:500]  # Truncate long errors
            }
    except requests.RequestException as e:
        return {"ok": False, "error": f"Request failed: {str(e)[:200]}"}
    except Exception as e:
        return {"ok": False, "error": f"Unexpected error: {str(e)[:200]}"}

def generate_secure_token() -> tuple[str, str, str]:
    """Generate a secure token with hash for database storage
    Returns: (raw_token, token_hash, token_suffix)
    """
    import secrets
    # Generate 40-character URL-safe token
    raw_token = secrets.token_urlsafe(40)
    # Create SHA-256 hash for database storage
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    # Keep last 4 chars for debugging/audit
    token_suffix = raw_token[-4:]
    return raw_token, token_hash, token_suffix

def verify_token_hash(raw_token: str, stored_hash: str) -> bool:
    """Verify if raw token matches stored hash using constant-time comparison"""
    computed_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return hmac.compare_digest(computed_hash, stored_hash)