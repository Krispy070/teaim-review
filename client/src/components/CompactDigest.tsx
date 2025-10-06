import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, MapPin, BarChart3 } from "lucide-react";
import { useOrg } from "@/App";

interface CompactDigestData {
  project_code: string;
  project_title: string;
  period_days: number;
  counts: {
    actions: number;
    risks: number;
    decisions: number;
  };
  overdue_signoffs: Array<{ title: string; requested_at: string }>;
  recent_by_area: Record<string, { actions: number; risks: number; decisions: number }>;
  recent_by_owner: Record<string, { actions: number; risks: number; decisions: number }>;
  total_activity: number;
}

interface ChipProps {
  label: string;
  count: number;
  type: "actions" | "risks" | "decisions";
  filter?: string;
  filterValue?: string;
}

function ActivityChip({ label, count, type, filter, filterValue }: ChipProps) {
  // Generate deep link query parameters for Actions page
  const generateQuery = () => {
    const params = new URLSearchParams();
    
    // Set status filter based on type (for actions only)
    if (type === "actions") {
      // Don't set specific status, show all actions
    }
    
    // Add additional filters
    if (filter === "area" && filterValue) {
      params.set("area", filterValue);
    } else if (filter === "owner" && filterValue) {
      params.set("owner", filterValue);
    }
    
    params.set("openFilters", "1");
    
    return params.toString();
  };

  // Determine target page based on type
  const getTargetPage = () => {
    if (type === "actions") {
      return `/actions?${generateQuery()}`;
    } else {
      // For risks and decisions, continue linking to timeline 
      const params = new URLSearchParams();
      if (type === "risks") params.set("tab", "risks");
      else if (type === "decisions") params.set("tab", "decisions");
      
      if (filter === "area" && filterValue) {
        params.set("area", filterValue);
      } else if (filter === "owner" && filterValue) {
        params.set("owner", filterValue);
      }
      params.set("openFilters", "1");
      
      return `/timeline#${params.toString()}`;
    }
  };

  if (count === 0) return null;

  const colors = {
    actions: "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200",
    risks: "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200",
    decisions: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200"
  };

  return (
    <Link 
      href={getTargetPage()}
      data-testid={`digest-chip-${type}-${filter || 'total'}-${filterValue || 'all'}`}
    >
      <Badge 
        variant="secondary" 
        className={`cursor-pointer transition-colors ${colors[type]} border`}
      >
        {label}: <strong>{count}</strong>
      </Badge>
    </Link>
  );
}

export default function CompactDigest({ projectId }: { projectId: string }) {
  const { orgId } = useOrg();
  const [data, setData] = useState<CompactDigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const load = async () => {
    if (!orgId) return; // Don't load if no orgId available
    setLoading(true);
    try {
      const result = await getJSON(`/api/digest/compact?project_id=${projectId}&days=${days}&org_id=${orgId}`);
      setData(result);
    } catch (error) {
      console.error("Failed to load compact digest:", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId && orgId) {
      load();
    }
  }, [projectId, orgId, days]);

  if (loading) {
    return (
      <Card data-testid="compact-digest-loading">
        <CardContent className="p-4">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card data-testid="compact-digest-error">
        <CardContent className="p-4 text-center text-muted-foreground">
          Unable to load digest data
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="compact-digest">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Recent Changes
          <Badge variant="outline" className="ml-auto">
            Last {data.period_days} days
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period selector */}
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d)}
              data-testid={`digest-period-${d}`}
            >
              {d}d
            </Button>
          ))}
        </div>

        {/* Main activity summary */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-medium">Activity Summary</h4>
            <Badge variant="secondary">{data.total_activity} total</Badge>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <ActivityChip label="Actions" count={data.counts.actions} type="actions" />
            <ActivityChip label="Risks" count={data.counts.risks} type="risks" />
            <ActivityChip label="Decisions" count={data.counts.decisions} type="decisions" />
            
            {data.total_activity === 0 && (
              <div className="text-sm text-muted-foreground py-2">
                No activity in the last {data.period_days} days
              </div>
            )}
          </div>
        </div>

        {/* By Area breakdown */}
        {Object.keys(data.recent_by_area).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <h4 className="font-medium">By Area</h4>
            </div>
            
            <div className="space-y-1">
              {Object.entries(data.recent_by_area)
                .filter(([, counts]) => (counts.actions + counts.risks + counts.decisions) > 0)
                .map(([area, counts]) => (
                  <div key={area} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{area}</span>
                    <div className="flex gap-1">
                      <ActivityChip label="A" count={counts.actions} type="actions" filter="area" filterValue={area} />
                      <ActivityChip label="R" count={counts.risks} type="risks" filter="area" filterValue={area} />
                      <ActivityChip label="D" count={counts.decisions} type="decisions" filter="area" filterValue={area} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* By Owner breakdown */}
        {Object.keys(data.recent_by_owner).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <h4 className="font-medium">By Owner</h4>
            </div>
            
            <div className="space-y-1">
              {Object.entries(data.recent_by_owner)
                .filter(([, counts]) => (counts.actions + counts.risks + counts.decisions) > 0)
                .slice(0, 5) // Show top 5 owners
                .map(([owner, counts]) => (
                  <div key={owner} className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate" title={owner}>
                      {owner.split('@')[0] || owner}
                    </span>
                    <div className="flex gap-1">
                      <ActivityChip label="A" count={counts.actions} type="actions" filter="owner" filterValue={owner} />
                      <ActivityChip label="R" count={counts.risks} type="risks" filter="owner" filterValue={owner} />
                      <ActivityChip label="D" count={counts.decisions} type="decisions" filter="owner" filterValue={owner} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Overdue signoffs */}
        {data.overdue_signoffs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <h4 className="font-medium text-orange-600 dark:text-orange-400">Overdue Sign-offs</h4>
              <Badge variant="destructive">{data.overdue_signoffs.length}</Badge>
            </div>
            
            <div className="space-y-1">
              {data.overdue_signoffs.map((signoff, idx) => (
                <div key={idx} className="text-sm text-orange-600 dark:text-orange-400">
                  • {signoff.title} (requested {new Date(signoff.requested_at).toLocaleDateString()})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View full timeline link */}
        <div className="pt-2 border-t">
          <Link href="/timeline">
            <Button variant="outline" size="sm" className="w-full" data-testid="view-full-timeline">
              View Full Timeline →
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}