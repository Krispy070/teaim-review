from fastapi import APIRouter, Body
from .supabase_client import get_supabase_client

router = APIRouter()

@router.post("/timeline/set")
def set_timeline(org_id: str = Body(...), project_id: str = Body(...), rows: list[dict] = Body(...)):
    # store as mem_entries 'episodic' or a milestones table if you already have one
    for r in rows:
        body = f"{r.get('phase')}|{r.get('start')}|{r.get('end')}"
        try:
            sb = get_supabase_client()
            sb.table("mem_entries").insert({"org_id":org_id,"project_id":project_id,"type":"episodic","title":"timeline_phase","body":body}).execute()
        except Exception: pass
    return {"ok": True, "count": len(rows)}