"""
Wellness Trend CSV Export Router

Provides CSV export functionality for wellness trend data, delivering daily counts
and statistics for administrative reporting and analysis.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from datetime import datetime, timedelta
from typing import Optional
import io
import csv
from ..supabase_client import get_user_supabase
from ..tenant import TenantCtx
from ..guards import require_role

router = APIRouter(prefix="/wellness", tags=["wellness"])
ADMIN = require_role({"owner", "admin", "pm"})

@router.get("/trend.csv")
async def export_wellness_trend_csv(
    project_id: str = Query(..., description="Project ID"),
    days: int = Query(30, description="Number of days to include in trend data", ge=1, le=365),
    ctx: TenantCtx = Depends(ADMIN)
):
    """
    Export wellness trend data as CSV for administrative reporting.
    
    Returns CSV with daily wellness statistics including:
    - Date
    - Wellness score average
    - Number of responses
    - Project metadata
    """
    
    try:
        # Calculate date range for trend data (exactly N days, ending today)
        today = datetime.utcnow().date()
        start_date = today - timedelta(days=days-1)
        
        # Query wellness data from the database
        # Note: In development, tables may not exist, so we handle gracefully
        supabase = get_user_supabase(ctx)
        try:
            # Create RFC3339 UTC timestamps with 'Z' suffix for Supabase
            start_timestamp = datetime.combine(start_date, datetime.min.time()).replace(microsecond=0).isoformat() + 'Z'
            end_timestamp = datetime.combine(today, datetime.max.time()).replace(microsecond=0).isoformat() + 'Z'
            
            wellness_query = supabase.table("team_wellness").select(
                "created_at, score"
            ).eq("org_id", ctx.org_id).eq("project_id", project_id).gte(
                "created_at", start_timestamp
            ).lte("created_at", end_timestamp).order("created_at", desc=False)
            
            wellness_result = wellness_query.execute()
            wellness_data = wellness_result.data if wellness_result.data else []
            
        except Exception as e:
            print(f"Wellness data query failed (dev environment): {e}")
            wellness_data = []
        
        # Aggregate data by date with type safety and validation
        daily_stats = {}
        for record in wellness_data:
            date_str = (record.get("created_at") or "")[:10]  # Extract YYYY-MM-DD
            if not date_str:
                continue
                
            # Safely convert score to float with bounds checking
            raw_score = record.get("score")
            try:
                score = float(raw_score or 0)
                # Validate score is within expected range (1-5)
                if 1 <= score <= 5:
                    if date_str not in daily_stats:
                        daily_stats[date_str] = {"scores": [], "count": 0}
                    
                    daily_stats[date_str]["scores"].append(score)
                    daily_stats[date_str]["count"] += 1
            except (ValueError, TypeError):
                # Skip invalid scores
                continue
        
        # Create CSV content
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write headers
        writer.writerow([
            "Date", 
            "Average_Score", 
            "Response_Count", 
            "Min_Score", 
            "Max_Score",
            "Project_ID"
        ])
        
        # Generate rows for exactly `days` days using date-only arithmetic
        for i in range(days):
            current_date = start_date + timedelta(days=i)
            date_str = current_date.strftime("%Y-%m-%d")
            
            if date_str in daily_stats:
                scores = daily_stats[date_str]["scores"]
                avg_score = sum(scores) / len(scores) if scores else 0
                min_score = min(scores) if scores else 0
                max_score = max(scores) if scores else 0
                count = daily_stats[date_str]["count"]
            else:
                avg_score = min_score = max_score = count = 0
            
            writer.writerow([
                date_str,
                round(avg_score, 2) if avg_score > 0 else 0,
                count,
                min_score,
                max_score,
                project_id
            ])
        
        csv_content = output.getvalue()
        output.close()
        
        # Return CSV response with proper headers
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=wellness_trend_{project_id}_{days}days.csv"
            }
        )
        
    except Exception as e:
        print(f"Wellness trend CSV export error: {e}")
        raise HTTPException(status_code=500, detail="Failed to export wellness trend data")