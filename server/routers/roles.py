from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["roles"])

class RoleBody(BaseModel):
    userId: str
    role: str
    roleScopes: Optional[Dict[str, Any]] = None
    defaultProjectId: Optional[str] = None

@router.get("/roles/users")
def list_users(projectId: Optional[str] = Query(None)):
    if projectId:
        rows = pg.query("""
           select u.id, u.email, u.role, u.role_scopes, u.default_project_id, u.org_type
           from users u
           join memberships m on m.user_id=u.id and m.project_id=%s
        """,(projectId,))
    else:
        rows = pg.query("""select id, email, role, role_scopes, default_project_id, org_type from users""",())
    return {"ok": True, "items": rows}

@router.post("/roles/set")
def set_role(body: RoleBody):
    exists = pg.one("select id from users where id=%s", (body.userId,))
    if not exists: raise HTTPException(404, "user not found")
    pg.exec("""update users set role=%s, role_scopes=%s::jsonb, default_project_id=%s where id=%s""",
            (body.role, pg.json(body.roleScopes or {}), body.defaultProjectId, body.userId))
    return {"ok": True}