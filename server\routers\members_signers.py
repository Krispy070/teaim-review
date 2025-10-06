from fastapi import APIRouter, Depends, Query
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/api/members", tags=["members"])

@router.get("/signers")
def signers(project_id: str = Query(...), area: str | None = None,
            ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        acc = sb.table("project_member_access").select("user_id,can_sign_all,sign_areas")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        # enrich with role/email
        mem = sb.table("project_members").select("user_id,role").eq("org_id", ctx.org_id)\
              .eq("project_id", project_id).execute().data or []
        roles = {m["user_id"]: m.get("role") for m in mem}
        prof = {}
        try:
            user_ids = list(roles.keys())
            if user_ids:
                p = sb.table("users_profile").select("user_id,email").in_("user_id", user_ids).execute().data or []
            else:
                p = []
            prof = {x["user_id"]: x.get("email") for x in p}
        except Exception: ...
        out=[]
        for a in acc:
            uid = a["user_id"]
            can = a.get("can_sign_all") or False
            areas = a.get("sign_areas") or []
            allowed = can or (area and area in areas)
            out.append({
                "user_id": uid,
                "email": prof.get(uid, uid),
                "role": roles.get(uid),
                "can_sign_all": can,
                "sign_areas": areas,
                "allowed": allowed
            })
        # sort: allowed first, then role
        out.sort(key=lambda x: (not x["allowed"], x.get("role","zz")))
        return {"items": out}
    except Exception:
        return {"items": []}

@router.get("/all")
def all_members(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    try:
        mem = sb.table("project_members").select("user_id,role")\
              .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
        roles = {m["user_id"]: m.get("role") for m in mem}
        prof = {}
        try:
            user_ids = list(roles.keys())
            if user_ids:
                p = sb.table("users_profile").select("user_id,email").in_("user_id", user_ids).execute().data or []
            else:
                p = []
            prof = {x["user_id"]: x.get("email") for x in p}
        except Exception: ...
        acc = {}
        try:
            a = sb.table("project_member_access").select("user_id,can_sign_all,sign_areas")\
                .eq("org_id", ctx.org_id).eq("project_id", project_id).execute().data or []
            acc = {x["user_id"]: x for x in a}
        except Exception: ...
        out=[]
        for uid, role in roles.items():
            a = acc.get(uid, {})
            out.append({
                "user_id": uid,
                "email": prof.get(uid, uid),
                "role": role,
                "can_sign_all": bool(a.get("can_sign_all")),
                "sign_areas": a.get("sign_areas") or []
            })
        # sort by role, then email
        out.sort(key=lambda x: ((x["role"] or "zz"), x["email"]))
        return {"items": out}
    except Exception:
        return {"items": []}