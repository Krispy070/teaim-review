import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getJSON } from "@/lib/authFetch";

export default function AnalyticsCards({ projectId }: { projectId: string }){
  const [sum,setSum] = useState<any>(null);
  const [burn,setBurn] = useState<any>(null);
  const [workbooksData,setWorkbooksData] = useState<any>(null);
  const [reportsData,setReportsData] = useState<any>(null);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{ (async ()=>{
    if (!projectId) return;
    setLoading(true);
    try {
      const sum = await getJSON(`/api/analytics/summary?project_id=${projectId}`);
      setSum(sum || { actions: 0, risks: 0, decisions: 0, docs: 0, stages_in_review: 0 });
      
      try {
        const burn = await getJSON(`/api/analytics/burnup?project_id=${projectId}`);
        setBurn(burn);
      } catch {
        setBurn(null);
      }
      
      // Fetch workbooks and reports metrics with graceful fallback
      try {
        const workbooks = await getJSON(`/api/workbooks/metrics?project_id=${projectId}`);
        setWorkbooksData(workbooks);
      } catch {
        setWorkbooksData(null);
      }
      
      try {
        const reports = await getJSON(`/api/reports/metrics?project_id=${projectId}`);
        setReportsData(reports);
      } catch {
        setReportsData(null);
      }
    } catch (error) {
      // Fallback to empty state
      setSum({ actions: 0, risks: 0, decisions: 0, docs: 0, stages_in_review: 0 });
      setWorkbooksData(null);
      setReportsData(null);
    } finally {
      setLoading(false);
    }
  })(); },[projectId]);

  if (loading) return <div className="text-sm text-slate-500" data-testid="analytics-loading">Loading analytics...</div>;
  if (!sum) return (
    <div className="grid md:grid-cols-3 gap-3" data-testid="analytics-skeleton">
      {Array.from({length:5}).map((_,i)=> <div key={i} className="border rounded p-3 h-[70px] bg-neutral-50" />)}
    </div>
  );

  return (
    <div className="grid md:grid-cols-3 gap-3" data-testid="analytics-cards">
      {[
        ["Docs", sum.docs], ["Actions", sum.actions], ["Risks", sum.risks],
        ["Decisions", sum.decisions], ["Stages in Review", sum.stages_in_review]
      ].map(([t,v]:any)=>(
        <div key={t} className="border rounded p-3" data-testid={`card-${t.toLowerCase().replace(' ', '-')}`}>
          <div className="text-sm text-muted-foreground">{t}</div>
          <div className="text-xl font-semibold">{v}</div>
        </div>
      ))}
      {(workbooksData || reportsData) && (
        <div className="border rounded p-3" data-testid="card-data-reporting">
          <div className="text-sm text-muted-foreground">Data & Reporting</div>
          <div className="text-xl font-semibold">
            {(workbooksData?.summary?.total || 0) + (reportsData?.summary?.total || 0)} items
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {workbooksData?.summary?.total > 0 && (
              <span>{workbooksData.summary.total} workbooks</span>
            )}
            {workbooksData?.summary?.total > 0 && reportsData?.summary?.total > 0 && " • "}
            {reportsData?.summary?.total > 0 && (
              <span>{reportsData.summary.total} reports</span>
            )}
            <br/>
            {workbooksData?.summary?.overdue > 0 && (
              <span className="text-red-600">{workbooksData.summary.overdue} overdue</span>
            )}
            {workbooksData?.summary?.overdue > 0 && workbooksData?.summary?.at_risk > 0 && " • "}
            {workbooksData?.summary?.at_risk > 0 && (
              <span className="text-amber-600">{workbooksData.summary.at_risk} at-risk</span>
            )}
          </div>
        </div>
      )}
      {burn && (
        <div className="md:col-span-3 border rounded p-3" data-testid="burnup-chart">
          <div className="text-sm text-muted-foreground mb-2">Burn-up (last 5 weeks)</div>
          <div style={{width:"100%", height:220}}>
            <ResponsiveContainer>
              <LineChart data={burn.actions}>
                <XAxis dataKey="date" hide />
                <YAxis allowDecimals={false}/>
                <Tooltip />
                <Line type="monotone" dataKey="count" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}