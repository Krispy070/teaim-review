import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Archive, 
  RotateCcw, 
  Download, 
  Plus, 
  FolderOpen, 
  Loader2,
  ChevronDown,
  FileText,
  Database
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import TenantLeakSentinel from "@/components/TenantLeakSentinel";

interface Project {
  id: string;
  name: string;
  code: string;
  client_name: string;
  status: string;
  lifecycle_status: string;
  archived_at?: string;
  created_at: string;
}

interface ProjectsAdminProps {
  orgId?: string;
}

export default function ProjectsAdmin({ orgId = "550e8400-e29b-41d4-a716-446655440000" }: ProjectsAdminProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  async function loadProjects() {
    if (!orgId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/list?org_id=${orgId}`);
      const data = await response.json();
      setProjects(data.items || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, [orgId]);

  async function archiveProject(projectId: string, projectName: string) {
    setActionLoading(projectId);
    try {
      const response = await fetch("/api/projects/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          purge_vectors: true
        })
      });

      const result = await response.json();
      if (result.ok) {
        toast({
          title: "Project Archived",
          description: `${projectName} has been archived successfully`,
        });
        loadProjects();
      } else {
        throw new Error(result.error || "Archive failed");
      }
    } catch (error) {
      toast({
        title: "Archive Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function reopenProject(projectId: string, projectName: string) {
    setActionLoading(projectId);
    try {
      const response = await fetch("/api/projects/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId
        })
      });

      const result = await response.json();
      if (result.ok) {
        toast({
          title: "Project Reopened",
          description: `${projectName} is now active again`,
        });
        loadProjects();
      } else {
        throw new Error(result.error || "Reopen failed");
      }
    } catch (error) {
      toast({
        title: "Reopen Failed", 
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function exportProject(projectId: string, projectName: string) {
    setActionLoading(projectId);
    try {
      toast({
        title: "Export Started",
        description: "Creating ZIP archive...",
      });

      const response = await fetch("/api/projects/export/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId
        })
      });

      const result = await response.json();
      if (result.ok) {
        // Get download URL
        const downloadResponse = await fetch(
          `/api/projects/export/download?org_id=${orgId}&project_id=${projectId}`
        );
        const downloadData = await downloadResponse.json();
        
        if (downloadData.ok && downloadData.url) {
          // Trigger download
          window.open(downloadData.url, '_blank');
          toast({
            title: "Export Ready",
            description: `${projectName} export is downloading`,
          });
        } else {
          toast({
            title: "Export Created",
            description: "Export completed, download will be available shortly",
          });
        }
      } else {
        throw new Error(result.error || "Export failed");
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  }

  // New streaming export with memory toggle  
  async function streamExport(projectId: string, projectName: string, includeMemory: boolean) {
    setActionLoading(projectId);
    try {
      toast({
        title: "Streaming Export Started",
        description: "Downloading ZIP archive...",
      });

      // Use fetch to ensure Authorization headers are included
      const response = await fetch(`/api/projects/export/stream?project_id=${projectId}&include_mem=${includeMemory}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`, // Include auth if available
        }
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status} ${response.statusText}`);
      }

      // Convert to blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${projectId}_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Ready",
        description: `${projectName} ZIP ${includeMemory ? '(with memory)' : '(artifacts only)'} downloaded`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  }

  const getStatusBadge = (lifecycleStatus: string) => {
    switch (lifecycleStatus) {
      case "active":
        return <Badge variant="default" data-testid={`status-active`}>Active</Badge>;
      case "archived":
        return <Badge variant="secondary" data-testid={`status-archived`}>Archived</Badge>;
      case "archiving":
        return <Badge variant="outline" data-testid={`status-archiving`}>Archiving...</Badge>;
      default:
        return <Badge variant="outline" data-testid={`status-unknown`}>{lifecycleStatus}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects Admin</h1>
          <p className="text-muted-foreground">
            Manage project lifecycle, exports, and archival
          </p>
        </div>
        <Button data-testid="button-new-project">
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Security Testing Section */}
      <TenantLeakSentinel orgId={orgId} />

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading projects...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-8">
                <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No projects yet</h3>
                <p className="text-sm text-muted-foreground text-center" data-testid="projects-empty-state">
                  Create your first project to get started with TEAIM
                </p>
              </CardContent>
            </Card>
          ) : (
            projects.map((project) => (
              <Card key={project.id} data-testid={`project-card-${project.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg" data-testid={`project-name-${project.id}`}>
                        {project.name}
                      </CardTitle>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span data-testid={`project-code-${project.id}`}>
                          {project.code}
                        </span>
                        <span data-testid={`project-client-${project.id}`}>
                          {project.client_name}
                        </span>
                        <Badge variant="outline" data-testid={`project-phase-${project.id}`}>
                          {project.status}
                        </Badge>
                      </div>
                    </div>
                    {getStatusBadge(project.lifecycle_status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Created {new Date(project.created_at).toLocaleDateString()}
                      {project.archived_at && (
                        <span className="ml-2">
                          • Archived {new Date(project.archived_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {project.lifecycle_status === "active" ? (
                        <>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={actionLoading === project.id}
                                data-testid={`button-export-dropdown-${project.id}`}
                              >
                                {actionLoading === project.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Download className="w-4 h-4 mr-1" />
                                    <ChevronDown className="w-3 h-3" />
                                  </>
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem 
                                onClick={() => exportProject(project.id, project.name)}
                                data-testid={`export-legacy-${project.id}`}
                              >
                                <Archive className="w-4 h-4 mr-2" />
                                Legacy Export
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => streamExport(project.id, project.name, false)}
                                data-testid={`export-artifacts-${project.id}`}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                ZIP (Artifacts Only)
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => streamExport(project.id, project.name, true)}
                                data-testid={`export-full-${project.id}`}
                              >
                                <Database className="w-4 h-4 mr-2" />
                                ZIP (With Memory)
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => archiveProject(project.id, project.name)}
                            disabled={actionLoading === project.id}
                            data-testid={`button-archive-${project.id}`}
                          >
                            {actionLoading === project.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Archive className="w-4 h-4" />
                            )}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reopenProject(project.id, project.name)}
                          disabled={actionLoading === project.id}
                          data-testid={`button-reopen-${project.id}`}
                        >
                          {actionLoading === project.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}