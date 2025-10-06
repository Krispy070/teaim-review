def get_user_context(request):
    # mirrored logic from tenant dev headers (keep in sync)
    headers = request.headers
    if headers.get("x-dev-user") and headers.get("x-dev-org") and (headers.get("x-dev-role")):
        return {"user_id": headers["x-dev-user"], "org_id": headers["x-dev-org"], "role": headers["x-dev-role"]}
    # For prod, tenant_ctx handles auth; at middleware stage we may not decode JWT—return minimal
    auth = headers.get("authorization","")
    return {"user_id": "jwt", "org_id": None, "role": None} if auth else {"user_id":"anon","org_id":None,"role":None}