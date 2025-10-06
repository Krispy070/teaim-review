import csv
from io import StringIO
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse, HTMLResponse

from ..tenant import TenantCtx
from ..guards import member_ctx
from ..db import get_conn

router = APIRouter()

def build_trend_filter(project_id: str, area_filter: Optional[str] = None, owner_filter: Optional[str] = None):
    """Build SQL filter for trend queries based on area/owner filters."""
    where_clauses = ["w.project_id = %s"]
    params = [project_id]
    
    if area_filter and area_filter != "all":
        where_clauses.append("w.stage_area = %s")
        params.append(area_filter)
    
    if owner_filter and owner_filter != "all":
        where_clauses.append("w.stage_owner = %s")
        params.append(owner_filter)
    
    return " AND ".join(where_clauses), params

@router.get("/trend_by.csv")
async def trend_by_csv(
    project_id: str = Query(...),
    area_filter: Optional[str] = Query(None),
    owner_filter: Optional[str] = Query(None),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Export wellness trend data as CSV with area/owner filtering."""
    # Verify permissions
    if ctx.role not in ["owner", "admin", "pm", "lead"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        conn = get_conn()
        cursor = conn.cursor()
        
        # Build filter conditions
        where_clause, params = build_trend_filter(project_id, area_filter, owner_filter)
        
        # Query wellness trend data
        query = f"""
            SELECT 
                date_trunc('week', w.created_at::date) as week,
                w.stage_area,
                w.stage_owner,
                COUNT(*) as entry_count,
                AVG(CASE WHEN w.mood_score IS NOT NULL THEN w.mood_score ELSE NULL END) as avg_mood,
                AVG(CASE WHEN w.stress_level IS NOT NULL THEN w.stress_level ELSE NULL END) as avg_stress,
                AVG(CASE WHEN w.workload_rating IS NOT NULL THEN w.workload_rating ELSE NULL END) as avg_workload,
                SUM(CASE WHEN w.needs_support THEN 1 ELSE 0 END) as support_requests,
                STRING_AGG(DISTINCT w.feedback_text, ' | ') as feedback_summary
            FROM wellness w
            WHERE {where_clause}
            AND w.created_at >= NOW() - INTERVAL '90 days'
            GROUP BY date_trunc('week', w.created_at::date), w.stage_area, w.stage_owner
            ORDER BY week DESC, w.stage_area, w.stage_owner
        """
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # Generate CSV
        output = StringIO()
        writer = csv.writer(output)
        
        # Headers
        writer.writerow([
            "Week", "Area", "Owner", "Entries", "Avg Mood", "Avg Stress", 
            "Avg Workload", "Support Requests", "Feedback Summary"
        ])
        
        # Data rows
        for row in rows:
            week, area, owner, count, mood, stress, workload, support, feedback = row
            writer.writerow([
                week.strftime("%Y-%m-%d") if week else "",
                area or "",
                owner or "",
                count or 0,
                f"{mood:.1f}" if mood else "",
                f"{stress:.1f}" if stress else "",
                f"{workload:.1f}" if workload else "",
                support or 0,
                feedback or ""
            ])
        
        cursor.close()
        conn.close()
        
        # Generate filename with filters
        filename_parts = ["wellness_trend"]
        if area_filter and area_filter != "all":
            filename_parts.append(f"area_{area_filter}")
        if owner_filter and owner_filter != "all":
            filename_parts.append(f"owner_{owner_filter}")
        filename = f"{'_'.join(filename_parts)}.csv"
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.get("/trend_by.html")
async def trend_by_html(
    project_id: str = Query(...),
    area_filter: Optional[str] = Query(None),
    owner_filter: Optional[str] = Query(None),
    ctx: TenantCtx = Depends(member_ctx)
):
    """Export wellness trend data as HTML report with brand headers."""
    # Verify permissions
    if ctx.role not in ["owner", "admin", "pm", "lead"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        conn = get_conn()
        cursor = conn.cursor()
        
        # Get project and branding info
        cursor.execute("""
            SELECT p.name, p.organization_id, 
                   COALESCE(b.app_name, 'TEAIM') as app_name,
                   COALESCE(b.primary_color, '#3b82f6') as primary_color
            FROM projects p
            LEFT JOIN org_branding b ON b.org_id = p.organization_id
            WHERE p.id = %s
        """, [project_id])
        project_row = cursor.fetchone()
        if not project_row:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project_name, org_id, app_name, primary_color = project_row
        
        # Build filter conditions
        where_clause, params = build_trend_filter(project_id, area_filter, owner_filter)
        
        # Query wellness trend data  
        query = f"""
            SELECT 
                date_trunc('week', w.created_at::date) as week,
                w.stage_area,
                w.stage_owner,
                COUNT(*) as entry_count,
                AVG(CASE WHEN w.mood_score IS NOT NULL THEN w.mood_score ELSE NULL END) as avg_mood,
                AVG(CASE WHEN w.stress_level IS NOT NULL THEN w.stress_level ELSE NULL END) as avg_stress,
                AVG(CASE WHEN w.workload_rating IS NOT NULL THEN w.workload_rating ELSE NULL END) as avg_workload,
                SUM(CASE WHEN w.needs_support THEN 1 ELSE 0 END) as support_requests
            FROM wellness w
            WHERE {where_clause}
            AND w.created_at >= NOW() - INTERVAL '90 days'
            GROUP BY date_trunc('week', w.created_at::date), w.stage_area, w.stage_owner
            ORDER BY week DESC, w.stage_area, w.stage_owner
        """
        
        cursor.execute(query, params)
        trend_data = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # Build filter description
        filter_desc = "All Areas & Owners"
        if area_filter and area_filter != "all":
            filter_desc = f"Area: {area_filter}"
            if owner_filter and owner_filter != "all":
                filter_desc += f", Owner: {owner_filter}"
        elif owner_filter and owner_filter != "all":
            filter_desc = f"Owner: {owner_filter}"
        
        # Generate table HTML
        if not trend_data:
            table_html = '<div class="no-data">No wellness data found for the selected filters.</div>'
        else:
            table_rows = []
            for row in trend_data:
                support_class = 'support-high' if (row[7] or 0) > 2 else ''
                table_rows.append(f"""<tr>
                    <td>{row[0].strftime("%Y-%m-%d") if row[0] else ""}</td>
                    <td>{row[1] or ""}</td>
                    <td>{row[2] or ""}</td>
                    <td class="metric">{row[3] or 0}</td>
                    <td class="metric">{f"{row[4]:.1f}" if row[4] else "—"}</td>
                    <td class="metric">{f"{row[5]:.1f}" if row[5] else "—"}</td>
                    <td class="metric">{f"{row[6]:.1f}" if row[6] else "—"}</td>
                    <td class="metric {support_class}">{row[7] or 0}</td>
                </tr>""")
            
            table_html = f"""<table>
                <thead>
                    <tr>
                        <th>Week</th>
                        <th>Area</th>
                        <th>Owner</th>
                        <th class="metric">Entries</th>
                        <th class="metric">Avg Mood</th>
                        <th class="metric">Avg Stress</th>
                        <th class="metric">Avg Workload</th>
                        <th class="metric">Support Requests</th>
                    </tr>
                </thead>
                <tbody>
                    {''.join(table_rows)}
                </tbody>
            </table>"""
        
        # Generate HTML report
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Wellness Trend Report - {project_name}</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; color: #374151; }}
                .header {{ background: {primary_color}; color: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; }}
                .header h1 {{ margin: 0 0 10px 0; font-size: 28px; }}
                .header p {{ margin: 0; opacity: 0.9; }}
                .filters {{ background: #f9fafb; padding: 15px; border-radius: 6px; margin-bottom: 20px; }}
                .filters strong {{ color: {primary_color}; }}
                table {{ width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
                th {{ background: {primary_color}; color: white; padding: 12px; text-align: left; font-weight: 600; }}
                td {{ padding: 12px; border-bottom: 1px solid #e5e7eb; }}
                tr:nth-child(even) {{ background: #f9fafb; }}
                .metric {{ text-align: center; font-weight: 500; }}
                .support-high {{ color: #ef4444; font-weight: 600; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; text-align: center; }}
                .no-data {{ text-align: center; padding: 40px; color: #6b7280; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{app_name} Wellness Trend Report</h1>
                <p>Project: {project_name} | Generated: {datetime.now().strftime("%B %d, %Y at %I:%M %p")}</p>
            </div>
            
            <div class="filters">
                <strong>Filter Applied:</strong> {filter_desc}
            </div>
            
            {table_html}
            
            <div class="footer">
                Generated by {app_name} | Data covers last 90 days
            </div>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content, headers={
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": f"inline; filename=wellness_trend_report.html"
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")