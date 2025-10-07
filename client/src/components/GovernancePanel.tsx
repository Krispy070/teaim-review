import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface CadenceMeeting {
  id: number;
  name: string;
  at: string;
}

interface CadenceResponse {
  ok: boolean;
  items: CadenceMeeting[];
}

export function GovernancePanel() {
  const { data: response, isLoading } = useQuery<CadenceResponse>({
    queryKey: ['/api/ma/cadences/upcoming']
  });
  
  const cadences = response?.items || [];

  const handleDownloadCal = () => {
    window.open('/api/ma/cadences/ics', '_blank');
  };

  if (isLoading) {
    return (
      <Card title="Governance Cadence">
        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
          Loading...
        </div>
      </Card>
    );
  }

  if (!cadences || cadences.length === 0) {
    return (
      <Card title="Governance Cadence">
        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
          No governance meetings scheduled
        </div>
      </Card>
    );
  }

  return (
    <Card 
      title="Governance Cadence"
      actions={
        <Button 
          size="sm" 
          variant="ghost"
          onClick={handleDownloadCal}
          data-testid="button-download-calendar"
        >
          <Download className="h-4 w-4 mr-1" />
          Calendar
        </Button>
      }
    >
      <ul className="space-y-3" data-testid="list-governance-cadences">
        {cadences.slice(0, 5).map((c) => {
          const nextDate = new Date(c.at);
          const isToday = nextDate.toDateString() === new Date().toDateString();
          
          return (
            <li 
              key={c.id} 
              className="flex items-center justify-between rounded-lg bg-panelc px-3 py-2"
              data-testid={`cadence-item-${c.id}`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span data-testid={`text-cadence-name-${c.id}`}>{c.name}</span>
              </div>
              <span 
                className={`text-xs rounded-full px-2 py-0.5 border ${
                  isToday 
                    ? 'bg-warning/15 text-warning border-warning/20' 
                    : 'bg-panel border-border'
                }`}
                data-testid={`text-cadence-date-${c.id}`}
              >
                {nextDate.toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
