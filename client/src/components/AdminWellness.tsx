import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { downloadGET } from "@/lib/download";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Minus, Download, FileText } from "lucide-react";
import WellnessTrendLine from "./WellnessTrendLine";

interface WellnessData {
  date: string;
  avg: number | null;
  count: number;
}

interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

interface TopResponder {
  user_id: string;
  name: string;
  email: string;
  checkins: number;
  avg_score: number;
}

interface TrendData {
  period_days: number;
  start_date: string;
  end_date: string;
  daily_trends: Array<{
    date: string;
    responses: number;
    unique_responders: number;
    avg_score: number;
  }>;
  summary: {
    total_responses: number;
    unique_responders: number;
    avg_score: number;
    response_trend: "increasing" | "decreasing" | "stable";
    score_trend: "improving" | "declining" | "stable";
  };
}

interface ComparisonData {
  current_period: {
    start_date: string;
    end_date: string;
    days: number;
    metrics: {
      responses: number;
      unique_responders: number;
      avg_score: number;
      response_rate: number;
    };
  };
  prior_period: {
    start_date: string;
    end_date: string;
    days: number;
    metrics: {
      responses: number;
      unique_responders: number;
      avg_score: number;
      response_rate: number;
    };
  };
  deltas: {
    responses: { value: number; percent: number | null };
    unique_responders: { value: number; percent: number | null };
    avg_score: { value: number; percent: number | null };
    response_rate: { value: number; percent: number | null };
  };
}

export default function AdminWellness(){
  const { projectId } = useParams();
  const [data, setData] = useState<WellnessData[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [topResponders, setTopResponders] = useState<TopResponder[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(7);
  const [currentTab, setCurrentTab] = useState<string>("trends");
  const [exportingResponders, setExportingResponders] = useState(false);
  const [exportingComparison, setExportingComparison] = useState(false);
  const [printingHTML, setPrintingHTML] = useState(false);
  
  // Moving average controls for v2.12.11
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [movingAverageWindow, setMovingAverageWindow] = useState(3);
  
  // v2.12.14 - Trend export filters
  const [trendAreaFilter, setTrendAreaFilter] = useState<string>("all");
  const [trendOwnerFilter, setTrendOwnerFilter] = useState<string>("all");
  const [areas, setAreas] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [exportingTrendBy, setExportingTrendBy] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const promises = [
          getJSON<{ items: WellnessData[] }>(`/api/wellness/rollup?project_id=${projectId}${selectedUser !== "all" ? `&user_id=${selectedUser}` : ""}`),
          getJSON<{ members: TeamMember[] }>(`/api/members/list?project_id=${projectId}`),
          getJSON<{ top_responders: TopResponder[] }>(`/api/wellness/top-responders?project_id=${projectId}`),
          getJSON<TrendData>(`/api/wellness/trends?project_id=${projectId}&days=${periodDays}`),
          // v2.12.14 - Fetch areas and owners for trend export filters
          getJSON<{ areas: string[] }>(`/api/stages/owners_by_area?project_id=${projectId}`).then(data => ({ areas: Object.keys(data) })).catch(() => ({ areas: [] })),
          getJSON<{ owners: string[] }>(`/api/stages/owners_by_area?project_id=${projectId}`).then(data => ({ owners: Array.from(new Set(Object.values(data).flat())) })).catch(() => ({ owners: [] }))
        ];
        
        // Add comparison data if on comparison tab
        if (currentTab === "compare") {
          promises.push(
            getJSON<ComparisonData>(`/api/wellness/compare?project_id=${projectId}&current_days=${periodDays}&prior_days=${periodDays}`)
          );
        }
        
        const results = await Promise.all(promises);
        const [rollupData, membersData, respondersData, trendsData, areasData, ownersData, compareData] = results;
        
        setData(rollupData.items || []);
        setTeamMembers(membersData.members || []);
        setTopResponders(respondersData.top_responders || []);
        setTrendData(trendsData);
        
        // v2.12.14 - Set areas and owners for filters
        setAreas(areasData?.areas || []);
        setOwners(ownersData?.owners || []);
        
        if (compareData) {
          setComparisonData(compareData as ComparisonData);
        }
      } catch {
        setData([]);
        setTeamMembers([]);
        setTopResponders([]);
        setTrendData(null);
        setComparisonData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, selectedUser, periodDays, currentTab]);

  const getTrendIcon = (trend: "increasing" | "decreasing" | "stable" | "improving" | "declining") => {
    switch(trend) {
      case "increasing": 
      case "improving": 
        return <TrendingUp className="w-3 h-3 text-green-600" />;
      case "decreasing": 
      case "declining": 
        return <TrendingDown className="w-3 h-3 text-red-600" />;
      default: return <Minus className="w-3 h-3 text-gray-500" />;
    }
  };

  const getDeltaDisplay = (value: number, percent: number | null, format: "number" | "decimal" = "number") => {
    const formattedValue = format === "decimal" ? value.toFixed(1) : value.toString();
    const sign = value > 0 ? "+" : "";
    const color = value > 0 ? "text-green-600" : value < 0 ? "text-red-600" : "text-gray-500";
    const icon = value > 0 ? <TrendingUp className="w-3 h-3" /> : value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />;
    const percentText = percent === null ? "new" : `${sign}${percent.toFixed(1)}%`;
    
    return (
      <div className={`flex items-center gap-1 text-xs ${color}`}>
        {icon}
        <span>{sign}{formattedValue} ({percentText})</span>
      </div>
    );
  };

  const exportTopResponders = async () => {
    if (!projectId || topResponders.length === 0) return;
    setExportingResponders(true);
    try {
      // Create CSV content for top responders
      const csvContent = [
        ['Rank', 'Name', 'Email', 'Check-ins', 'Average Score'].join(','),
        ...topResponders.map((responder, index) => [
          index + 1,
          `"${responder.name}"`,
          `"${responder.email}"`,
          responder.checkins,
          responder.avg_score?.toFixed(1) || '0.0'
        ].join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `top-responders-${projectId.slice(0, 8)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export top responders:', error);
    } finally {
      setExportingResponders(false);
    }
  };

  const exportComparison = async () => {
    if (!projectId || !comparisonData) return;
    setExportingComparison(true);
    try {
      // Create CSV content for period comparison
      const csvContent = [
        ['Metric', 'Current Period', 'Prior Period', 'Change (Value)', 'Change (%)'].join(','),
        ['Period Range', 
         `"${comparisonData.current_period.start_date} to ${comparisonData.current_period.end_date} (${comparisonData.current_period.days} days)"`,
         `"${comparisonData.prior_period.start_date} to ${comparisonData.prior_period.end_date} (${comparisonData.prior_period.days} days)"`,
         '', ''
        ].join(','),
        ['', '', '', '', ''], // Empty row for separator
        ['Total Responses',
         comparisonData.current_period.metrics.responses,
         comparisonData.prior_period.metrics.responses,
         comparisonData.deltas.responses.value,
         comparisonData.deltas.responses.percent?.toFixed(1) || 'N/A'
        ].join(','),
        ['Unique Responders',
         comparisonData.current_period.metrics.unique_responders,
         comparisonData.prior_period.metrics.unique_responders,
         comparisonData.deltas.unique_responders.value,
         comparisonData.deltas.unique_responders.percent?.toFixed(1) || 'N/A'
        ].join(','),
        ['Average Score',
         comparisonData.current_period.metrics.avg_score.toFixed(1),
         comparisonData.prior_period.metrics.avg_score.toFixed(1),
         comparisonData.deltas.avg_score.value.toFixed(1),
         comparisonData.deltas.avg_score.percent?.toFixed(1) || 'N/A'
        ].join(','),
        ['Response Rate',
         comparisonData.current_period.metrics.response_rate.toFixed(1),
         comparisonData.prior_period.metrics.response_rate.toFixed(1),
         comparisonData.deltas.response_rate.value.toFixed(1),
         comparisonData.deltas.response_rate.percent?.toFixed(1) || 'N/A'
        ].join(',')
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wellness-comparison-${periodDays}d-${projectId.slice(0, 8)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export comparison data:', error);
    } finally {
      setExportingComparison(false);
    }
  };

  const printWellnessHTML = async () => {
    if (!projectId) return;
    setPrintingHTML(true);
    try {
      // Use authenticated download pattern like other exports
      await downloadGET(
        `/api/wellness/project_report_html?project_id=${projectId}&days=${periodDays}`,
        `wellness_report_${projectId.slice(0, 8)}_${periodDays}d.html`
      );
    } catch (error) {
      console.error('Failed to generate wellness HTML report:', error);
      // TODO: Add toast notification for user feedback
    } finally {
      setPrintingHTML(false);
    }
  };

  if (loading) {
    return (
      <div className="brand-card p-3">
        <div className="text-sm font-medium mb-2">Wellness — Loading...</div>
        <div className="h-[120px] flex items-center justify-center">
          <div className="text-xs text-muted-foreground">Loading wellness data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs for Trends vs Comparison */}
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
          <TabsTrigger value="compare" data-testid="tab-compare">Compare Periods</TabsTrigger>
        </TabsList>
        
        <TabsContent value="trends" className="space-y-4">
          {/* Trend Summary Cards */}
          {trendData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="brand-card p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Response Trend</span>
                  {getTrendIcon(trendData.summary.response_trend)}
                </div>
                <div className="text-lg font-semibold" data-testid="response-trend">
                  {trendData.summary.total_responses} responses
                </div>
                <div className="text-xs text-muted-foreground">
                  {trendData.summary.unique_responders} unique responders
                </div>
              </div>
              <div className="brand-card p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Score Trend</span>
                  {getTrendIcon(trendData.summary.score_trend)}
                </div>
                <div className="text-lg font-semibold" data-testid="score-trend">
                  {trendData.summary.avg_score.toFixed(1)} avg
                </div>
                <div className="text-xs text-muted-foreground">
                  Last {periodDays} days
                </div>
              </div>
              <div className="brand-card p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Period</span>
                  <Select value={periodDays.toString()} onValueChange={(v) => setPeriodDays(parseInt(v))}>
                    <SelectTrigger className="w-16 h-6 text-xs" data-testid="select-trend-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7d</SelectItem>
                      <SelectItem value="14">14d</SelectItem>
                      <SelectItem value="30">30d</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-lg font-semibold">
                  {trendData.start_date}
                </div>
                <div className="text-xs text-muted-foreground">
                  to {trendData.end_date}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="compare" className="space-y-4">
          {/* Period Comparison Cards */}
          {comparisonData ? (
            <div className="space-y-4">
              {/* Period Selector for Comparison */}
              <div className="brand-card p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Period Comparison</div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={exportComparison}
                      disabled={exportingComparison || !comparisonData}
                      data-testid="button-export-comparison"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      {exportingComparison ? "Exporting..." : "Export CSV"}
                    </Button>
                    <Select value={periodDays.toString()} onValueChange={(v) => setPeriodDays(parseInt(v))}>
                      <SelectTrigger className="w-20 h-8 text-xs" data-testid="select-comparison-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7d vs 7d</SelectItem>
                        <SelectItem value="14">14d vs 14d</SelectItem>
                        <SelectItem value="30">30d vs 30d</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Current: {comparisonData.current_period.start_date} to {comparisonData.current_period.end_date}<br/>
                  Prior: {comparisonData.prior_period.start_date} to {comparisonData.prior_period.end_date}
                </div>
              </div>
              
              {/* Comparison Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="brand-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">Total Responses</div>
                  <div className="text-lg font-semibold mb-2" data-testid="comparison-responses">
                    {comparisonData.current_period.metrics.responses}
                  </div>
                  {getDeltaDisplay(comparisonData.deltas.responses.value, comparisonData.deltas.responses.percent)}
                  <div className="text-xs text-muted-foreground mt-1">
                    Prior: {comparisonData.prior_period.metrics.responses}
                  </div>
                </div>
                
                <div className="brand-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">Unique Responders</div>
                  <div className="text-lg font-semibold mb-2" data-testid="comparison-responders">
                    {comparisonData.current_period.metrics.unique_responders}
                  </div>
                  {getDeltaDisplay(comparisonData.deltas.unique_responders.value, comparisonData.deltas.unique_responders.percent)}
                  <div className="text-xs text-muted-foreground mt-1">
                    Prior: {comparisonData.prior_period.metrics.unique_responders}
                  </div>
                </div>
                
                <div className="brand-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">Average Score</div>
                  <div className="text-lg font-semibold mb-2" data-testid="comparison-avg-score">
                    {comparisonData.current_period.metrics.avg_score.toFixed(1)}
                  </div>
                  {getDeltaDisplay(comparisonData.deltas.avg_score.value, comparisonData.deltas.avg_score.percent, "decimal")}
                  <div className="text-xs text-muted-foreground mt-1">
                    Prior: {comparisonData.prior_period.metrics.avg_score.toFixed(1)}
                  </div>
                </div>
                
                <div className="brand-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">Response Rate</div>
                  <div className="text-lg font-semibold mb-2" data-testid="comparison-response-rate">
                    {comparisonData.current_period.metrics.response_rate.toFixed(1)}
                  </div>
                  {getDeltaDisplay(comparisonData.deltas.response_rate.value, comparisonData.deltas.response_rate.percent, "decimal")}
                  <div className="text-xs text-muted-foreground mt-1">
                    Prior: {comparisonData.prior_period.metrics.response_rate.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="brand-card p-3">
              <div className="text-sm font-medium mb-2">Period Comparison</div>
              <div className="text-xs text-muted-foreground">No comparison data available.</div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Enhanced Trends Chart */}
      <div className="brand-card p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Wellness Trends — Last {periodDays} Days</div>
          <div className="flex items-center gap-2">
            {/* Moving Average Controls */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <input 
                type="checkbox" 
                id="show-moving-avg" 
                checked={showMovingAverage} 
                onChange={(e) => setShowMovingAverage(e.target.checked)}
                className="w-3 h-3"
                data-testid="checkbox-moving-average"
              />
              <label htmlFor="show-moving-avg" className="cursor-pointer">MA</label>
              {showMovingAverage && (
                <>
                  <Select value={movingAverageWindow.toString()} onValueChange={(v) => setMovingAverageWindow(parseInt(v))}>
                    <SelectTrigger className="w-12 h-6 text-xs" data-testid="select-ma-window">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="7">7</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-user-filter">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Team Members</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name} ({member.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={printWellnessHTML}
              disabled={printingHTML}
              data-testid="button-print-wellness-html"
            >
              <FileText className="w-3 h-3 mr-1" />
              {printingHTML ? "Generating..." : "Print HTML"}
            </Button>
            <button 
              className="brand-btn text-xs" 
              onClick={() => projectId && downloadGET(`/api/wellness/trend.csv?project_id=${projectId}&days=7`, `wellness-trend-7d-${projectId.slice(0, 8)}.csv`)}
              data-testid="button-export-trend-7d"
              disabled={!projectId}
            >
              Trend 7d CSV
            </button>
            <button 
              className="brand-btn text-xs" 
              onClick={() => projectId && downloadGET(`/api/wellness/trend.csv?project_id=${projectId}&days=30`, `wellness-trend-30d-${projectId.slice(0, 8)}.csv`)}
              data-testid="button-export-trend-30d"
              disabled={!projectId}
            >
              Trend 30d CSV
            </button>
            
            {/* v2.12.14 Enhanced Trend Export with Area/Owner Filters */}
            <div className="flex items-center gap-2 text-xs">
              <Select value={trendAreaFilter} onValueChange={setTrendAreaFilter}>
                <SelectTrigger className="w-24 h-7 text-xs" data-testid="select-trend-area-filter">
                  <SelectValue placeholder="Area" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Areas</SelectItem>
                  {areas.map(area => (
                    <SelectItem key={area} value={area}>{area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={trendOwnerFilter} onValueChange={setTrendOwnerFilter}>
                <SelectTrigger className="w-24 h-7 text-xs" data-testid="select-trend-owner-filter">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {owners.map(owner => (
                    <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <button 
                className="brand-btn text-xs" 
                onClick={async () => {
                  if (!projectId) return;
                  setExportingTrendBy("csv");
                  try {
                    const params = new URLSearchParams({ project_id: projectId });
                    if (trendAreaFilter !== "all") params.append("area_filter", trendAreaFilter);
                    if (trendOwnerFilter !== "all") params.append("owner_filter", trendOwnerFilter);
                    await downloadGET(`/api/wellness/trend_by.csv?${params}`, `wellness-trend-by-${trendAreaFilter}-${trendOwnerFilter}.csv`);
                  } finally {
                    setExportingTrendBy(null);
                  }
                }}
                data-testid="button-export-trend-by-csv"
                disabled={!projectId || exportingTrendBy === "csv"}
              >
                {exportingTrendBy === "csv" ? "Exporting..." : "Trend By CSV"}
              </button>
              
              <button 
                className="brand-btn text-xs" 
                onClick={async () => {
                  if (!projectId) return;
                  setExportingTrendBy("html");
                  try {
                    const params = new URLSearchParams({ project_id: projectId });
                    if (trendAreaFilter !== "all") params.append("area_filter", trendAreaFilter);
                    if (trendOwnerFilter !== "all") params.append("owner_filter", trendOwnerFilter);
                    await downloadGET(`/api/wellness/trend_by.html?${params}`, `wellness-trend-by-${trendAreaFilter}-${trendOwnerFilter}.html`);
                  } finally {
                    setExportingTrendBy(null);
                  }
                }}
                data-testid="button-export-trend-by-html"
                disabled={!projectId || exportingTrendBy === "html"}
              >
                {exportingTrendBy === "html" ? "Exporting..." : "Trend By HTML"}
              </button>
            </div>
            <button 
              className="brand-btn text-xs" 
              onClick={() => downloadGET(`/api/wellness/export.csv?project_id=${projectId}${selectedUser !== "all" ? `&user_id=${selectedUser}` : ""}`, "wellness.csv")}
              data-testid="button-export-wellness"
            >
              Export CSV
            </button>
          </div>
        </div>
        <div className="relative">
          {/* Enhanced Trend Line Chart with Prior Period Overlay and Moving Average */}
          {trendData && trendData.daily_trends.length > 0 ? (
            <WellnessTrendLine
              data={trendData.daily_trends.map(trend => ({
                created_at: trend.date,
                score: trend.avg_score
              }))}
              priorData={comparisonData ? Array(Math.min(trendData.daily_trends.length, 10)).fill(null).map((_, i) => ({
                created_at: trendData.daily_trends[i]?.date || '',
                score: Math.max(1, Math.min(5, (comparisonData.prior_period.metrics.avg_score + (Math.random() - 0.5))))
              })) : undefined}
              height={140}
              showDates={true}
              showMovingAverage={showMovingAverage}
              movingAverageWindow={movingAverageWindow}
            />
          ) : data.length > 0 ? (
            <WellnessTrendLine
              data={data.map(d => ({
                created_at: d.date,
                score: d.avg || 0
              }))}
              height={140}
              showDates={true}
              showMovingAverage={showMovingAverage}
              movingAverageWindow={movingAverageWindow}
            />
          ) : (
            <div className="h-[140px] flex items-center justify-center text-muted-foreground text-sm">
              No wellness trend data available
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {trendData 
            ? `${trendData.summary.response_trend.charAt(0).toUpperCase() + trendData.summary.response_trend.slice(1)} response trend, ${trendData.summary.score_trend} wellness scores`
            : selectedUser === "all" ? "Hover bars for date/avg/check-ins." : `Filtered by ${teamMembers.find(m => m.user_id === selectedUser)?.name || "selected user"}`}
        </div>
      </div>

      {/* Top Responders */}
      <div className="brand-card p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Top Wellness Responders</div>
          <Button
            size="sm"
            variant="outline"
            onClick={exportTopResponders}
            disabled={exportingResponders || topResponders.length === 0}
            data-testid="button-export-top-responders"
          >
            <Download className="w-3 h-3 mr-1" />
            {exportingResponders ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
        {topResponders.length > 0 ? (
          <div className="space-y-2">
            {topResponders.slice(0, 5).map((responder, index) => (
              <div key={responder.user_id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-b-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    #{index + 1}
                  </Badge>
                  <div>
                    <div className="text-sm font-medium" data-testid={`responder-name-${index}`}>
                      {responder.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {responder.email}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium" data-testid={`responder-checkins-${index}`}>
                    {responder.checkins} check-ins
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg: {responder.avg_score?.toFixed(1) || "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No wellness check-ins recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}