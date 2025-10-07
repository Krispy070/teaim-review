import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { 
  PlayCircle, 
  Upload, 
  CheckCircle, 
  XCircle, 
  ExternalLink,
  Clock,
  AlertCircle,
  TestTube
} from "lucide-react";

interface SmokeResponse {
  ok: boolean;
  error?: string;
  details?: string;
  stage_id?: string;
  token_link?: string;
  email?: string;
}

interface SeedResponse {
  ok: boolean;
  count: number;
  results: Array<{name: string; status: number}>;
}

export default function ProjectSmokeRun() {
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  const { toast } = useToast();
  
  
  const [email, setEmail] = useState("");
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSmokeRunning, setIsSmokeRunning] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResponse | null>(null);
  const [smokeResult, setSmokeResult] = useState<SmokeResponse | null>(null);

  const handleSeedSimple = async () => {
    if (!projectId) return;
    
    setIsSeeding(true);
    setSeedResult(null);
    
    try {
      const result = await apiPost<SeedResponse>("/dev/seed-simple", undefined, { project_id: projectId });
      
      setSeedResult(result);
      
      if (result.ok) {
        toast({
          title: "Seeding completed",
          description: `Successfully seeded ${result.count} documents`
        });
      } else {
        toast({
          title: "Seeding failed", 
          description: "Check the results below for details",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Seeding error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSmokeRun = async () => {
    if (!projectId) return;
    
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address for the external signoff",
        variant: "destructive"
      });
      return;
    }
    
    setIsSmokeRunning(true);
    setSmokeResult(null);
    
    try {
      const result = await apiPost<SmokeResponse>("/dev/smoke-run", { email_to: email }, { project_id: projectId });
      
      setSmokeResult(result);
      
      if (result.ok) {
        toast({
          title: "Smoke run completed",
          description: "Discovery stage created and external signoff requested"
        });
      } else {
        toast({
          title: "Smoke run completed with issues",
          description: result.error || "Check details below",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Smoke run error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSmokeRunning(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <TestTube className="h-8 w-8 text-purple-600" />
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-title">Project QA Smoke Runner</h1>
          <p className="text-muted-foreground">
            One-click testing workflow: Seed data → Create Discovery stage → Request external signoff
          </p>
        </div>
      </div>

      {/* Step 1: Seed Simple Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Step 1: Seed Test Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload sample documents to populate the project for testing.
          </p>
          
          <Button 
            onClick={handleSeedSimple}
            disabled={isSeeding}
            className="flex items-center gap-2"
            data-testid="button-seed-documents"
          >
            {isSeeding ? (
              <>
                <Clock className="h-4 w-4 animate-spin" />
                Seeding...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Seed Documents
              </>
            )}
          </Button>

          {seedResult && (
            <Alert className={seedResult.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <div className="flex items-center gap-2">
                {seedResult.ok ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">
                      Seeded {seedResult.count} of {seedResult.results.length} documents
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {seedResult.results.map((result, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <Badge 
                            variant={result.status === 200 ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {result.status}
                          </Badge>
                          <span className="truncate">{result.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Step 2: Run Smoke Test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Step 2: Run QA Smoke Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create Discovery stage and request external signoff for workflow validation.
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="email" data-testid="label-email">External Signoff Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="qa-tester@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-email"
            />
          </div>
          
          <Button 
            onClick={handleSmokeRun}
            disabled={isSmokeRunning || !email.trim()}
            className="flex items-center gap-2"
            data-testid="button-run-smoke-test"
          >
            {isSmokeRunning ? (
              <>
                <Clock className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                Run Smoke Test
              </>
            )}
          </Button>

          {smokeResult && (
            <Alert className={smokeResult.ok ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}>
              <div className="flex items-center gap-2">
                {smokeResult.ok ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                )}
                <AlertDescription>
                  <div className="space-y-2">
                    {smokeResult.ok ? (
                      <div>
                        <p className="font-medium">Smoke test completed successfully!</p>
                        <p className="text-sm">
                          Discovery stage created (ID: {smokeResult.stage_id}) and 
                          external signoff sent to {smokeResult.email}
                        </p>
                        {smokeResult.token_link && smokeResult.token_link !== "mock://test-link" && (
                          <a 
                            href={smokeResult.token_link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                            data-testid="link-signoff-token"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Signoff Link
                          </a>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">{smokeResult.error}</p>
                        {smokeResult.details && (
                          <details className="text-xs mt-1">
                            <summary className="cursor-pointer hover:text-gray-700">
                              View Details
                            </summary>
                            <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto">
                              {smokeResult.details}
                            </pre>
                          </details>
                        )}
                        {smokeResult.token_link && smokeResult.token_link.startsWith("mock://") && (
                          <p className="text-xs text-gray-600 mt-1">
                            Mock token: {smokeResult.token_link}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800">How to Use</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-700 space-y-2">
          <ol className="list-decimal list-inside space-y-1">
            <li>First, seed test documents to populate your project with sample data</li>
            <li>Enter an email address where the external signoff should be sent</li>
            <li>Run the smoke test to create a Discovery stage and request signoff</li>
            <li>Use the signoff link to complete the external validation workflow</li>
          </ol>
          <p className="mt-3 text-xs">
            This tool is designed for QA testing and workflow validation in development environments.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}