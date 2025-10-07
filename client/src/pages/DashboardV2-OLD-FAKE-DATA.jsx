import { useOrg } from '@/App'
import { AppFrame } from "../components/layout/AppFrame";
import SidebarV2 from "../components/SidebarV2";
import { Card } from "../components/ui/Card";
import { Kpi } from "../components/ui/Kpi";
import { Button } from "../components/ui/Button";
import { Download, Share2 } from "lucide-react";
import { TimelineBar } from "./components/TimelineBar";
import { WellnessCard } from "./components/WellnessCard";
import { useLocation } from "wouter";

export default function DashboardV2() {
  const orgCtx = useOrg()
  const [location] = useLocation()
  
  // Check if we're inside a project route (which already has AppFrame from ProjectLayout)
  const isInsideProjectLayout = location.startsWith('/projects/')
  
  // Null-safe fallback to prevent crashes during initial render
  if (!orgCtx) {
    if (isInsideProjectLayout) {
      return (
        <div className="flex items-center justify-center h-32">
          <div className="text-[hsl(var(--ui-text-muted))]">Loading organization context...</div>
        </div>
      )
    }
    return (
      <AppFrame sidebar={<SidebarV2/>}>
        <div className="flex items-center justify-center h-32">
          <div className="text-[hsl(var(--ui-text-muted))]">Loading organization context...</div>
        </div>
      </AppFrame>
    )
  }
  
  const { orgId, projectId } = orgCtx
  
  // Dashboard content
  const dashboardContent = (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Risks Open" value="3" tone="error"/>
        <Kpi label="Actions Overdue" value="7" tone="warning"/>
        <Kpi label="Sign-offs Pending" value="2" tone="neutral"/>
        <Kpi label="Team Wellness" value="Good" tone="success"/>
      </div>

      {/* Program Timeline */}
      <Card
        title="Program Timeline"
        actions={
          <div className="flex gap-2">
            <Button className="bg-[hsl(var(--panel))] text-[hsl(var(--fg))] hover:bg-[hsl(var(--panel-contrast))]">Week</Button>
            <Button className="bg-[hsl(var(--panel))] text-[hsl(var(--fg))] hover:bg-[hsl(var(--panel-contrast))]">Month</Button>
            <Button className="bg-[hsl(var(--panel))] text-[hsl(var(--fg))] hover:bg-[hsl(var(--panel-contrast))]">Quarter</Button>
            <Button><Download className="h-4 w-4"/> Export</Button>
            <Button className="bg-[hsl(var(--panel))] text-[hsl(var(--fg))] hover:bg-[hsl(var(--panel-contrast))]"><Share2 className="h-4 w-4"/> Share</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <TimelineBar label="Discovery"     color="hsl(var(--brand-warn))" progress={100}/>
          <TimelineBar label="Design"        color="hsl(var(--brand-orange))" progress={80}/>
          <TimelineBar label="Configuration" color="hsl(var(--brand-orange))" progress={55}/>
          <TimelineBar label="Testing & Deploy" color="hsl(var(--panel-contrast))" progress={20}/>
        </div>
      </Card>

      {/* Wellness + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <WellnessCard className="lg:col-span-1"/>
        <Card title="Overdue Actions" >
          <ul className="space-y-3">
            {["Map payroll cost centers","Finalize security roles","Approve HCM data loads"].map((t,i)=>(
              <li key={i} className="flex items-center justify-between rounded-lg bg-[hsl(var(--panel-contrast))] px-3 py-2">
                <span>{t}</span>
                <span className="text-xs rounded-full bg-[hsl(var(--error))]/15 text-[hsl(var(--error))] px-2 py-0.5 border border-[hsl(var(--border))]">Overdue</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="AI Suggestions">
          <ul className="space-y-3">
            <li className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">
              <div className="text-sm">Draft email to owners of 7 overdue actions?</div>
              <div className="mt-2 flex gap-2">
                <Button>Accept</Button>
                <Button className="bg-[hsl(var(--panel))] text-[hsl(var(--fg))] hover:bg-[hsl(var(--panel-contrast))]">Tweak</Button>
              </div>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );

  // If we're inside ProjectLayout, just return the content without AppFrame
  if (isInsideProjectLayout) {
    return dashboardContent;
  }

  // If we're not inside ProjectLayout, wrap with AppFrame
  return (
    <AppFrame sidebar={<SidebarV2/>}>
      {dashboardContent}
    </AppFrame>
  );
}