import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "../App";
import { useAreaUpdates } from "../hooks/useAreaUpdates";
import { Badge } from "@/components/ui/badge";

interface AreaChipsProps {
  currentArea?: string;
  className?: string;
}

export default function AreaChips({ currentArea, className = "" }: AreaChipsProps) {
  const navigate = useNavigate();
  const params = useParams();
  const org = useOrg();
  const projectId = params.projectId || org?.projectId;

  // Query for areas to show available chips
  const { data: areasData, isLoading } = useQuery({
    queryKey: [`/api/areas/summary_all?project_id=${projectId}`],
    enabled: !!projectId,
  });

  // Get area updates for showing notification dots
  const { hasAreaUpdates, markAreaAsSeen } = useAreaUpdates({ projectId });

  const handleAreaClick = (areaName: string) => {
    if (projectId) {
      // Only mark as seen if we have comment data available to avoid race conditions
      const areaWithComments = areas.find((area: any) => area.area === areaName);
      if (areaWithComments) {
        markAreaAsSeen(areaName);
      }
      // Navigate regardless - WorkstreamArea will handle marking as seen with proper data
      navigate(`/projects/${projectId}/workstreams/${encodeURIComponent(areaName)}`);
    }
  };

  const areas = (areasData as any)?.items || [];
  
  if (isLoading || !areas.length) {
    return null;
  }

  return (
    <div className={`flex flex-wrap gap-2 mb-4 ${className}`} data-testid="area-chips">
      {areas.map((area: any) => {
        const isActive = currentArea === area.area;
        const hasUpdates = hasAreaUpdates(area.area);
        
        return (
          <button
            key={area.area}
            onClick={() => handleAreaClick(area.area)}
            className={`
              inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium 
              transition-colors border
              ${isActive 
                ? 'bg-primary text-primary-foreground border-primary' 
                : 'bg-background text-foreground border-border hover:bg-muted'
              }
            `}
            data-testid={`area-chip-${area.area.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <span>{area.area}</span>
            
            {/* Show metrics/counts */}
            {area.actions_count > 0 && (
              <Badge variant="secondary" className="text-xs">
                {area.actions_count}
              </Badge>
            )}
            
            {/* Show update dot if there are new comments */}
            {hasUpdates && (
              <span 
                className="w-2 h-2 bg-red-500 rounded-full" 
                data-testid={`update-dot-${area.area.toLowerCase().replace(/\s+/g, '-')}`}
                title="New activity"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}