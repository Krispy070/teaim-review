import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Mail, Eye, Users, Send, RefreshCw } from "lucide-react";

interface DigestPreviewData {
  html: string;
  counts: {
    actions: number;
    risks: number;
    decisions: number;
  };
  overdue_count: number;
  topics: string[];
  project_code: string;
  period: string;
}

interface DigestRecipient {
  email: string;
  user_id: string;
  subscriptions: {
    actions: boolean;
    risks: boolean;
    decisions: boolean;
  };
}

interface RecipientsData {
  recipients: DigestRecipient[];
  period: string;
  total_count: number;
}

export default function DigestPreview() {
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  const { toast } = useToast();
  
  // State for preview settings
  const [selectedTopics, setSelectedTopics] = useState<string[]>(["actions", "risks", "decisions"]);
  const [selectedPeriod, setSelectedPeriod] = useState("Weekly");
  const [testEmail, setTestEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch digest preview HTML
  const { data: previewData, isLoading: previewLoading, refetch: refetchPreview } = useQuery<DigestPreviewData>({
    queryKey: ['/api/digest-preview/html', { projectId, topics: selectedTopics.join(','), period: selectedPeriod }],
    enabled: !!projectId,
    staleTime: 30000, // 30 seconds
  });

  // Fetch current recipients
  const { data: recipientsData, isLoading: recipientsLoading, refetch: refetchRecipients } = useQuery<RecipientsData>({
    queryKey: ['/api/digest-preview/recipients', { projectId, period: selectedPeriod.toLowerCase() }],
    enabled: !!projectId,
    staleTime: 60000, // 1 minute
  });

  // Test send mutation
  const testSendMutation = useMutation({
    mutationFn: (data: { email: string; topics: string[]; period: string }) =>
      apiRequest('POST', `/api/digest-preview/test-send?project_id=${projectId}`, data),
    onSuccess: () => {
      toast({
        title: "Test email sent!",
        description: `Digest sent successfully to ${testEmail}`,
      });
      setTestEmail("");
      // Invalidate relevant caches for auto-refresh
      queryClient.invalidateQueries({ queryKey: ['/api/digest-preview/html'] });
      queryClient.invalidateQueries({ queryKey: ['/api/digest-preview/recipients'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send test",
        description: error.message || "An error occurred while sending the test email.",
        variant: "destructive",
      });
    },
  });

  // Handle topic selection
  const handleTopicChange = (topic: string, checked: boolean) => {
    if (checked) {
      setSelectedTopics(prev => [...prev, topic]);
    } else {
      setSelectedTopics(prev => prev.filter(t => t !== topic));
    }
  };

  // Handle test send
  const handleTestSend = async () => {
    if (!testEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address to send the test digest.",
        variant: "destructive",
      });
      return;
    }

    if (selectedTopics.length === 0) {
      toast({
        title: "Topics required",
        description: "Please select at least one topic to include in the digest.",
        variant: "destructive",
      });
      return;
    }

    testSendMutation.mutate({
      email: testEmail.trim(),
      topics: selectedTopics,
      period: selectedPeriod,
    });
  };

  // Handle refresh preview
  const handleRefreshPreview = () => {
    refetchPreview();
    refetchRecipients();
  };

  const days = selectedPeriod === "Weekly" ? 7 : 30;
  const totalActivityCount = previewData ? 
    (previewData.counts.actions + previewData.counts.risks + previewData.counts.decisions) : 0;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100" data-testid="text-digest-preview-title">
            Digest Preview
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Preview and test your digest emails with brand-aware styling
          </p>
        </div>
        <Button
          onClick={handleRefreshPreview}
          variant="outline"
          disabled={previewLoading}
          data-testid="button-refresh-preview"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="preview" className="space-y-6">
        <TabsList data-testid="tabs-digest-preview">
          <TabsTrigger value="preview" data-testid="tab-preview">
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="recipients" data-testid="tab-recipients">
            <Users className="w-4 h-4 mr-2" />
            Recipients
          </TabsTrigger>
          <TabsTrigger value="test-send" data-testid="tab-test-send">
            <Send className="w-4 h-4 mr-2" />
            Test Send
          </TabsTrigger>
        </TabsList>

        {/* Preview Tab */}
        <TabsContent value="preview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Digest Configuration
              </CardTitle>
              <CardDescription>
                Customize the digest content and period settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="period-select" className="text-base font-medium">Period</Label>
                    <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger data-testid="select-digest-period">
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Weekly">Weekly (7 days)</SelectItem>
                        <SelectItem value="Monthly">Monthly (30 days)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-base font-medium mb-3 block">Topics to Include</Label>
                    <div className="space-y-2">
                      {['actions', 'risks', 'decisions'].map(topic => (
                        <div key={topic} className="flex items-center space-x-2">
                          <Checkbox
                            id={`topic-${topic}`}
                            checked={selectedTopics.includes(topic)}
                            onCheckedChange={(checked) => handleTopicChange(topic, checked as boolean)}
                            data-testid={`checkbox-topic-${topic}`}
                          />
                          <Label htmlFor={`topic-${topic}`} className="capitalize">
                            {topic}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium mb-3 block">Activity Summary ({days}d)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <span className="text-sm">Actions:</span>
                        <Badge variant="outline" data-testid="badge-actions-count">
                          {previewData?.counts.actions || 0}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <span className="text-sm">Risks:</span>
                        <Badge variant="outline" data-testid="badge-risks-count">
                          {previewData?.counts.risks || 0}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <span className="text-sm">Decisions:</span>
                        <Badge variant="outline" data-testid="badge-decisions-count">
                          {previewData?.counts.decisions || 0}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <span className="text-sm">Overdue:</span>
                        <Badge variant="outline" data-testid="badge-overdue-count">
                          {previewData?.overdue_count || 0}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>HTML Preview</CardTitle>
              <CardDescription>
                This is how your digest will appear in email clients with full branding
              </CardDescription>
            </CardHeader>
            <CardContent>
              {previewLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span>Loading preview...</span>
                </div>
              ) : previewData?.html ? (
                <div 
                  className="brand-card p-4 max-h-96 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: previewData.html }}
                  data-testid="div-digest-preview-html"
                />
              ) : (
                <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                  No preview available. Check your configuration and try again.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recipients Tab */}
        <TabsContent value="recipients" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Current Recipients
              </CardTitle>
              <CardDescription>
                Team members who will receive {selectedPeriod.toLowerCase()} digest emails
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recipientsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span>Loading recipients...</span>
                </div>
              ) : recipientsData?.recipients && recipientsData.recipients.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Total recipients: {recipientsData.total_count}
                    </span>
                    <Badge>{selectedPeriod} digest</Badge>
                  </div>
                  <div className="grid gap-3">
                    {recipientsData.recipients.map((recipient, index) => (
                      <div 
                        key={recipient.user_id} 
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        data-testid={`recipient-${index}`}
                      >
                        <span className="font-medium">{recipient.email}</span>
                        <div className="flex gap-2">
                          {recipient.subscriptions.actions && (
                            <Badge variant="secondary" size="sm">Actions</Badge>
                          )}
                          {recipient.subscriptions.risks && (
                            <Badge variant="secondary" size="sm">Risks</Badge>
                          )}
                          {recipient.subscriptions.decisions && (
                            <Badge variant="secondary" size="sm">Decisions</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                  No recipients configured for {selectedPeriod.toLowerCase()} digests.
                  <br />
                  Recipients are configured in Team Access settings.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Send Tab */}
        <TabsContent value="test-send" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Send Test Digest
              </CardTitle>
              <CardDescription>
                Send a test digest to any email address to verify the styling and content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="test-email">Email Address</Label>
                  <Input
                    id="test-email"
                    type="email"
                    placeholder="test@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    data-testid="input-test-email"
                  />
                </div>

                <Separator />
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Test Configuration</Label>
                    <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <div>Period: <span className="font-medium">{selectedPeriod}</span></div>
                      <div>Topics: <span className="font-medium">{selectedTopics.join(', ')}</span></div>
                      <div>Activity Count: <span className="font-medium">{totalActivityCount}</span></div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Email Subject</Label>
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      Test {selectedPeriod} Digest — {previewData?.project_code || 'Project'}
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleTestSend}
                  disabled={testSendMutation.isPending || !testEmail.trim() || selectedTopics.length === 0}
                  className="w-full"
                  data-testid="button-send-test-digest"
                >
                  {testSendMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending Test...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Test Digest
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}