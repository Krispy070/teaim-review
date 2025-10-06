from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
import io, csv
from datetime import datetime, timedelta
from ..tenant import TenantCtx
from ..guards import require_role
from ..supabase_client import get_user_supabase

router = APIRouter(prefix="/wellness", tags=["wellness"])
ADMIN = require_role({"owner","admin","pm"})

@router.get("/export.csv")
def export_csv(project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN)):
    sb = get_user_supabase(ctx)
    try:
        rows = sb.table("team_wellness").select("created_at,user_id,score")\
               .eq("org_id", ctx.org_id).eq("project_id", project_id).order("created_at", desc=True).limit(500).execute().data or []
    except Exception:
        rows = []
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["created_at","user_id","score"])
    for r in rows: w.writerow([r.get("created_at"), r.get("user_id"), r.get("score")])
    buf.seek(0)
    return StreamingResponse(iter([buf.read()]), media_type="text/csv",
      headers={"Content-Disposition": 'attachment; filename="wellness.csv"'})

@router.get("/compare-both.csv")
def compare_both_csv(project_id: str = Query(...), ctx: TenantCtx = Depends(ADMIN)):
    """Export compare-both CSV with 7d and 30d wellness data side by side for comparison"""
    sb = get_user_supabase(ctx)
    
    # Calculate date ranges with proper RFC3339 UTC timestamps
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    
    try:
        # Get 7-day data
        rows_7d = sb.table("team_wellness").select("created_at,user_id,score")\
                   .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                   .gte("created_at", seven_days_ago.replace(microsecond=0).isoformat() + 'Z')\
                   .order("created_at", desc=True).execute().data or []
                   
        # Get 30-day data
        rows_30d = sb.table("team_wellness").select("created_at,user_id,score")\
                    .eq("org_id", ctx.org_id).eq("project_id", project_id)\
                    .gte("created_at", thirty_days_ago.replace(microsecond=0).isoformat() + 'Z')\
                    .order("created_at", desc=True).execute().data or []
    except Exception:
        rows_7d = []
        rows_30d = []
    
    # Aggregate data by user for comparison
    user_data_7d = {}
    user_data_30d = {}
    
    for row in rows_7d:
        user_id = row.get("user_id")
        score = row.get("score", 0)
        if user_id not in user_data_7d:
            user_data_7d[user_id] = {"scores": [], "avg": 0, "count": 0}
        user_data_7d[user_id]["scores"].append(score)
        user_data_7d[user_id]["count"] += 1
    
    for row in rows_30d:
        user_id = row.get("user_id") 
        score = row.get("score", 0)
        if user_id not in user_data_30d:
            user_data_30d[user_id] = {"scores": [], "avg": 0, "count": 0}
        user_data_30d[user_id]["scores"].append(score)
        user_data_30d[user_id]["count"] += 1
    
    # Calculate averages
    for user_id in user_data_7d:
        scores = user_data_7d[user_id]["scores"]
        user_data_7d[user_id]["avg"] = sum(scores) / len(scores) if scores else 0
    
    for user_id in user_data_30d:
        scores = user_data_30d[user_id]["scores"]
        user_data_30d[user_id]["avg"] = sum(scores) / len(scores) if scores else 0
    
    # Get all unique users from both periods
    all_users = set(user_data_7d.keys()) | set(user_data_30d.keys())
    
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow([
        "user_id", 
        "7d_avg_score", "7d_entry_count", 
        "30d_avg_score", "30d_entry_count",
        "score_trend", "activity_change"
    ])
    
    for user_id in sorted(all_users):
        avg_7d = user_data_7d.get(user_id, {}).get("avg", 0)
        count_7d = user_data_7d.get(user_id, {}).get("count", 0)
        avg_30d = user_data_30d.get(user_id, {}).get("avg", 0)
        count_30d = user_data_30d.get(user_id, {}).get("count", 0)
        
        # Calculate trend indicators
        score_trend = "improving" if avg_7d > avg_30d else ("declining" if avg_7d < avg_30d else "stable")
        
        # Activity change with tolerance band (±15% of expected weekly activity)
        expected_7d = count_30d * 0.25  # Expected 7d activity based on 30d average
        tolerance = expected_7d * 0.15  # 15% tolerance band
        
        if count_7d > (expected_7d + tolerance):
            activity_change = "more_active"
        elif count_7d < (expected_7d - tolerance):
            activity_change = "less_active"
        else:
            activity_change = "similar"
        
        w.writerow([
            user_id,
            round(avg_7d, 2), count_7d,
            round(avg_30d, 2), count_30d,
            score_trend, activity_change
        ])
    
    buf.seek(0)
    return StreamingResponse(iter([buf.read()]), media_type="text/csv",
      headers={"Content-Disposition": 'attachment; filename="wellness-compare-both.csv"'})