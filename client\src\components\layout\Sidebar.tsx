import { 
  LayoutDashboard, Calendar, Workflow, FileText, CheckSquare, LineChart, ShieldCheck, Briefcase, HeartPulse,
  Home, Settings, Users, Box, Bell, Wrench, ClipboardList, PenTool, FlaskConical,
  Bus, Database, DollarSign, ServerCog, Cog, FileCog, Activity, FlaskRound, 
  Rocket, Mail, FolderOpen, GraduationCap, Bug, Truck
} from "lucide-react";
import { Link, useLocation } from "wouter";
// @ts-ignore - App.jsx file import
import { useOrg } from "../../App";
import { landingFor, getHomeLabelFor, hasAdminAccess } from "../../lib/landing";

export function Sidebar() {
  const orgCtx = useOrg();
  const userRole = orgCtx?.userRole;
  const projectId = orgCtx?.projectId || 'e1ec6ad0-a4e8-45dd-87b0-e123776ffe6e';
  const canAdmin = ["owner","admin","pm"].includes(userRole);

  return (
    <div className="h-full overflow-y-auto">
      <nav className="p-3 pb-20">
        <Brand />
        
        <Section title="Planning" items={[
          {icon: <LayoutDashboard/>, label: getHomeLabelFor(userRole), href: landingFor(userRole)},
          {icon: <LayoutDashboard/>, label: "Dashboard", href: "/dashboard"},
          {icon: <Calendar/>,        label: "Timeline", href: `/projects/${projectId}/timeline`},
          {icon: <Workflow/>,        label: "Workstreams", href: "/workstreams"},
        ]}/>
        
        <Section title="Execution" items={[
          {icon: <CheckSquare/>,     label: "Actions", href: "/actions"},
          {icon: <ClipboardList/>,   label: "Actions Kanban", href: "/actions/kanban"},
          {icon: <ShieldCheck/>,     label: "Stage Sign-Off", href: "/stages"},
          {icon: <PenTool/>,         label: "Stage Wizard", href: "/stages/wizard"},
          {icon: <FileText/>,        label: "Documents", href: "/documents"},
          {icon: <Mail/>,            label: "Meeting Summaries", href: "/meetings"},
        ]}/>
        
        <Section title="Insights" items={[
          {icon: <LineChart/>,       label: "Data & Reporting", href: "/data"},
          {icon: <HeartPulse/>,      label: "Team Wellness", href: "/wellness"},
          {icon: <DollarSign/>,      label: "Financials", href: "/financials"},
        ]}/>
        
        <Section title="Operations" items={[
          {icon: <GraduationCap/>,   label: "Training", href: "/training"},
          {icon: <Bug/>,             label: "Testing", href: "/testing"},
          {icon: <Truck/>,           label: "Logistics", href: "/logistics"},
          {icon: <Users/>,           label: "Team", href: "/team"},
          {icon: <Bell/>,            label: "Updates", href: "/updates"},
        ]}/>
        
        {canAdmin && (
          <Section title="Admin" items={[
            {icon: <Box/>,             label: "Projects", href: "/admin/projects"},
            {icon: <Users/>,           label: "Members", href: "/admin/members"},
            {icon: <Settings/>,        label: "Branding", href: "/admin/branding"},
            {icon: <ServerCog/>,       label: "System Health", href: "/admin/health"},
            {icon: <Database/>,        label: "Integrations", href: `/projects/${projectId}/admin/integrations`},
            {icon: <Activity/>,        label: "Audit Timeline", href: `/projects/${projectId}/admin/audit-timeline`},
            {icon: <FlaskConical/>,    label: "QA Tools", href: `/projects/${projectId}/admin/qa`},
            {icon: <FlaskRound/>,      label: "Test Runner", href: `/projects/${projectId}/admin/test`},
            {icon: <FolderOpen/>,      label: "Backups", href: `/projects/${projectId}/admin/backups`},
            {icon: <Cog/>,             label: "Schema Doctor", href: `/projects/${projectId}/admin/schema-doctor`},
            {icon: <Wrench/>,          label: "RLS Test", href: `/projects/${projectId}/admin/rls-selftest`},
          ]}/>
        )}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="px-2 py-3 mb-1">
      <div className="text-xl font-bold tracking-tight" style={{color: 'var(--text-strong)'}}>
        TE<span className="teaim-ai-brand">AI</span>M
      </div>
      <div className="text-xs" style={{color: 'var(--text-muted)'}}>Project Management Operating System</div>
    </div>
  );
}

function Section({title, items}:{title:string; items:{icon:JSX.Element; label:string; href:string}[]}) {
  const [location] = useLocation();
  
  return (
    <div className="mt-4">
      <div className="px-2 text-[11px] uppercase tracking-wider" style={{color: 'var(--text-muted)'}}>{title}</div>
      <ul className="mt-1">
        {items.map((it)=>(
          <li key={it.label}>
            <Link to={it.href}>
              <div 
                className="flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors border"
                style={{
                  backgroundColor: location === it.href ? 'var(--ui-panel-2)' : 'transparent',
                  color: location === it.href ? 'var(--text-strong)' : 'var(--text)',
                  borderColor: location === it.href ? 'var(--ui-border)' : 'transparent'
                }}
                onMouseEnter={(e) => {
                  if (location !== it.href) {
                    e.currentTarget.style.backgroundColor = 'var(--ui-panel)';
                    e.currentTarget.style.borderColor = 'var(--ui-border)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (location !== it.href) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                  }
                }}
                data-testid={`nav-${it.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                <span className="h-4 w-4" style={{color: 'var(--text-muted)'}}>{it.icon}</span>
                <span>{it.label}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}