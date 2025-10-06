import { useState } from "react";
import { Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import UploadButton from "./UploadButton";
import BrandedHeader from "./BrandedHeader";
import PresenceIndicator from "./PresenceIndicator";
import PresenceTracker from "./PresenceTracker";

interface HeaderProps {
  orgId?: string;
  projectId?: string;
  onOrgIdChange?: (orgId: string) => void;
  onProjectIdChange?: (projectId: string) => void;
}

export default function Header({ 
  orgId = 'demo-org', 
  projectId = 'demo-project', 
  onOrgIdChange, 
  onProjectIdChange 
}: HeaderProps) {
  const [selectedProject, setSelectedProject] = useState("WD-ACME-2024");
  
  console.log('🔍 Header rendered with props:', { projectId, orgId, enabled: !!projectId });

  return (
    <>
      <PresenceTracker enabled={!!projectId} projectId={projectId} />
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BrandedHeader variant="full" showFallback={true} />
          
          <div className="flex items-center gap-2 ml-8">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="bg-secondary border-border w-48" data-testid="project-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WD-ACME-2024">WD-ACME-2024</SelectItem>
                <SelectItem value="WD-GLOBEX-2024">WD-GLOBEX-2024</SelectItem>
                <SelectItem value="WD-STARK-2024">WD-STARK-2024</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="bg-accent/20 text-accent" data-testid="status-badge">
              Active Implementation
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input 
              className="px-2 py-1 border rounded-full text-sm w-28 bg-background" 
              placeholder="org_id" 
              value={orgId} 
              onChange={e => onOrgIdChange?.(e.target.value)}
              data-testid="org-id-input"
            />
            <input 
              className="px-2 py-1 border rounded-full text-sm w-32 bg-background" 
              placeholder="project_id" 
              value={projectId} 
              onChange={e => onProjectIdChange?.(e.target.value)}
              data-testid="project-id-input"
            />
            <UploadButton orgId={orgId} projectId={projectId} />
          </div>
          
          <div className="flex items-center gap-3">
            <PresenceIndicator className="border-r border-border pr-3" projectId={projectId} />
            <Button variant="ghost" size="sm" className="p-2" data-testid="notifications-button">
              <Bell className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" className="p-2" data-testid="settings-button">
              <Settings className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2 pl-3 border-l border-border">
              <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-accent-foreground" data-testid="user-avatar">JD</span>
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium" data-testid="user-name">John Doe</p>
                <p className="text-xs text-muted-foreground" data-testid="user-role">Project Manager</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
    </>
  );
}
