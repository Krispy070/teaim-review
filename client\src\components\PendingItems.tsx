import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PendingItem {
  title: string;
  assignee: string;
  status: "overdue" | "due-tomorrow" | "upcoming";
  statusText: string;
  statusColor: string;
}

export default function PendingItems() {
  const items: PendingItem[] = [
    {
      title: "Security review for ADP integration",
      assignee: "David Kim",
      status: "overdue",
      statusText: "Overdue by 2 days",
      statusColor: "bg-destructive",
    },
    {
      title: "Benefits enrollment testing",
      assignee: "Jennifer Adams",
      status: "due-tomorrow",
      statusText: "Due tomorrow",
      statusColor: "bg-chart-3",
    },
    {
      title: "Training materials review",
      assignee: "Sarah Chen",
      status: "upcoming",
      statusText: "Due in 3 days",
      statusColor: "bg-accent",
    },
  ];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" data-testid="pending-items-title">Pending Items</h3>
          <span className="text-sm text-muted-foreground" data-testid="pending-items-count">
            {items.length} items
          </span>
        </div>
        
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="flex items-start gap-3 p-3 border border-border rounded-md">
              <div className={`w-2 h-2 ${item.statusColor} rounded-full mt-2 flex-shrink-0`} />
              <div className="flex-1">
                <p className="text-sm font-medium" data-testid={`pending-item-title-${index}`}>
                  {item.title}
                </p>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-muted-foreground" data-testid={`pending-item-assignee-${index}`}>
                    Assigned: {item.assignee}
                  </span>
                  <span 
                    className={`text-xs ${
                      item.status === "overdue" 
                        ? "text-destructive" 
                        : item.status === "due-tomorrow" 
                        ? "text-orange-400" 
                        : "text-muted-foreground"
                    }`}
                    data-testid={`pending-item-status-${index}`}
                  >
                    {item.statusText}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button 
          variant="ghost" 
          className="w-full mt-4 text-primary hover:bg-primary/10"
          data-testid="view-all-pending-button"
        >
          View all pending items
        </Button>
      </CardContent>
    </Card>
  );
}
