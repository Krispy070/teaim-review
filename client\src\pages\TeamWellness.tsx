import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Heart, TrendingUp, Calendar, Users, MessageCircle, Coffee, Battery, CheckCircle2 } from "lucide-react";

const teamMembers = [
  {
    id: 1,
    name: "Sarah Johnson",
    role: "Project Manager",
    wellnessScore: 85,
    workload: 75,
    satisfaction: 92,
    lastCheckIn: "2025-09-26",
    status: "good",
    initiatives: ["Flexible hours", "Mental health days"]
  },
  {
    id: 2,
    name: "Mike Chen",
    role: "Lead Developer",
    wellnessScore: 72,
    workload: 95,
    satisfaction: 68,
    lastCheckIn: "2025-09-25",
    status: "concern",
    initiatives: ["Workload review", "1:1 support"]
  },
  {
    id: 3,
    name: "Emily Rodriguez",
    role: "Business Analyst",
    wellnessScore: 91,
    workload: 65,
    satisfaction: 89,
    lastCheckIn: "2025-09-26",
    status: "excellent",
    initiatives: ["Team mentoring", "Innovation time"]
  },
  {
    id: 4,
    name: "David Kim",
    role: "QA Engineer",
    wellnessScore: 78,
    workload: 80,
    satisfaction: 76,
    lastCheckIn: "2025-09-24",
    status: "good",
    initiatives: ["Skill development", "Cross-training"]
  }
];

const wellnessInitiatives = [
  {
    id: 1,
    title: "Flexible Working Hours",
    description: "Allow team members to adjust their schedule for better work-life balance",
    participants: 15,
    effectiveness: 88,
    status: "active"
  },
  {
    id: 2,
    title: "Mental Health Support",
    description: "Monthly 1:1 wellness check-ins with team leads",
    participants: 20,
    effectiveness: 92,
    status: "active"
  },
  {
    id: 3,
    title: "Team Building Activities",
    description: "Bi-weekly virtual and in-person team bonding sessions",
    participants: 18,
    effectiveness: 76,
    status: "active"
  },
  {
    id: 4,
    title: "Workload Balancing",
    description: "AI-powered workload distribution based on capacity and skills",
    participants: 20,
    effectiveness: 85,
    status: "pilot"
  }
];

export default function TeamWellness() {
  const [selectedMember, setSelectedMember] = useState<number | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "excellent": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "good": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "concern": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "risk": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Team Wellness</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Monitor team health, workload balance, and job satisfaction during the Workday implementation
          </p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="schedule-checkin">
            <Calendar className="w-4 h-4 mr-2" />
            Schedule Check-in
          </Button>
          <Button variant="outline" data-testid="wellness-report">
            <TrendingUp className="w-4 h-4 mr-2" />
            Wellness Report
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Overall Wellness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">81.5%</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +3.2% this month
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Team Satisfaction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">78.8%</div>
            <div className="text-xs text-gray-500">4.2/5 average rating</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Workload Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">78.8%</div>
            <div className="text-xs text-gray-500">2 members overloaded</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Initiatives</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4</div>
            <div className="text-xs text-gray-500">All showing positive impact</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Team Overview</TabsTrigger>
          <TabsTrigger value="initiatives" data-testid="tab-initiatives">Wellness Initiatives</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {teamMembers.map((member) => (
              <Card 
                key={member.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedMember(member.id)}
                data-testid={`team-member-${member.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{member.name}</CardTitle>
                      <CardDescription>{member.role}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(member.status)}>
                      {member.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Wellness Score</span>
                      <span className={`font-semibold ${getScoreColor(member.wellnessScore)}`}>
                        {member.wellnessScore}%
                      </span>
                    </div>
                    <Progress value={member.wellnessScore} className="h-2" />
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Workload</div>
                        <div className={`font-medium ${member.workload > 90 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                          {member.workload}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Satisfaction</div>
                        <div className={`font-medium ${getScoreColor(member.satisfaction)}`}>
                          {member.satisfaction}%
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      Last check-in: {new Date(member.lastCheckIn).toLocaleDateString()}
                    </div>

                    {member.initiatives.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {member.initiatives.map((initiative, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {initiative}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="initiatives" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-500" />
                Wellness Initiatives
              </CardTitle>
              <CardDescription>
                Active programs and initiatives to support team wellness during the implementation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {wellnessInitiatives.map((initiative) => (
                  <div 
                    key={initiative.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    data-testid={`initiative-${initiative.id}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">
                            {initiative.title}
                          </h3>
                          <Badge variant="outline">
                            {initiative.status.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {initiative.description}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500 mb-1">Participation</div>
                        <div className="flex items-center gap-2">
                          <Users className="w-3 h-3" />
                          <span>{initiative.participants} team members</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Effectiveness</div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full"
                              style={{ width: `${initiative.effectiveness}%` }}
                            />
                          </div>
                          <span className="font-medium">{initiative.effectiveness}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Wellness Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Week 1 (Sept 1-7)</span>
                    <span className="font-semibold">79%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Week 2 (Sept 8-14)</span>
                    <span className="font-semibold">77%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Week 3 (Sept 15-21)</span>
                    <span className="font-semibold">80%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Week 4 (Sept 22-28)</span>
                    <span className="font-semibold text-green-600">82%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Recent Feedback
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="font-medium text-green-800 dark:text-green-300">Sarah J.</div>
                    <div className="text-green-700 dark:text-green-400">
                      "Flexible hours really helping with work-life balance!"
                    </div>
                  </div>
                  <div className="text-sm p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="font-medium text-blue-800 dark:text-blue-300">Emily R.</div>
                    <div className="text-blue-700 dark:text-blue-400">
                      "Team mentoring program is excellent for skill development."
                    </div>
                  </div>
                  <div className="text-sm p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="font-medium text-yellow-800 dark:text-yellow-300">Mike C.</div>
                    <div className="text-yellow-700 dark:text-yellow-400">
                      "Could use better workload distribution during crunch times."
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recommended Actions</CardTitle>
              <CardDescription>
                AI-powered recommendations based on team wellness data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      Schedule 1:1 with Mike Chen
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Workload at 95% - consider redistributing tasks or extending timeline
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <Coffee className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      Organize team coffee chat
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      It's been 2 weeks since last informal team gathering
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <Battery className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      Consider project milestone celebration
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Team morale boost after completing HCM configuration phase
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}