import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Clock, AlertCircle, Shield, CheckCircle } from 'lucide-react';
import { useParams } from 'wouter';

interface SchedulerHealthData {
  queue: {
    due: number;
    total: number;
  };
  tokens_revoked_today: number;
}

export function SchedulerHealthCard() {
  const params = useParams<{projectId: string}>();
  const projectId = params.projectId || "";
  const [data, setData] = useState<SchedulerHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHealth = async () => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`/api/ops/scheduler_health?project_id=${projectId}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const result = await response.json();
        setData(result);
        setError(false);
      } else {
        setError(true);
      }
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [projectId]);

  if (loading) {
    return (
      <Card data-testid="scheduler-health-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-4 text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="scheduler-health-card" className="border-orange-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-4 text-muted-foreground">
          Health data unavailable
        </CardContent>
      </Card>
    );
  }

  const queueStatus = data.queue.due === 0 ? 'healthy' : 'attention';
  const queueColor = queueStatus === 'healthy' ? 'text-green-600' : 'text-orange-600';
  const QueueIcon = queueStatus === 'healthy' ? CheckCircle : Clock;

  return (
    <Card data-testid="scheduler-health-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4" />
          System Health
        </CardTitle>
        <CardDescription className="text-xs">
          Scheduler and queue status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QueueIcon className={`h-4 w-4 ${queueColor}`} />
            <span className="text-sm font-medium">Queue</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold" data-testid="queue-due-count">
              {data.queue.due} due
            </div>
            <div className="text-xs text-muted-foreground" data-testid="queue-total-count">
              {data.queue.total} total
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium">Security</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold" data-testid="tokens-revoked-count">
              {data.tokens_revoked_today}
            </div>
            <div className="text-xs text-muted-foreground">
              tokens revoked today
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Updates every 30s
        </div>
      </CardContent>
    </Card>
  );
}