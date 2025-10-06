import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, AlertTriangle, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface TestResult {
  ok: boolean;
  leak: boolean | null;
  message: string;
  current_user: string;
  current_org: string;
  target_project: string;
  test_type: string;
  error_type?: string;
}

interface Project {
  id: string;
  code: string;
  org_id: string;
}

interface TenantLeakSentinelProps {
  orgId?: string;
}

export default function TenantLeakSentinel({ orgId = "87654321-4321-4321-4321-cba987654321" }: TenantLeakSentinelProps) {
  const [selectedProject, setSelectedProject] = useState("");
  const [targetProject, setTargetProject] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  // Fetch available projects for testing using the correct endpoint
  const { data: projectsData } = useQuery({
    queryKey: ['/api/projects/list', orgId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/list?org_id=${orgId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    enabled: !!orgId
  });

  const projects: Project[] = projectsData?.items || [];

  const runSecurityTest = async () => {
    if (!selectedProject || !targetProject) return;
    
    setTesting(true);
    setResult(null);
    
    try {
      const response = await fetch(`/sentinel/tenant-leak?project_id=${selectedProject}&target_project_id=${targetProject}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        leak: null,
        message: `Test failed: ${String(error)}`,
        current_user: "",
        current_org: "",
        target_project: targetProject,
        test_type: "network_error"
      });
    } finally {
      setTesting(false);
    }
  };

  const getResultIcon = () => {
    if (!result) return null;
    
    if (!result.ok || result.leak === null) {
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    }
    
    return result.leak ? (
      <XCircle className="h-5 w-5 text-red-500" />
    ) : (
      <CheckCircle className="h-5 w-5 text-green-500" />
    );
  };

  const getResultColor = () => {
    if (!result) return "border-gray-200";
    
    if (!result.ok || result.leak === null) {
      return "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20";
    }
    
    return result.leak ? 
      "border-red-500 bg-red-50 dark:bg-red-900/20" : 
      "border-green-500 bg-green-50 dark:bg-green-900/20";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Tenant Leak Sentinel
        </CardTitle>
        <CardDescription>
          Test multi-tenant security isolation. This tool attempts cross-project data access to verify Row Level Security (RLS) is working correctly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Current Project</label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger data-testid="select-current-project">
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code || project.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Project (to test access)</label>
            <Select value={targetProject} onValueChange={setTargetProject}>
              <SelectTrigger data-testid="select-target-project">
                <SelectValue placeholder="Select target..." />
              </SelectTrigger>
              <SelectContent>
                {projects.filter(p => p.id !== selectedProject).map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code || project.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={runSecurityTest}
          disabled={!selectedProject || !targetProject || testing}
          className="w-full"
          data-testid="button-run-security-test"
        >
          {testing ? "Testing Security..." : "Run Security Test"}
        </Button>

        {result && (
          <Alert className={getResultColor()}>
            <div className="flex items-start gap-2">
              {getResultIcon()}
              <div className="flex-1">
                <AlertDescription>
                  <div className="font-semibold mb-1">{result.message}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <div>Test Type: {result.test_type}</div>
                    <div>Current User: {result.current_user}</div>
                    <div>Organization: {result.current_org}</div>
                    <div>Target Project: {result.target_project}</div>
                    {result.error_type && <div>Error Type: {result.error_type}</div>}
                  </div>
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <div className="text-xs text-gray-500 border-t pt-3 mt-4">
          <div className="space-y-1">
            <div><strong>PASS:</strong> Access to target project correctly blocked by RLS</div>
            <div><strong>FAIL:</strong> Data leaked across projects - security issue detected</div>
            <div><strong>ERROR:</strong> Test could not complete - check database configuration</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}