import { Link, useLocation } from "wouter";
import { resolveProjectId } from "@/lib/projectId";
import { getPersistedProjectId } from "@/lib/projectCtx";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  Home, Calendar, FileText, Settings, Users, LineChart, Box, Bell,
  Workflow, Wrench, ClipboardList, CheckSquare, PenTool, FlaskConical,
  Bus, Database, HeartPulse, DollarSign, ServerCog, Cog, ShieldCheck,
  FileCog, Activity, FlaskRound, Rocket, Mail, FolderOpen, ChevronLeft, ChevronRight
} from "lucide-react";
import { useContext } from "react";
// @ts-ignore
import { useOrg } from "../App.jsx"; // Import from App.jsx where it's exported

function Group({title, children, collapsed}:{title:string; children:any; collapsed:boolean}){
  return (
    <div className="mb-4">
      {!collapsed && <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">{title}</div>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Item({to, icon:Icon, label, collapsed}:{to:string; icon:any; label:string; collapsed:boolean}){
  const [location] = useLocation();
  // More flexible active state detection - check if current location ends with or matches the target path
  const isActive = location === to || location.endsWith(to.split('/').pop() || '');
  return (
    <Link to={to} data-testid={`sidebar-link-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer ${isActive?'bg-white/10 text-white':'text-gray-300 hover:bg-white/5'} transition-colors`}>
        <Icon size={16} />
        {!collapsed && <span className="text-sm">{label}</span>}
      </div>
    </Link>
  );
}

export default function SidebarV2(){
  // Extract project ID from current location
  const [currentLocation] = useLocation();
  const pathSegments = currentLocation.split('/');
  const projectsIndex = pathSegments.indexOf('projects');
  const projectIdFromPath = projectsIndex >= 0 && projectsIndex + 1 < pathSegments.length ? pathSegments[projectsIndex + 1] : undefined;
  const pid = resolveProjectId(projectIdFromPath, undefined) || getPersistedProjectId();
  const p = (path:string) => pid ? `/projects/${pid}/${path}` : "/projects/select";

  // Collapse and resize state
  const [collapsed, setCollapsed] = useLocalStorage<boolean>("kap.sidebar.collapsed", false);
  const [width, setWidth] = useLocalStorage<number>("kap.sidebar.width", 240);
  const minW = 180, maxW = 360;

  // Simple gating (owner/admin/pm). If you don't have useOrg(), set this to true to show Admin group.
  let canAdmin = true;
  try {
    const org = (useOrg && useOrg()) || {} as any;
    canAdmin = ["owner","admin","pm"].includes(org?.userRole || "admin");
  } catch { /* show admin by default */ }

  return (
    <div className="h-full bg-[var(--brand-bg)] text-white p-3 border-r border-white/10 overflow-auto relative"
         style={{ width: collapsed ? 60 : width }}>
      
      {/* Header with collapse button */}
      <div className="flex items-center justify-between mb-2">
        {!collapsed && <div className="text-[11px] uppercase tracking-wider text-gray-400">Menu</div>}
        <button 
          className="brand-btn text-[11px] p-1 rounded hover:bg-white/10" 
          onClick={() => setCollapsed(!collapsed)}
          data-testid="sidebar-collapse-button"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Resize handle */}
      {!collapsed && (
        <div
          className="absolute top-0 right-0 h-full w-[4px] cursor-col-resize hover:bg-white/20"
          onMouseDown={(e) => {
            const startX = e.clientX;
            const startW = width;
            function move(ev: MouseEvent) {
              const nw = Math.min(maxW, Math.max(minW, startW + (ev.clientX - startX)));
              setWidth(nw);
            }
            function up() {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            }
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
          data-testid="sidebar-resize-handle"
        />
      )}
      {/* Main */}
      <Group title="Main" collapsed={collapsed}>
        <Item to={p("dashboard")} icon={Home} label="Dashboard" collapsed={collapsed} />
        <Item to={p("timeline")} icon={Calendar} label="Timeline" collapsed={collapsed} />
        <Item to={p("documents")} icon={FileText} label="Documents" collapsed={collapsed} />
        <Item to={p("meetings")} icon={Calendar} label="Meetings" collapsed={collapsed} />
      </Group>

      {/* Actions & Tasks */}
      <Group title="Actions & Tasks" collapsed={collapsed}>
        <Item to={p("actions/list")} icon={CheckSquare} label="Actions" collapsed={collapsed} />
        <Item to={p("actions/kanban")} icon={PenTool} label="Actions Kanban" collapsed={collapsed} />
        <Item to={p("stages/manage")} icon={Calendar} label="Stages" collapsed={collapsed} />
        <Item to={p("stages/wizard")} icon={Box} label="Stage Wizard" collapsed={collapsed} />
      </Group>

      {/* Planning & Delivery */}
      <Group title="Planning & Delivery" collapsed={collapsed}>
        <Item to={p("workstreams")} icon={Workflow} label="Workstreams" collapsed={collapsed} />
        <Item to={p("training")} icon={ClipboardList} label="Training" collapsed={collapsed} />
        <Item to={p("testing")} icon={FlaskConical} label="Testing" collapsed={collapsed} />
        <Item to={p("logistics")} icon={Bus} label="Logistics" collapsed={collapsed} />
        <Item to={p("integrations")} icon={Wrench} label="Integrations & Tech" collapsed={collapsed} />
      </Group>

      {/* Sign-Off & Governance */}
      <Group title="Sign-Off & Governance" collapsed={collapsed}>
        <Item to={p("stages")} icon={ShieldCheck} label="Stage Sign-Off" collapsed={collapsed} />
        <Item to={p("signoff/compose")} icon={FileCog} label="Compose Sign-Off Package" collapsed={collapsed} />
        <Item to={p("signoff/docs")} icon={FileText} label="Sign-Off Docs" collapsed={collapsed} />
        <Item to={p("updates/review")} icon={Bell} label="PM Update Monitor" collapsed={collapsed} />
      </Group>

      {/* Analytics */}
      <Group title="Analytics" collapsed={collapsed}>
        <Item to={p("reporting")} icon={Database} label="Data & Reporting" collapsed={collapsed} />
        <Item to={p("wellness")} icon={HeartPulse} label="Team Wellness" collapsed={collapsed} />
        <Item to={p("financials")} icon={DollarSign} label="Financials" collapsed={collapsed} />
        <Item to={p("admin/method")} icon={LineChart} label="Method Insights" collapsed={collapsed} />
        <Item to={p("admin/audit-timeline")} icon={Activity} label="Audit Timeline" collapsed={collapsed} />
      </Group>

      {/* Administration */}
      {canAdmin && (
        <Group title="Administration" collapsed={collapsed}>
          <Item to={p("admin/members")} icon={Users} label="Team Members" collapsed={collapsed} />
          <Item to={p("admin/team-access")} icon={Users} label="Team Access" collapsed={collapsed} />
          <Item to={`/admin/branding`} icon={Settings} label="Branding" collapsed={collapsed} />
          <Item to={p("admin/projects")} icon={FolderOpen} label="Projects" collapsed={collapsed} />
          <Item to={`/projects/new`} icon={FolderOpen} label="New Project" collapsed={collapsed} />
          <Item to={p("admin/integrations")} icon={Wrench} label="Integrations" collapsed={collapsed} />
          <Item to={p("admin/ops")} icon={ServerCog} label="System Health" collapsed={collapsed} />
          <Item to={p("admin/backups")} icon={FileText} label="Backups" collapsed={collapsed} />
          <Item to={p("admin/comms")} icon={Mail} label="Email Center" collapsed={collapsed} />
          <Item to={p("admin/qa-tools")} icon={FlaskRound} label="QA Tools" collapsed={collapsed} />
          <Item to={p("admin/smoke-run")} icon={Rocket} label="Smoke Run" collapsed={collapsed} />
          <Item to={p("admin/test")} icon={FlaskConical} label="Test Runner" collapsed={collapsed} />
          <Item to={p("admin/rls-selftest")} icon={ShieldCheck} label="RLS Test" collapsed={collapsed} />
          <Item to={`/admin/schema-doctor`} icon={Cog} label="Schema Doctor" collapsed={collapsed} />
        </Group>
      )}
    </div>
  );
}