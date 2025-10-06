from fastapi import APIRouter, Body, Query
from .supabase_client import get_supabase_client
from .db import get_conn
from .updater import publish_action, publish_risk, publish_decision, publish_integration, publish_workstream

router = APIRouter()

@router.get("/review/pending")
def pending(org_id: str, project_id: str, limit: int = 50):
    """Get pending items in review queue (confidence < 0.8) - using direct psycopg"""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id, org_id, project_id, artifact_id, item_type, payload, confidence, is_published, created_at
                           FROM extracted_items 
                           WHERE org_id = %s AND project_id = %s AND is_published = false
                           ORDER BY created_at DESC LIMIT %s""",
                       (org_id, project_id, limit))
            rows = []
            for row in cur.fetchall():
                rows.append({
                    "id": row[0], "org_id": row[1], "project_id": row[2], "artifact_id": row[3],
                    "item_type": row[4], "payload": row[5], "confidence": float(row[6]) if row[6] else 0,
                    "is_published": row[7], "created_at": row[8].isoformat() if row[8] else None
                })
            return {"items": rows}
    except Exception as e:
        return {"items": [], "error": str(e)}

@router.post("/review/approve")
def approve(org_id: str = Body(...), project_id: str = Body(...),
            id: int = Body(...), publish: bool = Body(True), edit_payload: dict = Body(None)):
    """Approve or discard a review queue item - using direct psycopg"""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            # Get the item
            cur.execute("SELECT * FROM extracted_items WHERE id = %s", (id,))
            row = cur.fetchone()
            if not row:
                return {"ok": False, "error": "not found"}
            
            item_type = row[4]  # item_type column
            payload = row[5]    # payload column  
            artifact_id = row[3]  # artifact_id column
            
            obj = edit_payload or payload
            
            if publish:
                # Publish the item to the appropriate table
                if item_type == "action": 
                    publish_action(org_id, project_id, artifact_id, obj)
                elif item_type == "risk": 
                    publish_risk(org_id, project_id, artifact_id, obj)
                elif item_type == "decision": 
                    publish_decision(org_id, project_id, artifact_id, obj)
                elif item_type == "integration": 
                    publish_integration(org_id, project_id, obj)
                elif item_type == "workstream": 
                    publish_workstream(org_id, project_id, obj, 99)
                # Add other types as needed
                
                # Mark as published
                cur.execute("UPDATE extracted_items SET is_published = true WHERE id = %s", (id,))
                
                # Emit webhook event for review applied
                try:
                    from .utils.events import emit_event
                    emit_event(
                        org_id=org_id,
                        project_id=project_id,
                        kind="review.applied",
                        details={
                            "item_type": item_type,
                            "artifact_id": artifact_id,
                            "published": True,
                            "review_id": id
                        }
                    )
                except Exception as e:
                    # Don't fail review process if webhook fails
                    print(f"Failed to emit review.applied event: {e}")
                
                # Create notification for review applied
                try:
                    from .supabase_client import get_supabase_client
                    sbs = get_supabase_client()
                    sbs.table("notifications").insert({
                        "org_id": org_id, 
                        "project_id": project_id,
                        "kind": "review.applied", 
                        "title": f"Update applied: {item_type}",
                        "body": {"update_id": id, "target": obj.get("title", item_type)},
                        "link": f"/projects/{project_id}/updates/review"
                    }).execute()
                except Exception as e:
                    # Don't fail review process if notification fails
                    print(f"Failed to create notification for review.applied: {e}")
                
                return {"ok": True, "published": item_type}
            else:
                # Discard the item
                cur.execute("DELETE FROM extracted_items WHERE id = %s", (id,))
                return {"ok": True, "discarded": item_type}
    except Exception as e:
        return {"ok": False, "error": str(e)}