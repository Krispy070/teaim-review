import { Link, useLocation } from "wouter";
import { resolveProjectId } from "@/lib/projectId";
import { getPersistedProjectId } from "@/lib/projectCtx";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  Home, Calendar, FileText, Settings, Users, LineChart, Box, Bell,
  Workflow, Wrench, ClipboardList, CheckSquare, PenTool, FlaskConical,
  Bus, Database, HeartPulse, DollarSign, ServerCog, Cog, ShieldCheck,
  FileCog, Activity, FlaskRound, Rocket, Mail, FolderOpen, ChevronLeft, ChevronRight,
  BookOpen, GitFork, AlertTriangle, Lightbulb, Key, Archive, Clipboard, CalendarDays, Ticket, Scissors
} from "lucide-react";
import { useContext, useRef, useEffect } from "react";
import { useUserRole, isAdmin, canEdit } from "@/lib/role";
// @ts-ignore
import { useOrg } from "../App.jsx"; // Import from App.jsx where it's exported

// Module-level storage for sidebar scroll position (persists across component remounts)
let sidebarScrollPosition = 0;

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

  // Preserve scroll position on navigation using module-level storage
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Save and restore scroll position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Save scroll position continuously while scrolling
    const handleScroll = () => {
      sidebarScrollPosition = container.scrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    // Restore scroll position after content renders
    if (sidebarScrollPosition > 0) {
      // Use double requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = sidebarScrollPosition;
          }
        });
      });
    }

    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentLocation]);

  // Role-based access control
  const userRole = useUserRole();
  const showMemberFeatures = canEdit(userRole);
  const showAdminFeatures = isAdmin(userRole);
  
  // Legacy org-based gating (fallback)
  let canAdmin = showAdminFeatures;
  try {
    const org = (useOrg && useOrg()) || {} as any;
    canAdmin = canAdmin || ["owner","admin","pm"].includes(org?.userRole || "");
  } catch { /* use role-based */ }

  return (
    <div 
      ref={scrollContainerRef}
      className="h-full bg-slate-900 text-white p-3 border-r border-slate-700 overflow-y-auto relative"
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
        <Item to={p("brief")} icon={Clipboard} label="Daily Brief" collapsed={collapsed} />
        <Item to={p("calendar")} icon={CalendarDays} label="Calendar" collapsed={collapsed} />
      </Group>

      {/* Insights */}
      <Group title="Insights" collapsed={collapsed}>
        <Item to={p("insights/timeline")} icon={Calendar} label="Timeline Events" collapsed={collapsed} />
        <Item to={p("insights/decisions")} icon={CheckSquare} label="Decisions" collapsed={collapsed} />
        <Item to={p("insights/tests")} icon={FlaskConical} label="Test Cases" collapsed={collapsed} />
      </Group>

      {/* Actions & Tasks */}
      <Group title="Actions & Tasks" collapsed={collapsed}>
        <Item to={p("insights/actions")} icon={CheckSquare} label="Actions" collapsed={collapsed} />
        <Item to={p("actions/kanban")} icon={PenTool} label="Actions Kanban" collapsed={collapsed} />
        <Item to={p("stages/manage")} icon={Calendar} label="Stages" collapsed={collapsed} />
        <Item to={p("stages/wizard")} icon={Box} label="Stage Wizard" collapsed={collapsed} />
      </Group>

      {/* M&A Module */}
      <Group title="M&A" collapsed={collapsed}>
        <Item to={p("ma/playbooks")} icon={BookOpen} label="Playbooks" collapsed={collapsed} />
        <Item to={p("ma/integrations")} icon={GitFork} label="Integrations" collapsed={collapsed} />
        <Item to={p("ma/issues")} icon={AlertTriangle} label="Issues" collapsed={collapsed} />
        <Item to={p("tickets")} icon={Ticket} label="Tickets" collapsed={collapsed} />
        <Item to={p("clip")} icon={Scissors} label="Clip" collapsed={collapsed} />
        <Item to={p("ma/risks")} icon={AlertTriangle} label="Risks" collapsed={collapsed} />
        <Item to={p("ma/lessons")} icon={Lightbulb} label="Lessons" collapsed={collapsed} />
        <Item to={p("stakeholders/matrix")} icon={Users} label="RACI Matrix" collapsed={collapsed} />
        <Item to={p("tenants")} icon={Database} label="Tenants" collapsed={collapsed} />
        <Item to={p("tenants/snapshots")} icon={Archive} label="Tenant Snapshots" collapsed={collapsed} />
      </Group>

      {/* Planning & Delivery */}
      <Group title="Planning & Delivery" collapsed={collapsed}>
        <Item to={p("roadmap")} icon={Rocket} label="Roadmap" collapsed={collapsed} />
        <Item to={p("plan")} icon={Rocket} label="Project Plan" collapsed={collapsed} />
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

      {/* Settings (member+) */}
      {showMemberFeatures && (
        <Group title="Settings" collapsed={collapsed}>
          <Item to={p("team")} icon={Users} label="Team" collapsed={collapsed} />
          <Item to={p("api-keys")} icon={Key} label="API Keys" collapsed={collapsed} />
          <Item to={p("backup")} icon={Archive} label="Backup" collapsed={collapsed} />
          <Item to={p("setup")} icon={Settings} label="Project Setup" collapsed={collapsed} />
        </Group>
      )}

      {/* Administration (admin only) */}
      {canAdmin && (
        <Group title="Administration" collapsed={collapsed}>
          <Item to={p("ops")} icon={ServerCog} label="Ops / Health" collapsed={collapsed} />
          <Item to={p("activity")} icon={Activity} label="Activity Log" collapsed={collapsed} />
          <Item to={`/org/admin`} icon={Cog} label="Org Admin" collapsed={collapsed} />
          <Item to={p("admin/members")} icon={Users} label="Team Members" collapsed={collapsed} />
          <Item to={p("admin/team-access")} icon={Users} label="Team Access" collapsed={collapsed} />
          <Item to={`/admin/branding`} icon={Settings} label="Branding" collapsed={collapsed} />
          <Item to={`/admin/projects`} icon={FolderOpen} label="Projects" collapsed={collapsed} />
          <Item to={p("admin/integrations")} icon={Wrench} label="Integrations" collapsed={collapsed} />
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