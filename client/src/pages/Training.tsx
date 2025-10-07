import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Play, Clock, CheckCircle2, Users, FileText, Video, Download } from "lucide-react";

const trainingModules = [
  {
    id: 1,
    title: "Workday Fundamentals",
    description: "Introduction to Workday concepts and navigation",
    duration: "2 hours",
    status: "available",
    type: "video",
    completedBy: 12,
    totalUsers: 20
  },
  {
    id: 2,
    title: "HCM Configuration",
    description: "Setting up Human Capital Management modules",
    duration: "3 hours",
    status: "available", 
    type: "interactive",
    completedBy: 8,
    totalUsers: 20
  },
  {
    id: 3,
    title: "Financial Management",
    description: "Workday Financial Management setup and processes",
    duration: "4 hours",
    status: "coming_soon",
    type: "video",
    completedBy: 0,
    totalUsers: 20
  },
  {
    id: 4,
    title: "Reporting & Analytics",
    description: "Creating reports and dashboards in Workday",
    duration: "2.5 hours",
    status: "available",
    type: "document",
    completedBy: 15,
    totalUsers: 20
  },
  {
    id: 5,
    title: "Integration Patterns",
    description: "Best practices for Workday integrations",
    duration: "3.5 hours",
    status: "in_progress",
    type: "interactive",
    completedBy: 3,
    totalUsers: 20
  }
];

const resources = [
  {
    title: "Workday Implementation Guide",
    type: "PDF",
    size: "2.4 MB",
    downloads: 156
  },
  {
    title: "Quick Reference Cards",
    type: "PDF", 
    size: "890 KB",
    downloads: 203
  },
  {
    title: "Video Tutorial Collection",
    type: "ZIP",
    size: "45.2 MB", 
    downloads: 87
  },
  {
    title: "Configuration Templates",
    type: "XLSX",
    size: "1.2 MB",
    downloads: 134
  }
];

export default function Training() {
  const [selectedModule, setSelectedModule] = useState<number | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "in_progress": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "coming_soon": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="w-4 h-4" />;
      case "interactive": return <Play className="w-4 h-4" />;
      case "document": return <FileText className="w-4 h-4" />;
      default: return <BookOpen className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Training Center</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Comprehensive Workday implementation training modules and resources
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            20 Team Members
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            68% Completion Rate
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="modules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="modules" data-testid="tab-modules">Training Modules</TabsTrigger>
          <TabsTrigger value="resources" data-testid="tab-resources">Resources</TabsTrigger>
          <TabsTrigger value="progress" data-testid="tab-progress">Team Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {trainingModules.map((module) => (
              <Card 
                key={module.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedModule(module.id)}
                data-testid={`training-module-${module.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(module.type)}
                      <Badge className={getStatusColor(module.status)}>
                        {module.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center text-sm text-gray-500 gap-1">
                      <Clock className="w-3 h-3" />
                      {module.duration}
                    </div>
                  </div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {module.completedBy}/{module.totalUsers} completed
                    </div>
                    <div className="flex gap-2">
                      {module.status === "available" && (
                        <Button size="sm" data-testid={`start-module-${module.id}`}>
                          <Play className="w-3 h-3 mr-1" />
                          Start
                        </Button>
                      )}
                      {module.status === "in_progress" && (
                        <Button size="sm" variant="outline" data-testid={`continue-module-${module.id}`}>
                          Continue
                        </Button>
                      )}
                      {module.status === "coming_soon" && (
                        <Button size="sm" variant="ghost" disabled>
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${(module.completedBy / module.totalUsers) * 100}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Training Resources
              </CardTitle>
              <CardDescription>
                Download helpful materials and reference documents for your Workday implementation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {resources.map((resource, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    data-testid={`resource-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {resource.title}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <span>{resource.type}</span>
                          <span>•</span>
                          <span>{resource.size}</span>
                          <span>•</span>
                          <span>{resource.downloads} downloads</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" data-testid={`download-resource-${index}`}>
                      <Download className="w-3 h-3 mr-1" />
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Overall Progress</CardTitle>
                <CardDescription>Team training completion statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Average Completion</span>
                    <span className="font-semibold">68%</span>
                  </div>
                  <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div className="bg-primary h-3 rounded-full" style={{ width: "68%" }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Completed Modules</div>
                      <div className="text-xl font-semibold">38</div>
                    </div>
                    <div>
                      <div className="text-gray-500">In Progress</div>
                      <div className="text-xl font-semibold">12</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Performers</CardTitle>
                <CardDescription>Team members with highest completion rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { name: "Sarah Johnson", completion: 95 },
                    { name: "Mike Chen", completion: 87 },
                    { name: "Emily Rodriguez", completion: 82 },
                    { name: "David Kim", completion: 78 }
                  ].map((user, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm">{user.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${user.completion}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8">{user.completion}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}