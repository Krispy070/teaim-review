import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock, XCircle, Send, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';

type StageStatus = 'pending' | 'in_review' | 'signed_off' | 'rejected';

interface Stage {
  id: string;
  title: string;
  status: StageStatus;
  start_date?: string;
  end_date?: string;
  signoff_decision?: string;
  signoff_notes?: string;
  requested_at?: string;
  signoff_date?: string;
  sort_index?: number;
}

interface StageTrackerProps {
  projectId: string;
  canPM?: boolean;
  canSign?: boolean;
}

export function StageTracker({ projectId, canPM = false, canSign = false }: StageTrackerProps) {
  const [emailTo, setEmailTo] = useState('');
  const [message, setMessage] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [newStageTitle, setNewStageTitle] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch stages
  const { data: stagesData, isLoading, error } = useQuery({
    queryKey: ['stages', projectId],
    queryFn: () => apiGet<{stages: Stage[]}>('/stages/list', { project_id: projectId }),
    enabled: !!projectId
  });

  const stages: Stage[] = stagesData?.stages || [];

  // Create stage mutation
  const createStageMutation = useMutation({
    mutationFn: (title: string) => apiPost('/stages/create', { title }, { project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages', projectId] });
      setNewStageTitle('');
      toast({ title: 'Stage created successfully' });
    },
    onError: (error) => {
      toast({
        title: 'Create Stage Failed',
        description: String(error),
        variant: 'destructive'
      });
    }
  });

  // Request signoff mutation
  const requestSignoffMutation = useMutation({
    mutationFn: ({ stageId, email, msg }: { stageId: string; email: string; msg: string }) => 
      apiPost('/stages/request-signoff', { stage_id: stageId, email_to: email, message: msg }, { project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages', projectId] });
      setEmailTo('');
      setMessage('');
      toast({ title: 'Sign-off request sent successfully' });
    },
    onError: (error) => {
      toast({
        title: 'Request Failed',
        description: String(error),
        variant: 'destructive'
      });
    }
  });

  // Decision mutation
  const decisionMutation = useMutation({
    mutationFn: ({ stageId, decision, notes }: { stageId: string; decision: 'approved' | 'rejected'; notes: string }) => 
      apiPost('/stages/decision', { stage_id: stageId, decision, notes }, { project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages', projectId] });
      setDecisionNotes('');
      toast({ title: 'Decision recorded successfully' });
    },
    onError: (error) => {
      toast({
        title: 'Decision Failed',
        description: String(error),
        variant: 'destructive'
      });
    }
  });

  const getStatusBadge = (status: StageStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-700" data-testid={`status-pending`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'in_review':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-700" data-testid={`status-in-review`}><AlertCircle className="w-3 h-3 mr-1" />In Review</Badge>;
      case 'signed_off':
        return <Badge variant="secondary" className="bg-green-100 text-green-700" data-testid={`status-signed-off`}><CheckCircle2 className="w-3 h-3 mr-1" />Signed Off</Badge>;
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-100 text-red-700" data-testid={`status-rejected`}><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`status-unknown`}>Unknown</Badge>;
    }
  };

  if (!projectId) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">Set project_id to load stage data.</div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Stage Sign-Off</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading stages...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Stage Sign-Off</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-600">Failed to load stages. Please try again.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Stage Sign-Off</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Create new stage (PM/Admin only) */}
        {canPM && (
          <div className="border-b pb-4">
            <h3 className="text-sm font-medium mb-2">Create New Stage</h3>
            <div className="flex gap-2">
              <Input
                placeholder="Stage title (e.g., Discovery, Design, Testing)"
                value={newStageTitle}
                onChange={(e) => setNewStageTitle(e.target.value)}
                className="flex-1"
                data-testid="input-stage-title"
              />
              <Button
                onClick={() => createStageMutation.mutate(newStageTitle)}
                disabled={!newStageTitle.trim() || createStageMutation.isPending}
                data-testid="button-create-stage"
              >
                {createStageMutation.isPending ? 'Creating...' : 'Create Stage'}
              </Button>
            </div>
          </div>
        )}

        {/* Request signoff controls (PM/Admin only) */}
        {canPM && stages.some(s => s.status === 'pending') && (
          <div className="border-b pb-4">
            <h3 className="text-sm font-medium mb-2">Request Sign-Off</h3>
            <div className="grid gap-2">
              <Input
                placeholder="Customer signer email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                data-testid="input-signer-email"
              />
              <Textarea
                placeholder="Optional message for the signer..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                data-testid="textarea-signoff-message"
              />
              <div className="text-xs text-muted-foreground">
                Select a pending stage below and click "Request Sign-Off".
              </div>
            </div>
          </div>
        )}

        {/* Stages list */}
        <div className="space-y-3">
          {stages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No stages created yet.
              {canPM && " Create your first stage above."}
            </div>
          ) : (
            stages.map((stage) => (
              <div key={stage.id} className="border rounded-lg p-4 space-y-3" data-testid={`stage-card-${stage.id}`}>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium" data-testid={`stage-title-${stage.id}`}>{stage.title}</div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(stage.status)}
                      {stage.start_date && (
                        <div className="text-xs text-muted-foreground">
                          Start: {new Date(stage.start_date).toLocaleDateString()}
                        </div>
                      )}
                      {stage.end_date && (
                        <div className="text-xs text-muted-foreground">
                          End: {new Date(stage.end_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    {stage.signoff_decision && stage.signoff_notes && (
                      <div className="text-sm mt-2 p-2 bg-muted rounded">
                        <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          Decision: {stage.signoff_decision}
                        </div>
                        <div className="mt-1" data-testid={`stage-notes-${stage.id}`}>{stage.signoff_notes}</div>
                        {stage.signoff_date && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(stage.signoff_date).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 min-w-0">
                    {/* PM Request Actions */}
                    {canPM && stage.status === 'pending' && emailTo && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => requestSignoffMutation.mutate({
                          stageId: stage.id,
                          email: emailTo,
                          msg: message
                        })}
                        disabled={requestSignoffMutation.isPending}
                        data-testid={`button-request-signoff-${stage.id}`}
                      >
                        <Send className="w-3 h-3 mr-1" />
                        {requestSignoffMutation.isPending ? 'Sending...' : 'Request Sign-Off'}
                      </Button>
                    )}

                    {/* Signer Decision Actions */}
                    {canSign && stage.status === 'in_review' && (
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Decision notes (optional)..."
                          value={decisionNotes}
                          onChange={(e) => setDecisionNotes(e.target.value)}
                          className="min-w-[250px]"
                          rows={2}
                          data-testid={`textarea-decision-notes-${stage.id}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => decisionMutation.mutate({
                              stageId: stage.id,
                              decision: 'approved',
                              notes: decisionNotes
                            })}
                            disabled={decisionMutation.isPending}
                            data-testid={`button-approve-${stage.id}`}
                          >
                            <ThumbsUp className="w-3 h-3 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => decisionMutation.mutate({
                              stageId: stage.id,
                              decision: 'rejected',
                              notes: decisionNotes
                            })}
                            disabled={decisionMutation.isPending}
                            data-testid={`button-reject-${stage.id}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}