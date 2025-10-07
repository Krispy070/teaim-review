from .email_send import mg_send
from typing import Dict, Any, Optional

def send_metrics_request(
    to_email: str, 
    project_code: str, 
    first_name: str = "team"
) -> Dict[str, Any]:
    """Send metrics alignment request for PMO onboarding"""
    subject = f"Aligning success metrics for {project_code}"
    body = f"""Hi {first_name},

To keep {project_code} focused, please share your top 3 measures of success:

1) 
2) 
3) 

Reply to this email (we'll ingest it automatically), or use the secure link we'll send next.

— TEAIM PMO
"""
    return mg_send(to_email, subject, body)

def send_team_request(
    to_email: str, 
    project_code: str, 
    first_name: str = "team"
) -> Dict[str, Any]:
    """Send team roster request for PMO onboarding"""
    subject = f"Team roster setup for {project_code}"
    body = f"""Hi {first_name},

To ensure smooth communication for {project_code}, please provide:

Team Lead: 
Technical Lead: 
Business Lead: 
Additional stakeholders: 

Preferred meeting cadence (weekly/bi-weekly): 
Best meeting times: 

Reply to this email or we'll follow up with a secure form link.

— TEAIM PMO
"""
    return mg_send(to_email, subject, body)

def send_logistics_request(
    to_email: str, 
    project_code: str, 
    first_name: str = "team"
) -> Dict[str, Any]:
    """Send logistics setup request for PMO onboarding"""
    subject = f"Logistics & communication setup for {project_code}"
    body = f"""Hi {first_name},

Final setup items for {project_code}:

Preferred communication tools: 
Document repository: 
Meeting platform: 
Status update frequency: 

Weekly digest recipients: 
Escalation contacts: 

Reply to this email or use the secure link coming next.

— TEAIM PMO
"""
    return mg_send(to_email, subject, body)

def send_onboarding_reminder(
    to_email: str,
    project_code: str,
    step_name: str,
    first_name: str = "team",
    days_overdue: int = 2
) -> Dict[str, Any]:
    """Send gentle reminder for overdue onboarding step"""
    subject = f"Gentle reminder: {step_name} setup for {project_code}"
    body = f"""Hi {first_name},

Just a friendly reminder about the {step_name} setup for {project_code}.

No rush - we know you're busy! When you have a moment, please reply to the original email or let us know if you need any assistance.

Thanks!
— TEAIM PMO
"""
    return mg_send(to_email, subject, body)

def send_onboarding_complete(
    to_email: str,
    project_code: str,
    first_name: str = "team"
) -> Dict[str, Any]:
    """Send onboarding completion confirmation"""
    subject = f"Welcome to TEAIM! {project_code} is all set"
    body = f"""Hi {first_name},

Great news - {project_code} onboarding is complete! 

Your project dashboard is now live and we're ready to support your Workday implementation.

You'll receive weekly digests with:
• Action items and owners
• Risk monitoring
• Decision tracking
• Progress insights

Questions? Just reply to any of our emails.

Welcome aboard!
— TEAIM PMO
"""
    return mg_send(to_email, subject, body)

# Template mapping for programmatic access
ONBOARDING_TEMPLATES = {
    "metrics": send_metrics_request,
    "team": send_team_request,  
    "logistics": send_logistics_request,
    "reminder": send_onboarding_reminder,
    "complete": send_onboarding_complete
}

def send_onboarding_email(
    template_key: str,
    to_email: str,
    project_code: str,
    first_name: str = "team",
    **kwargs
) -> Dict[str, Any]:
    """Generic onboarding email sender"""
    if template_key not in ONBOARDING_TEMPLATES:
        raise ValueError(f"Unknown template: {template_key}. Available: {list(ONBOARDING_TEMPLATES.keys())}")
    
    template_func = ONBOARDING_TEMPLATES[template_key]
    return template_func(to_email, project_code, first_name, **kwargs)