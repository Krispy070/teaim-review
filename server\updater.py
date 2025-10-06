from .supabase_client import get_supabase_client
from .db import get_conn
import logging

CONFIDENCE_PUBLISH = 0.8
logger = logging.getLogger(__name__)

def queue_item(org_id, project_id, artifact_id, item_type, obj, conf):
    """Queue low-confidence item for review (using direct psycopg to bypass PostgREST)"""
    try:
        import json
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO extracted_items (org_id, project_id, artifact_id, item_type, payload, confidence, is_published)
                           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                       (org_id, project_id, artifact_id, item_type, json.dumps(obj), conf, False))
    except Exception as e:
        logger.error(f"Failed to queue item: {e}")

def publish_action(org_id, project_id, artifact_id, obj):
    """Publish high-confidence action to actions table"""
    try:
        sb = get_supabase_client()
        sb.table("actions").insert({
            "org_id": org_id, 
            "project_id": project_id,
            "title": obj.get("title"), 
            "owner": obj.get("owner_email"),  # Use owner column not owner_email
            "due_date": obj.get("due_date"), 
            "artifact_id": artifact_id,      # Use artifact_id not source_artifact
            "status": "open"
        }).execute()
    except Exception as e:
        # Fallback to psycopg if PostgREST fails
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""INSERT INTO actions (org_id, project_id, title, owner, due_date, artifact_id, status)
                               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                           (org_id, project_id, obj.get("title"), obj.get("owner_email"), 
                            obj.get("due_date"), artifact_id, "open"))
        except Exception as e2:
            logger.error(f"Failed to publish action via fallback: {e2}")

def publish_risk(org_id, project_id, artifact_id, obj):
    """Publish high-confidence risk to summaries table"""
    try:
        sb = get_supabase_client()
        sb.table("summaries").insert({
            "org_id": org_id, 
            "project_id": project_id, 
            "artifact_id": artifact_id,
            "level": "artifact", 
            "risks": [obj], 
            "summary": ""
        }).execute()
    except Exception as e:
        logger.error(f"Failed to publish risk: {e}")

def publish_decision(org_id, project_id, artifact_id, obj):
    """Publish high-confidence decision to summaries table"""
    try:
        sb = get_supabase_client()
        sb.table("summaries").insert({
            "org_id": org_id, 
            "project_id": project_id, 
            "artifact_id": artifact_id,
            "level": "artifact", 
            "decisions": [obj], 
            "summary": ""
        }).execute()
    except Exception as e:
        logger.error(f"Failed to publish decision: {e}")

def publish_integration(org_id, project_id, obj):
    """Publish high-confidence integration as semantic memory"""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""insert into mem_entries (org_id, project_id, type, title, body)
                           values (%s,%s,'semantic','integration',%s)""",
                        (org_id, project_id, f"{obj.get('name')} | {obj.get('transport')} | {obj.get('frequency')}"))
    except Exception as e:
        logger.error(f"Failed to publish integration: {e}")

def publish_workstream(org_id, project_id, obj, sort_idx):
    """Ensure workstream exists in workstreams table"""
    try:
        sb = get_supabase_client()
        sb.table("workstreams").insert({
            "org_id": org_id, 
            "project_id": project_id, 
            "name": obj.get("name", "")[:120],
            "description": obj.get("description", ""), 
            "sort_order": sort_idx, 
            "is_active": True
        }).execute()
    except Exception as e:
        # Workstream might already exist, which is fine
        logger.debug(f"Workstream insert failed (possibly duplicate): {e}")

def publish_reporting_request(org_id, project_id, obj):
    """Publish reporting request as semantic memory"""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""insert into mem_entries (org_id, project_id, type, title, body)
                           values (%s,%s,'semantic','reporting_request',%s)""",
                        (org_id, project_id, obj.get('text', '')[:4000]))
    except Exception as e:
        logger.error(f"Failed to publish reporting request: {e}")

def publish_logistics(org_id, project_id, obj):
    """Publish logistics info as episodic memory"""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cadence = obj.get('cadence', '')
            links = obj.get('links', [])
            body = f"Cadence: {cadence} | Links: {', '.join(links[:3])}"
            cur.execute("""insert into mem_entries (org_id, project_id, type, title, body)
                           values (%s,%s,'episodic','logistics',%s)""",
                        (org_id, project_id, body[:4000]))
    except Exception as e:
        logger.error(f"Failed to publish logistics: {e}")

def publish_metric(org_id, project_id, obj):
    """Publish metric as semantic memory"""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            body = f"{obj.get('name', '')}: {obj.get('value', '')}"
            cur.execute("""insert into mem_entries (org_id, project_id, type, title, body)
                           values (%s,%s,'semantic','metric',%s)""",
                        (org_id, project_id, body[:4000]))
    except Exception as e:
        logger.error(f"Failed to publish metric: {e}")

def apply_updates(org_id, project_id, artifact_id, project_code, updates: dict):
    """Apply classified updates to project dashboard with confidence-based publishing"""
    logger.info(f"Applying updates for {project_code}: {len(updates.get('actions', []))} actions, {len(updates.get('risks', []))} risks")
    
    # Store summary if provided
    if updates.get("summary"):
        try:
            sb = get_supabase_client()
            sb.table("summaries").insert({
                "org_id": org_id, 
                "project_id": project_id, 
                "artifact_id": artifact_id,
                "level": "artifact", 
                "summary": updates["summary"]
            }).execute()
        except Exception as e:
            logger.error(f"Failed to store summary: {e}")

    # Process workstreams
    for i, ws in enumerate(updates.get("workstreams", [])):
        if ws.get("confidence", 0) >= CONFIDENCE_PUBLISH:
            publish_workstream(org_id, project_id, ws, i)
        else:
            queue_item(org_id, project_id, artifact_id, "workstream", ws, ws.get("confidence", 0))

    # Process actions
    for a in updates.get("actions", []):
        if a.get("confidence", 0) >= CONFIDENCE_PUBLISH and a.get("title"):
            publish_action(org_id, project_id, artifact_id, a)
        else:
            queue_item(org_id, project_id, artifact_id, "action", a, a.get("confidence", 0))

    # Process risks
    for r in updates.get("risks", []):
        if r.get("confidence", 0) >= CONFIDENCE_PUBLISH:
            publish_risk(org_id, project_id, artifact_id, r)
        else:
            queue_item(org_id, project_id, artifact_id, "risk", r, r.get("confidence", 0))

    # Process decisions
    for d in updates.get("decisions", []):
        if d.get("confidence", 0) >= CONFIDENCE_PUBLISH:
            publish_decision(org_id, project_id, artifact_id, d)
        else:
            queue_item(org_id, project_id, artifact_id, "decision", d, d.get("confidence", 0))

    # Process integrations
    for ig in updates.get("integrations", []):
        if ig.get("confidence", 0) >= CONFIDENCE_PUBLISH:
            publish_integration(org_id, project_id, ig)
        else:
            queue_item(org_id, project_id, artifact_id, "integration", ig, ig.get("confidence", 0))

    # Process reporting requests
    for rr in updates.get("reporting_requests", []):
        if rr.get("confidence", 0) >= CONFIDENCE_PUBLISH:
            publish_reporting_request(org_id, project_id, rr)
        else:
            queue_item(org_id, project_id, artifact_id, "reporting", rr, rr.get("confidence", 0))

    # Process logistics
    logistics = updates.get("logistics", {})
    if logistics and logistics.get("confidence", 0) >= CONFIDENCE_PUBLISH:
        publish_logistics(org_id, project_id, logistics)
    elif logistics:
        queue_item(org_id, project_id, artifact_id, "logistics", logistics, logistics.get("confidence", 0))

    # Process metrics
    for m in updates.get("metrics", []):
        if m.get("confidence", 0) >= CONFIDENCE_PUBLISH:
            publish_metric(org_id, project_id, m)
        else:
            queue_item(org_id, project_id, artifact_id, "metrics", m, m.get("confidence", 0))