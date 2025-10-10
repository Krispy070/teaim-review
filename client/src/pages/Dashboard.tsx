import { Card } from "../components/ui/Card";
import { Kpi } from "../components/ui/Kpi";
import { Button } from "../components/ui/Button";
import { Download, Share2 } from "lucide-react";
import { TimelineBar } from "./components/TimelineBar";
import { WellnessCard } from "./components/WellnessCard";
import { GovernancePanel } from "../components/GovernancePanel";

export default function DashboardPage() {
  return (
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
            <Button className="bg-panel text-fg hover:bg-panelc">Week</Button>
            <Button className="bg-panel text-fg hover:bg-panelc">Month</Button>
            <Button className="bg-panel text-fg hover:bg-panelc">Quarter</Button>
            <Button><Download className="h-4 w-4"/> Export</Button>
            <Button className="bg-panel text-fg hover:bg-panelc"><Share2 className="h-4 w-4"/> Share</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <TimelineBar label="Discovery"     color="hsl(var(--brand-warn))" progress={100}/>
          <TimelineBar label="Design"        color="hsl(var(--brand-orange))" progress={80}/>
          <TimelineBar label="Configuration" color="hsl(var(--brand-orange))" progress={55}/>
          <TimelineBar label="Testing & Deploy" color="hsl(var(--panelc))" progress={20}/>
        </div>
      </Card>

      {/* Wellness + Actions + Governance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mt-6">
        <WellnessCard className="lg:col-span-1"/>
        <Card title="Overdue Actions" >
          <ul className="space-y-3">
            {["Map payroll cost centers","Finalize security roles","Approve HCM data loads"].map((t,i)=>(
              <li key={i} className="flex items-center justify-between rounded-lg bg-panelc px-3 py-2">
                <span>{t}</span>
                <span className="text-xs rounded-full bg-error/15 text-error px-2 py-0.5 border border-border">Overdue</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="AI Suggestions">
          <ul className="space-y-3">
            <li className="rounded-lg border border-border px-3 py-2">
              <div className="text-sm">Draft email to owners of 7 overdue actions?</div>
              <div className="mt-2 flex gap-2">
                <Button>Accept</Button>
                <Button className="bg-panel text-fg hover:bg-panelc">Tweak</Button>
              </div>
            </li>
          </ul>
        </Card>
        <GovernancePanel />
      </div>
    </>
  );
}