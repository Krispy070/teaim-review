import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Check, Clock, AlertCircle } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  stage: "discover" | "design" | "config" | "test" | "deploy";
  status: "Complete" | "Configure" | "Design" | "Test" | "Deploy";
  dueDate: string;
  stages: {
    discover: boolean;
    design: boolean;
    config: boolean;
    test: boolean;
    deploy: boolean;
  };
  data: Array<{ icon: React.ComponentType<{ className?: string }>; text: string; status: "complete" | "pending" }>;
  pending: Array<{ icon: React.ComponentType<{ className?: string }>; text: string }>;
  qa: Array<{ question: string; answer: string }>;
}

export default function IntegrationsPanel() {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const integrations: Integration[] = [
    {
      id: "adp-payroll",
      name: "ADP Payroll Integration",
      stage: "config",
      status: "Configure",
      dueDate: "Feb 20",
      stages: { discover: true, design: true, config: true, test: false, deploy: false },
      data: [
        { icon: Check, text: "Employee records mapped", status: "complete" },
        { icon: Check, text: "Payroll data validated", status: "complete" },
        { icon: Clock, text: "Security configs pending", status: "pending" },
      ],
      pending: [
        { icon: AlertCircle, text: "API authentication setup" },
        { icon: AlertCircle, text: "Error handling review" },
      ],
      qa: [
        { question: "Frequency of sync?", answer: "Daily at 2 AM EST" },
      ],
    },
    {
      id: "benefits-sso",
      name: "Benefits Portal SSO",
      stage: "design",
      status: "Design",
      dueDate: "Mar 1",
      stages: { discover: true, design: true, config: false, test: false, deploy: false },
      data: [],
      pending: [],
      qa: [],
    },
    {
      id: "hris-migration",
      name: "HRIS Data Migration",
      stage: "deploy",
      status: "Complete",
      dueDate: "Completed",
      stages: { discover: true, design: true, config: true, test: true, deploy: true },
      data: [],
      pending: [],
      qa: [],
    },
  ];

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Complete": return "bg-accent/20 text-accent";
      case "Configure": return "bg-chart-3/20 text-orange-400";
      case "Design": return "bg-chart-2/20 text-emerald-400";
      default: return "bg-muted/20 text-muted-foreground";
    }
  };

  const getStageClass = (stage: string) => {
    switch (stage) {
      case "discover": return "stage-discover";
      case "design": return "stage-design";
      case "config": return "stage-config";
      case "test": return "stage-test";
      case "deploy": return "stage-deploy";
      default: return "";
    }
  };

  return (
    <Card className="mb-8">
      <CardContent className="p-0">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold" data-testid="integrations-title">Integrations & Tech</h3>
          <p className="text-sm text-muted-foreground">Track integration workflows from discovery to deployment</p>
        </div>
        
        <div className="p-6 space-y-4">
          {integrations.map((integration) => (
            <Collapsible 
              key={integration.id}
              open={expandedItems.includes(integration.id)}
              onOpenChange={() => toggleExpanded(integration.id)}
            >
              <div className="border border-border rounded-lg overflow-hidden">
                <CollapsibleTrigger asChild>
                  <div className={`integration-stage ${getStageClass(integration.stage)} p-4 cursor-pointer hover:bg-muted/10 transition-colors`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <ChevronRight 
                            className={`w-4 h-4 transform transition-transform ${
                              expandedItems.includes(integration.id) ? 'rotate-90' : ''
                            }`}
                          />
                          <span className="font-medium" data-testid={`integration-name-${integration.id}`}>
                            {integration.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(integration.status)} data-testid={`integration-status-${integration.id}`}>
                            {integration.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground" data-testid={`integration-due-${integration.id}`}>
                            Due: {integration.dueDate}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {Object.entries(integration.stages).map(([stage, completed]) => (
                          <div 
                            key={stage}
                            className={`w-2 h-2 rounded-full ${
                              completed ? 'bg-accent' : 'bg-muted'
                            }`}
                            data-testid={`integration-stage-${integration.id}-${stage}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="border-t border-border bg-muted/20">
                    <div className="grid grid-cols-3 divide-x divide-border">
                      <div className="p-4">
                        <h5 className="font-medium mb-3 text-sm">Data</h5>
                        <div className="space-y-2">
                          {integration.data.map((item, index) => {
                            const Icon = item.icon;
                            return (
                              <div key={index} className="flex items-center gap-2">
                                <Icon className={`w-3 h-3 ${
                                  item.status === "complete" ? "text-accent" : "text-chart-3"
                                }`} />
                                <span className="text-xs" data-testid={`integration-data-${integration.id}-${index}`}>
                                  {item.text}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      <div className="p-4">
                        <h5 className="font-medium mb-3 text-sm">Pending</h5>
                        <div className="space-y-2">
                          {integration.pending.map((item, index) => {
                            const Icon = item.icon;
                            return (
                              <div key={index} className="flex items-center gap-2">
                                <Icon className="w-3 h-3 text-chart-3" />
                                <span className="text-xs" data-testid={`integration-pending-${integration.id}-${index}`}>
                                  {item.text}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      <div className="p-4">
                        <h5 className="font-medium mb-3 text-sm">Q&A</h5>
                        <div className="space-y-2">
                          {integration.qa.map((item, index) => (
                            <div key={index}>
                              <div className="text-xs text-muted-foreground" data-testid={`integration-question-${integration.id}-${index}`}>
                                <strong>Q:</strong> {item.question}
                              </div>
                              <div className="text-xs" data-testid={`integration-answer-${integration.id}-${index}`}>
                                <strong>A:</strong> {item.answer}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
