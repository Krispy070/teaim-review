import { TrendingUp, CheckSquare, Zap, Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  subtitle?: string;
  progress?: number;
}

function KPICard({ title, value, icon: Icon, iconColor, subtitle, progress }: KPICardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-foreground" data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              {value}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconColor}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-4 w-full bg-secondary rounded-full h-2">
            <div 
              className="progress-line h-2 rounded-full" 
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {subtitle && (
          <p className="mt-4 text-sm text-muted-foreground" data-testid={`kpi-subtitle-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function KPICards() {
  const kpis = [
    {
      title: "Project Progress",
      value: "65%",
      icon: TrendingUp,
      iconColor: "bg-accent/20 text-accent",
      progress: 65,
    },
    {
      title: "Active Actions",
      value: 23,
      icon: CheckSquare,
      iconColor: "bg-chart-3/20 text-orange-400",
      subtitle: "3 overdue • 20 on track",
    },
    {
      title: "Integrations",
      value: "8/12",
      icon: Zap,
      iconColor: "bg-chart-2/20 text-emerald-400",
      subtitle: "4 in progress",
    },
    {
      title: "Team Health",
      value: "Good",
      icon: Heart,
      iconColor: "bg-accent/20 text-accent",
      subtitle: "Based on 15 responses",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {kpis.map((kpi) => (
        <KPICard key={kpi.title} {...kpi} />
      ))}
    </div>
  );
}
