import requests, json, os, logging
from ..supabase_client import get_supabase_client as get_service_supabase

log = logging.getLogger("events")

def _project_link(project_id: str | None, path: str) -> str | None:
    base = os.getenv("APP_BASE_URL","").rstrip("/")
    return f"{base}{path}" if project_id and base else None

def _post(url: str, payload: dict):
    try:
        requests.post(url, json=payload, timeout=6)
    except Exception as e:
        log.warning(f"[webhook] post failed: {e}")

def _slack_blocks(title: str, fields: list[tuple[str,str]], details: dict):
    def fld(label, val): return {"type":"mrkdwn","text":f"*{label}:* {val}"}
    block_fields = [fld(k,v) for k,v in fields]
    blocks = [
        {"type":"header","text":{"type":"plain_text","text":title,"emoji":True}},
        {"type":"section","fields": block_fields[:10]}
    ]
    if details:
        blocks.append({"type":"section","text":{"type":"mrkdwn","text":f"```{json.dumps(details, indent=2, ensure_ascii=False)}```"}})
    return blocks

def _teams_card(title: str, facts: list[tuple[str,str]], details: dict):
    card = {
        "@type":"MessageCard","@context":"https://schema.org/extensions",
        "summary":title,"themeColor":"0078D4",
        "sections":[{"activityTitle":title,"facts":[{"name":k,"value":v} for k,v in facts[:10]]}]
    }
    if details:
        card["sections"][0]["text"] = f"<pre>{json.dumps(details, indent=2)}</pre>"
    return card

def emit_event(org_id: str, project_id: str | None, kind: str, details: dict):
    sbs = get_service_supabase()
    try:
        r = sbs.table("org_webhooks").select("*").eq("org_id", org_id).single().execute()
        cfg = r.data
    except Exception:
        cfg = None
    if not cfg or not cfg.get("enabled"): return

    # Per-event titles & fields  
    link = None
    title = f"TEAIM: {kind}{(' • '+project_id) if project_id else ''}"
    fields: list[tuple[str,str]] = []
    
    if kind == "review.applied":
        table = details.get("table") or details.get("target_table")
        tid = details.get("target_id") or details.get("update_id") or "—"
        title = f"TEAIM: Review Applied • {table} {tid}"
        link = _project_link(project_id, f"/projects/{project_id}/updates/review")
        # show most relevant fields for table
        if table == "actions":
            fields = [("Title", details.get("title") or "—"),
                      ("Owner", details.get("owner") or "—"),
                      ("Status", details.get("status") or "—"),
                      ("Area", details.get("area") or "—")]
        elif table == "risks":
            fields = [("Title", details.get("title") or "—"),
                      ("Severity", details.get("severity") or "—"),
                      ("Owner", details.get("owner") or "—"),
                      ("Area", details.get("area") or "—")]
        elif table == "decisions":
            fields = [("Title", details.get("title") or "—"),
                      ("Decided By", details.get("decided_by") or "—"),
                      ("Area", details.get("area") or "—")]
        else:
            fields = [("Target", tid)]
    elif kind == "signoff.doc.signed":
        title = f"TEAIM: Document Signed • {details.get('doc_id')}"
        link = _project_link(project_id, f"/projects/{project_id}/signoff/docs")
        fields = [("Doc", details.get("doc_id") or "—"),
                  ("Signer", details.get("email") or "—"),
                  ("Name", details.get("name") or "—")]
    elif kind == "signoff_doc.signed_external":
        doc_id = details.get('doc_id') or ''
        signer = details.get('signed_name') or details.get('signer_email') or details.get('email') or details.get('name') or 'external signer'
        title = f"TEAIM: External Signature • {doc_id}"
        fields = [("Document", doc_id), ("Signer", signer)]
    elif kind == "classifier.ingest":
        operation = details.get('operation') or 'processed'
        target_table = details.get('target_table') or 'data'
        confidence = details.get('confidence', 0)
        title = f"TEAIM: AI Analysis • {operation} {target_table}"
        fields = [("Operation", operation), ("Table", target_table), ("Confidence", f"{confidence:.1%}")]
    elif kind == "stage.created":
        stage_name = details.get('stage_name') or details.get('title') or 'stage'
        creator = details.get('created_by') or 'system'
        title = f"TEAIM: Stage Created • {stage_name}"
        fields = [("Stage", stage_name), ("Created By", creator)]
    elif kind == "stage.updated":
        stage_name = details.get('stage_name') or details.get('title') or 'stage'
        updater = details.get('updated_by') or 'system'
        title = f"TEAIM: Stage Updated • {stage_name}"
        fields = [("Stage", stage_name), ("Updated By", updater)]
    elif kind == "document.uploaded":
        filename = details.get('filename') or details.get('name') or 'document'
        uploader = details.get('uploaded_by') or 'user'
        title = f"TEAIM: Document Uploaded • {filename}"
        fields = [("Document", filename), ("Uploaded By", uploader)]
    elif kind == "member.invited":
        email = details.get('email') or 'user'
        role = details.get('role') or 'member'
        inviter = details.get('invited_by') or 'admin'
        title = f"TEAIM: Member Invited • {email}"
        fields = [("Email", email), ("Role", role), ("Invited By", inviter)]
    elif kind == "member.joined":
        email = details.get('email') or details.get('user_email') or 'user'
        role = details.get('role') or 'member'
        title = f"TEAIM: Member Joined • {email}"
        fields = [("Email", email), ("Role", role)]
    elif kind == "notification.created":
        notification_title = details.get('title') or 'notification'
        recipient = details.get('recipient') or details.get('user_id') or 'user'
        title = f"TEAIM: Notification • {notification_title}"
        fields = [("Title", notification_title), ("Recipient", recipient)]
    elif kind == "export.dataroom":
        exported_by = details.get('exported_by') or 'user'
        file_count = details.get('file_count') or 'multiple'
        title = f"TEAIM: Data Room Export • {file_count} files"
        fields = [("Files", str(file_count)), ("Exported By", exported_by)]
    elif kind == "reminder.sent":
        aid = details.get("action_id")
        title = f"TEAIM: Reminder Sent • action {aid}"
        link = _project_link(project_id, f"/projects/{project_id}/actions/kanban")
        fields = [("Action", details.get("action_id") or "—")]
    else:
        # Fallback with basic project info
        clean_kind = kind.replace('.', ' ').replace('_', ' ').title()
        title = f"TEAIM: {clean_kind}"
        fields = [("Event Type", clean_kind)]
        if project_id:
            fields.append(("Project", project_id))
    
    # Add org fallback if no fields set
    if not fields:
        fields = [("Organization", org_id[:8] + "..."), ("Event", kind)]
    payload = {"org_id": org_id, "project_id": project_id, "kind": kind, "details": details}

    # Slack blocks with a link button if available
    if cfg.get("slack_url"):
        blocks = _slack_blocks(title, fields, details)
        if link:
            blocks.append({
              "type":"actions",
              "elements":[{"type":"button","text":{"type":"plain_text","text":"Open in TEAIM"}, "url": link}]
            })
        _post(cfg["slack_url"], {"blocks": blocks})
    # Teams
    if cfg.get("teams_url"):
        facts = fields
        card = _teams_card(title, facts, details)
        if link:
            card.setdefault("potentialAction",[]).append({"@type":"OpenUri","name":"Open in TEAIM","targets":[{"os":"default","uri":link}]})
        _post(cfg["teams_url"], card)
    # Generic
    if cfg.get("generic_url"):
        payload = {"org_id": org_id, "project_id": project_id, "kind": kind, "details": details, "url": link}
        _post(cfg["generic_url"], payload)