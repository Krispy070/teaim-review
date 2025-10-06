import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ChevronDown, ChevronUp, Mail, Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface QueueStatus {
  queue_lengths: {
    reindex_pending: number;
    reindex_running: number;
  };
  scheduler: {
    status: string;
    last_heartbeat: string | null;
    heartbeat_age_seconds: number | null;
  };
  timestamp: string;
  error?: string;
}

interface CommsQueueItem {
  id: string;
  kind: string;
  to_email: string;
  to_token?: string;
  not_before: string;
  sent_at?: string;
  created_at: string;
  error_count?: number;
  last_error?: string;
  details?: any;
}

interface CommsQueueData {
  items: CommsQueueItem[];
  total: number;
  retry_metrics: {
    daily_retries: Array<{date: string; retries: number; total: number}>;
    retry_by_kind: Array<{kind: string; retries: number; total: number}>;
  };
  timestamp: string;
  error?: string;
}

export default function AdminOps() {
  const [expandedQueue, setExpandedQueue] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  
  const { data: queueStatus, isLoading, failureCount: queueFailures } = useQuery({
    queryKey: ['/api/queue/status'],
    refetchInterval: () => {
      // Exponential backoff based on failure count
      const failureCount = queueFailures || 0;
      if (failureCount === 0) return 10000; // Normal 10 seconds
      return Math.min(10000 * Math.pow(2, failureCount), 120000); // Max 2 minutes
    },
    refetchIntervalInBackground: false, // Don't poll when tab hidden
    retry: (failureCount: number) => {
      // Retry up to 3 times, then stop
      return failureCount < 3;
    },
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential delay
  });

  const { data: commsQueueData, isLoading: isLoadingComms, failureCount: commsFailures } = useQuery({
    queryKey: ['/api/ops/comms_queue', selectedStatus],
    queryFn: async () => {
      const statusParam = selectedStatus !== "all" ? `&status=${selectedStatus}` : "";
      const response = await fetch(`/api/ops/comms_queue?limit=20${statusParam}`);
      if (!response.ok) throw new Error('Failed to fetch communications queue');
      return response.json() as Promise<CommsQueueData>;
    },
    refetchInterval: () => {
      // Less aggressive polling for secondary data
      const failureCount = commsFailures || 0;
      if (failureCount === 0) return 30000; // Normal 30 seconds
      return Math.min(30000 * Math.pow(2, failureCount), 300000); // Max 5 minutes
    },
    refetchIntervalInBackground: false,
    enabled: expandedQueue, // Only fetch when expanded
    retry: 2, // Fewer retries for less critical data
    retryDelay: (attemptIndex: number) => Math.min(2000 * 2 ** attemptIndex, 60000),
  });

  if (isLoading) {
    return (
      <div className="p-4 border rounded bg-slate-900 border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Admin Operations</h3>
        <div className="text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  const status = queueStatus as QueueStatus;
  if (!status) {
    return (
      <div className="p-4 border rounded bg-slate-900 border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Admin Operations</h3>
        <div className="text-sm text-slate-400">Queue status unavailable</div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'unhealthy': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const formatHeartbeatAge = (seconds: number | null) => {
    if (!seconds) return 'Never';
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getQueueItemStatus = (item: CommsQueueItem) => {
    if (item.sent_at) return "sent";
    if (item.error_count && item.error_count > 0) return "error";
    const now = new Date();
    const notBefore = new Date(item.not_before);
    return now >= notBefore ? "due" : "pending";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent": return <Badge variant="secondary" className="bg-green-900/20 text-green-400"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
      case "error": return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Error</Badge>;
      case "due": return <Badge variant="destructive"><Clock className="w-3 h-3 mr-1" />Due</Badge>;
      case "pending": return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-ops-panel">
      {/* Basic Queue Status */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">System Operations</CardTitle>
        </CardHeader>
        <CardContent>
          {status?.error && (
            <div className="mb-4 p-2 bg-yellow-900/20 border border-yellow-700 rounded text-yellow-400 text-sm">
              Note: {status.error.includes('table') ? 'Database tables not yet available' : status.error}
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Queue Lengths</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Reindex Pending:</span>
                  <span className="font-mono" data-testid="queue-reindex-pending">{status?.queue_lengths.reindex_pending || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reindex Running:</span>
                  <span className="font-mono" data-testid="queue-reindex-running">{status?.queue_lengths.reindex_running || 0}</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Scheduler Status</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className={`font-medium ${getStatusColor(status?.scheduler.status || 'unknown')}`} data-testid="scheduler-status">
                    {(status?.scheduler.status || 'unknown').toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Heartbeat:</span>
                  <span className="font-mono text-xs" data-testid="scheduler-heartbeat">
                    {formatHeartbeatAge(status?.scheduler.heartbeat_age_seconds)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center">
            <div className="text-xs text-slate-500">
              Updated: {status ? new Date(status.timestamp).toLocaleTimeString() : '--'}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedQueue(!expandedQueue)}
              className="text-xs"
              data-testid="button-toggle-comms-queue"
            >
              {expandedQueue ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              Communications Queue
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Communications Queue Details */}
      {expandedQueue && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Communications Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
                <TabsTrigger value="due" data-testid="tab-due">Due</TabsTrigger>
                <TabsTrigger value="sent" data-testid="tab-sent">Sent</TabsTrigger>
              </TabsList>
              
              <TabsContent value={selectedStatus} className="mt-4">
                {isLoadingComms ? (
                  <div className="text-center py-4 text-slate-400">Loading communications queue...</div>
                ) : commsQueueData?.error ? (
                  <div className="text-center py-4 text-red-400">Error: {commsQueueData.error}</div>
                ) : commsQueueData && commsQueueData.items.length > 0 ? (
                  <div className="space-y-4">
                    {/* Queue Items List */}
                    <div className="space-y-3">
                      {commsQueueData.items.map((item) => (
                        <div key={item.id} className="border border-slate-600 rounded p-3 bg-slate-800/50" data-testid={`queue-item-${item.id}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-200">{item.kind}</span>
                              {getStatusBadge(getQueueItemStatus(item))}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatTime(item.created_at)}
                            </div>
                          </div>
                          <div className="text-sm text-slate-400 space-y-1">
                            <div>To: {item.to_email}</div>
                            <div>Due: {formatTime(item.not_before)}</div>
                            {item.sent_at && <div>Sent: {formatTime(item.sent_at)}</div>}
                            {item.error_count && item.error_count > 0 && (
                              <div className="text-red-400">Retries: {item.error_count}</div>
                            )}
                            {item.last_error && (
                              <div className="text-red-400 text-xs">Last Error: {item.last_error}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Retry Metrics Charts */}
                    {commsQueueData.retry_metrics && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 pt-4 border-t border-slate-700">
                        <div>
                          <h4 className="text-sm font-medium text-slate-300 mb-3">Daily Retries (Last 7 Days)</h4>
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={commsQueueData.retry_metrics.daily_retries}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
                              <YAxis stroke="#9CA3AF" fontSize={12} />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: '#1E293B', 
                                  border: '1px solid #475569',
                                  borderRadius: '6px'
                                }}
                              />
                              <Bar dataKey="retries" fill="#EF4444" />
                              <Bar dataKey="total" fill="#3B82F6" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium text-slate-300 mb-3">Retries by Type</h4>
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={commsQueueData.retry_metrics.retry_by_kind}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                dataKey="retries"
                                nameKey="kind"
                              >
                                {commsQueueData.retry_metrics.retry_by_kind.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={`hsl(${index * 45}, 70%, 50%)`} />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: '#1E293B', 
                                  border: '1px solid #475569',
                                  borderRadius: '6px'
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400">No queue items found</div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}