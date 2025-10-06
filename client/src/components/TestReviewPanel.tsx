import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, XCircle, Edit3, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type StagedTest = {
  id: string;
  transcriptId?: string;
  dedupeKey: string;
  title: string;
  gherkin: string;
  steps: string[];
  areaKey?: string;
  bpCode?: string;
  priority: "P0" | "P1" | "P2" | "P3";
  type: "happy" | "edge" | "negative" | "regression";
  ownerHint?: string;
  tags: string[];
  trace: string[];
  confidence: number;
  createdAt?: string;
};

type TestOverrides = {
  areaKey?: string;
  bpCode?: string;
  priority?: string;
  type?: string;
  title?: string;
  ownerHint?: string;
  tags?: string[];
};

interface TestReviewPanelProps {
  projectId: string;
}

export default function TestReviewPanel({ projectId }: TestReviewPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [edited, setEdited] = React.useState<Record<string, Partial<StagedTest>>>({});
  const [approved, setApproved] = React.useState<Record<string, TestOverrides>>({});
  const [rejected, setRejected] = React.useState<Record<string, true>>({});
  const [expandedRows, setExpandedRows] = React.useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["staging-tests", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/review/tests?project_id=${projectId}`);
      if (!response.ok) throw new Error('Failed to load tests');
      return response.json();
    },
    staleTime: 10000,
  });

  const commitMutation = useMutation({
    mutationFn: async (body: any) => {
      const response = await fetch(`/api/admin/review/tests/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error('Failed to commit changes');
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["staging-tests", projectId] });
      toast({
        title: "Tests committed successfully",
        description: `Approved: ${result.appliedCounts?.approved || 0}, Rejected: ${result.appliedCounts?.rejected || 0}, Edited: ${result.appliedCounts?.edited || 0}`
      });
      // Reset selections
      setApproved({});
      setRejected({});
      setEdited({});
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to commit test changes",
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">Loading tests...</div>
        </CardContent>
      </Card>
    );
  }

  const items: StagedTest[] = data?.items || [];

  const approve = (id: string, overrides: TestOverrides = {}) => {
    setApproved(prev => ({ ...prev, [id]: overrides }));
    // Remove from rejected if it was there
    setRejected(prev => {
      const { [id]: removed, ...rest } = prev;
      return rest;
    });
  };

  const reject = (id: string) => {
    setRejected(prev => ({ ...prev, [id]: true }));
    // Remove from approved if it was there
    setApproved(prev => {
      const { [id]: removed, ...rest } = prev;
      return rest;
    });
  };

  const markEdit = (id: string, patch: Partial<StagedTest>) => {
    setEdited(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const toggleExpanded = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const onCommit = () => {
    const body = {
      project_id: projectId,
      approved: Object.entries(approved).map(([id, overrides]) => ({ id, overrides })),
      edited: Object.entries(edited).map(([id, patch]) => ({ id, ...patch })),
      rejected: Object.keys(rejected),
    };
    commitMutation.mutate(body);
  };

  const autoApproveHighConfidence = () => {
    const highConfidenceApprovals: Record<string, TestOverrides> = {};
    items.forEach(item => {
      if (item.confidence >= 0.85) {
        highConfidenceApprovals[item.id] = {};
      }
    });
    setApproved(highConfidenceApprovals);
    toast({
      title: "Auto-approved high confidence tests",
      description: `${Object.keys(highConfidenceApprovals).length} tests selected for approval`
    });
  };

  const hasSelections = Object.keys(approved).length > 0 || Object.keys(rejected).length > 0 || Object.keys(edited).length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Test Candidates</CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={autoApproveHighConfidence}
              data-testid="button-auto-approve"
            >
              Auto-Approve High Confidence (≥85%)
            </Button>
            <Button 
              onClick={onCommit} 
              disabled={commitMutation.isPending || !hasSelections}
              data-testid="button-commit-tests"
            >
              {commitMutation.isPending ? "Committing..." : "Commit Selected"}
            </Button>
          </div>
        </div>
        {items.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {items.length} test candidate{items.length !== 1 ? 's' : ''} • 
            Approved: {Object.keys(approved).length} • 
            Rejected: {Object.keys(rejected).length} • 
            Edited: {Object.keys(edited).length}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No test candidates found for this project.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(item => {
              const isApproved = approved[item.id] !== undefined;
              const isRejected = !!rejected[item.id];
              const isExpanded = expandedRows[item.id];
              const patch = edited[item.id] || {};
              const currentTitle = patch.title ?? item.title;
              const currentGherkin = patch.gherkin ?? item.gherkin;
              const currentSteps = patch.steps ?? item.steps;
              const currentAreaKey = patch.areaKey ?? item.areaKey;
              const currentBpCode = patch.bpCode ?? item.bpCode;
              const currentPriority = patch.priority ?? item.priority;
              const currentType = patch.type ?? item.type;
              const currentTags = patch.tags ?? item.tags;

              return (
                <Card key={item.id} className={`${isApproved ? 'border-green-200 bg-green-50' : isRejected ? 'border-red-200 bg-red-50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" data-testid={`badge-confidence-${item.id}`}>
                          {Math.round(item.confidence * 100)}% confidence
                        </Badge>
                        {item.areaKey && (
                          <Badge variant="secondary" data-testid={`badge-area-${item.id}`}>
                            {item.areaKey}
                          </Badge>
                        )}
                        {item.bpCode && (
                          <Badge variant="secondary" data-testid={`badge-bp-${item.id}`}>
                            {item.bpCode}
                          </Badge>
                        )}
                        <Badge variant="outline" data-testid={`badge-priority-${item.id}`}>
                          {item.priority}
                        </Badge>
                        <Badge variant="outline" data-testid={`badge-type-${item.id}`}>
                          {item.type}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={isExpanded ? "default" : "outline"}
                          onClick={() => toggleExpanded(item.id)}
                          data-testid={`button-expand-${item.id}`}
                        >
                          <Edit3 className="h-4 w-4 mr-1" />
                          Edit
                          {isExpanded ? <ChevronDown className="h-4 w-4 ml-1" /> : <ChevronRight className="h-4 w-4 ml-1" />}
                        </Button>
                        <Button
                          size="sm"
                          variant={isApproved ? "default" : "outline"}
                          onClick={() => approve(item.id)}
                          className={isApproved ? "bg-green-600 hover:bg-green-700" : ""}
                          data-testid={`button-approve-${item.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant={isRejected ? "default" : "outline"}
                          onClick={() => reject(item.id)}
                          className={isRejected ? "bg-red-600 hover:bg-red-700" : ""}
                          data-testid={`button-reject-${item.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Title</label>
                        <Input
                          value={currentTitle}
                          onChange={(e) => markEdit(item.id, { title: e.target.value })}
                          className="mt-1"
                          data-testid={`input-title-${item.id}`}
                        />
                      </div>

                      <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(item.id)}>
                        <CollapsibleContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Area Key</label>
                              <Input
                                value={currentAreaKey || ""}
                                onChange={(e) => markEdit(item.id, { areaKey: e.target.value })}
                                placeholder="e.g., HCM, FIN"
                                className="mt-1"
                                data-testid={`input-area-${item.id}`}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">BP Code</label>
                              <Input
                                value={currentBpCode || ""}
                                onChange={(e) => markEdit(item.id, { bpCode: e.target.value })}
                                placeholder="e.g., HIRE_EMPLOYEE"
                                className="mt-1"
                                data-testid={`input-bp-${item.id}`}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Priority</label>
                              <Select 
                                value={currentPriority} 
                                onValueChange={(value) => markEdit(item.id, { priority: value as any })}
                              >
                                <SelectTrigger className="mt-1" data-testid={`select-priority-${item.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="P0">P0 - Critical</SelectItem>
                                  <SelectItem value="P1">P1 - High</SelectItem>
                                  <SelectItem value="P2">P2 - Medium</SelectItem>
                                  <SelectItem value="P3">P3 - Low</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Type</label>
                              <Select 
                                value={currentType} 
                                onValueChange={(value) => markEdit(item.id, { type: value as any })}
                              >
                                <SelectTrigger className="mt-1" data-testid={`select-type-${item.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="happy">Happy Path</SelectItem>
                                  <SelectItem value="edge">Edge Case</SelectItem>
                                  <SelectItem value="negative">Negative</SelectItem>
                                  <SelectItem value="regression">Regression</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Gherkin</label>
                            <Textarea
                              value={currentGherkin}
                              onChange={(e) => markEdit(item.id, { gherkin: e.target.value })}
                              rows={5}
                              className="mt-1 font-mono"
                              data-testid={`textarea-gherkin-${item.id}`}
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Steps</label>
                            <Textarea
                              value={currentSteps.join('\n')}
                              onChange={(e) => markEdit(item.id, { 
                                steps: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) 
                              })}
                              rows={4}
                              placeholder="Step-by-step instructions (one per line)"
                              className="mt-1"
                              data-testid={`textarea-steps-${item.id}`}
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Tags</label>
                            <Input
                              value={currentTags.join(', ')}
                              onChange={(e) => markEdit(item.id, { 
                                tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
                              })}
                              placeholder="Comma-separated tags"
                              className="mt-1"
                              data-testid={`input-tags-${item.id}`}
                            />
                          </div>

                          {item.trace.length > 0 && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Source Transcript Quotes</label>
                              <div className="mt-1 bg-gray-50 rounded p-3 space-y-2">
                                {item.trace.map((quote, idx) => (
                                  <div key={idx} className="text-sm text-gray-700 border-l-2 border-blue-200 pl-3">
                                    "{quote}"
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}