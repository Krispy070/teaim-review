import time
from collections import defaultdict, deque
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from .supabase_client import get_supabase_client

def get_user_context(request):
    """Get user context from request headers - mirrors tenant dev header logic"""
    headers = request.headers
    if headers.get("x-dev-user") and headers.get("x-dev-org") and (headers.get("x-dev-role")):
        return {"user_id": headers["x-dev-user"], "org_id": headers["x-dev-org"], "role": headers["x-dev-role"]}
    # For prod, tenant_ctx handles auth; at middleware stage we may not decode JWT—return minimal
    auth = headers.get("authorization","")
    return {"user_id": "jwt", "org_id": None, "role": None} if auth else {"user_id":"anon","org_id":None,"role":None}

# Simple per-user+route sliding window (in-memory, dev-friendly)
WINDOW_SEC = int(float(__import__("os").getenv("RATE_LIMIT_WINDOW_SEC", "60")))
MAX_REQ = int(float(__import__("os").getenv("RATE_LIMIT_MAX", "120")))

_buckets: dict[tuple[str,str], deque] = defaultdict(deque)

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/"):  # only API
            return await call_next(request)

        now = time.time()
        user = get_user_context(request)  # reads Bearer or X-Dev-* if dev
        key = (user.get("user_id","anon"), path)

        q = _buckets[key]
        while q and now - q[0] > WINDOW_SEC:
            q.popleft()
        if len(q) >= MAX_REQ:
            # Telemetry (service key; non-blocking)
            try:
                sb = get_supabase_client()
                sb.table("telemetry_events").insert({
                    "org_id": user.get("org_id"),
                    "project_id": None,
                    "user_id": user.get("user_id"),
                    "kind": "rate_limited",
                    "path": path,
                    "meta": {"window": WINDOW_SEC, "max": MAX_REQ}
                }).execute()
            except Exception:
                pass
            return Response("Too Many Requests", status_code=429,
                            headers={
                                "Retry-After": str(WINDOW_SEC),
                                "X-RateLimit-Limit": str(MAX_REQ),
                                "X-RateLimit-Window": str(WINDOW_SEC)
                            })
        q.append(now)

        try:
            resp = await call_next(request)
        except Exception as e:
            # Telemetry for 5xx
            try:
                sb = get_supabase_client()
                sb.table("telemetry_events").insert({
                    "org_id": user.get("org_id"),
                    "project_id": None,
                    "user_id": user.get("user_id"),
                    "kind": "server_error",
                    "path": path,
                    "meta": {"error": str(e)}
                }).execute()
            except Exception:
                pass
            raise
        return resp