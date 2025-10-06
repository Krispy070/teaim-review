# server/routers/dev_seed_tests.py
from fastapi import APIRouter, Query, HTTPException, Depends
from typing import List, Dict, Any
from datetime import datetime, timezone
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
import uuid
import hashlib

dev_seed_tests_router = APIRouter(tags=["dev_seed_tests"])
ADMIN_PLUS = require_role({"owner", "admin"})

def generate_dedupe_key(title: str, bp_code: str = "", area_key: str = "") -> str:
    """Generate consistent dedupe key for tests"""
    normalized = f"{title.lower().strip()}|{bp_code or ''}|{area_key or ''}"
    return hashlib.md5(normalized.encode()).hexdigest()[:32]

# Sample test candidates that might be extracted from meeting transcripts
SAMPLE_TEST_CANDIDATES = [
    {
        "title": "Verify employee can be hired with all required fields",
        "gherkin": """Feature: Employee Hiring Process

Background:
  Given I am an authenticated HR user in the tenant

Scenario: Happy Path - Complete Employee Hiring
  Given I navigate to the hiring workflow
  When I enter all required employee information
    | field | value |
    | first_name | John |
    | last_name | Doe |
    | email | john.doe@company.com |
    | department | Engineering |
    | start_date | 2024-01-15 |
  And I submit the hiring request
  Then the employee should be successfully created
  And the employee should appear in the directory
  And a welcome email should be sent""",
        "steps": [
            "Navigate to HR -> Hire Employee",
            "Fill in employee basic information",
            "Select department and role",
            "Set start date",
            "Submit the form",
            "Verify success message",
            "Check employee appears in directory"
        ],
        "area_key": "HCM",
        "bp_code": "HIRE_EMPLOYEE",
        "priority": "P1",
        "type": "happy",
        "tags": ["hiring", "core-workflow", "hr"],
        "trace": [
            "We need to make sure the hiring process works end-to-end",
            "The form should validate all required fields before submission",
            "After hiring, the employee should immediately appear in searches"
        ],
        "confidence": 0.95,
        "owner_hint": "HR Team Lead"
    },
    {
        "title": "Handle missing required fields during employee hire",
        "gherkin": """Feature: Employee Hiring Validation

Scenario: Negative - Missing Required Fields
  Given I am on the hire employee page
  When I submit the form with missing required fields
  Then I should see validation errors
  And the form should not be submitted
  And I should be able to correct the errors""",
        "steps": [
            "Navigate to hire employee form",
            "Leave required fields empty",
            "Click submit",
            "Verify validation messages appear",
            "Fill in missing fields",
            "Verify form can be submitted successfully"
        ],
        "area_key": "HCM", 
        "bp_code": "HIRE_EMPLOYEE",
        "priority": "P2",
        "type": "negative",
        "tags": ["validation", "hiring", "error-handling"],
        "trace": [
            "What happens if someone forgets to fill in the required fields?",
            "The system should clearly show what's missing",
            "We've had issues before where the error messages weren't clear"
        ],
        "confidence": 0.87,
        "owner_hint": "QA Engineer"
    },
    {
        "title": "Verify payroll setup for newly hired employee",
        "gherkin": """Feature: Payroll Integration

Scenario: Happy Path - New Employee Payroll Setup  
  Given an employee has been successfully hired
  When I navigate to payroll setup
  And I configure their compensation details
  Then the payroll information should be saved
  And it should integrate with the payroll system""",
        "steps": [
            "Complete employee hiring first",
            "Go to payroll configuration",
            "Set base salary",
            "Configure benefits",
            "Save payroll setup",
            "Verify integration with payroll provider"
        ],
        "area_key": "FIN",
        "bp_code": "SETUP_PAYROLL", 
        "priority": "P1",
        "type": "happy",
        "tags": ["payroll", "integration", "compensation"],
        "trace": [
            "Once we hire someone, we need to get their payroll set up immediately",
            "The payroll system integration has been problematic in the past",
            "We should test the full flow from hiring to first paycheck"
        ],
        "confidence": 0.92,
        "owner_hint": "Finance Team"
    },
    {
        "title": "Test manager approval workflow for hiring requests",
        "gherkin": """Feature: Manager Approval Process

Scenario: Happy Path - Manager Approval Required
  Given a hiring request has been submitted
  And manager approval is required
  When the manager reviews the request
  And approves the hiring
  Then the employee should be processed
  And notifications should be sent to relevant parties""",
        "steps": [
            "Submit hiring request requiring approval",
            "Login as manager",
            "Review pending approvals",
            "Approve the hiring request",
            "Verify employee is processed",
            "Check approval notifications sent"
        ],
        "area_key": "HCM",
        "bp_code": "APPROVE_HIRING",
        "priority": "P2", 
        "type": "happy",
        "tags": ["approval", "workflow", "notifications"],
        "trace": [
            "Some positions require manager approval before hiring",
            "The approval workflow needs to be seamless",
            "Managers should get clear notifications about pending requests"
        ],
        "confidence": 0.84,
        "owner_hint": "Workflow Admin"
    },
    {
        "title": "Handle duplicate employee creation attempt",
        "gherkin": """Feature: Duplicate Employee Prevention

Scenario: Edge Case - Duplicate Employee Email
  Given an employee already exists with email 'john@company.com'
  When I try to hire another employee with the same email
  Then I should see a duplicate email error
  And the system should suggest checking existing employees""",
        "steps": [
            "Create an employee with a specific email",
            "Try to create another employee with same email", 
            "Verify duplicate error message",
            "Check that existing employee link is provided",
            "Verify no duplicate employee was created"
        ],
        "area_key": "HCM",
        "bp_code": "HIRE_EMPLOYEE",
        "priority": "P2",
        "type": "edge",
        "tags": ["validation", "duplicates", "data-integrity"],
        "trace": [
            "What if someone tries to hire the same person twice?",
            "We need good duplicate detection on email addresses",
            "The error message should be helpful, not just technical"
        ],
        "confidence": 0.79,
        "owner_hint": "Data Quality Team"
    },
    {
        "title": "Test performance with large employee directory search",
        "gherkin": """Feature: Employee Directory Performance

Scenario: Regression - Large Directory Search Performance
  Given there are over 10,000 employees in the system
  When I search for employees by various criteria
  Then search results should return within 3 seconds
  And results should be accurate and paginated""",
        "steps": [
            "Ensure large employee dataset exists",
            "Perform various search queries",
            "Measure response times",
            "Verify search accuracy",
            "Test pagination functionality",
            "Check search with special characters"
        ],
        "area_key": "HCM",
        "bp_code": "SEARCH_EMPLOYEES",
        "priority": "P3",
        "type": "regression", 
        "tags": ["performance", "search", "scalability"],
        "trace": [
            "As our company grows, directory searches are getting slower",
            "We need to make sure searches stay fast even with lots of employees",
            "Pagination becomes important with large result sets"
        ],
        "confidence": 0.71,
        "owner_hint": "Performance Team"
    }
]

@dev_seed_tests_router.post("/dev/seed-tests")
def seed_test_data(
    projectId: str = Query(..., description="Project UUID"),
    transcriptId: str = Query(None, description="Optional transcript ID to associate tests with"),
    ctx: TenantCtx = Depends(ADMIN_PLUS)
):
    """Seed staging test data for development/demo purposes"""
    sb = get_user_supabase(ctx)
    
    try:
        created_tests = []
        
        # Use provided transcript ID or generate a sample one
        sample_transcript_id = transcriptId or str(uuid.uuid4())
        
        for test_data in SAMPLE_TEST_CANDIDATES:
            # Generate unique ID and dedupe key
            test_id = str(uuid.uuid4())
            dedupe_key = generate_dedupe_key(
                test_data["title"], 
                test_data.get("bp_code", ""), 
                test_data.get("area_key", "")
            )
            
            # Insert staging test
            result = sb.table("staging_tests").insert({
                "id": test_id,
                "org_id": ctx.org_id,
                "project_id": projectId,
                "transcript_id": sample_transcript_id,
                "dedupe_key": dedupe_key,
                "title": test_data["title"],
                "gherkin": test_data["gherkin"],
                "steps": test_data["steps"],
                "area_key": test_data.get("area_key"),
                "bp_code": test_data.get("bp_code"),
                "priority": test_data["priority"],
                "type": test_data["type"],
                "owner_hint": test_data.get("owner_hint"),
                "tags": test_data["tags"],
                "trace": test_data["trace"],
                "confidence": test_data["confidence"]
            }).execute()
            
            if result.data:
                created_tests.append({
                    "id": test_id,
                    "title": test_data["title"],
                    "confidence": test_data["confidence"],
                    "type": test_data["type"]
                })
        
        return {
            "ok": True,
            "message": f"Successfully created {len(created_tests)} test candidates",
            "tests": created_tests,
            "transcriptId": sample_transcript_id
        }
        
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to seed test data: {str(e)}")

@dev_seed_tests_router.delete("/dev/clear-tests") 
def clear_test_data(
    projectId: str = Query(..., description="Project UUID"),
    ctx: TenantCtx = Depends(ADMIN_PLUS)
):
    """Clear all staging test data for a project"""
    sb = get_user_supabase(ctx)
    
    try:
        # Clear staging tests
        staging_result = sb.table("staging_tests").delete().eq(
            "org_id", ctx.org_id
        ).eq("project_id", projectId).execute()
        
        # Clear tests library  
        library_result = sb.table("tests_library").delete().eq(
            "org_id", ctx.org_id  
        ).eq("project_id", projectId).execute()
        
        # Clear tests history
        history_result = sb.table("tests_history").delete().eq(
            "org_id", ctx.org_id
        ).eq("project_id", projectId).execute()
        
        staging_count = len(staging_result.data) if staging_result.data else 0
        library_count = len(library_result.data) if library_result.data else 0
        history_count = len(history_result.data) if history_result.data else 0
        
        return {
            "ok": True,
            "message": "Test data cleared successfully",
            "deleted": {
                "staging": staging_count,
                "library": library_count, 
                "history": history_count
            }
        }
        
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to clear test data: {str(e)}")