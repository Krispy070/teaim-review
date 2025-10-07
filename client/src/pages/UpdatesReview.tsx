import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { getJSON, postJSON } from "@/lib/authFetch";
import { useOrg } from '../App';
import { usePersistProjectId } from "@/lib/projectCtx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, XCircle, Edit, Undo, Eye, RefreshCw, FileText, Database, Settings, Filter, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PageHeaderHint from '@/components/PageHeaderHint';

interface PendingUpdate {
  id: string;
  change_type: string;
  operation: string;
  target_table: string;
  target_id?: string;
  payload: Record<string, any>;
  old_snapshot?: Record<string, any>;
  source_artifact_id?: string;
  source_span?: string;
  confidence: number;
  status: 'pending' | 'approved' | 'applied' | 'rejected' | 'failed';
  error?: string;
  created_by: string;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  applied_by?: string;
  applied_at?: string;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  applied: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  failed: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
};

const changeTypeIcons = {
  action: <FileText className="w-4 h-4" />,
  risk: <AlertCircle className="w-4 h-4" />,
  decision: <CheckCircle className="w-4 h-4" />,
  integration: <Settings className="w-4 h-4" />,
  workstream: <Database className="w-4 h-4" />,
  memory: <RefreshCw className="w-4 h-4" />
};

export default function UpdatesReview() {
  const { toast } = useToast();
  const { projectId } = useOrg();
  usePersistProjectId(projectId);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingUpdate, setEditingUpdate] = useState<PendingUpdate | null>(null);
  const [editedPayload, setEditedPayload] = useState<string>('');
  const [thresh,setThresh] = useState<number>(0.85);
  const [selOnly,setSelOnly] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState<PendingUpdate | null>(null);
  const [appliedNow, setAppliedNow] = useState(false);
  
  // Inline editing state
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineEditForm, setInlineEditForm] = useState<Record<string, any>>({});

  // Fetch pending updates with filters
  const { data: updatesData, isLoading } = useQuery({
    queryKey: ['/api/updates/list', projectId, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        project_id: projectId,
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(typeFilter !== 'all' && { types: typeFilter })
      });
      const response = await fetch(`/api/updates/list?${params}`);
      if (!response.ok) throw new Error('Failed to fetch updates');
      return response.json();
    },
    enabled: !!projectId
  });

  const updates: PendingUpdate[] = updatesData?.items || [];

  // Mutation for approving updates
  const approveMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const response = await apiRequest(`/api/updates/${updateId}/approve?project_id=${projectId}`, 'POST');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/updates/list'] });
      toast({ title: 'Update approved and applied successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to apply update', 
        description: error.message || 'Unknown error occurred',
        variant: 'destructive' 
      });
    }
  });

  // Mutation for rejecting updates
  const rejectMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const response = await apiRequest(`/api/updates/${updateId}/reject?project_id=${projectId}`, 'POST');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/updates/list'] });
      toast({ title: 'Update rejected successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to reject update', 
        description: error.message || 'Unknown error occurred',
        variant: 'destructive' 
      });
    }
  });

  // Mutation for edit and approve
  const editApproveMutation = useMutation({
    mutationFn: async ({ updateId, payload }: { updateId: string; payload: Record<string, any> }) => {
      const response = await apiRequest(`/api/updates/${updateId}/edit-approve?project_id=${projectId}`, 'POST', { payload });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/updates/list'] });
      setEditingUpdate(null);
      cancelInlineEdit(); // Close inline editing form on success
      toast({ title: 'Update edited and applied successfully' });
    },
    onError: (error: any) => {
      // Keep inline editing form open on error so user doesn't lose context
      toast({ 
        title: 'Failed to edit and apply update', 
        description: error.message || 'Please fix the error and try again',
        variant: 'destructive' 
      });
    }
  });

  // Mutation for undo
  const undoMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const response = await apiRequest(`/api/updates/${updateId}/undo?project_id=${projectId}`, 'POST');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/updates/list'] });
      toast({ title: 'Update undone successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to undo update', 
        description: error.message || 'Unknown error occurred',
        variant: 'destructive' 
      });
    }
  });

  // Mutation for batch approve
  const batchApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest(`/api/updates/batch_approve?project_id=${projectId}`, 'POST', { ids });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/updates/list'] });
      setSelectedIds(new Set());
      toast({ title: 'Batch approval completed' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Batch approval failed', 
        description: error.message || 'Some updates may have failed',
        variant: 'destructive' 
      });
    }
  });

  // Apply All Safe functionality
  async function applyAllSafe(){
    try{
      const idsAll = updates
        .filter(i => i.status==="pending" && Number(i.confidence??0) >= thresh)
        .map(i=>i.id);
      const ids = selOnly ? idsAll.filter(id=>selectedIds.has(id)) : idsAll;
      if (!ids.length) { toast({ title: "No items ≥ threshold", description: `Min conf ${thresh}` }); return; }
      await postJSON(`/api/updates/batch_approve?project_id=${projectId}`, { ids });
      setAppliedNow(true);
      setTimeout(()=>setAppliedNow(false), 1200);
      toast({ title: "Applied", description: `${ids.length} update(s) applied` });
      queryClient.invalidateQueries({ queryKey: ['/api/updates/list'] });
    }catch(e:any){
      toast({ title:"Apply failed", description: String(e?.message||e), variant:"destructive" });
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(updates.filter(u => u.status === 'pending').map(u => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectUpdate = (updateId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(updateId);
    } else {
      newSelected.delete(updateId);
    }
    setSelectedIds(newSelected);
  };

  const handleEditUpdate = (update: PendingUpdate) => {
    setEditingUpdate(update);
    setEditedPayload(JSON.stringify(update.payload, null, 2));
  };

  const handleSaveEdit = () => {
    if (!editingUpdate) return;
    try {
      const payload = JSON.parse(editedPayload);
      editApproveMutation.mutate({ updateId: editingUpdate.id, payload });
    } catch (error) {
      toast({ title: 'Invalid JSON format', variant: 'destructive' });
    }
  };

  // Inline editing helpers
  const startInlineEdit = (update: PendingUpdate) => {
    setInlineEditingId(update.id);
    setInlineEditForm({ ...update.payload });
  };

  const cancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineEditForm({});
  };

  const handleInlineFieldChange = (field: string, value: any) => {
    setInlineEditForm(prev => ({ ...prev, [field]: value }));
  };

  const saveInlineEdit = () => {
    if (!inlineEditingId) return;
    
    // Basic client-side validation
    if (!inlineEditForm.title?.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    
    editApproveMutation.mutate({ 
      updateId: inlineEditingId, 
      payload: inlineEditForm 
    });
    // Don't close form here - move to onSuccess callback
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const renderInlineEditForm = (update: PendingUpdate) => {
    const formData = inlineEditForm;
    const changeType = update.change_type;
    
    return (
      <div className="space-y-4 p-4 border border-blue-200 rounded-lg bg-blue-50/50">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-blue-900">Edit {changeType.charAt(0).toUpperCase() + changeType.slice(1)}</h4>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              onClick={saveInlineEdit}
              disabled={editApproveMutation.isPending || !formData.title?.trim()}
              data-testid={`button-save-inline-${update.id}`}
            >
              <Save className="w-4 h-4 mr-1" />
              {editApproveMutation.isPending ? 'Saving...' : 'Save & Approve'}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={cancelInlineEdit}
              data-testid={`button-cancel-inline-${update.id}`}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Title field for all types */}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={(e) => handleInlineFieldChange('title', e.target.value)}
              placeholder="Enter title"
              data-testid={`input-title-${update.id}`}
            />
          </div>
          
          {/* Description field for all types */}
          <div className="md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleInlineFieldChange('description', e.target.value)}
              placeholder="Enter description"
              rows={3}
              data-testid={`textarea-description-${update.id}`}
            />
          </div>
          
          {/* Fields specific to actions */}
          {changeType === 'action' && (
            <>
              <div>
                <Label htmlFor="owner">Owner</Label>
                <Input
                  id="owner"
                  value={formData.owner || ''}
                  onChange={(e) => handleInlineFieldChange('owner', e.target.value)}
                  placeholder="Enter owner"
                  data-testid={`input-owner-${update.id}`}
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'pending'} onValueChange={(value) => handleInlineFieldChange('status', value)}>
                  <SelectTrigger data-testid={`select-status-${update.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="area">Area</Label>
                <Input
                  id="area"
                  value={formData.area || ''}
                  onChange={(e) => handleInlineFieldChange('area', e.target.value)}
                  placeholder="Enter area (e.g., HCM, Payroll)"
                  data-testid={`input-area-${update.id}`}
                />
              </div>
              <div>
                <Label htmlFor="verb">Action Verb</Label>
                <Input
                  id="verb"
                  value={formData.verb || ''}
                  onChange={(e) => handleInlineFieldChange('verb', e.target.value)}
                  placeholder="Enter action verb"
                  data-testid={`input-verb-${update.id}`}
                />
              </div>
            </>
          )}
          
          {/* Fields specific to risks */}
          {changeType === 'risk' && (
            <>
              <div>
                <Label htmlFor="severity">Severity</Label>
                <Select value={formData.severity || 'medium'} onValueChange={(value) => handleInlineFieldChange('severity', value)}>
                  <SelectTrigger data-testid={`select-severity-${update.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'open'} onValueChange={(value) => handleInlineFieldChange('status', value)}>
                  <SelectTrigger data-testid={`select-status-${update.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="mitigated">Mitigated</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="owner">Owner</Label>
                <Input
                  id="owner"
                  value={formData.owner || ''}
                  onChange={(e) => handleInlineFieldChange('owner', e.target.value)}
                  placeholder="Enter owner"
                  data-testid={`input-owner-${update.id}`}
                />
              </div>
              <div>
                <Label htmlFor="area">Area</Label>
                <Input
                  id="area"
                  value={formData.area || ''}
                  onChange={(e) => handleInlineFieldChange('area', e.target.value)}
                  placeholder="Enter area (e.g., HCM, Payroll)"
                  data-testid={`input-area-${update.id}`}
                />
              </div>
            </>
          )}
          
          {/* Fields specific to decisions */}
          {changeType === 'decision' && (
            <>
              <div>
                <Label htmlFor="decided_by">Decided By</Label>
                <Input
                  id="decided_by"
                  value={formData.decided_by || ''}
                  onChange={(e) => handleInlineFieldChange('decided_by', e.target.value)}
                  placeholder="Enter decision maker"
                  data-testid={`input-decided_by-${update.id}`}
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'pending'} onValueChange={(value) => handleInlineFieldChange('status', value)}>
                  <SelectTrigger data-testid={`select-status-${update.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="decided">Decided</SelectItem>
                    <SelectItem value="implemented">Implemented</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="area">Area</Label>
                <Input
                  id="area"
                  value={formData.area || ''}
                  onChange={(e) => handleInlineFieldChange('area', e.target.value)}
                  placeholder="Enter area (e.g., HCM, Payroll)"
                  data-testid={`input-area-${update.id}`}
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderDiffViewer = (update: PendingUpdate) => {
    return (
      <div className="space-y-4">
        <div>
          <h4 className="font-medium mb-2">Operation: {update.operation} → {update.target_table}</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Confidence: {(update.confidence * 100).toFixed(0)}%
            {update.source_span && ` • Source: ${update.source_span}`}
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {update.old_snapshot && (
            <div>
              <h5 className="font-medium mb-2 text-red-600">Before (Old)</h5>
              <pre className="bg-red-50 dark:bg-red-900/20 p-3 rounded text-xs overflow-auto max-h-64">
                {JSON.stringify(update.old_snapshot, null, 2)}
              </pre>
            </div>
          )}
          
          <div>
            <h5 className="font-medium mb-2 text-green-600">After (Proposed)</h5>
            <pre className="bg-green-50 dark:bg-green-900/20 p-3 rounded text-xs overflow-auto max-h-64">
              {JSON.stringify(update.payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const pendingCount = updates.filter(u => u.status === 'pending').length;
  const selectedCount = selectedIds.size;

  return (
    <div className="p-6 space-y-6">
      <PageHeaderHint 
        id="updates-review"
        title="PM Update Monitor"
        intro="The system automatically analyzes documents and proposes updates to actions, risks, decisions, and other project data."
        bullets={[
          "Review each proposed change in the diff viewer to see confidence scores and source spans",
          "Filter by status/type and select all pending to speed up approvals",
          "Edit payloads before applying if adjustments are needed", 
          "Use bulk operations to approve multiple updates at once",
          "Undo applied changes if they need to be reversed"
        ]}
      />

      <div className="flex items-center justify-end">
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" data-testid="text-pending-count">
            {pendingCount} pending
          </Badge>
          {statusFilter === "pending" && pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs">Min conf</label>
              <input type="number" step="0.01" min={0} max={1} className="border rounded p-1 w-[80px]" value={thresh} onChange={e=>setThresh(parseFloat(e.target.value||"0.85"))}/>
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={selOnly} onChange={e=>setSelOnly(e.target.checked)}/> selection only
              </label>
              <button className={`px-3 py-2 border rounded ${appliedNow?'applied-glow':''}`} onClick={applyAllSafe}>
                Apply All Safe
              </button>
            </div>
          )}
          {selectedCount > 0 && (
            <Button 
              onClick={() => batchApproveMutation.mutate(Array.from(selectedIds))}
              disabled={batchApproveMutation.isPending}
              data-testid="button-batch-approve"
            >
              Approve Selected ({selectedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1">
            <label className="text-sm font-medium">Change Type</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="action">Actions</SelectItem>
                <SelectItem value="risk">Risks</SelectItem>
                <SelectItem value="decision">Decisions</SelectItem>
                <SelectItem value="integration">Integrations</SelectItem>
                <SelectItem value="workstream">Workstreams</SelectItem>
                <SelectItem value="memory">Memory</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {pendingCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Checkbox
                checked={selectedIds.size > 0 && selectedIds.size === pendingCount}
                onCheckedChange={handleSelectAll}
                data-testid="checkbox-select-all"
              />
              <span className="text-sm">
                Select all pending updates ({pendingCount})
              </span>
              {selectedCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {selectedCount} selected
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Updates List */}
      <div className="space-y-4">
        {updates.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No updates found matching your filters.</p>
            </CardContent>
          </Card>
        ) : (
          updates.map((update) => (
            <Card key={update.id} data-testid={`card-update-${update.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {update.status === 'pending' && (
                      <Checkbox
                        checked={selectedIds.has(update.id)}
                        onCheckedChange={(checked) => handleSelectUpdate(update.id, !!checked)}
                        data-testid={`checkbox-update-${update.id}`}
                      />
                    )}
                    
                    <div className="flex items-center gap-2">
                      {changeTypeIcons[update.change_type as keyof typeof changeTypeIcons]}
                      <CardTitle className="text-lg">
                        {update.change_type.charAt(0).toUpperCase() + update.change_type.slice(1)} • {update.operation}
                      </CardTitle>
                    </div>
                    
                    <Badge 
                      className={statusColors[update.status]}
                      data-testid={`badge-status-${update.id}`}
                    >
                      {update.status}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDiffModal(update)}
                      data-testid={`button-view-diff-${update.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View Diff
                    </Button>
                    
                    {update.status === 'pending' && (
                      <>
                        {/* Inline Edit Button - New Feature */}
                        {['action', 'risk', 'decision'].includes(update.change_type) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => startInlineEdit(update)}
                            data-testid={`button-inline-edit-${update.id}`}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Inline Edit
                          </Button>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUpdate(update)}
                          data-testid={`button-edit-${update.id}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit JSON
                        </Button>
                        
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => approveMutation.mutate(update.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${update.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => rejectMutation.mutate(update.id)}
                          disabled={rejectMutation.isPending}
                          data-testid={`button-reject-${update.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    
                    {update.status === 'applied' && update.old_snapshot && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => undoMutation.mutate(update.id)}
                        disabled={undoMutation.isPending}
                        data-testid={`button-undo-${update.id}`}
                      >
                        <Undo className="w-4 h-4 mr-1" />
                        Undo
                      </Button>
                    )}
                  </div>
                </div>
                
                <CardDescription className="space-y-1">
                  <div>Table: {update.target_table} • By: {update.created_by}</div>
                  <div>Created: {formatTimestamp(update.created_at)}</div>
                  {update.error && (
                    <div className="text-red-600">Error: {update.error}</div>
                  )}
                </CardDescription>
              </CardHeader>
              
              {/* Inline editing form */}
              {inlineEditingId === update.id && (
                <CardContent>
                  {renderInlineEditForm(update)}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingUpdate} onOpenChange={() => setEditingUpdate(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Update Payload</DialogTitle>
            <DialogDescription>
              Modify the proposed changes before applying them.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Textarea
              value={editedPayload}
              onChange={(e) => setEditedPayload(e.target.value)}
              className="min-h-64 font-mono text-sm"
              placeholder="JSON payload..."
              data-testid="textarea-edit-payload"
            />
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingUpdate(null)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveEdit}
                disabled={editApproveMutation.isPending}
                data-testid="button-save-edit"
              >
                Save & Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diff Viewer Modal */}
      <Dialog open={!!showDiffModal} onOpenChange={() => setShowDiffModal(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Change Diff</DialogTitle>
            <DialogDescription>
              Compare the proposed changes with existing data.
            </DialogDescription>
          </DialogHeader>
          
          {showDiffModal && renderDiffViewer(showDiffModal)}
        </DialogContent>
      </Dialog>
    </div>
  );
}