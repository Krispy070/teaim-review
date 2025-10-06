from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from datetime import datetime, timedelta
import html
from ..tenant import TenantCtx
from ..guards import member_ctx, require_role
from ..supabase_client import get_user_supabase, get_supabase_client
from ..brand.export_header import export_header_html

router = APIRouter(prefix="/wellness", tags=["wellness"])

# Helper endpoint for testing wellness data
@router.get("/test_data")
def get_test_data(project_id: str = Query(...), ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    
    # Get sample wellness data
    q = sb.table("team_wellness_comments").select("created_at,score,comment,user_id") \
          .eq("org_id", ctx.org_id).eq("project_id", project_id).order("created_at", desc=True).limit(10)
    
    try:
        result = q.execute()
        rows = result.data if result.data else []
        return {"count": len(rows), "sample": rows[:3]}
    except Exception as e:
        return {"count": 0, "sample": [], "error": str(e)}

# User wellness history endpoint
@router.get("/user_history")
def user_history(project_id: str = Query(...), user_id: str = Query(...), 
                start: str = Query(None), end: str = Query(None),
                ctx: TenantCtx = Depends(member_ctx)):
    sb = get_user_supabase(ctx)
    
    q = sb.table("team_wellness_comments").select("created_at,score,comment") \
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("user_id", user_id) \
          .order("created_at", desc=True)
    
    if start: q = q.gte("created_at", start)
    if end:
        # Use end-of-day to include all records from the end date
        end_plus_one = (datetime.fromisoformat(end) + timedelta(days=1)).isoformat()
        q = q.lt("created_at", end_plus_one)
    
    try:
        result = q.execute()
        rows = result.data if result.data else []
        return {"data": rows, "count": len(rows)}
    except Exception as e:
        return {"data": [], "count": 0, "error": str(e)}

@router.get("/user_report_html")
def user_report_html(project_id: str = Query(...), user_id: str = Query(...), 
                    start: str = Query(None), end: str = Query(None),
                    ctx: TenantCtx = Depends(member_ctx)):
    """Export individual user wellness report as HTML"""
    
    sb = get_user_supabase(ctx)
    sbs = get_supabase_client()
    
    # Get user info and project details
    user_name = "Unknown User"
    user_email = ""
    project_title = "Project"
    project_code = "PROJ"
    
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
            project_code = proj_result.data.get("code", "PROJ")
            project_title = proj_result.data.get("title", "Project")
    except Exception:
        pass
    
    # Get wellness history
    q = sb.table("team_wellness_comments").select("created_at,score,comment")\
          .eq("org_id", ctx.org_id).eq("project_id", project_id).eq("user_id", user_id)\
          .order("created_at", desc=True)
    
    if start: q = q.gte("created_at", start)
    if end:
        end_plus_one = (datetime.fromisoformat(end) + timedelta(days=1)).isoformat()
        q = q.lt("created_at", end_plus_one)
    
    try:
        result = q.execute()
        rows = result.data if result.data else []
    except Exception:
        rows = []
    
    # Get branding settings
    try:
        org_result = sbs.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute()
        org_settings = org_result.data if org_result.data else {}
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
    
    # Calculate most common score (not count)
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
    
    # Create HTML report using string concatenation to avoid f-string issues
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wellness Report - """ + user_name_safe + """</title>
    <style>
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
            /* Page setup with standardized margins */
            @page { 
                size: A4; 
                margin: 12.7mm; 
            }
            
            /* Global color preservation */
            html, body { 
                print-color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
            }
            
            /* Page setup and layout */
            body { 
                background: white !important; 
                margin: 0;
                font-size: 11pt;
                line-height: 1.4;
            } 
            .container { 
                box-shadow: none !important; 
                border-radius: 0 !important;
                padding: 15pt 20pt !important;
                margin: 0 !important;
                max-width: 100% !important;
            }
            
            /* Typography optimization for print */
            .report-title h1 { font-size: 18pt !important; margin-bottom: 8pt !important; }
            .report-title p { font-size: 10pt !important; margin: 4pt 0 !important; }
            h3 { font-size: 12pt !important; margin: 12pt 0 6pt 0 !important; }
            
            /* Export header for professional look */
            .export-header { 
                border-bottom-width: 1pt !important; 
                margin-bottom: 12pt !important;
                page-break-after: avoid;
                print-color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
            }
            .export-header .title { font-size: 11pt !important; }
            
            /* Statistics grid - optimize for print */
            .stats-grid { 
                margin: 12pt 0 !important;
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .stat-card { 
                padding: 8pt !important; 
                margin-bottom: 6pt !important;
                border: 1pt solid #ddd !important;
                background: #f9f9f9 !important;
                print-color-adjust: exact;
            }
            .stat-card .value { font-size: 16pt !important; }
            .stat-card .label { font-size: 9pt !important; }
            
            /* Score bars - ensure colors print */
            .score-bars { 
                margin: 12pt 0 !important; 
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .score-bar { 
                margin: 4pt 0 !important; 
                font-size: 9pt !important; 
            }
            .score-bar .bar { 
                height: 14pt !important; 
                border: 1pt solid #ddd !important;
            }
            .score-bar .fill { 
                print-color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
            }
            
            /* History section */
            .history { 
                margin: 16pt 0 !important; 
                page-break-before: auto;
            }
            .history-item { 
                padding: 6pt !important; 
                font-size: 9pt !important;
                border-bottom: 0.5pt solid #eee !important;
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .history-date { width: 80pt !important; }
            .history-score { width: 40pt !important; }
            .score-badge { 
                width: 16pt !important; 
                height: 16pt !important; 
                line-height: 16pt !important;
                font-size: 8pt !important;
                print-color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
            }
            
            /* Footer */
            .footer { 
                margin-top: 16pt !important; 
                padding-top: 8pt !important;
                font-size: 8pt !important;
                border-top: 0.5pt solid #ddd !important;
                page-break-inside: avoid;
            }
            
            /* Page break control */
            .stats-grid, .score-bars { page-break-inside: avoid; }
            .history h3 { page-break-after: avoid; }
            
            /* Ensure all colors print properly */
            .score-1, .score-2, .score-3, .score-4, .score-5 {
                print-color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        """ + brand_header + """
        
        <div class="report-title">
            <h1>Individual Wellness Report</h1>
            <p><strong>""" + user_name_safe + """</strong> (""" + user_email_safe + """)</p>
            <p>Period: """ + period_start_formatted + """ - """ + period_end_formatted + """</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="value">""" + str(total_checkins) + """</div>
                <div class="label">Total Check-ins</div>
            </div>
            <div class="stat-card">
                <div class="value">""" + f"{avg_score:.1f}" + """</div>
                <div class="label">Average Score</div>
            </div>
            <div class="stat-card">
                <div class="value">""" + str(most_common_score) + """</div>
                <div class="label">Most Common Score</div>
            </div>
        </div>
        
        <div class="score-bars">
            <h3>Score Distribution</h3>"""

    # Add score bars using string concatenation
    for i in range(5):
        width_pct = (score_counts[i] / max(total_checkins, 1)) * 100 if total_checkins > 0 else 0
        html_content += f"""
            <div class="score-bar">
                <div class="label">Score {i+1}</div>
                <div class="bar">
                    <div class="fill score-{i+1}" style="width: {width_pct}%"></div>
                </div>
                <div class="count">{score_counts[i]}</div>
            </div>"""
    
    html_content += """
        </div>
        
        <div class="history">
            <h3>Check-in History</h3>"""
    
    if rows:
        for r in rows[:50]:  # Show last 50 entries
            created_at = r.get("created_at", "")[:19]
            try:
                date_formatted = datetime.fromisoformat(created_at).strftime("%b %d, %Y")
            except:
                date_formatted = "Unknown"
            score = r.get("score", 1)
            comment = html.escape(r.get("comment", "") or "No comment provided")
            
            html_content += f"""
            <div class="history-item">
                <div class="history-date">{date_formatted}</div>
                <div class="history-score">
                    <span class="score-badge score-{score}">{score}</span>
                </div>
                <div class="history-comment">{comment}</div>
            </div>"""
        
        if total_checkins > 50:
            html_content += f"""<p style="text-align: center; color: #666; font-style: italic;">Showing most recent 50 of {total_checkins} total check-ins</p>"""
    else:
        html_content += """<p style="text-align: center; color: #666;">No check-in history available for this period.</p>"""
    
    html_content += """
        </div>
        
        <div class="footer">
            Generated on """ + datetime.now().strftime("%B %d, %Y at %I:%M %p") + """ • 
            Project: """ + project_title_safe + """ (""" + project_code_safe + """)
        </div>
    </div>
</body>
</html>"""
    
    # Sanitize filename to prevent header injection and ensure safe downloads
    import re
    safe_user_name = re.sub(r'[^A-Za-z0-9_.-]', '_', user_name.replace(" ", "_"))
    safe_filename = f"wellness_report_{safe_user_name}_{user_id[:8]}.html"
    
    return HTMLResponse(content=html_content, headers={
        "Content-Disposition": f'attachment; filename="{safe_filename}"'
    })

@router.get("/project_report_html")
def project_report_html(project_id: str = Query(...), days: int = Query(30),
                        ctx: TenantCtx = Depends(require_role({"owner","admin","pm"}))):
    """Export comprehensive project wellness report as HTML"""
    
    sb = get_user_supabase(ctx)
    sbs = get_supabase_client()
    
    # Get project details and branding
    project_title = "Project"
    project_code = "PROJ"
    org_settings = {}
    
    try:
        # Get project info
        project = sbs.table("projects").select("title,code").eq("id", project_id).single().execute()
        if project.data:
            project_title = project.data.get("title", "Project")
            project_code = project.data.get("code", "PROJ")
        
        # Get org branding settings
        branding = sbs.table("org_branding").select("*").eq("org_id", ctx.org_id).single().execute()
        if branding.data:
            org_settings = branding.data
    except Exception:
        pass
    
    # Calculate date range - use proper inclusive/exclusive pattern
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    end_date_exclusive = end_date + timedelta(days=1)  # Next day for exclusive end
    
    # Get wellness data for the period
    wellness_data = []
    top_responders = []
    summary_stats = {
        "total_responses": 0,
        "unique_responders": 0,
        "avg_score": 0.0,
        "response_rate": 0.0
    }
    
    try:
        # Get wellness responses - use proper date range to include all data from end_date
        wellness_query = sb.table("team_wellness").select("created_at,user_id,score") \
                          .eq("org_id", ctx.org_id).eq("project_id", project_id) \
                          .gte("created_at", start_date.isoformat()) \
                          .lt("created_at", end_date_exclusive.isoformat()) \
                          .order("created_at", desc=True).limit(1000)
        
        wellness_result = wellness_query.execute()
        if wellness_result.data:
            wellness_data = wellness_result.data
            
            # Calculate summary stats
            summary_stats["total_responses"] = len(wellness_data)
            unique_users = set(entry.get("user_id") for entry in wellness_data)
            summary_stats["unique_responders"] = len(unique_users)
            
            if wellness_data:
                avg_score = sum(entry.get("score", 0) for entry in wellness_data) / len(wellness_data)
                summary_stats["avg_score"] = round(avg_score, 1)
            
            # Get top responders
            user_stats = {}
            for entry in wellness_data:
                uid = entry.get("user_id")
                score = entry.get("score", 0)
                if uid:
                    if uid not in user_stats:
                        user_stats[uid] = {"checkins": 0, "total_score": 0}
                    user_stats[uid]["checkins"] += 1
                    user_stats[uid]["total_score"] += score
            
            # Get user details and create top responders list
            top_user_ids = sorted(user_stats.keys(), key=lambda x: user_stats[x]["checkins"], reverse=True)[:10]
            
            for uid in top_user_ids:
                user_name = uid[:8]  # Fallback
                user_email = ""
                
                try:
                    # Try contacts first
                    contact = sb.table("contacts").select("name,email").eq("user_id", uid).single().execute()
                    if contact.data:
                        user_name = contact.data.get("name", uid[:8])
                        user_email = contact.data.get("email", "")
                    else:
                        # Try users_profile
                        profile = sb.table("users_profile").select("full_name,email").eq("user_id", uid).single().execute()
                        if profile.data:
                            user_name = profile.data.get("full_name", uid[:8])
                            user_email = profile.data.get("email", "")
                except Exception:
                    pass
                
                stats = user_stats[uid]
                avg_user_score = stats["total_score"] / stats["checkins"] if stats["checkins"] > 0 else 0
                
                top_responders.append({
                    "user_id": uid,
                    "name": user_name,
                    "email": user_email,
                    "checkins": stats["checkins"],
                    "avg_score": round(avg_user_score, 1)
                })
            
    except Exception as e:
        print(f"Error fetching wellness data: {e}")
        pass
    
    # Generate HTML report
    header_html = export_header_html(org_settings, project_code)
    
    # Sanitize content
    safe_title = html.escape(project_title)
    safe_period = f"{start_date} to {end_date}"
    
    # Generate responders table
    responders_rows = ""
    if top_responders:
        for i, responder in enumerate(top_responders[:10]):
            safe_name = html.escape(responder.get("name", "Unknown"))
            safe_email = html.escape(responder.get("email", ""))
            checkins = int(responder.get("checkins", 0))
            avg_score = float(responder.get("avg_score", 0))
            
            responders_rows += f"""
            <tr>
                <td style="padding:8px;border:1px solid #ddd;">#{i+1}</td>
                <td style="padding:8px;border:1px solid #ddd;">{safe_name}</td>
                <td style="padding:8px;border:1px solid #ddd;">{safe_email}</td>
                <td style="padding:8px;border:1px solid #ddd;">{checkins}</td>
                <td style="padding:8px;border:1px solid #ddd;">{avg_score}</td>
            </tr>
            """
    else:
        responders_rows = '<tr><td colspan="5" style="padding:16px;text-align:center;color:#666;">No wellness data available</td></tr>'
    
    # Trend indicator
    trend_color = "#22c55e" if summary_stats["avg_score"] >= 3.5 else "#ef4444" if summary_stats["avg_score"] < 2.5 else "#f59e0b"
    
    complete_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Wellness Report - {safe_title}</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; }}
            .container {{ max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
            .header {{ padding: 20px; border-bottom: 1px solid #e5e7eb; }}
            .content {{ padding: 20px; }}
            .stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 20px 0; }}
            .stat-card {{ padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; text-align: center; }}
            .stat-value {{ font-size: 24px; font-weight: bold; color: {trend_color}; }}
            .stat-label {{ font-size: 12px; color: #6b7280; margin-top: 4px; }}
            .section {{ margin: 30px 0; }}
            .section h3 {{ margin: 0 0 16px 0; font-size: 18px; color: #1f2937; }}
            table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
            th {{ background: #f3f4f6; padding: 12px 8px; border: 1px solid #d1d5db; font-weight: 600; text-align: left; }}
            td {{ padding: 8px; border: 1px solid #e5e7eb; }}
            .export-header {{ border-bottom: 2px solid; padding: 12px 0; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }}
            .export-header .left {{ font-weight: 600; }}
            .export-header .title {{ font-size: 16px; font-weight: 700; }}
            .export-header .right {{ font-weight: 600; }}
            .export-subtle {{ font-size: 12px; color: #6b7280; margin-bottom: 20px; }}
            @media print {{
                body {{ background: white; }}
                .container {{ box-shadow: none; }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                {header_html}
            </div>
            
            <div class="content">
                <h1 style="margin: 0 0 8px 0; color: #1f2937;">Wellness Report</h1>
                <p style="color: #6b7280; margin: 0 0 20px 0;">Period: {safe_period} ({days} days)</p>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">{summary_stats['total_responses']}</div>
                        <div class="stat-label">Total Responses</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">{summary_stats['unique_responders']}</div>
                        <div class="stat-label">Unique Responders</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" style="color: {trend_color};">{summary_stats['avg_score']}</div>
                        <div class="stat-label">Average Score</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">{summary_stats['response_rate']:.1f}%</div>
                        <div class="stat-label">Response Rate</div>
                    </div>
                </div>
                
                <div class="section">
                    <h3>Top Wellness Responders</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Check-ins</th>
                                <th>Avg Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {responders_rows}
                        </tbody>
                    </table>
                </div>
                
                <div class="section">
                    <p style="font-size: 12px; color: #6b7280; margin: 20px 0;">
                        Generated on {datetime.now().strftime('%Y-%m-%d at %H:%M UTC')}<br>
                        This report contains aggregated wellness data for project analysis and team support.
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    return HTMLResponse(content=complete_html, headers={
        "Content-Disposition": "inline",
        "Cache-Control": "no-cache"
    })