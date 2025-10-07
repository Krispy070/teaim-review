from fastapi import APIRouter, Depends, Query
from datetime import datetime, date
from typing import Optional

from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase

router = APIRouter()

@router.get("/metrics")
def reports_metrics(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    """Get reports metrics for the Reporting page"""
    # For now, return basic placeholder metrics since reports functionality isn't fully implemented
    # This prevents 404 errors and allows the reporting page to load
    try:
        # TODO: Implement proper reports metrics when reports functionality is added
        return {
            "summary": {
                "total": 0,
                "active": 0,
                "pending": 0,
                "overdue": 0
            },
            "upcoming": []
        }
    except Exception:
        # Dev-safe fallback
        return {
            "summary": {
                "total": 0,
                "active": 0,
                "pending": 0,
                "overdue": 0
            },
            "upcoming": []
        }