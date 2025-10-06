from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, HTMLResponse
import io, csv, html
from datetime import datetime, timedelta
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase, get_supabase_client
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/wellness", tags=["wellness"])

@router.get("/user_history")
def user_history(project_id: str = Query(...), user_id: str = Query(...),
                 start: str | None = None, end: str | None = None,
                 ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    q = sb.table("team_wellness_comments").select("created_at,score,comment")\
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("user_id", user_id)
    if start: q = q.gte("created_at", start)
    if end:
        # Use end-of-day to include all records from the end date
        end_plus_one = (datetime.fromisoformat(end) + timedelta(days=1)).isoformat()
        q = q.lt("created_at", end_plus_one)
    try:
        rows = q.order("created_at", desc=True).limit(200).execute().data or []
        return {"items": rows}
    except Exception:
        return {"items": []}

@router.get("/user_export.csv")
def user_export(project_id: str = Query(...), user_id: str = Query(...),
                start: str | None = None, end: str | None = None,
                ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    q = sb.table("team_wellness_comments").select("created_at,score,comment")\
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("user_id", user_id)
    if start: q = q.gte("created_at", start)
    if end:
        # Use end-of-day to include all records from the end date
        end_plus_one = (datetime.fromisoformat(end) + timedelta(days=1)).isoformat()
        q = q.lt("created_at", end_plus_one)
    try:
        rows = q.order("created_at", desc=True).limit(2000).execute().data or []
    except Exception:
        rows = []
    s = io.StringIO(); w = csv.writer(s); w.writerow(["created_at","score","comment"])
    for r in rows: w.writerow([r.get("created_at"), r.get("score"), r.get("comment")])
    s.seek(0)
    return StreamingResponse(iter([s.read()]), media_type="text/csv",
      headers={"Content-Disposition": f'attachment; filename="wellness_{user_id[:8]}.csv"'})

@router.get("/user_export.html", response_class=HTMLResponse)
def user_export_html(project_id: str = Query(...), user_id: str = Query(...),
                     start: str | None = None, end: str | None = None,
                     ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    sbs = get_supabase_client()
    
    # Get user info and project details
    user_name = "Unknown User"
    user_email = ""
    project_code = "Unknown"
    project_title = "Unknown Project"
    
    try:
        # Get user info from contacts or users_profile
        user_result = sb.table("contacts").select("name,email").eq("user_id", user_id).single().execute()
        if user_result.data:
            user_name = user_result.data.get("name", "Unknown User")
            user_email = user_result.data.get("email", "")
        else:
            # Fallback to users_profile
            profile_result = sb.table("users_profile").select("full_name,email").eq("user_id", user_id).single().execute()
            if profile_result.data:
                user_name = profile_result.data.get("full_name", "Unknown User")
                user_email = profile_result.data.get("email", "")
        
        # Get project details
        proj_result = sb.table("projects").select("code,title").eq("id", project_id).single().execute()
        if proj_result.data:
            project_code = proj_result.data.get("code", "Unknown")
            project_title = proj_result.data.get("title", "Unknown Project")
    except Exception:
        pass
    
    # Get wellness history
    q = sb.table("team_wellness_comments").select("created_at,score,comment")\
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("user_id", user_id)
    if start: q = q.gte("created_at", start)
    if end:
        end_plus_one = (datetime.fromisoformat(end) + timedelta(days=1)).isoformat()
        q = q.lt("created_at", end_plus_one)
    
    try:
        rows = q.order("created_at", desc=True).limit(500).execute().data or []
    except Exception:
        rows = []
    
    # Get branding settings
    try:
        org_result = sbs.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute()
        org_settings = org_result.data or {}
    except Exception:
        org_settings = {}
    
    # Calculate stats
    total_checkins = len(rows)
    avg_score = sum(r.get("score", 0) for r in rows) / max(total_checkins, 1) if rows else 0
    score_counts = [0, 0, 0, 0, 0]  # Scores 1-5
    for r in rows:
        score = r.get("score", 0)
        if 1 <= score <= 5:
            score_counts[score-1] += 1
    
    # Fix: Calculate most common score (not count)
    most_common_idx = max(range(5), key=lambda i: score_counts[i])
    most_common_score = most_common_idx + 1
    most_common_count = score_counts[most_common_idx]
    
    # Date range info
    if start:
        period_start = start
    elif rows:
        period_start = rows[-1].get("created_at") or datetime.now().isoformat()
    else:
        period_start = datetime.now().isoformat()
        
    if end:
        period_end = end
    elif rows:
        period_end = rows[0].get("created_at") or datetime.now().isoformat()
    else:
        period_end = datetime.now().isoformat()
    
    period_start_formatted = datetime.fromisoformat(period_start[:19]).strftime("%B %d, %Y")
    period_end_formatted = datetime.fromisoformat(period_end[:19]).strftime("%B %d, %Y")
    
    # Generate branded header and escape all dynamic content for HTML safety
    brand_header = export_header_html(org_settings, project_code)
    user_name_safe = html.escape(user_name)
    user_email_safe = html.escape(user_email)
    project_title_safe = html.escape(project_title)
    project_code_safe = html.escape(project_code)
    
    # Create HTML report - separate CSS from f-string to avoid # character conflicts
    css_styles = """
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; line-height: 1.5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .export-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 2px solid; margin-bottom: 8px; }
        .export-header .left, .export-header .right { flex: 1; }
        .export-header .title { flex: 2; text-align: center; font-weight: 600; font-size: 16px; }
        .export-subtle { text-align: center; color: #666; margin-bottom: 24px; }
        .report-title { text-align: center; margin: 24px 0; }
        .report-title h1 { margin: 0; color: #333; font-size: 28px; }
        .report-title p { margin: 8px 0 0 0; color: #666; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin: 24px 0; }
        .stat-card { background: #f8f9fa; padding: 16px; border-radius: 6px; text-align: center; }
        .stat-card .value { font-size: 24px; font-weight: 600; color: #333; }
        .stat-card .label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 4px; }
        .score-bars { margin: 24px 0; }
        .score-bars h3 { margin-bottom: 16px; }
        .score-bar { display: flex; align-items: center; margin: 8px 0; }
        .score-bar .label { width: 80px; font-size: 14px; }
        .score-bar .bar { flex: 1; height: 20px; background: #e9ecef; border-radius: 10px; margin: 0 12px; position: relative; }
        .score-bar .fill { height: 100%; border-radius: 10px; transition: width 0.3s ease; }
        .score-bar .count { width: 40px; text-align: right; font-size: 14px; }
        .score-1 { background: #dc3545; }
        .score-2 { background: #fd7e14; }
        .score-3 { background: #ffc107; }
        .score-4 { background: #20c997; }
        .score-5 { background: #28a745; }
        .history { margin: 32px 0; }
        .history h3 { margin-bottom: 16px; }
        .history-item { display: flex; padding: 12px; border-bottom: 1px solid #e9ecef; }
        .history-item:last-child { border-bottom: none; }
        .history-date { width: 120px; font-size: 14px; color: #666; }
        .history-score { width: 60px; }
        .history-comment { flex: 1; font-size: 14px; }
        .score-badge { display: inline-block; width: 24px; height: 24px; border-radius: 12px; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; color: white; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e9ecef; font-size: 12px; color: #666; text-align: center; }
        @media print { 
            body { background: white; } 
            .container { box-shadow: none; padding: 20px; }
            .score-bar .fill { print-color-adjust: exact; }
        }
    """
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Wellness Report - {user_name_safe}</title>
        <style>{css_styles}</style>
    </head>
    <body>
        <div class="container">
            {brand_header}
            
            <div class="report-title">
                <h1>Individual Wellness Report</h1>
                <p><strong>{user_name_safe}</strong> ({user_email_safe})</p>
                <p>Period: {period_start_formatted} - {period_end_formatted}</p>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="value">{total_checkins}</div>
                    <div class="label">Total Check-ins</div>
                </div>
                <div class="stat-card">
                    <div class="value">{avg_score:.1f}</div>
                    <div class="label">Average Score</div>
                </div>
                <div class="stat-card">
                    <div class="value">{most_common_score}</div>
                    <div class="label">Most Common Score</div>
                </div>
            </div>
            
            <div class="score-bars">
                <h3>Score Distribution</h3>
                {chr(10).join([
                    f'''<div class="score-bar">
                        <div class="label">Score {i+1}</div>
                        <div class="bar">
                            <div class="fill score-{i+1}" style="width: {(score_counts[i] / max(total_checkins, 1)) * 100}%"></div>
                        </div>
                        <div class="count">{score_counts[i]}</div>
                    </div>''' for i in range(5)
                ])}
            </div>
            
            <div class="history">
                <h3>Check-in History</h3>
                {chr(10).join([
                    f'''<div class="history-item">
                        <div class="history-date">{datetime.fromisoformat(r.get("created_at", "")[:19]).strftime("%b %d, %Y")}</div>
                        <div class="history-score">
                            <span class="score-badge score-{r.get("score", 1)}">{r.get("score", "")}</span>
                        </div>
                        <div class="history-comment">{html.escape(r.get("comment", "") or "No comment provided")}</div>
                    </div>''' for r in rows[:50]  # Show last 50 entries
                ]) if rows else '<p style="text-align: center; color: #666;">No check-in history available for this period.</p>'}
                <p style="text-align: center; color: #666; font-style: italic;">{f'Showing most recent 50 of {total_checkins} total check-ins' if total_checkins > 50 else ''}</p>
            </div>
            
            <div class="footer">
                Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")} • 
                Project: {project_title_safe} ({project_code_safe})
            </div>
        </div>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content, headers={
        "Content-Disposition": f'attachment; filename="wellness_report_{user_name.replace(" ", "_")}_{user_id[:8]}.html"'
    })