import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Archive, 
  RotateCcw, 
  Download, 
  Plus, 
  Loader2,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Rocket,
  ChevronDown,
  FolderOpen
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";

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

interface Contact {
  name: string;
  email: string;
  role: string;
  workstream: string;
}

interface Workstream {
  name: string;
  description: string;
}

interface ProjectManagementProps {
  orgId?: string;
}

export default function ProjectManagement({ orgId = "87654321-4321-4321-4321-cba987654321" }: ProjectManagementProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { refreshProjects } = useProject();

  // Wizard state
  const [step, setStep] = useState(1);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("WD-");
  const [clientName, setClientName] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContact, setNewContact] = useState<Contact>({
    name: "", email: "", role: "", workstream: ""
  });
  const [sowText, setSowText] = useState("");
  const [customWorkstreams, setCustomWorkstreams] = useState<Workstream[]>([]);
  const [newWorkstream, setNewWorkstream] = useState<Workstream>({
    name: "", description: ""
  });

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

  async function streamExport(projectId: string, projectName: string, includeMemory: boolean) {
    setActionLoading(projectId);
    try {
      toast({
        title: "Export Started",
        description: "Downloading ZIP archive...",
      });

      const response = await fetch(`/api/projects/export/stream?project_id=${projectId}&include_mem=${includeMemory}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status} ${response.statusText}`);
      }

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
        title: "Export Complete",
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

  // Wizard functions
  const addContact = () => {
    if (newContact.name && newContact.email) {
      setContacts([...contacts, newContact]);
      setNewContact({ name: "", email: "", role: "", workstream: "" });
    }
  };

  const removeContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const addWorkstream = () => {
    if (newWorkstream.name) {
      setCustomWorkstreams([...customWorkstreams, newWorkstream]);
      setNewWorkstream({ name: "", description: "" });
    }
  };

  const removeWorkstream = (index: number) => {
    setCustomWorkstreams(customWorkstreams.filter((_, i) => i !== index));
  };

  const canProceed = () => {
    if (step === 1) {
      return name.trim() && code.trim() && clientName.trim();
    }
    return true;
  };

  const resetWizard = () => {
    setStep(1);
    setName("");
    setCode("WD-");
    setClientName("");
    setContacts([]);
    setNewContact({ name: "", email: "", role: "", workstream: "" });
    setSowText("");
    setCustomWorkstreams([]);
    setNewWorkstream({ name: "", description: "" });
  };

  const createProject = async () => {
    setWizardLoading(true);
    try {
      const createResponse = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          name: name.trim(),
          code: code.trim(),
          client_name: clientName.trim()
        })
      });

      const createResult = await createResponse.json();
      if (!createResult.ok) {
        throw new Error(createResult.error || "Failed to create project");
      }

      const projectId = createResult.project.id;

      if (contacts.length > 0 || customWorkstreams.length > 0 || sowText.trim()) {
        await fetch("/api/projects/onboarding/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            org_id: orgId,
            project_id: projectId,
            contacts: contacts,
            workstreams: customWorkstreams,
            sow_text: sowText.trim() || null
          })
        });
      }

      toast({
        title: "Project Created!",
        description: `${name} (${code}) is ready to go`,
      });

      setDialogOpen(false);
      resetWizard();
      loadProjects();
      
      // Refresh the global projects list for the header dropdown
      await refreshProjects();
      
      // Navigate to the new project
      navigate(`/projects/${projectId}/dashboard`);

    } catch (error) {
      toast({
        title: "Creation Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setWizardLoading(false);
    }
  };

  const renderWizardStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., ACME Corp Workday Implementation"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-code">Project Code</Label>
              <Input
                id="project-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g., WD-ACME-2024"
                data-testid="input-project-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name</Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g., ACME Corporation"
                data-testid="input-client-name"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-medium">Project Contacts (Optional)</h3>
              {contacts.map((contact, index) => (
                <div key={index} className="flex items-center gap-2 p-2 border rounded">
                  <div className="flex-1">
                    <div className="font-medium">{contact.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {contact.email} • {contact.role}
                      {contact.workstream && ` • ${contact.workstream}`}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeContact(index)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Name"
              />
              <Input
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder="Email"
              />
              <Input
                value={newContact.role}
                onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                placeholder="Role"
              />
              <Input
                value={newContact.workstream}
                onChange={(e) => setNewContact({ ...newContact, workstream: e.target.value })}
                placeholder="Workstream"
              />
            </div>

            <Button onClick={addContact} variant="outline" size="sm" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-medium">Custom Workstreams (Optional)</h3>
              {customWorkstreams.map((ws, index) => (
                <div key={index} className="flex items-center gap-2 p-2 border rounded">
                  <div className="flex-1">
                    <div className="font-medium">{ws.name}</div>
                    {ws.description && (
                      <div className="text-sm text-muted-foreground">{ws.description}</div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeWorkstream(index)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Input
                value={newWorkstream.name}
                onChange={(e) => setNewWorkstream({ ...newWorkstream, name: e.target.value })}
                placeholder="Workstream Name"
              />
              <Input
                value={newWorkstream.description}
                onChange={(e) => setNewWorkstream({ ...newWorkstream, description: e.target.value })}
                placeholder="Description (optional)"
              />
            </div>

            <Button onClick={addWorkstream} variant="outline" size="sm" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Workstream
            </Button>

            <div className="space-y-2">
              <Label htmlFor="sow-text">Statement of Work (Optional)</Label>
              <Textarea
                id="sow-text"
                value={sowText}
                onChange={(e) => setSowText(e.target.value)}
                placeholder="Paste SOW text here for AI extraction..."
                rows={6}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const activeProjects = projects.filter(p => p.lifecycle_status === 'active');
  const archivedProjects = projects.filter(p => p.lifecycle_status === 'archived');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Manage your Workday implementation projects</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetWizard();
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-project">
              <Plus className="w-4 h-4 mr-2" />
              Create New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Create New Project
                <div className="flex items-center gap-2 mt-3">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                        step === s ? 'bg-primary text-primary-foreground' : 
                        step > s ? 'bg-primary/20' : 'bg-muted'
                      }`}>
                        {step > s ? <Check className="w-4 h-4" /> : s}
                      </div>
                      {s < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="py-4">
              {renderWizardStep()}
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="ghost"
                onClick={() => setStep(Math.max(1, step - 1))}
                disabled={step === 1 || wizardLoading}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>

              {step < 3 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed() || wizardLoading}
                  data-testid="button-wizard-next"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={createProject}
                  disabled={!canProceed() || wizardLoading}
                  data-testid="button-create-project-submit"
                >
                  {wizardLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 mr-2" />
                      Create Project
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Active Projects ({activeProjects.length})</h2>
            {activeProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No active projects. Create one to get started!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeProjects.map((project) => (
                  <Card key={project.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="truncate">{project.name}</span>
                        <Badge variant="secondary">{project.code}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Client:</span>
                          <span className="font-medium">{project.client_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge variant="outline">{project.status}</Badge>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => navigate(`/projects/${project.id}/dashboard`)}
                          data-testid={`button-open-${project.id}`}
                        >
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Open
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoading === project.id}
                            >
                              {actionLoading === project.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => streamExport(project.id, project.name, false)}>
                              <Download className="w-4 h-4 mr-2" />
                              Export (Artifacts Only)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => streamExport(project.id, project.name, true)}>
                              <Download className="w-4 h-4 mr-2" />
                              Export (With Memory)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => archiveProject(project.id, project.name)}
                              className="text-destructive"
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {archivedProjects.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">Archived Projects ({archivedProjects.length})</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {archivedProjects.map((project) => (
                  <Card key={project.id} className="opacity-60">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="truncate">{project.name}</span>
                        <Badge variant="secondary">{project.code}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Client:</span>
                          <span className="font-medium">{project.client_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge variant="outline">Archived</Badge>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => reopenProject(project.id, project.name)}
                        disabled={actionLoading === project.id}
                        data-testid={`button-reopen-${project.id}`}
                      >
                        {actionLoading === project.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        Reopen
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
