import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Plus, 
  X, 
  Loader2,
  Rocket 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface ProjectWizardProps {
  orgId?: string;
  onComplete?: (projectId: string) => void;
}

export default function ProjectWizard({ 
  orgId = "550e8400-e29b-41d4-a716-446655440000",
  onComplete 
}: ProjectWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Step 1: Basic Info
  const [name, setName] = useState("");
  const [code, setCode] = useState("WD-");
  const [clientName, setClientName] = useState("");

  // Step 2: Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContact, setNewContact] = useState<Contact>({
    name: "", email: "", role: "", workstream: ""
  });

  // Step 3: Optional SOW & Workstreams
  const [sowText, setSowText] = useState("");
  const [customWorkstreams, setCustomWorkstreams] = useState<Workstream[]>([]);
  const [newWorkstream, setNewWorkstream] = useState<Workstream>({
    name: "", description: ""
  });

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
    return true; // Steps 2 and 3 are optional
  };

  const createProject = async () => {
    setLoading(true);
    try {
      // Step 1: Create project
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

      // Step 2: Seed with contacts and workstreams
      if (contacts.length > 0 || customWorkstreams.length > 0 || sowText.trim()) {
        const seedResponse = await fetch("/api/projects/onboarding/seed", {
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

        const seedResult = await seedResponse.json();
        if (!seedResult.ok) {
          console.warn("Seeding failed:", seedResult.error);
        }
      }

      toast({
        title: "Project Created!",
        description: `${name} (${code}) is ready to go`,
      });

      if (onComplete) {
        onComplete(projectId);
      }

    } catch (error) {
      toast({
        title: "Creation Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name" data-testid="label-project-name">Project Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., ACME Corp Workday Implementation"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-code" data-testid="label-project-code">Project Code</Label>
              <Input
                id="project-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g., WD-ACME-2024"
                data-testid="input-project-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-name" data-testid="label-client-name">Client Name</Label>
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
              <h3 className="font-medium">Project Contacts</h3>
              {contacts.map((contact, index) => (
                <div key={index} className="flex items-center gap-2 p-2 border rounded">
                  <div className="flex-1">
                    <div className="font-medium" data-testid={`contact-name-${index}`}>
                      {contact.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {contact.email} • {contact.role}
                      {contact.workstream && ` • ${contact.workstream}`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeContact(index)}
                    data-testid={`button-remove-contact-${index}`}
                  >
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
                data-testid="input-contact-name"
              />
              <Input
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder="Email"
                data-testid="input-contact-email"
              />
              <Input
                value={newContact.role}
                onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                placeholder="Role (PM, Lead, etc.)"
                data-testid="input-contact-role"
              />
              <Input
                value={newContact.workstream}
                onChange={(e) => setNewContact({ ...newContact, workstream: e.target.value })}
                placeholder="Workstream (optional)"
                data-testid="input-contact-workstream"
              />
            </div>
            <Button
              variant="outline"
              onClick={addContact}
              disabled={!newContact.name || !newContact.email}
              data-testid="button-add-contact"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sow-text">Statement of Work (Optional)</Label>
              <Textarea
                id="sow-text"
                value={sowText}
                onChange={(e) => setSowText(e.target.value)}
                placeholder="Paste SOW text here to auto-extract workstreams and timeline..."
                rows={4}
                data-testid="textarea-sow"
              />
            </div>

            <div className="space-y-3">
              <h3 className="font-medium">Custom Workstreams</h3>
              <p className="text-sm text-muted-foreground">
                Override default workstreams (HCM, Payroll, Finance, etc.)
              </p>
              
              {customWorkstreams.map((ws, index) => (
                <div key={index} className="flex items-center gap-2 p-2 border rounded">
                  <div className="flex-1">
                    <div className="font-medium" data-testid={`workstream-name-${index}`}>
                      {ws.name}
                    </div>
                    {ws.description && (
                      <div className="text-sm text-muted-foreground">
                        {ws.description}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeWorkstream(index)}
                    data-testid={`button-remove-workstream-${index}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              <div className="grid grid-cols-1 gap-2">
                <Input
                  value={newWorkstream.name}
                  onChange={(e) => setNewWorkstream({ ...newWorkstream, name: e.target.value })}
                  placeholder="Workstream name"
                  data-testid="input-workstream-name"
                />
                <Input
                  value={newWorkstream.description}
                  onChange={(e) => setNewWorkstream({ ...newWorkstream, description: e.target.value })}
                  placeholder="Description (optional)"
                  data-testid="input-workstream-description"
                />
              </div>
              <Button
                variant="outline"
                onClick={addWorkstream}
                disabled={!newWorkstream.name}
                data-testid="button-add-workstream"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Workstream
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <Rocket className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">New Project Wizard</h1>
        <p className="text-muted-foreground">
          Set up your Workday implementation project
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-center space-x-2">
        {[1, 2, 3].map((stepNum) => (
          <div key={stepNum} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              stepNum === step ? 'bg-primary text-primary-foreground' :
              stepNum < step ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
            }`} data-testid={`step-indicator-${stepNum}`}>
              {stepNum < step ? <Check className="w-4 h-4" /> : stepNum}
            </div>
            {stepNum < 3 && (
              <div className={`w-12 h-0.5 mx-2 ${
                stepNum < step ? 'bg-green-500' : 'bg-muted'
              }`} />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle data-testid={`step-title-${step}`}>
            {step === 1 && "Project Details"}
            {step === 2 && "Team Contacts"}
            {step === 3 && "Configuration"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderStep()}

          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              data-testid="button-back"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                data-testid="button-next"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={createProject}
                disabled={loading || !canProceed()}
                data-testid="button-create-project"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Create Project
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}