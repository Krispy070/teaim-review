import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, TrendingUp } from "lucide-react";

export default function WellnessMatrix() {
  // Mock wellness data - in production this would come from API
  const wellnessData = [
    { day: 0, level: 0.4 }, // Monday
    { day: 1, level: 0.6 }, // Tuesday
    { day: 2, level: 0.8 }, // Wednesday
    { day: 3, level: 0.6 }, // Thursday
    { day: 4, level: 0.4 }, // Friday
    { day: 5, level: 0.7 }, // Saturday
    { day: 6, level: 0.5 }, // Sunday
  ];

  const getWellnessColor = (level: number) => {
    if (level >= 0.8) return "bg-accent/80";
    if (level >= 0.6) return "bg-accent/60";
    if (level >= 0.4) return "bg-accent/40";
    return "bg-chart-3/60";
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" data-testid="wellness-title">Team Wellness</h3>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Anonymous</span>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">This Week</span>
              <span className="text-sm font-medium text-accent" data-testid="wellness-status">
                Good
              </span>
            </div>
            <div className="wellness-grid">
              {wellnessData.map((day, index) => (
                <div 
                  key={index}
                  className={`wellness-cell ${getWellnessColor(day.level)}`}
                  data-testid={`wellness-cell-${index}`}
                />
              ))}
            </div>
          </div>
          
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Trend</span>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-accent" />
                <span className="text-xs text-accent" data-testid="wellness-trend">+5%</span>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Responses</span>
                <span data-testid="wellness-responses">15/18 team members</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avg. sentiment</span>
                <span className="text-accent" data-testid="wellness-sentiment">Positive</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
