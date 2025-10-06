import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, BellOff, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth } from "@/lib/supabase";

interface AlertSubscriber {
  id: string;
  userEmail: string;
  events: string[];
  email: boolean;
  slackWebhookId: string | null;
  digest: string;
  muteUntil: string | null;
}

export default function ProjectNotificationsPage() {
  const { toast } = useToast();
  const [, params] = useLocation();
  const projectId = new URLSearchParams(window.location.search).get("projectId") || "";
  const [projMute, setProjMute] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/alerts/users", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/alerts/users?projectId=${encodeURIComponent(projectId)}`);
      return res.json();
    },
    enabled: !!projectId
  });

  // Fetch project-level mute status
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const res = await fetch(`/api/alerts/project-snooze/status?projectId=${encodeURIComponent(projectId)}`);
        const j = await res.json();
        setProjMute(j.muteUntil || "");
      } catch (e) {
        console.error("Failed to fetch project mute status:", e);
      }
    })();
  }, [projectId]);

  const snoozeMutation = useMutation({
    mutationFn: async ({ userEmail, preset }: { userEmail: string; preset: string }) => {
      return apiRequest("/api/alerts/users/snooze", "POST", { projectId, userEmail, preset });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/users", projectId] });
      toast({ title: "Snooze updated" });
    },
    onError: () => {
      toast({ title: "Failed to update snooze", variant: "destructive" });
    }
  });

  const projectSnoozeMutation = useMutation({
    mutationFn: async (preset: string) => {
      return apiRequest("/api/alerts/project-snooze", "POST", { projectId, preset });
    },
    onSuccess: async () => {
      const res = await fetch(`/api/alerts/project-snooze/status?projectId=${encodeURIComponent(projectId)}`);
      const j = await res.json();
      setProjMute(j.muteUntil || "");
      toast({ title: "Project snooze updated" });
    },
    onError: () => {
      toast({ title: "Failed to update project snooze", variant: "destructive" });
    }
  });

  const handleUserSnooze = (userEmail: string, preset: string) => {
    snoozeMutation.mutate({ userEmail, preset });
  };

  const handleProjectSnooze = (preset: string) => {
    projectSnoozeMutation.mutate(preset);
  };

  if (isLoading) {
    return <div className="p-6">Loading notifications...</div>;
  }

  const subscribers = (data?.items || []) as AlertSubscriber[];
  const allEvents = data?.all || [];

  return (
    <div className="container max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            Alert Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who receives alert notifications for this project
          </p>
        </div>
      </div>

      {/* Project-level Snooze */}
      <Card data-testid="card-project-snooze">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Project-Level Snooze
          </CardTitle>
          <CardDescription>
            Temporarily mute all alerts for this project (affects all subscribers)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            {projMute ? (
              <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-project-muted">
                <Clock className="h-3 w-3" />
                Muted until {new Date(projMute).toLocaleString()}
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="badge-project-active">
                Project alerts active
              </Badge>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleProjectSnooze("1h")}
                disabled={projectSnoozeMutation.isPending}
                data-testid="button-project-snooze-1h"
              >
                Mute 1h
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleProjectSnooze("8h")}
                disabled={projectSnoozeMutation.isPending}
                data-testid="button-project-snooze-8h"
              >
                Mute 8h
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleProjectSnooze("24h")}
                disabled={projectSnoozeMutation.isPending}
                data-testid="button-project-snooze-24h"
              >
                Mute 24h
              </Button>
              {projMute && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleProjectSnooze("off")}
                  disabled={projectSnoozeMutation.isPending}
                  data-testid="button-project-unmute"
                >
                  Unmute
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscribers List */}
      <Card data-testid="card-subscribers">
        <CardHeader>
          <CardTitle>Alert Subscribers ({subscribers.length})</CardTitle>
          <CardDescription>
            Individual subscribers and their quick mute controls
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-subscribers">
              No alert subscribers configured for this project.
            </p>
          ) : (
            <div className="space-y-4">
              {subscribers.map((subscriber) => (
                <div
                  key={subscriber.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                  data-testid={`subscriber-${subscriber.userEmail}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" data-testid={`text-email-${subscriber.userEmail}`}>
                        {subscriber.userEmail}
                      </span>
                      <Badge variant="outline" data-testid={`badge-digest-${subscriber.userEmail}`}>
                        {subscriber.digest}
                      </Badge>
                      {subscriber.email && (
                        <Badge variant="secondary" data-testid={`badge-email-enabled-${subscriber.userEmail}`}>
                          Email
                        </Badge>
                      )}
                      {subscriber.slackWebhookId && (
                        <Badge variant="secondary" data-testid={`badge-slack-enabled-${subscriber.userEmail}`}>
                          Slack
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1" data-testid={`text-events-${subscriber.userEmail}`}>
                      Events: {subscriber.events.length > 0 ? subscriber.events.join(", ") : "none"}
                    </div>
                    {subscriber.muteUntil && (
                      <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1" data-testid={`text-muted-${subscriber.userEmail}`}>
                        <Clock className="h-3 w-3" />
                        Muted until {new Date(subscriber.muteUntil).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUserSnooze(subscriber.userEmail, "1h")}
                      disabled={snoozeMutation.isPending}
                      data-testid={`button-snooze-1h-${subscriber.userEmail}`}
                    >
                      1h
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUserSnooze(subscriber.userEmail, "8h")}
                      disabled={snoozeMutation.isPending}
                      data-testid={`button-snooze-8h-${subscriber.userEmail}`}
                    >
                      8h
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUserSnooze(subscriber.userEmail, "24h")}
                      disabled={snoozeMutation.isPending}
                      data-testid={`button-snooze-24h-${subscriber.userEmail}`}
                    >
                      24h
                    </Button>
                    {subscriber.muteUntil && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleUserSnooze(subscriber.userEmail, "off")}
                        disabled={snoozeMutation.isPending}
                        data-testid={`button-unmute-${subscriber.userEmail}`}
                      >
                        Unmute
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Channels */}
      <ProjectChannelsCard projectId={projectId} />

      {/* Available Events Reference */}
      <Card data-testid="card-events">
        <CardHeader>
          <CardTitle className="text-base">Available Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {allEvents.map((evt: string) => (
              <Badge key={evt} variant="outline" data-testid={`badge-event-${evt}`}>
                {evt}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectChannelsCard({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [hooks, setHooks] = useState<any[]>([]);
  const [editingRows, setEditingRows] = useState<Record<string, any>>({});
  const cats = ["onboarding", "plan", "release", "alerts", "announcements"];
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      if (!projectId) return;
      const r = await fetchWithAuth(`/api/messaging/channels?projectId=${encodeURIComponent(projectId)}`);
      const j = await r.json();
      setRows(j.items || []);
      const w = await fetchWithAuth(`/api/webhooks/list?projectId=${encodeURIComponent(projectId)}`);
      const jw = await w.json();
      setHooks(jw.items || []);
    })();
  }, [projectId]);

  function rowFor(c: string) {
    if (editingRows[c]) return editingRows[c];
    return rows.find((r: any) => r.category === c) || { category: c, slackWebhookId: "", teamsTeamId: "", teamsChannelId: "" };
  }

  function updateEditing(c: string, field: string, value: string) {
    setEditingRows(prev => ({
      ...prev,
      [c]: { ...rowFor(c), [field]: value }
    }));
  }

  async function save(c: string) {
    const body = editingRows[c] || rowFor(c);
    await fetchWithAuth(`/api/messaging/channels`, {
      method: "POST",
      body: JSON.stringify({
        projectId,
        category: c,
        slackWebhookId: body.slackWebhookId || null,
        teamsTeamId: body.teamsTeamId || null,
        teamsChannelId: body.teamsChannelId || null
      })
    });
    const r = await fetchWithAuth(`/api/messaging/channels?projectId=${encodeURIComponent(projectId)}`);
    const j = await r.json();
    setRows(j.items || []);
    setEditingRows(prev => {
      const updated = { ...prev };
      delete updated[c];
      return updated;
    });
    toast({ title: "Channel configuration saved" });
  }

  return (
    <Card data-testid="card-project-channels">
      <CardHeader>
        <CardTitle>Project Channels</CardTitle>
        <CardDescription>
          Configure Slack and Teams channels for different notification categories
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="text-xs min-w-[860px] w-full border-collapse">
            <thead className="bg-slate-900/40 dark:bg-slate-800/40">
              <tr>
                <th className="text-left px-2 py-2 border">Category</th>
                <th className="text-left px-2 py-2 border">Slack Webhook</th>
                <th className="text-left px-2 py-2 border">Teams Team ID</th>
                <th className="text-left px-2 py-2 border">Teams Channel ID</th>
                <th className="text-left px-2 py-2 border">Action</th>
              </tr>
            </thead>
            <tbody>
              {cats.map(c => {
                const r = rowFor(c);
                return (
                  <tr key={c} className="border-b border-slate-800" data-testid={`row-channel-${c}`}>
                    <td className="px-2 py-2 border capitalize">{c}</td>
                    <td className="px-2 py-2 border">
                      <select
                        className="border rounded px-2 py-1 bg-background w-full"
                        value={r.slackWebhookId || ""}
                        onChange={e => updateEditing(c, "slackWebhookId", e.target.value)}
                        data-testid={`select-slack-${c}`}
                      >
                        <option value="">(none)</option>
                        {hooks.map((h: any) => <option key={h.id} value={h.id}>{h.label || h.url}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 border">
                      <input
                        className="border rounded px-2 py-1 bg-background w-full"
                        value={r.teamsTeamId || ""}
                        onChange={e => updateEditing(c, "teamsTeamId", e.target.value)}
                        placeholder="Teams Team ID"
                        data-testid={`input-teams-team-${c}`}
                      />
                    </td>
                    <td className="px-2 py-2 border">
                      <input
                        className="border rounded px-2 py-1 bg-background w-full"
                        value={r.teamsChannelId || ""}
                        onChange={e => updateEditing(c, "teamsChannelId", e.target.value)}
                        placeholder="Teams Channel ID"
                        data-testid={`input-teams-channel-${c}`}
                      />
                    </td>
                    <td className="px-2 py-2 border">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => save(c)}
                        data-testid={`button-save-${c}`}
                      >
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
