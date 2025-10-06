import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Shield, 
  Settings, 
  Users, 
  FileText, 
  Eye, 
  PenTool,
  Crown,
  UserCheck,
  AlertTriangle,
  CheckCircle,
  XCircle
} from "lucide-react";

const ROLES = [
  {
    name: "owner",
    label: "Owner",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    icon: Crown,
    description: "Ultimate authority with full organizational control"
  },
  {
    name: "admin", 
    label: "Admin",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: Shield,
    description: "Complete project management and member administration"
  },
  {
    name: "pm",
    label: "PM",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", 
    icon: Settings,
    description: "Project manager with workflow and content creation rights"
  },
  {
    name: "lead",
    label: "Lead",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: UserCheck,
    description: "Team lead with content creation and review capabilities"
  },
  {
    name: "member",
    label: "Member",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: Users,
    description: "Standard team member with full read access"
  },
  {
    name: "guest",
    label: "Guest",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    icon: Eye,
    description: "Limited visitor access to specific content only"
  }
];

const PERMISSIONS = [
  { 
    key: "manage_roles", 
    label: "Manage Roles", 
    description: "Add/remove members and assign roles",
    levels: { owner: "full", admin: "limited", pm: false, lead: false, member: false, guest: false }
  },
  { 
    key: "project_settings", 
    label: "Project Settings", 
    description: "Configure project properties and integrations",
    levels: { owner: true, admin: true, pm: false, lead: false, member: false, guest: false }
  },
  { 
    key: "create_content", 
    label: "Create Content", 
    description: "Add stages, actions, risks, decisions, and documents",
    levels: { owner: true, admin: true, pm: true, lead: true, member: false, guest: false }
  },
  { 
    key: "edit_content", 
    label: "Edit Content", 
    description: "Modify existing project content and summaries",
    levels: { owner: true, admin: true, pm: true, lead: true, member: false, guest: false }
  },
  { 
    key: "view_all", 
    label: "View All Content", 
    description: "Access to all project documents and data",
    levels: { owner: true, admin: true, pm: true, lead: true, member: true, guest: false }
  },
  { 
    key: "view_limited", 
    label: "View Public Content", 
    description: "Access to publicly shared documents only",
    levels: { owner: true, admin: true, pm: true, lead: true, member: true, guest: true }
  }
];

function PermissionIcon({ value }: { value: boolean | string }) {
  if (value === true) return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (value === "full") return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (value === "limited") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  return <XCircle className="h-4 w-4 text-gray-400" />;
}

function getPermissionText(value: boolean | string) {
  if (value === true) return "Full Access";
  if (value === "full") return "Full Control";
  if (value === "limited") return "Limited";
  return "No Access";
}

export default function RoleMatrixCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Role Matrix & Permissions
        </CardTitle>
        <CardDescription>
          Comprehensive overview of project roles, permissions, and the special signing capability
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Role Hierarchy */}
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Crown className="h-4 w-4" />
            Role Hierarchy (Highest to Lowest Authority)
          </h3>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role, index) => {
              const Icon = role.icon;
              return (
                <div key={role.name} className="flex items-center gap-1">
                  <Badge 
                    variant="secondary" 
                    className={`${role.color} px-3 py-1 font-medium`}
                    data-testid={`badge-role-${role.name}`}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {role.label}
                  </Badge>
                  {index < ROLES.length - 1 && (
                    <span className="text-gray-400 mx-1">→</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Role Descriptions */}
        <div>
          <h3 className="font-semibold text-sm mb-3">Role Descriptions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ROLES.map(role => {
              const Icon = role.icon;
              return (
                <div 
                  key={role.name} 
                  className="flex items-start gap-2 p-2 rounded-lg bg-muted/30"
                  data-testid={`description-${role.name}`}
                >
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{role.label}</div>
                    <div className="text-xs text-muted-foreground">{role.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Permissions Matrix */}
        <div>
          <h3 className="font-semibold text-sm mb-3">Permissions Matrix</h3>
          <div className="overflow-x-auto">
            <div className="min-w-full">
              {/* Header Row */}
              <div className="grid grid-cols-7 gap-1 mb-2 text-xs font-medium">
                <div className="p-2">Permission</div>
                {ROLES.map(role => (
                  <div key={role.name} className="p-2 text-center">
                    {role.label}
                  </div>
                ))}
              </div>
              
              {/* Permission Rows */}
              {PERMISSIONS.map(permission => (
                <div 
                  key={permission.key} 
                  className="grid grid-cols-7 gap-1 mb-1 text-xs border rounded-lg p-1"
                  data-testid={`permission-row-${permission.key}`}
                >
                  <div className="p-2">
                    <div className="font-medium">{permission.label}</div>
                    <div className="text-muted-foreground text-xs">{permission.description}</div>
                  </div>
                  {ROLES.map(role => {
                    const value = permission.levels[role.name as keyof typeof permission.levels];
                    return (
                      <div 
                        key={role.name} 
                        className="p-2 text-center flex flex-col items-center gap-1"
                        data-testid={`permission-${permission.key}-${role.name}`}
                      >
                        <PermissionIcon value={value} />
                        <span className="text-xs">{getPermissionText(value)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* Special Permissions */}
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <PenTool className="h-4 w-4" />
            Special Permissions
          </h3>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <PenTool className="h-4 w-4 mt-0.5 text-blue-600" />
              <div>
                <div className="font-medium text-sm text-blue-900 dark:text-blue-100">
                  Signer Capability
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  <strong>Independent of role:</strong> Any member can be granted signing permission to approve stage sign-offs and formal project deliverables. This authorization is managed separately from the role hierarchy.
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  Examples: A "member" role with signer permission can approve stages, while a "pm" role without signer permission cannot.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Notes */}
        <div className="bg-muted/50 rounded-lg p-3">
          <h4 className="font-medium text-sm mb-2">Usage Notes</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• <strong>Owner role:</strong> Can assign any role including other owners and admins</li>
            <li>• <strong>Admin role:</strong> Cannot assign owner or admin roles (limited management)</li>
            <li>• <strong>Role inheritance:</strong> Higher roles include all permissions of lower roles</li>
            <li>• <strong>Signer permission:</strong> Completely independent - can be granted to any role level</li>
            <li>• <strong>Project isolation:</strong> All permissions are scoped to the specific project</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}