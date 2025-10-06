import { Users, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Workstream {
  name: string;
  status: "On Track" | "At Risk" | "Complete";
  progress: number;
  team: string[];
  dueDate: string;
  statusColor: string;
  progressColor: string;
}

export default function WorkstreamsGrid() {
  const workstreams: Workstream[] = [
    {
      name: "HCM Core",
      status: "On Track",
      progress: 78,
      team: ["Sarah Chen", "Mike Rodriguez"],
      dueDate: "Feb 15, 2024",
      statusColor: "bg-accent/20 text-accent",
      progressColor: "bg-accent",
    },
    {
      name: "Payroll",
      status: "At Risk",
      progress: 45,
      team: ["David Kim", "Lisa Wang"],
      dueDate: "Feb 28, 2024",
      statusColor: "bg-chart-3/20 text-orange-400",
      progressColor: "bg-chart-3",
    },
    {
      name: "Benefits",
      status: "On Track",
      progress: 62,
      team: ["Jennifer Adams"],
      dueDate: "Mar 15, 2024",
      statusColor: "bg-accent/20 text-accent",
      progressColor: "bg-accent",
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
      {workstreams.map((workstream, index) => (
        <Card key={index}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold" data-testid={`workstream-name-${index}`}>
                {workstream.name}
              </h4>
              <Badge className={workstream.statusColor} data-testid={`workstream-status-${index}`}>
                {workstream.status}
              </Badge>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="text-sm font-medium" data-testid={`workstream-progress-${index}`}>
                  {workstream.progress}%
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-1.5">
                <div 
                  className={`${workstream.progressColor} h-1.5 rounded-full transition-all`}
                  style={{ width: `${workstream.progress}%` }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground" data-testid={`workstream-team-${index}`}>
                  {workstream.team.join(", ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground" data-testid={`workstream-due-${index}`}>
                  Due: {workstream.dueDate}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
