from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/documents", tags=["documents"])

@router.get("/list")
def list_docs(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    # Query the docs table from the local database
    try:
        sb = get_user_supabase(ctx)
        rows = sb.table("docs").select("id,name,filename,created_at")\
                .eq("project_id", project_id)\
                .order("created_at", desc=True).limit(500).execute().data or []
        
        # Transform to match expected format
        items = []
        for row in rows:
            items.append({
                "id": row["id"],
                "title": row.get("name") or row.get("filename", "Untitled"),
                "created_at": row["created_at"],
                "source": "document_upload"
            })
        return {"items": items}
    except Exception as e:
        print(f"Error fetching docs: {e}")
        return {"items": []}