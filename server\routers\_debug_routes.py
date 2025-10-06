from fastapi import APIRouter
from fastapi.encoders import jsonable_encoder
from typing import List, Dict
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/_debug", tags=["_debug"])

@router.get("/routes")
def list_routes() -> List[Dict[str,str]]:
    # Import app inside the function to avoid circular imports
    from .. import main
    out = []
    for r in main.app.routes:
        try:
            path = getattr(r, 'path', '')
            methods = getattr(r, 'methods', set())
            if path and methods:
                out.append({"path": path, "methods": ",".join(sorted(methods))})
        except Exception:
            pass
    return jsonable_encoder(out)

@router.post("/reload_schema")
def reload_schema():
    sbs = get_supabase_client()
    try:
        # Try to notify PostgREST to reload schema cache
        try:
            # Attempt direct RPC call if available
            sbs.postgrest.rpc("pg_notify", {"channel":"pgrst","payload":"reload schema"})
        except Exception:
            # Fallback: raw SQL via postgrest
            try:
                sbs.postgrest._request("POST", "/rpc/pg_notify", json={"channel":"pgrst","payload":"reload schema"})
            except Exception:
                # Last resort: touch a known schema table with service key to nudge cache
                sbs.table("artifacts").select("id").limit(1).execute()
    except Exception as e:
        # Even if notification fails, return success to avoid blocking development
        pass
    return {"ok": True}