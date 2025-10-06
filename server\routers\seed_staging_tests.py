# server/routers/seed_staging_tests.py
from fastapi import APIRouter, Depends, HTTPException
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase
import uuid
import hashlib

seed_tests_router = APIRouter(tags=["dev_seed"])
ADMIN_PLUS = require_role({"owner", "admin"})

def generate_dedupe_key(title: str, bp_code: str = "", area_key: str = "") -> str:
    """Generate consistent dedupe key for tests"""
    normalized = f"{title.lower().strip()}|{bp_code}|{area_key}"
    return hashlib.md5(normalized.encode()).hexdigest()[:32]

@seed_tests_router.post("/dev/seed/staging-tests")
def seed_staging_tests(
    project_id: str,
    ctx: TenantCtx = Depends(ADMIN_PLUS)
):
    """Add sample staging test data for demonstration"""
    sb = get_user_supabase(ctx)
    
    # Sample test candidates that would come from transcript extraction
    sample_tests = [
        {
            "title": "Employee should be able to update their personal information",
            "gherkin": """Given I am a logged-in employee
When I navigate to my profile page
Then I should see my current personal information
When I click the edit button
And I update my address and phone number
And I click save
Then I should see a success message
And my information should be updated""",
            "steps": [
                "Navigate to employee profile",
                "Click 'Edit Profile' button",
                "Update address field",
                "Update phone number field", 
                "Click 'Save Changes'",
                "Verify success message appears"
            ],
            "area_key": "HCM",
            "bp_code": "EMPLOYEE_PROFILE",
            "priority": "P1",
            "type": "happy",
            "tags": ["self-service", "profile", "employee"],
            "trace": [
                "User mentioned: 'employees should be able to update their own info'",
                "Requirements doc states: 'self-service profile management is critical'",
                "PM said: 'this is high priority for phase 1'"
            ],
            "confidence": 0.92
        },
        {
            "title": "System should prevent hiring an employee with missing background check",
            "gherkin": """Given I am a hiring manager
When I try to complete the hiring process for a candidate
And the background check is not completed
Then the system should show an error message
And prevent me from proceeding
And suggest next steps to complete the background check""",
            "steps": [
                "Open candidate record in hiring system",
                "Navigate to background check section",
                "Verify status shows 'Pending' or 'Not Started'",
                "Attempt to click 'Complete Hire' button",
                "Verify error message appears",
                "Verify hire process is blocked"
            ],
            "area_key": "HCM", 
            "bp_code": "HIRE_EMPLOYEE",
            "priority": "P0",
            "type": "negative",
            "tags": ["compliance", "background-check", "hiring"],
            "trace": [
                "Compliance team stressed: 'no exceptions on background checks'",
                "Legal said: 'this is a hard requirement, system must enforce it'",
                "Previous incident report mentioned this gap"
            ],
            "confidence": 0.89
        },
        {
            "title": "Finance user can generate monthly expense report by department",
            "gherkin": """Given I am a finance user with reporting permissions
When I navigate to the expense reports section
And I select 'Monthly Department Report'
And I choose the current month
And I select a specific department
Then I should see a detailed expense breakdown
And I should be able to export it to Excel
And the report should include budget variance analysis""",
            "steps": [
                "Login as finance user",
                "Go to Reports > Expense Reports",
                "Select 'Monthly Department Report'",
                "Choose month from dropdown",
                "Select department",
                "Click 'Generate Report'",
                "Verify report data appears",
                "Click 'Export to Excel'",
                "Verify budget variance section"
            ],
            "area_key": "FIN",
            "bp_code": "EXPENSE_REPORTING",
            "priority": "P2", 
            "type": "happy",
            "tags": ["reporting", "expenses", "finance"],
            "trace": [
                "CFO requested: 'we need better department visibility'",
                "Finance team said: 'monthly reports are essential'",
                "Budget meeting notes: 'variance analysis is key'"
            ],
            "confidence": 0.78
        },
        {
            "title": "Payroll should handle edge case of mid-month salary change",
            "gherkin": """Given an employee has a salary change effective mid-month
When the payroll process runs for that month
Then it should prorate the salary correctly
And split the payment between old and new rates
And generate appropriate tax calculations
And create audit trail of the change""",
            "steps": [
                "Create salary change effective mid-month",
                "Run payroll calculation for the month",
                "Verify prorated amounts are calculated",
                "Check that both salary rates are applied",
                "Verify tax calculations are accurate",
                "Review audit logs for change history"
            ],
            "area_key": "HCM",
            "bp_code": "PAYROLL_PROCESSING",
            "priority": "P1",
            "type": "edge",
            "tags": ["payroll", "salary-change", "proration"],
            "trace": [
                "Payroll team noted: 'mid-month changes are tricky'",
                "Previous implementation had bugs with this scenario",
                "Accounting needs accurate prorated amounts"
            ],
            "confidence": 0.65
        },
        {
            "title": "Purchase requisition workflow should route to correct approver",
            "gherkin": """Given I create a purchase requisition over $5000
When I submit the requisition
Then it should route to my direct manager first
And if approved, route to finance for budget approval
And if finance approves, route to procurement
And I should receive notifications at each step""",
            "steps": [
                "Create purchase requisition over $5000",
                "Fill in vendor details and justification", 
                "Submit requisition",
                "Verify manager receives approval notification",
                "Manager approves requisition",
                "Verify finance receives notification",
                "Finance approves budget",
                "Verify procurement receives final notification"
            ],
            "area_key": "FIN",
            "bp_code": "PURCHASE_REQUISITION",
            "priority": "P2",
            "type": "happy",
            "tags": ["workflow", "approvals", "procurement"],
            "trace": [
                "Procurement lead explained: 'approval routing is complex'",
                "Finance director specified: '$5000 threshold for finance review'",
                "Managers requested: 'clear notification process'"
            ],
            "confidence": 0.71
        }
    ]
    
    try:
        # Clear existing staging tests for this project to avoid duplicates
        sb.table("staging_tests").delete().eq("org_id", ctx.org_id).eq("project_id", project_id).execute()
        
        # Insert sample tests
        for test_data in sample_tests:
            dedupe_key = generate_dedupe_key(test_data["title"], test_data.get("bp_code", ""), test_data.get("area_key", ""))
            
            sb.table("staging_tests").insert({
                "id": str(uuid.uuid4()),
                "org_id": ctx.org_id,
                "project_id": project_id,
                "transcript_id": None,  # No actual transcript for seed data
                "dedupe_key": dedupe_key,
                "title": test_data["title"],
                "gherkin": test_data["gherkin"],
                "steps": test_data["steps"],
                "area_key": test_data.get("area_key"),
                "bp_code": test_data.get("bp_code"),
                "priority": test_data.get("priority", "P2"),
                "type": test_data.get("type", "happy"),
                "owner_hint": None,
                "tags": test_data.get("tags", []),
                "trace": test_data.get("trace", []),
                "confidence": test_data["confidence"]
            }).execute()
        
        return {
            "ok": True,
            "message": f"Created {len(sample_tests)} staging test candidates",
            "count": len(sample_tests)
        }
        
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to seed staging tests: {str(e)}")

@seed_tests_router.delete("/dev/seed/staging-tests")  
def clear_staging_tests(
    project_id: str,
    ctx: TenantCtx = Depends(ADMIN_PLUS)
):
    """Clear staging tests for development/testing"""
    sb = get_user_supabase(ctx)
    
    try:
        result = sb.table("staging_tests").delete().eq("org_id", ctx.org_id).eq("project_id", project_id).execute()
        
        return {
            "ok": True,
            "message": "Cleared all staging tests for project",
            "count": len(result.data) if result.data else 0
        }
        
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to clear staging tests: {str(e)}")