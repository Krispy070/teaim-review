import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useOrg } from '../App';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Users, Shield, Bell, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PageHeaderHint from '@/components/PageHeaderHint';

interface TeamMember {
  id: string;
  display_name: string;
  email: string;
  role: string;
  joined_at: string;
  access?: {
    visibility: 'full' | 'limited' | 'minimal';
    can_sign_all: boolean;
    sign_areas: string[];
    notifications: {
      mentions: boolean;
      stage_changes: boolean;
      new_documents: boolean;
      action_items: boolean;
    };
  };
}

interface ProjectArea {
  id: string;
  name: string;
  description?: string;
}

export default function TeamAccess() {
  const { toast } = useToast();
  const { projectId } = useOrg();
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  // Fetch team members and their access settings
  const { data: accessData, isLoading: membersLoading } = useQuery({
    queryKey: ['/api/team-access/access/list', projectId],
    queryFn: () => fetch(`/api/team-access/access/list?project_id=${projectId}`).then(res => res.json()),
    enabled: !!projectId
  });
  
  // Fetch member profiles for display names and roles
  const { data: membersProfiles = [] } = useQuery({
    queryKey: ['/api/members/list', projectId],
    queryFn: () => fetch(`/api/members/list?project_id=${projectId}`).then(res => res.json()),
    enabled: !!projectId
  });
  
  const accessControls = accessData?.access_controls || [];
  
  // Transform backend data to frontend format
  const members: TeamMember[] = accessControls.map((access: any) => {
    const profile = membersProfiles.find((p: any) => p.user_id === access.user_id) || {};
    return {
      id: access.user_id,
      display_name: profile.display_name || profile.name || 'Unknown User',
      email: profile.email || '',
      role: profile.role || 'member',
      joined_at: profile.joined_at || '',
      access: {
        visibility: (access.can_view_all ? 'full' : 'limited') as 'full' | 'limited' | 'minimal',
        can_sign_all: access.can_sign_all || false,
        sign_areas: access.sign_areas || [],
        notifications: {
          mentions: true, // Default - not yet implemented in backend
          stage_changes: access.notify_reminders || false,
          new_documents: access.notify_decisions || false,
          action_items: access.notify_actions || false
        }
      }
    };
  });

  // Mock project areas for now - will need backend endpoint
  const areas: ProjectArea[] = [
    { id: 'hr', name: 'HR & People' },
    { id: 'finance', name: 'Finance & Reporting' },
    { id: 'technical', name: 'Technical Configuration' },
    { id: 'integrations', name: 'Integrations & Data' },
    { id: 'testing', name: 'Testing & QA' },
    { id: 'training', name: 'Training & Documentation' }
  ];
  const areasLoading = false;

  // Update member access mutation
  const updateAccessMutation = useMutation({
    mutationFn: async ({ memberId, access }: { memberId: string; access: any }) => {
      // Transform frontend access to backend format
      const backendPayload = {
        user_id: memberId,
        can_view_all: access.visibility === 'full',
        visibility_areas: access.visibility === 'limited' ? access.sign_areas : [],
        can_sign_all: access.can_sign_all,
        sign_areas: access.sign_areas,
        notify_actions: access.notifications?.action_items || false,
        notify_risks: false, // Not implemented in UI yet
        notify_decisions: access.notifications?.new_documents || false,
        notify_reminders: access.notifications?.stage_changes || false
      };
      
      return apiRequest(`/api/team-access/access/upsert?project_id=${projectId}`, 'POST', backendPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team-access/access/list', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/members/list', projectId] });
      toast({
        title: "Access Updated",
        description: "Team member access settings have been updated successfully."
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Failed to update access settings."
      });
    }
  });

  const handleAccessUpdate = (memberId: string, updates: Partial<TeamMember['access']>) => {
    const member = members.find((m: TeamMember) => m.id === memberId);
    if (!member) return;

    const newAccess = {
      ...member.access,
      ...updates
    };

    updateAccessMutation.mutate({ memberId, access: newAccess });
  };

  const handleNotificationUpdate = (memberId: string, notificationType: string, enabled: boolean) => {
    const member = members.find((m: TeamMember) => m.id === memberId);
    if (!member) return;

    const currentNotifications = member.access?.notifications || {
      mentions: false,
      stage_changes: false,
      new_documents: false,
      action_items: false
    };
    const newNotifications = {
      ...currentNotifications,
      [notificationType]: enabled
    };

    handleAccessUpdate(memberId, { notifications: newNotifications });
  };

  const handleAreaToggle = (memberId: string, areaId: string, enabled: boolean) => {
    const member = members.find((m: TeamMember) => m.id === memberId);
    if (!member) return;

    const currentAreas = member.access?.sign_areas || [];
    const newAreas = enabled 
      ? [...currentAreas, areaId]
      : currentAreas.filter((a: string) => a !== areaId);

    handleAccessUpdate(memberId, { sign_areas: newAreas });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'default';
      case 'admin': return 'secondary';
      case 'pm': return 'outline';
      default: return 'outline';
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'full': return <Eye className="h-4 w-4" />;
      case 'limited': return <EyeOff className="h-4 w-4" />;
      case 'minimal': return <AlertCircle className="h-4 w-4" />;
      default: return <Eye className="h-4 w-4" />;
    }
  };

  if (membersLoading || areasLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Team Access Management</h1>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-team-access">
      <PageHeaderHint
        id="team-access-hint"
        title="Manage Team Access & Permissions"
      />

      <div className="flex items-center space-x-2">
        <Users className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Team Access Management</h1>
      </div>

      <div className="grid gap-6">
        {members.map((member: TeamMember) => (
          <Card key={member.id} className="w-full" data-testid={`member-card-${member.id}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3">
                    <span data-testid={`member-name-${member.id}`}>{member.display_name}</span>
                    <Badge variant={getRoleBadgeVariant(member.role)} data-testid={`member-role-${member.id}`}>
                      {member.role}
                    </Badge>
                  </CardTitle>
                  <CardDescription data-testid={`member-email-${member.id}`}>
                    {member.email}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedMember(selectedMember === member.id ? null : member.id)}
                  data-testid={`toggle-member-${member.id}`}
                >
                  {selectedMember === member.id ? 'Collapse' : 'Configure'}
                </Button>
              </div>
            </CardHeader>

            {selectedMember === member.id && (
              <CardContent className="space-y-6">
                {/* Visibility Settings */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {getVisibilityIcon(member.access?.visibility || 'full')}
                    <Label className="text-base font-medium">Project Visibility</Label>
                  </div>
                  <Select
                    value={member.access?.visibility || 'full'}
                    onValueChange={(value) => handleAccessUpdate(member.id, { visibility: value as any })}
                    data-testid={`visibility-select-${member.id}`}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Access - See all project data</SelectItem>
                      <SelectItem value="limited">Limited Access - See assigned areas only</SelectItem>
                      <SelectItem value="minimal">Minimal Access - Basic project overview</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Sign-off Authority */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    <Label className="text-base font-medium">Sign-off Authority</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={member.access?.can_sign_all || false}
                      onCheckedChange={(checked) => handleAccessUpdate(member.id, { can_sign_all: checked })}
                      data-testid={`can-sign-all-${member.id}`}
                    />
                    <Label>Can sign off on all project areas</Label>
                  </div>

                  {!member.access?.can_sign_all && areas.length > 0 && (
                    <div className="ml-6 space-y-2">
                      <Label className="text-sm text-gray-600">Specific areas:</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {areas.map((area: ProjectArea) => (
                          <div key={area.id} className="flex items-center space-x-2">
                            <Switch
                              checked={member.access?.sign_areas?.includes(area.id) || false}
                              onCheckedChange={(checked) => handleAreaToggle(member.id, area.id, checked)}
                              data-testid={`area-${area.id}-${member.id}`}
                            />
                            <Label className="text-sm">{area.name}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Notification Preferences */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    <Label className="text-base font-medium">Notification Preferences</Label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={member.access?.notifications?.mentions || false}
                        onCheckedChange={(checked) => handleNotificationUpdate(member.id, 'mentions', checked)}
                        data-testid={`mentions-${member.id}`}
                      />
                      <Label className="text-sm">Mentions & Direct Messages</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={member.access?.notifications?.stage_changes || false}
                        onCheckedChange={(checked) => handleNotificationUpdate(member.id, 'stage_changes', checked)}
                        data-testid={`stage-changes-${member.id}`}
                      />
                      <Label className="text-sm">Stage Changes</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={member.access?.notifications?.new_documents || false}
                        onCheckedChange={(checked) => handleNotificationUpdate(member.id, 'new_documents', checked)}
                        data-testid={`new-documents-${member.id}`}
                      />
                      <Label className="text-sm">New Documents</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={member.access?.notifications?.action_items || false}
                        onCheckedChange={(checked) => handleNotificationUpdate(member.id, 'action_items', checked)}
                        data-testid={`action-items-${member.id}`}
                      />
                      <Label className="text-sm">Action Items</Label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    {updateAccessMutation.isPending ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
                        Saving changes...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        Changes saved automatically
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {members.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">No Team Members</h3>
            <p className="text-gray-600">Add team members to your project to manage their access and permissions.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}