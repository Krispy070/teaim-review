from fastapi import APIRouter, Depends
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/admin", tags=["admin"])
ADMIN = require_role({"owner","admin"})

# Minimal set we depend on; expand as needed
REQUIRED = {
  "projects": ["id","code"],
  "artifacts": ["id","name","org_id","project_id","storage_bucket","storage_path","created_at"],
  "artifact_tags": ["org_id","project_id","artifact_id","tag_id"],
  "tags": ["id","org_id","name"],
  "project_stages": ["id","org_id","project_id","title","area","status","created_at"],
  "actions": ["id","org_id","project_id","title","owner","status","area","created_at","updated_at"],
  "risks": ["id","org_id","project_id","title","severity","owner","area","created_at","updated_at"],
  "decisions": ["id","org_id","project_id","title","decided_by","area","created_at","updated_at"],
  "summaries": ["artifact_id","org_id","project_id","actions","risks","decisions"],
  "pending_updates": ["id","org_id","project_id","change_type","operation","target_table","payload","status","confidence","created_at"],
  "share_links": ["token","org_id","project_id","artifact_id","expires_at"],
  "signoff_docs": ["id","org_id","project_id","name","status","signed_by","signed_name","signed_ip","signed_at","html","storage_bucket","storage_path"],
  "signoff_doc_tokens": ["token","org_id","project_id","doc_id","signer_email","expires_at","used_at"],
  "project_members": ["org_id","project_id","user_id","role"],
  "project_member_access": ["org_id","project_id","user_id","can_view_all","visibility_areas","can_sign_all","sign_areas"],
  "team_subscriptions": ["org_id","project_id","user_id","digest_weekly","digest_monthly","notify_actions","notify_risks","notify_decisions","notify_reminders"],
  "org_webhooks": ["org_id","enabled","slack_url","teams_url","generic_url"],
}

DDL_SNIPPETS = {
  "actions.area": "alter table public.actions add column if not exists area text;",
  "risks.area": "alter table public.risks add column if not exists area text;",
  "decisions.area": "alter table public.decisions add column if not exists area text;",
  "signoff_docs.signed_name": "alter table public.signoff_docs add column if not exists signed_name text;",
  "signoff_docs.signed_ip": "alter table public.signoff_docs add column if not exists signed_ip text;",
  "signoff_docs.signed_meta": "alter table public.signoff_docs add column if not exists signed_meta jsonb;",
}

@router.get("/schema_doctor")
def schema_doctor(ctx: TenantCtx = Depends(ADMIN)):
    sbs = get_supabase_client()
    missing: list[dict] = []
    suggestions: list[str] = []

    for table, cols in REQUIRED.items():
        try:
            info = sbs.postgrest._request("GET", f"/information_schema/columns", params={
              "select":"column_name,table_name", "table_schema":"eq.public", "table_name": f"eq.{table}"
            })
            have = {c["column_name"] for c in info.json()}
            if not have:
                missing.append({"table": table, "missing": "table"})
                continue
            lost = [c for c in cols if c not in have]
            if lost:
                missing.append({"table": table, "missing_columns": lost})
                for c in lost:
                    key = f"{table}.{c}"
                    if key in DDL_SNIPPETS: suggestions.append(DDL_SNIPPETS[key])
        except Exception:
            # If information_schema isn't exposed via PostgREST, provide generic advice
            missing.append({"table": table, "missing": "unknown"})

    return {"ok": len(missing)==0, "missing": missing, "suggested_sql": list(sorted(set(suggestions)))}