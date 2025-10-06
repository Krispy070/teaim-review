"""
RLS Self-Test router for verifying tenant isolation
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/admin/rls-selftest", tags=["admin"])
# Alias router with /api prefix for frontend consistency
router_api = APIRouter(prefix="/api/admin/rls-selftest", tags=["admin-api"])
ADMIN = require_role({"owner", "admin"})

def _rls_selftest_impl(
    project_id: str, 
    other_project_id: str, 
    ctx: TenantCtx
):
    """
    Test RLS tenant isolation by attempting to read from another project.
    PASS if no data is returned (no cross-tenant leak).
    """
    try:
        sb = get_user_supabase(ctx)
    except Exception as e:
        # Auth failures should be surfaced, not treated as PASS
        raise HTTPException(status_code=401, detail="User JWT required for user-scoped database operations")
    
    # Test multiple sensitive tables for comprehensive coverage
    tables_to_test = ["artifacts", "project_stages", "risks", "decisions"]
    test_details = {
        "org_id": ctx.org_id,
        "current_project": project_id,
        "test_project": other_project_id,
        "tables_tested": tables_to_test
    }
    
    try:
        # Test each sensitive table with per-table control tests
        leak_detected = False
        coverage_incomplete = False
        tables_with_errors = []
        
        for table in tables_to_test:
            # Per-table control test: verify we can read our own project for this table
            try:
                control_response = sb.table(table).select("id").eq("org_id", ctx.org_id).eq("project_id", project_id).limit(1).execute()
                test_details[f"control_{table}"] = "accessible" if control_response.data is not None else "no_data"
            except Exception as control_error:
                test_details[f"control_{table}"] = f"failed: {str(control_error)}"
                coverage_incomplete = True
                tables_with_errors.append(table)
                continue  # Skip leak test for this table
            
            # Cross-tenant leak test for this table
            try:
                res = sb.table(table).select("id").eq("org_id", ctx.org_id).eq("project_id", other_project_id).limit(5).execute().data or []
                if len(res) > 0:
                    leak_detected = True
                    test_details[f"leak_{table}"] = len(res)
                else:
                    test_details[f"tested_{table}"] = "zero_returned"
            except Exception as table_error:
                # Table-specific errors make test inconclusive
                test_details[f"error_{table}"] = str(table_error)
                coverage_incomplete = True
                tables_with_errors.append(table)
        
        # Mark as inconclusive if any tables had errors or couldn't be tested
        if coverage_incomplete:
            test_details["coverage_incomplete"] = True
            test_details["tables_with_errors"] = tables_with_errors
            return {
                "ok": False,
                "leak": None,  # inconclusive
                "tested_against": other_project_id,
                "error": f"Test inconclusive: Cannot fully test tables {tables_with_errors}",
                "test_details": test_details
            }
        
        return {
            "ok": not leak_detected,
            "leak": leak_detected,
            "tested_against": other_project_id,
            "test_details": test_details
        }
        
    except Exception as e:
        # Server errors should be inconclusive, not PASS
        return {
            "ok": False,
            "leak": None,  # inconclusive
            "tested_against": other_project_id,
            "error": f"Test inconclusive due to server error: {str(e)}",
            "test_details": test_details
        }

@router.get("/test")
def rls_selftest(
    project_id: str = Query(...), 
    other_project_id: str = Query(...), 
    ctx: TenantCtx = Depends(ADMIN)
):
    """Test RLS tenant isolation by attempting to read from another project."""
    return _rls_selftest_impl(project_id, other_project_id, ctx)

@router_api.get("/test")
def rls_selftest_api(
    project_id: str = Query(...), 
    other_project_id: str = Query(...), 
    ctx: TenantCtx = Depends(ADMIN)
):
    """Test RLS tenant isolation by attempting to read from another project."""
    return _rls_selftest_impl(project_id, other_project_id, ctx)