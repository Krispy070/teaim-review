from fastapi import APIRouter, Depends, Query, HTTPException
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase, get_supabase_client
from pydantic import BaseModel
from typing import Optional
import os, io, requests

router = APIRouter(prefix="/dev", tags=["dev"])
ADMIN_OR_OWNER = require_role({"owner","admin"})

SIMPLE_DOCS = [
  ("00_SOW_v1_ACME-HCM-001.txt", """Project: ACME-HCM-001 | Customer: Acme Health
Scope: Workday HCM, Payroll, Time, Financials
Workstreams: HCM; Payroll; Time; Financials; Integrations; Reporting; Cutover; Security; Data
Integrations: ADP_FundTransfer (SFTP 01:00 UTC); Okta_SSO (OIDC); BankOfNow PositivePay (SFTP hourly)
Milestones:
- Discovery: 2025-09-22 → 2025-10-10
- Build P1: 2025-10-13 → 2025-12-05
- Test: 2025-12-08 → 2026-01-16
- Cutover: 2026-01-30 → 2026-02-03
Decisions:
- Workday is source of truth for worker master.
Risks:
- High: Legacy HRIS data quality unknown.
Actions:
- Sam to obtain SFTP key requirements by 2025-09-26.
- Priya to profile HR data by 2025-09-24.
"""),
  ("01_Change_Order_1_ACME-HCM-001.txt", """Change Order CO-001 (2025-09-24)
Add ACA reporting; shift Cutover +1 week (to 2026-02-06 → 2026-02-10).
Decision: Include ACA reporting in Phase 1.
Action: Finance lead update baseline schedule by 2025-09-25.
Risk: Low — Reporting team bandwidth slip of 1 week.
"""),
  ("03_Kickoff_Transcript_2025-09-23.txt", """Dana: Goal is first payroll Feb 2026.
Kris: Lock scope, confirm milestones.
Sam: Need SFTP keys & test folder for BankOfNow.
Priya: Data profiling ~3 days after exports.
Summary:
Decision: Workday = source-of-truth for worker data (reaffirmed).
Risk (High): SFTP key process unclear at BankOfNow.
Action: Sam to send SFTP key fingerprint by 2025-09-24.
Action: Priya to request HR export by 2025-09-23 EOD.
Integration: BankOfNow PositivePay test path /bn/ppay/test/
"""),
  ("05_Discovery_Signoff_Package_ACME-HCM-001.txt", """Stages:
- Stage: Discovery | Start: 2025-09-22 | End: 2025-10-10
- Stage: Build P1 | Start: 2025-10-13 | End: 2025-12-05
- Stage: Test | Start: 2025-12-08 | End: 2026-01-16
- Stage: Cutover | Start: 2026-01-30 | End: 2026-02-03
Deliverables: Workstreams list, Integration inventory baseline, Data profiling report.
Decision: Discovery complete pending BankOfNow key confirmation.
"""),
]

def _auth_headers(ctx: TenantCtx):
    # Always use dev mode headers in development
    headers = {"X-Dev-User": ctx.user_id or "dev-user", "X-Dev-Org": ctx.org_id, "X-Dev-Role": ctx.role or "admin"}
    
    # Also set production auth as fallback
    token = os.getenv("INTERNAL_API_BEARER")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

@router.post("/seed-simple")
def seed_simple(project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    base = os.getenv("FASTAPI_URL", "http://127.0.0.1:5000")
    url = f"{base}/api/ingest-sync?project_id={project_id}"
    headers = _auth_headers(ctx)

    ok = 0; results = []
    for name, body in SIMPLE_DOCS:
        files = {"file": (name, body.encode("utf-8"), "text/plain")}
        r = requests.post(url, files=files, headers=headers, timeout=60)
        results.append({ "name": name, "status": r.status_code })
        if r.ok: ok += 1

    return {"ok": True, "count": ok, "results": results}

class SmokeBody(BaseModel):
    email_to: str

@router.post("/smoke-run")
def smoke_run(project_id: str = Query(...), body: Optional[SmokeBody] = None, ctx: TenantCtx = Depends(ADMIN_OR_OWNER)):
    """
    1) Ensure a 'Discovery' stage exists (create if missing)
    2) Request external signoff to provided email (or DIGEST_TEST_EMAIL)
    3) Return token link from signoff request (if guard allowed immediate send)
    """
    # Use service role client for admin operations
    sb = get_supabase_client()
    email = (body.email_to if body else None) or os.getenv("DIGEST_TEST_EMAIL")
    if not email:
        raise HTTPException(400, "Provide email_to or set DIGEST_TEST_EMAIL")

    # 1) ensure stage
    try:
        got = sb.table("project_stages").select("id,title").eq("org_id", ctx.org_id)\
            .eq("project_id", project_id).eq("title","Discovery").limit(1).execute().data
        if got:
            stage_id = got[0]["id"]
        else:
            # Create stage using service role client
            stage_data = {
                "org_id": ctx.org_id,
                "project_id": project_id,
                "title": "Discovery",
                "status": "pending"
            }
            try:
                result = sb.table("project_stages").insert(stage_data).execute()
                if result.data:
                    stage_id = result.data[0]["id"]
                else:
                    raise HTTPException(500, "Failed to create Discovery stage")
            except Exception as e:
                raise HTTPException(500, f"Failed to create stage: {e}")
    except Exception as e:
        # Database schema not ready - return mock response for development
        return {"ok": False, "error": "Database schema not ready", "details": str(e), "token_link": "mock://test-link"}

    # 2) request external sign-off using same pattern as signoff_external.py
    from ..routers.signoff_external import generate_secure_token
    from datetime import datetime, timezone, timedelta
    
    # Generate secure token (service role to bypass RLS for later token validation)
    raw_token, token_hash, token_suffix = generate_secure_token()
    
    try:
        sb.table("signoff_tokens").insert({
            "org_id": ctx.org_id, 
            "project_id": project_id, 
            "stage_id": stage_id,
            "email": email, 
            "token_hash": token_hash,
            "token_suffix": token_suffix,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        }).execute()
    except Exception as e:
        raise HTTPException(500, f"Failed to create signoff token: {str(e)}")

    app_url = os.getenv("APP_BASE_URL", "")
    link = f"{app_url}/signoff/{raw_token}"
    
    return {"ok": True, "stage_id": stage_id, "token_link": link, "email": email}