import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Webhook, Settings, TestTube2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const webhookSettingsSchema = z.object({
  enabled: z.boolean(),
  slack_url: z.string().optional(),
  teams_url: z.string().optional(),
  generic_url: z.string().optional()
});

type WebhookSettings = z.infer<typeof webhookSettingsSchema>;

export default function WebhookSettings() {
  const { toast } = useToast();
  const [isTesting, setIsTesting] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/webhooks/settings"],
    queryFn: () => fetch("/api/webhooks/settings").then(res => res.json()) as Promise<WebhookSettings>
  });

  const form = useForm<WebhookSettings>({
    resolver: zodResolver(webhookSettingsSchema),
    defaultValues: settings || {
      enabled: false,
      slack_url: "",
      teams_url: "",
      generic_url: ""
    }
  });

  // Reset form when settings load
  if (settings && !form.formState.isDirty) {
    form.reset(settings);
  }

  const updateMutation = useMutation({
    mutationFn: (data: WebhookSettings) => 
      apiRequest("/api/webhooks/settings", "POST", data),
    onSuccess: () => {
      toast({ title: "Webhook settings updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks/settings"] });
    },
    onError: () => {
      toast({ title: "Failed to update webhook settings", variant: "destructive" });
    }
  });

  const testMutation = useMutation({
    mutationFn: () => apiRequest("/api/webhooks/test", "POST", {}),
    onSuccess: () => {
      toast({ title: "Test webhook sent successfully" });
    },
    onError: () => {
      toast({ title: "Failed to send test webhook", variant: "destructive" });
    }
  });

  const onSubmit = (data: WebhookSettings) => {
    updateMutation.mutate(data);
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await testMutation.mutateAsync();
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8" data-testid="webhooks-loading">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center text-muted-foreground">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8" data-testid="webhooks-page">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="webhooks-title">
            <Webhook className="h-5 w-5" />
            Webhook Settings
          </CardTitle>
          <CardDescription>
            Configure webhook notifications for project events like signoffs, updates, and reminders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base" data-testid="webhooks-enabled-label">
                        Enable Webhooks
                      </FormLabel>
                      <FormDescription>
                        Enable webhook notifications for this organization
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="webhooks-enabled-switch"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="slack_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel data-testid="slack-url-label">Slack Webhook URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://hooks.slack.com/services/..."
                          data-testid="input-slack-url"
                        />
                      </FormControl>
                      <FormDescription>
                        Slack incoming webhook URL for formatted notifications
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="teams_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel data-testid="teams-url-label">Microsoft Teams Webhook URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://outlook.office.com/webhook/..."
                          data-testid="input-teams-url"
                        />
                      </FormControl>
                      <FormDescription>
                        Microsoft Teams incoming webhook URL for notifications
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="generic_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel data-testid="generic-url-label">Generic Webhook URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://your-webhook-endpoint.com/hook"
                          data-testid="input-generic-url"
                        />
                      </FormControl>
                      <FormDescription>
                        Custom webhook endpoint for raw JSON payloads
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-4">
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                  data-testid="button-save-webhooks"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  {updateMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={isTesting || testMutation.isPending || !form.watch("enabled")}
                  data-testid="button-test-webhooks"
                >
                  <TestTube2 className="mr-2 h-4 w-4" />
                  {isTesting ? "Testing..." : "Send Test"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}