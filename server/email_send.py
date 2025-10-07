import os
import requests
from typing import Optional, Dict, Any

MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN")  # sandbox or your custom domain
MAILGUN_BASE = os.getenv("MAILGUN_BASE_URL", "https://api.mailgun.net")

def mg_send(
    to_email: str, 
    subject: str, 
    text: str, 
    from_name: str = "TEAIM PMO",
    html: Optional[str] = None,
    attachments: Optional[list] = None
) -> Dict[str, Any]:
    """
    Send email via Mailgun API
    
    Args:
        to_email: Recipient email address
        subject: Email subject line
        text: Plain text email body
        from_name: Sender display name (default: "TEAIM PMO")
        html: Optional HTML email body
        attachments: Optional list of file attachments
    
    Returns:
        Mailgun API response JSON
    
    Raises:
        RuntimeError: If Mailgun credentials are not configured
        requests.HTTPError: If Mailgun API returns an error
    """
    if not all([MAILGUN_API_KEY, MAILGUN_DOMAIN]):
        raise RuntimeError("Mailgun credentials not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables.")
    
    url = f"{MAILGUN_BASE}/v3/{MAILGUN_DOMAIN}/messages"
    
    data = {
        "from": f"{from_name} <postmaster@{MAILGUN_DOMAIN}>",
        "to": to_email,
        "subject": subject,
        "text": text,
    }
    
    if html:
        data["html"] = html
    
    files = []
    if attachments:
        for i, attachment in enumerate(attachments):
            files.append(("attachment", (attachment["filename"], attachment["data"], attachment.get("content_type", "application/octet-stream"))))
    
    try:
        response = requests.post(
            url, 
            auth=("api", MAILGUN_API_KEY), 
            data=data, 
            files=files if files else None,
            timeout=20
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Failed to send email via Mailgun: {str(e)}")

def get_mailgun_status() -> Dict[str, Any]:
    """Check Mailgun configuration status"""
    return {
        "configured": bool(MAILGUN_API_KEY and MAILGUN_DOMAIN),
        "api_key_set": bool(MAILGUN_API_KEY),
        "domain_set": bool(MAILGUN_DOMAIN),
        "base_url": MAILGUN_BASE,
        "domain": MAILGUN_DOMAIN if MAILGUN_DOMAIN else "Not configured"
    }