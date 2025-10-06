import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Play, Bug, CheckCircle2, Clock, AlertTriangle, Target, FileText, Settings } from "lucide-react";

const testSuites = [
  {
    id: 1,
    name: "Core HCM Functionality",
    description: "Basic HR management and employee data tests",
    totalTests: 45,
    passedTests: 42,
    failedTests: 2,
    skippedTests: 1,
    status: "running",
    lastRun: "2025-09-27T01:15:00Z",
    duration: "8m 32s"
  },
  {
    id: 2,
    name: "Financial Management", 
    description: "Accounting, budgeting, and financial reporting tests",
    totalTests: 38,
    passedTests: 35,
    failedTests: 3,
    skippedTests: 0,
    status: "completed",
    lastRun: "2025-09-27T00:45:00Z",
    duration: "12m 18s"
  },
  {
    id: 3,
    name: "Payroll Processing",
    description: "Payroll calculations and processing workflows",
    totalTests: 29,
    passedTests: 28,
    failedTests: 0,
    skippedTests: 1,
    status: "completed",
    lastRun: "2025-09-26T23:30:00Z",
    duration: "6m 45s"
  },
  {
    id: 4,
    name: "Integration Tests",
    description: "Third-party integrations and API connectivity",
    totalTests: 52,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    status: "pending",
    lastRun: null,
    duration: null
  },
  {
    id: 5,
    name: "Performance Tests",
    description: "Load testing and performance benchmarks",
    totalTests: 15,
    passedTests: 12,
    failedTests: 3,
    skippedTests: 0,
    status: "failed",
    lastRun: "2025-09-26T22:00:00Z",
    duration: "25m 12s"
  }
];

const recentBugs = [
  {
    id: "BUG-201",
    title: "Employee search timeout on large datasets",
    severity: "high",
    status: "open",
    assignee: "Mike Chen",
    created: "2025-09-26"
  },
  {
    id: "BUG-202", 
    title: "Payroll calculation rounding error",
    severity: "medium",
    status: "in_progress",
    assignee: "Sarah Johnson",
    created: "2025-09-25"
  },
  {
    id: "BUG-203",
    title: "Dashboard widget loading issue",
    severity: "low",
    status: "resolved",
    assignee: "David Kim",
    created: "2025-09-24"
  },
  {
    id: "BUG-204",
    title: "API rate limiting causing failures",
    severity: "critical",
    status: "open",
    assignee: "Emily Rodriguez",
    created: "2025-09-26"
  }
];

export default function Testing() {
  const [selectedSuite, setSelectedSuite] = useState<number | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "running": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "failed": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "pending": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "high": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
      case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "low": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getBugStatusColor = (status: string) => {
    switch (status) {
      case "resolved": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "in_progress": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "open": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const calculatePassRate = (suite: any) => {
    if (suite.totalTests === 0) return 0;
    return Math.round((suite.passedTests / suite.totalTests) * 100);
  };

  const totalTests = testSuites.reduce((sum, suite) => sum + suite.totalTests, 0);
  const totalPassed = testSuites.reduce((sum, suite) => sum + suite.passedTests, 0);
  const totalFailed = testSuites.reduce((sum, suite) => sum + suite.failedTests, 0);
  const overallPassRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Testing Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Automated testing results and quality assurance for Workday implementation
          </p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="run-all-tests">
            <Play className="w-4 h-4 mr-2" />
            Run All Tests
          </Button>
          <Button variant="outline" data-testid="test-report">
            <FileText className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTests}</div>
            <div className="text-xs text-gray-500">Across 5 test suites</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{overallPassRate}%</div>
            <div className="text-xs text-gray-500">{totalPassed} passed, {totalFailed} failed</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Bugs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {recentBugs.filter(bug => bug.status !== 'resolved').length}
            </div>
            <div className="text-xs text-gray-500">
              {recentBugs.filter(bug => bug.severity === 'critical').length} critical
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Test Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">87%</div>
            <div className="text-xs text-gray-500">Code coverage</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="suites" className="space-y-4">
        <TabsList>
          <TabsTrigger value="suites" data-testid="tab-suites">Test Suites</TabsTrigger>
          <TabsTrigger value="bugs" data-testid="tab-bugs">Bug Tracking</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="suites" className="space-y-4">
          <div className="space-y-4">
            {testSuites.map((suite) => (
              <Card 
                key={suite.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedSuite(suite.id)}
                data-testid={`test-suite-${suite.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{suite.name}</CardTitle>
                      <CardDescription>{suite.description}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(suite.status)}>
                      {suite.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Pass Rate</span>
                      <span className="font-semibold text-green-600">
                        {calculatePassRate(suite)}%
                      </span>
                    </div>
                    <Progress value={calculatePassRate(suite)} className="h-2" />
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        <span>{suite.passedTests} passed</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-red-600" />
                        <span>{suite.failedTests} failed</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-500" />
                        <span>{suite.skippedTests} skipped</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>
                        {suite.lastRun ? 
                          `Last run: ${new Date(suite.lastRun).toLocaleString()}` : 
                          'Never run'
                        }
                      </span>
                      {suite.duration && (
                        <span>Duration: {suite.duration}</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        disabled={suite.status === 'running'}
                        data-testid={`run-suite-${suite.id}`}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        {suite.status === 'running' ? 'Running...' : 'Run Tests'}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        data-testid={`view-details-${suite.id}`}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bugs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bug className="w-5 h-5 text-red-500" />
                Bug Tracking
              </CardTitle>
              <CardDescription>
                Recent bugs and issues discovered during testing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentBugs.map((bug) => (
                  <div 
                    key={bug.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    data-testid={`bug-${bug.id}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-gray-500">{bug.id}</span>
                          <Badge className={getSeverityColor(bug.severity)}>
                            {bug.severity.toUpperCase()}
                          </Badge>
                          <Badge className={getBugStatusColor(bug.status)}>
                            {bug.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">
                          {bug.title}
                        </h3>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                      <span>Assigned to: {bug.assignee}</span>
                      <span>Created: {new Date(bug.created).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Test Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Code Coverage</span>
                    <span className="font-semibold">87%</span>
                  </div>
                  <Progress value={87} className="h-2" />
                  
                  <div className="flex justify-between">
                    <span>Test Automation</span>
                    <span className="font-semibold">94%</span>
                  </div>
                  <Progress value={94} className="h-2" />
                  
                  <div className="flex justify-between">
                    <span>Bug Resolution Rate</span>
                    <span className="font-semibold">76%</span>
                  </div>
                  <Progress value={76} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Testing Tools
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 border rounded">
                    <span>Selenium WebDriver</span>
                    <Badge variant="outline">Active</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 border rounded">
                    <span>Jest Unit Tests</span>
                    <Badge variant="outline">Active</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 border rounded">
                    <span>Postman API Tests</span>
                    <Badge variant="outline">Active</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 border rounded">
                    <span>JMeter Load Tests</span>
                    <Badge variant="outline">Configured</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quality Gates</CardTitle>
              <CardDescription>
                Automated quality checks before deployment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div className="flex-1">
                    <div className="font-medium">Code Coverage Above 80%</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Current: 87%</div>
                  </div>
                  <Badge className="bg-green-100 text-green-800">PASSED</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div className="flex-1">
                    <div className="font-medium">All Critical Tests Pass</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">117 out of 117 tests</div>
                  </div>
                  <Badge className="bg-green-100 text-green-800">PASSED</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <div className="flex-1">
                    <div className="font-medium">No Critical Bugs</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">1 critical bug open</div>
                  </div>
                  <Badge className="bg-red-100 text-red-800">FAILED</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}