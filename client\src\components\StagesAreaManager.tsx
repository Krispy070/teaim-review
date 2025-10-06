import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Calendar, ArrowUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Stage {
  id: string;
  title: string;
  area: string | null;
  start_date?: string;
  end_date?: string;
  status: string;
  sort_index?: number;
}

interface StageGroup {
  [area: string]: Stage[];
}

export default function StagesAreaManager() {
  const { projectId } = useParams();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftWeeks, setShiftWeeks] = useState<{[area: string]: number}>({});
  const [shifting, setShifting] = useState<{[area: string]: boolean}>({});
  const { toast } = useToast();

  useEffect(() => {
    loadStages();
  }, [projectId]);

  const loadStages = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const response = await getJSON<{stages: Stage[]}>(`/api/stages/list?project_id=${projectId}`);
      setStages(response.stages || []);
    } catch (error) {
      console.error("Failed to load stages:", error);
      setStages([]);
    } finally {
      setLoading(false);
    }
  };

  // Group stages by area
  const groupedStages: StageGroup = stages.reduce((groups, stage) => {
    const area = stage.area || "Unassigned";
    if (!groups[area]) {
      groups[area] = [];
    }
    groups[area].push(stage);
    return groups;
  }, {} as StageGroup);

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: {[key: string]: string} = {
      'pending': 'bg-gray-100 text-gray-700',
      'in_review': 'bg-orange-100 text-orange-700', 
      'signed_off': 'bg-green-100 text-green-700',
      'rejected': 'bg-red-100 text-red-700'
    };
    return (
      <Badge variant="secondary" className={variants[status] || 'bg-gray-100 text-gray-700'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const handleShiftWeeksChange = (area: string, value: string) => {
    const weeks = parseInt(value || '0', 10);
    setShiftWeeks(prev => ({...prev, [area]: weeks}));
  };

  const shiftAreaWeeks = async (area: string, weeks: number) => {
    if (!projectId || !weeks) return;
    
    setShifting(prev => ({...prev, [area]: true}));
    try {
      const response = await apiRequest(
        'POST',
        `/stages/shift_area_weeks?project_id=${projectId}`,
        {
          area,
          weeks
        }
      );

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Shifted",
          description: result.message || `${area}: start/end by ${weeks > 0 ? '+' + weeks : weeks} week(s)`
        });
        
        // Reload stages to reflect changes
        await loadStages();
        
        // Reset shift weeks input for this area
        setShiftWeeks(prev => ({...prev, [area]: 0}));
      } else {
        throw new Error(`Failed to shift stages: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to shift stages:", error);
      toast({
        title: "Error",
        description: "Failed to shift stage dates",
        variant: "destructive"
      });
    } finally {
      setShifting(prev => ({...prev, [area]: false}));
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stages by Area</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading stages...</div>
        </CardContent>
      </Card>
    );
  }

  if (stages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stages by Area</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No stages found.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4" />
            Stages by Area - Shift by Weeks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(groupedStages).map(([area, areaStages]) => (
              <div key={area} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-lg">{area}</h3>
                    <Badge variant="outline">{areaStages.length} stages</Badge>
                  </div>
                  
                  {/* Shift by weeks controls */}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground">ΔWeeks</label>
                    <Input
                      type="number"
                      className="w-[60px] h-8 text-xs"
                      value={shiftWeeks[area] || 0}
                      onChange={(e) => handleShiftWeeksChange(area, e.target.value)}
                      placeholder="0"
                      data-testid={`input-shift-weeks-${area}`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => shiftAreaWeeks(area, shiftWeeks[area] || 0)}
                      disabled={shifting[area] || !shiftWeeks[area]}
                      data-testid={`button-shift-weeks-${area}`}
                    >
                      {shifting[area] ? "Shifting..." : "Shift by weeks"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {areaStages.map((stage) => (
                    <div key={stage.id} className="flex items-center justify-between p-3 border rounded bg-card/50">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium text-sm" data-testid={`stage-title-${stage.id}`}>
                            {stage.title}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {getStatusBadge(stage.status)}
                            {stage.start_date && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span data-testid={`stage-start-${stage.id}`}>
                                  {formatDate(stage.start_date)}
                                </span>
                              </div>
                            )}
                            {stage.end_date && (
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span data-testid={`stage-end-${stage.id}`}>
                                  {formatDate(stage.end_date)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}