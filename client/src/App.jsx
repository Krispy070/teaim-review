import React, { useState, createContext, useContext, useEffect, Suspense, lazy } from 'react'
import { Router, Route, Link, useLocation, Redirect } from 'wouter'
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/queryClient"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { HelpModal } from "@/components/HelpModal"
import { AuthProvider, AuthGuard } from "./contexts/AuthContext"
import { ProjectProvider } from "./contexts/ProjectContext"
import { isBrandV2, applyBrandClass } from "@/lib/brand"
import { initTheme } from "./lib/theme"
import NotificationDrawer from "@/components/NotificationDrawer"
import SidebarV2 from "@/components/SidebarV2"
import ChatDock from './components/ChatDock'
import SpotlightSearch from './components/SpotlightSearch'
import ImpersonateBar from './components/ImpersonateBar'
import PresenceIndicator from './components/PresenceIndicator'
import PresenceTracker from './components/PresenceTracker'
import MainDashboard, { LiveDashboardWidgets, FunctionalAreas } from './components/Dashboard'
import DashboardV2 from './pages/DashboardV2'
import ProjectManagement from './pages/ProjectManagement'
import ProjectStages from './pages/ProjectStages'
import AdminMembers from './pages/AdminMembers'
import TeamSubscriptions from './components/TeamSubscriptions'
import AdminEmailSend from './components/AdminEmailSend'
import ExternalSignOff from './pages/ExternalSignOff'
import SignOffSuccess from './pages/SignOffSuccess'
import InviteAccept from './pages/InviteAccept'
import ActionsKanban from './pages/ActionsKanban'
import ActionsList from './pages/ActionsList'
import Training from './pages/Training'
import TrainingPage from './pages/TrainingPage'
import Testing from './pages/Testing'
import TimelineInsights from './pages/TimelineInsights'
import TimelineEventsPage from './pages/TimelineEventsPage'
import RisksInsightsPage from './pages/RisksInsightsPage'
import DecisionsInsights from './pages/DecisionsInsights'
import ActionsInsights from './pages/ActionsInsights'
import TeamWellness from './pages/TeamWellness'
import TeamAccess from './pages/TeamAccess'
import TeamPage from './pages/TeamPage'
import UpdatesReview from './pages/UpdatesReview'
import Stages from './pages/Stages'
import StageWizard from './pages/StageWizard'
import { getJSON } from "@/lib/authFetch"
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from "@/components/AppShell"
import ScrollToTop from "@/components/ScrollToTop"
import { RoleGate } from '@/components/ui/role-gate'
import ProjectGuard from '@/components/ProjectGuard'
import ProjectSelect from '@/pages/ProjectSelect'
import ProjectLayout from '@/components/ProjectLayout'
import TimelinePage from '@/pages/Timeline'
import Login from '@/pages/Login'
import ForgotPassword from '@/pages/ForgotPassword'
import Profile from '@/pages/Profile'
import { AppFrame } from './components/layout/AppFrame'
import PMHome from './pages/PMHome'
import AdminHome from './pages/AdminHome'
import RequireRole from './components/guards/RequireRole'
import { RoleBasedLanding } from './components/RoleBasedLanding'

// Lazy loaded heavy components
const Library = lazy(() => import('./pages/Library'))
const Meetings = lazy(() => import('./pages/Meetings'))
const BrandingSettings = lazy(() => import('./pages/BrandingSettings'))
const AdminBackups = lazy(() => import('./pages/AdminBackups'))
const AdminHealthDashboard = lazy(() => import('./pages/AdminHealthDashboard'))
const AdminSchemaDoctor = lazy(() => import('./pages/AdminSchemaDoctor'))
const IntegrationsTracker = lazy(() => import('./pages/IntegrationsTracker'))
const ProjectQATools = lazy(() => import('./pages/ProjectQATools'))
const ProjectSmokeRun = lazy(() => import('./pages/ProjectSmokeRun'))
const SignoffComposer = lazy(() => import('./pages/SignoffComposer'))
const ShareLinksManager = lazy(() => import('./pages/ShareLinksManager'))
const AuditTimeline = lazy(() => import('./pages/AuditTimeline'))
const StageTemplateEditor = lazy(() => import('./pages/StageTemplateEditor'))
const RlsSelfTest = lazy(() => import('./pages/RlsSelfTest'))
const DigestPreview = lazy(() => import('./pages/DigestPreview'))
const Reporting = lazy(() => import('./pages/Reporting'))
const Workstreams = lazy(() => import('./pages/Workstreams'))
const WorkstreamArea = lazy(() => import('./pages/WorkstreamArea'))
const ChangeIntake = lazy(() => import('./pages/ChangeIntake'))
const ChangeKanban = lazy(() => import('./pages/ChangeKanban'))
const ChangeList = lazy(() => import('./pages/ChangeList'))
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'))
const Releases = lazy(() => import('./pages/Releases'))
const AdminAreaOwners = lazy(() => import('./pages/AdminAreaOwners'))
const TestRunner = lazy(() => import('./pages/TestRunner'))
const TestsLibrary = lazy(() => import('./pages/TestsLibrary'))
const IngestDoc = lazy(() => import('./pages/IngestDoc'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const DocDetailPage = lazy(() => import('./pages/DocDetailPage'))
const MAPlaybooks = lazy(() => import('./pages/ma/Playbooks'))
const MAIntegrations = lazy(() => import('./pages/ma/Integrations'))
const MARisks = lazy(() => import('./pages/ma/Risks'))
const MALessons = lazy(() => import('./pages/ma/Lessons'))
const MAndAHubPage = lazy(() => import('./pages/MAndAHubPage'))
const GlobalSearchPage = lazy(() => import('./pages/GlobalSearchPage'))
const ProjectSetupPage = lazy(() => import('./pages/ProjectWizardPage'))
const ActivityPage = lazy(() => import('./pages/ActivityPage'))
const OpsPage = lazy(() => import('./pages/OpsPage'))
const OrgAdminPage = lazy(() => import('./pages/OrgAdminPage'))
const ProjectApiKeysPage = lazy(() => import('./pages/ProjectApiKeysPage'))
const ProjectBackupPage = lazy(() => import('./pages/ProjectBackupPage'))
const TenantsPage = lazy(() => import('./pages/TenantsPage'))
const IssuesBoard = lazy(() => import('./pages/ma/IssuesBoard'))
const TenantsDiffPage = lazy(() => import('./pages/TenantsDiffPage'))
const TenantSnapshotsPage = lazy(() => import('./pages/TenantSnapshotsPage'))
const DailyBriefPage = lazy(() => import('./pages/DailyBriefPage'))
const CalendarMeetingsPage = lazy(() => import('./pages/MeetingsPage'))
const TicketsPage = lazy(() => import('./pages/TicketsPage'))
const StakeholderMatrixPage = lazy(() => import('./pages/StakeholderMatrixPage'))
const ArtifactViewerPage = lazy(() => import('./pages/ArtifactViewerPage'))
const ClipPage = lazy(() => import('./pages/ClipPage'))
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'))
const PlanBuilderPage = lazy(() => import('./pages/PlanBuilderPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const OnboardingPushHistoryPage = lazy(() => import('./pages/OnboardingPushHistoryPage'))
const ReleaseManagerPage = lazy(() => import('./pages/ReleaseManagerPage'))
const ReleaseTestsPage = lazy(() => import('./pages/ReleaseTestsPage'))
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const GettingStartedPage = lazy(() => import('./pages/GettingStartedPage'))

// Role-based home pages
const SystemAdminHome = lazy(() => import('./pages/home/AdminHome'))
const ProjectManagerHome = lazy(() => import('./pages/home/PmHome'))
const ExecutiveCustomerHome = lazy(() => import('./pages/home/ExecCustomerHome'))
const ExecutivePartnerHome = lazy(() => import('./pages/home/ExecPartnerHome'))
const FunctionalLeadHome = lazy(() => import('./pages/home/FunctionalHome'))
const DataLeadHome = lazy(() => import('./pages/home/DataLeadHome'))
const WorkerHome = lazy(() => import('./pages/home/WorkerHome'))

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
)

// Lazy wrapper for suspense
const LazyWrapper = ({ children }) => (
  <Suspense fallback={<PageLoader />}>
    {children}
  </Suspense>
)

// lightweight stubs for now:
const Page = ({title, children}) => (<div className="space-y-4"><h2 className="text-xl font-semibold">{title}</h2>{children}</div>)

// Brand V2 layout wrapper that uses the new sidebar
const BrandV2Layout = ({ children }) => {
  return (
    <AppFrame sidebar={<SidebarV2 />}>
      {children}
    </AppFrame>
  )
}

const OrgCtx = createContext(null)
export const useOrg = () => useContext(OrgCtx)

export default function App(){
  const [projectId, setProjectId] = useState('e1ec6ad0-a4e8-45dd-87b0-e123776ffe6e')
  const [orgId, setOrgId] = useState('87654321-4321-4321-4321-cba987654321')
  const [userRole, setUserRole] = useState('admin')
  
  // Initialize theme and get role from dev auth or environment
  useEffect(() => {
    // Initialize TEAIM theme system
    initTheme();
    
    // Enable Brand V2 mode for the new UI layout
    localStorage.setItem("kap.brandv2", "1");
    
    // Apply Brand V2 CSS class to document root
    applyBrandClass();
    
    try {
      const devAuth = JSON.parse(localStorage.getItem("kap.devAuth") || "null");
      if (devAuth?.role) {
        setUserRole(devAuth.role);
      } else {
        setUserRole(import.meta.env.VITE_DEV_ROLE || 'admin');
      }
    } catch {
      setUserRole(import.meta.env.VITE_DEV_ROLE || 'admin');
    }
  }, []);
  
  const value = { projectId, setProjectId, orgId, setOrgId, userRole, setUserRole }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ProjectProvider>
            <AppContent value={value} />
            <HelpModal />
          </ProjectProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

function AppContent({ value }) {
  const [location] = useLocation()
  const isPublicSignoffRoute = location?.startsWith('/signoff')
  const isPublicInviteRoute = location?.startsWith('/invite')
  const isLoginRoute = location === '/login'
  const isLandingRoute = location === '/'
  const isGettingStartedRoute = location === '/getting-started'
  const brandV2 = isBrandV2()
  
  // Extract userRole from value for RoleGate usage
  const { userRole } = value

  if (isLandingRoute || isGettingStartedRoute) {
    return (
      <>
        <Route path="/">
          <LazyWrapper><LandingPage /></LazyWrapper>
        </Route>
        <Route path="/getting-started">
          <LazyWrapper><GettingStartedPage /></LazyWrapper>
        </Route>
        <Toaster />
      </>
    )
  }

  if (isPublicSignoffRoute) {
    // Public layout for external signer token pages
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Route path="/signoff/:token" component={ExternalSignOff} />
        <Route path="/signoff/success" component={SignOffSuccess} />
        <Toaster />
      </div>
    )
  }

  if (isPublicInviteRoute) {
    // Public layout for invite token acceptance
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Route path="/invite/accept/:token" component={InviteAccept} />
        <Toaster />
      </div>
    )
  }

  if (isLoginRoute || location === '/auth/forgot-password') {
    // Clean layout for login and auth pages
    return (
      <>
        <Route path="/login">
          <LazyWrapper><LoginPage /></LazyWrapper>
        </Route>
        <Route path="/auth/forgot-password" component={ForgotPassword} />
        <Toaster />
      </>
    )
  }

  // Authenticated layout for internal users
  return (
    <AuthGuard>
      <OrgCtx.Provider value={value}>
        <div className={brandV2 ? "brand-v2 min-h-screen" : "min-h-screen bg-slate-950 text-slate-100"}>
          <ErrorBoundary>
            {brandV2 ? (
              // Brand V2 uses its own layout system via DashboardV2's AppFrame
              <>
                  <Route path="/">{() => 
                    <BrandV2Layout>
                      <RoleBasedLanding>
                        <DashboardV2 />
                      </RoleBasedLanding>
                    </BrandV2Layout>
                  }</Route>
                  <Route path="/dashboard">{() => <Redirect to={`/projects/${value.projectId}/dashboard`} />}</Route>
                  <Route path="/timeline">{() => <BrandV2Layout><TimelinePage /></BrandV2Layout>}</Route>
                  <Route path="/workstreams">{() => <BrandV2Layout><LazyWrapper><Workstreams /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/integrations">{() => <BrandV2Layout><Page title="Integrations & Tech"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">🔧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">System Integrations</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor and configure integrations with external systems and technical infrastructure.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/actions">{() => <Redirect to={`/projects/${value.projectId}/actions`} />}</Route>
                  <Route path="/actions/list">{() => <Redirect to={`/projects/${value.projectId}/actions/list`} />}</Route>
                  <Route path="/actions/kanban">{() => <Redirect to={`/projects/${value.projectId}/actions/kanban`} />}</Route>
                  <Route path="/documents">{() => <Redirect to={`/projects/${value.projectId}/documents`} />}</Route>
                  <Route path="/meetings">{() => <Redirect to={`/projects/${value.projectId}/meetings`} />}</Route>
                  <Route path="/training">{() => <Redirect to={`/projects/${value.projectId}/training`} />}</Route>
                  <Route path="/testing">{() => <Redirect to={`/projects/${value.projectId}/testing`} />}</Route>
                  <Route path="/logistics">{() => <BrandV2Layout><Page title="Logistics"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📦</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Resource Management</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Track project resources, equipment allocation, and logistical coordination for your Workday implementation.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/data">{() => <Redirect to={`/projects/${value.projectId}/reporting`} />}</Route>
                  <Route path="/reporting">{() => <Redirect to={`/projects/${value.projectId}/reporting`} />}</Route>
                  <Route path="/wellness">{() => <Redirect to={`/projects/${value.projectId}/wellness`} />}</Route>
                  <Route path="/financials">{() => <BrandV2Layout><Page title="Financials"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">💰</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Budget & Cost Tracking</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor project budgets, track expenses, and manage financial aspects of your implementation.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/team">{() => <BrandV2Layout><TeamPage /></BrandV2Layout>}</Route>
                  <Route path="/updates">{() => <BrandV2Layout><UpdatesReview /></BrandV2Layout>}</Route>
                  <Route path="/admin-email">{() => <BrandV2Layout><Page title="Email Center"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Communication Hub</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Manage email communications, notifications, and team messaging for your project.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/admin/projects">{() => <BrandV2Layout><ProjectManagement /></BrandV2Layout>}</Route>
                  <Route path="/admin/members">{() => <BrandV2Layout><AdminMembers /></BrandV2Layout>}</Route>
                  <Route path="/admin/branding">{() => <BrandV2Layout><RoleGate allow={['owner', 'admin']} role={userRole}><LazyWrapper><BrandingSettings /></LazyWrapper></RoleGate></BrandV2Layout>}</Route>
                  <Route path="/admin/schema-doctor">{() => <BrandV2Layout><LazyWrapper><AdminSchemaDoctor /></LazyWrapper></BrandV2Layout>}</Route>
                  
                  {/* Role-based home routes */}
                  <Route path="/home/admin">{() => <BrandV2Layout><LazyWrapper><SystemAdminHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/pm/:projectId">{(params) => <BrandV2Layout><LazyWrapper><ProjectManagerHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/exec/:projectId">{(params) => <BrandV2Layout><LazyWrapper><ExecutiveCustomerHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/exec-partner">{() => <BrandV2Layout><LazyWrapper><ExecutivePartnerHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/functional/:projectId">{(params) => <BrandV2Layout><LazyWrapper><FunctionalLeadHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/data/:projectId">{(params) => <BrandV2Layout><LazyWrapper><DataLeadHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/worker/:projectId">{(params) => <BrandV2Layout><LazyWrapper><WorkerHome /></LazyWrapper></BrandV2Layout>}</Route>
                  
                  {/* PM/Admin Home Routes - converted to wouter syntax with guards inside render functions */}
                  <Route path="/pm">{() => <Redirect to={`/projects/${value.projectId}/dashboard`} />}</Route>
                  <Route path="/admin">{() => <Redirect to={`/projects/${value.projectId}/dashboard`} />}</Route>
                  
                  {/* Admin routes moved to project-scoped section for proper navigation */}
                  <Route path="/admin/stage-templates">{() => <BrandV2Layout><RoleGate allow={['owner', 'admin', 'pm']} role={userRole}><LazyWrapper><StageTemplateEditor /></LazyWrapper></RoleGate></BrandV2Layout>}</Route>
                  {/* Project-scoped routes flattened for wouter compatibility */}
                  <Route path="/projects/:projectId">{(params) => <BrandV2Layout><Redirect to={`/projects/${params.projectId}/dashboard`} /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/dashboard">{(params) => <BrandV2Layout><DashboardV2 /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/timeline">{(params) => <BrandV2Layout><TimelinePage /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/documents">{(params) => <BrandV2Layout><LazyWrapper><DocsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/library">{(params) => <BrandV2Layout><LazyWrapper><Library orgId={value.orgId} projectId={params.projectId} /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/ingest">{(params) => <BrandV2Layout><LazyWrapper><IngestDoc /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/meetings">{(params) => <BrandV2Layout><LazyWrapper><Meetings projectId={params.projectId} /></LazyWrapper></BrandV2Layout>}</Route>
                  
                  {/* M&A Module routes */}
                  <Route path="/projects/:projectId/ma/hub">{(params) => <BrandV2Layout><LazyWrapper><MAndAHubPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/ma/playbooks">{(params) => <BrandV2Layout><LazyWrapper><MAPlaybooks /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/ma/integrations">{(params) => <BrandV2Layout><LazyWrapper><MAIntegrations /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/ma/risks">{(params) => <BrandV2Layout><LazyWrapper><MARisks /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/ma/lessons">{(params) => <BrandV2Layout><LazyWrapper><MALessons /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/ma/issues">{(params) => <BrandV2Layout><LazyWrapper><IssuesBoard /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/stakeholders/matrix">{(params) => <BrandV2Layout><LazyWrapper><StakeholderMatrixPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/search">{(params) => <BrandV2Layout><LazyWrapper><GlobalSearchPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/brief">{(params) => <BrandV2Layout><LazyWrapper><DailyBriefPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/calendar">{(params) => <BrandV2Layout><LazyWrapper><CalendarMeetingsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/tickets">{(params) => <BrandV2Layout><LazyWrapper><TicketsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/clip">{(params) => <BrandV2Layout><LazyWrapper><ClipPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/roadmap">{(params) => <BrandV2Layout><LazyWrapper><RoadmapPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/plan">{(params) => <BrandV2Layout><LazyWrapper><PlanBuilderPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/onboarding">{(params) => <BrandV2Layout><LazyWrapper><OnboardingPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/onboarding/push-history">{(params) => <BrandV2Layout><LazyWrapper><OnboardingPushHistoryPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/releases">{(params) => <BrandV2Layout><LazyWrapper><ReleaseManagerPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/releases/:id/tests">{(params) => <BrandV2Layout><LazyWrapper><ReleaseTestsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/templates">{(params) => <BrandV2Layout><LazyWrapper><TemplatesPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/viewer">{() => <LazyWrapper><ArtifactViewerPage /></LazyWrapper>}</Route>
                  
                  {/* M&A shorthand routes that use project from context */}
                  <Route path="/ma/hub">{() => <Redirect to={`/projects/${value.projectId}/ma/hub`} />}</Route>
                  <Route path="/ma/playbooks">{() => <Redirect to={`/projects/${value.projectId}/ma/playbooks`} />}</Route>
                  <Route path="/ma/integrations">{() => <Redirect to={`/projects/${value.projectId}/ma/integrations`} />}</Route>
                  <Route path="/ma/risks">{() => <Redirect to={`/projects/${value.projectId}/ma/risks`} />}</Route>
                  <Route path="/ma/lessons">{() => <Redirect to={`/projects/${value.projectId}/ma/lessons`} />}</Route>
                  <Route path="/ma/issues">{() => <Redirect to={`/projects/${value.projectId}/ma/issues`} />}</Route>
                  
                  {/* Project Setup Wizard */}
                  <Route path="/projects/:projectId/setup">{(params) => <BrandV2Layout><LazyWrapper><ProjectSetupPage /></LazyWrapper></BrandV2Layout>}</Route>
                  
                  {/* Activity & Ops (Fix Pack v28, v29, v32, v33, v34) */}
                  <Route path="/projects/:projectId/activity">{(params) => <BrandV2Layout><LazyWrapper><ActivityPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/ops">{(params) => <BrandV2Layout><LazyWrapper><OpsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/api-keys">{(params) => <BrandV2Layout><LazyWrapper><ProjectApiKeysPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/backup">{(params) => <BrandV2Layout><LazyWrapper><ProjectBackupPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/tenants">{(params) => <BrandV2Layout><LazyWrapper><TenantsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/tenants/diff">{(params) => <BrandV2Layout><LazyWrapper><TenantsDiffPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/tenants/snapshots">{(params) => <BrandV2Layout><LazyWrapper><TenantSnapshotsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/org/admin">{() => <BrandV2Layout><LazyWrapper><OrgAdminPage /></LazyWrapper></BrandV2Layout>}</Route>
                  
                  {/* Flattened project routes - converted from nested structure to absolute paths */}
                  <Route path="/projects/:projectId/tests">{(params) => <BrandV2Layout><LazyWrapper><TestsLibrary projectId={params.projectId} /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/updates/review">{(params) => <BrandV2Layout><UpdatesReview /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/updates">{(params) => <BrandV2Layout><Redirect to={`/projects/${params.projectId}/updates/review`} /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/actions">{(params) => <BrandV2Layout><ActionsList /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/actions/list">{(params) => <BrandV2Layout><ActionsList /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/actions/kanban">{(params) => <BrandV2Layout><ActionsKanban /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/chat">{(params) => <BrandV2Layout><Page title="Chat"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">💬</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Team Chat</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Real-time messaging and collaboration space for your project team.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/analytics">{(params) => <BrandV2Layout><Redirect to={`/projects/${params.projectId}/reporting`} /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/reports">{(params) => <BrandV2Layout><Redirect to={`/projects/${params.projectId}/reporting`} /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/reporting">{(params) => <BrandV2Layout><LazyWrapper><Reporting /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/signoffs">{(params) => <BrandV2Layout><Redirect to={`/projects/${params.projectId}/signoff/compose`} /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/signoff/compose">{(params) => <BrandV2Layout><LazyWrapper><SignoffComposer /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/signoff/docs">{(params) => <BrandV2Layout><Page title="Sign-Off Documents"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📄</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Sign-Off Documents</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">View and manage sign-off documents for your implementation milestones.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/stages/manage">{(params) => <BrandV2Layout><Stages /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/stages/wizard">{(params) => <BrandV2Layout><StageWizard /></BrandV2Layout>}</Route>
                  
                  {/* Admin routes - flattened from nested structure */}
                  <Route path="/projects/:projectId/admin/ops">{(params) => <BrandV2Layout><Page title="Operations"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">⚙️</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Operations Dashboard</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor operational metrics, system health, and administrative tasks.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/branding">{(params) => <BrandV2Layout><RoleGate allow={['owner', 'admin']} role={userRole}><LazyWrapper><BrandingSettings /></LazyWrapper></RoleGate></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/digest-preview">{(params) => <BrandV2Layout><RoleGate allow={['owner', 'admin', 'pm', 'lead']} role={userRole}><LazyWrapper><DigestPreview /></LazyWrapper></RoleGate></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/method">{(params) => <BrandV2Layout><Page title="Method Insights"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📈</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Implementation Analytics</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Insights and analytics about your Workday implementation methodology and progress.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/invite">{(params) => <BrandV2Layout><AdminMembers /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/members">{(params) => <BrandV2Layout><AdminMembers /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/team-access">{(params) => <BrandV2Layout><TeamAccess /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/backups">{(params) => <BrandV2Layout><LazyWrapper><AdminBackups projectId={params.projectId} /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/rls-selftest">{(params) => <BrandV2Layout><LazyWrapper><RlsSelfTest /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/health">{(params) => <BrandV2Layout><LazyWrapper><AdminHealthDashboard projectId={params.projectId} /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/schema-doctor">{(params) => <BrandV2Layout><LazyWrapper><AdminSchemaDoctor /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/integrations">{(params) => <BrandV2Layout><LazyWrapper><IntegrationsTracker projectId={params.projectId} /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/share-links">{(params) => <BrandV2Layout><LazyWrapper><ShareLinksManager /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/audit-timeline">{(params) => <BrandV2Layout><LazyWrapper><AuditTimeline /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/qa">{(params) => <BrandV2Layout><LazyWrapper><ProjectQATools /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/qa-tools">{(params) => <BrandV2Layout><LazyWrapper><ProjectQATools /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/comms">{(params) => <BrandV2Layout><Page title="Email Center"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Communication Hub</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Manage email communications, notifications, and team messaging for your project.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/smoke-run">{(params) => <BrandV2Layout><LazyWrapper><ProjectSmokeRun /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/admin/test">{(params) => <BrandV2Layout><LazyWrapper><TestRunner /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/docs/:id">{(params) => <BrandV2Layout><LazyWrapper><DocDetailPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/docs">{(params) => <BrandV2Layout><LazyWrapper><DocsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/docs">{() => <BrandV2Layout><LazyWrapper><DocsPage /></LazyWrapper></BrandV2Layout>}</Route>
                  
                  {/* Additional project routes - flattened from nested structure */}
                  <Route path="/projects/:projectId/workstreams">{(params) => <BrandV2Layout><LazyWrapper><Workstreams /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/workstreams/:areaKey">{(params) => <BrandV2Layout><LazyWrapper><WorkstreamArea /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/changes/intake">{(params) => <BrandV2Layout><LazyWrapper><ChangeIntake /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/changes/board">{(params) => <BrandV2Layout><LazyWrapper><ChangeKanban /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/changes/list">{(params) => <BrandV2Layout><LazyWrapper><ChangeList /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/team/owner">{(params) => <BrandV2Layout><LazyWrapper><OwnerDashboard /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/team/area-owners">{(params) => <BrandV2Layout><LazyWrapper><AdminAreaOwners /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/releases">{(params) => <BrandV2Layout><LazyWrapper><Releases /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/training">{(params) => <TrainingPage />}</Route>
                  <Route path="/projects/:projectId/testing">{(params) => <BrandV2Layout><Testing /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/logistics">{(params) => <BrandV2Layout><Page title="Logistics"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📦</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Resource Management</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Track project resources, equipment allocation, and logistical coordination for your Workday implementation.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/stages">{(params) => <BrandV2Layout><Page title="Stage Sign-Off"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">✅</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Stage Approvals</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Manage stage-based approvals and sign-offs for your implementation milestones.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/integrations">{(params) => <BrandV2Layout><Page title="Integrations & Tech"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">🔧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">System Integrations</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor and configure integrations with external systems and technical infrastructure.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/wellness">{(params) => <BrandV2Layout><TeamWellness /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/team">{(params) => <BrandV2Layout><TeamPage /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/financials">{(params) => <BrandV2Layout><Page title="Financials"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">💰</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Budget & Cost Tracking</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor project budgets, track expenses, and manage financial aspects of your implementation.</p></div></Page></BrandV2Layout>}</Route>
                  
                  {/* Insights routes */}
                  <Route path="/projects/:projectId/insights/timeline">{(params) => <BrandV2Layout><TimelineEventsPage /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/insights/risks">{(params) => <BrandV2Layout><RisksInsightsPage /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/insights/actions">{(params) => <BrandV2Layout><ActionsInsights /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/insights/decisions">{(params) => <BrandV2Layout><DecisionsInsights /></BrandV2Layout>}</Route>
                  <Route path="/projects/:projectId/insights/tests">{(params) => <BrandV2Layout><Testing /></BrandV2Layout>}</Route>
                  
                  {/* Safety redirect for malformed project URLs */}
                  <Route path="/projects/undefined/*">{() => <Redirect to="/projects/select" />}</Route>
                  
                  {/* Non-project routes with proper layout */}
                  <Route path="/projects/select">{() => <BrandV2Layout><ProjectSelect /></BrandV2Layout>}</Route>
                  <Route path="/projects/new">{() => <BrandV2Layout><ProjectWizard /></BrandV2Layout>}</Route>
                  <Route path="/projects/stages">{() => <ProjectStages projectId={value.projectId} />}</Route>
                  <Route path="/profile">{() => <Profile />}</Route>
                  <Route path="*">{() => <Page title="Not Found">Check the URL.</Page>}</Route>
                <ChatDock orgId={value.orgId} projectId={value.projectId} />
                <SpotlightSearch />
                <ImpersonateBar />
              </>
            ) : (
              // Original layout system for non Brand V2
              <AppShell sidebar={<Sidebar />}>
                <main className="max-w-7xl mx-auto px-4 py-6">
                    <Route path="/">{() => <Redirect to={`/projects/${value.projectId}/dashboard`} />}</Route>
                    <Route path="/dashboard">{() => <Redirect to={`/projects/${value.projectId}/dashboard`} />}</Route>
                    <Route path="/timeline">{() => <Page title="Timeline">Coming soon</Page>}</Route>
                    <Route path="/workstreams">{() => <LazyWrapper><Workstreams /></LazyWrapper>}</Route>
                    <Route path="/integrations">{() => <Page title="Integrations & Tech">Coming soon</Page>}</Route>
                    <Route path="/actions">{() => <Redirect to={`/projects/${value.projectId}/actions`} />}</Route>
                    <Route path="/actions/list">{() => <Redirect to={`/projects/${value.projectId}/actions/list`} />}</Route>
                    <Route path="/actions/kanban">{() => <Redirect to={`/projects/${value.projectId}/actions/kanban`} />}</Route>
                    <Route path="/documents">{() => <Redirect to={`/projects/${value.projectId}/documents`} />}</Route>
                    <Route path="/meetings">{() => <Redirect to={`/projects/${value.projectId}/meetings`} />}</Route>
                    <Route path="/training">{() => <Redirect to={`/projects/${value.projectId}/training`} />}</Route>
                    <Route path="/testing">{() => <Redirect to={`/projects/${value.projectId}/testing`} />}</Route>
                    <Route path="/logistics">{() => <Page title="Logistics">Coming soon</Page>}</Route>
                    <Route path="/data">{() => <Redirect to={`/projects/${value.projectId}/reporting`} />}</Route>
                    <Route path="/wellness">{() => <Redirect to={`/projects/${value.projectId}/wellness`} />}</Route>
                    <Route path="/financials">{() => <Page title="Financials">Coming soon</Page>}</Route>
                    <Route path="/team">{() => <TeamAccess />}</Route>
                    <Route path="/updates">{() => <UpdatesReview />}</Route>
                    <Route path="/admin-email">{() => <Page title="Email Center">Coming soon</Page>}</Route>
                    <Route path="/admin/projects">{() => <ProjectManagement />}</Route>
                    <Route path="/admin/members">{() => <AdminMembers />}</Route>
                    <Route path="/admin/branding">{() => <RoleGate allow={['owner', 'admin']} role={userRole}><LazyWrapper><BrandingSettings /></LazyWrapper></RoleGate>}</Route>
                    <Route path="/admin/stage-templates">{() => <RoleGate allow={['owner', 'admin', 'pm']} role={userRole}><LazyWrapper><StageTemplateEditor /></LazyWrapper></RoleGate>}</Route>
                    {/* Project-scoped routes converted to wouter syntax */}
                    <Route path="/projects/:projectId">{(params) => <ProjectLayout><Redirect to={`/projects/${params.projectId}/dashboard`} /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/dashboard">{(params) => <ProjectLayout><DashboardV2 /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/timeline">{(params) => <ProjectLayout><TimelinePage /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/insights/timeline">{(params) => <ProjectLayout><TimelineEventsPage /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/insights/risks">{(params) => <ProjectLayout><RisksInsightsPage /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/insights/decisions">{(params) => <ProjectLayout><DecisionsInsights /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/insights/actions">{(params) => <ProjectLayout><ActionsInsights /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/insights/tests">{(params) => <ProjectLayout><Testing /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/documents">{(params) => <ProjectLayout><LazyWrapper><Library orgId={value.orgId} projectId={params.projectId} /></LazyWrapper></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/meetings">{(params) => <ProjectLayout><LazyWrapper><Meetings projectId={params.projectId} /></LazyWrapper></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/updates/review">{(params) => <ProjectLayout><UpdatesReview /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/stages/manage">{(params) => <ProjectLayout><Stages /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/stages/wizard">{(params) => <ProjectLayout><StageWizard /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/signoff/compose">{(params) => <ProjectLayout><LazyWrapper><SignoffComposer /></LazyWrapper></ProjectLayout>}</Route>
                      <Route path="/signoff/docs">{() => <Page title="Sign-Off Documents">Coming soon</Page>}</Route>
                      <Route path="/admin/ops">{() => <Page title="Operations">Coming soon</Page>}</Route>
                      <Route path="/admin/branding">{() => <RoleGate allow={['owner', 'admin']} role={userRole}><LazyWrapper><BrandingSettings /></LazyWrapper></RoleGate>}</Route>
                      <Route path="/admin/digest-preview">{() => <RoleGate allow={['owner', 'admin', 'pm', 'lead']} role={userRole}><LazyWrapper><DigestPreview /></LazyWrapper></RoleGate>}</Route>
                      <Route path="/admin/method">{() => <Page title="Method Insights">Coming soon</Page>}</Route>
                      <Route path="/admin/invite">{() => <AdminMembers />}</Route>
                      <Route path="/admin/team-access">{() => <TeamAccess />}</Route>
                      <Route path="/admin/backups">{() => <LazyWrapper><AdminBackups projectId={value.projectId} /></LazyWrapper>}</Route>
                      <Route path="/admin/rls-selftest">{() => <LazyWrapper><RlsSelfTest /></LazyWrapper>}</Route>
                      <Route path="/admin/health">{() => <LazyWrapper><AdminHealthDashboard projectId={value.projectId} /></LazyWrapper>}</Route>
                      <Route path="/admin/schema-doctor">{() => <LazyWrapper><AdminSchemaDoctor /></LazyWrapper>}</Route>
                      <Route path="/admin/integrations">{() => <LazyWrapper><IntegrationsTracker projectId={value.projectId} /></LazyWrapper>}</Route>
                      <Route path="/admin/share-links">{() => <LazyWrapper><ShareLinksManager /></LazyWrapper>}</Route>
                      <Route path="/admin/audit-timeline">{() => <LazyWrapper><AuditTimeline /></LazyWrapper>}</Route>
                      <Route path="/admin/qa">{() => <LazyWrapper><ProjectQATools /></LazyWrapper>}</Route>
                      <Route path="/admin/smoke-run">{() => <LazyWrapper><ProjectSmokeRun /></LazyWrapper>}</Route>
                      <Route path="/admin/test">{() => <Redirect to={`/projects/${value.projectId}/admin/test`} />}</Route>
                      {/* Additional stub routes for complete navigation */}
                      <Route path="/workstreams">{() => <LazyWrapper><Workstreams /></LazyWrapper>}</Route>
                      <Route path="/workstreams/:areaKey">{() => <LazyWrapper><WorkstreamArea /></LazyWrapper>}</Route>
                      <Route path="/changes/intake">{() => <LazyWrapper><ChangeIntake /></LazyWrapper>}</Route>
                      <Route path="/changes/board">{() => <LazyWrapper><ChangeKanban /></LazyWrapper>}</Route>
                      <Route path="/changes/list">{() => <LazyWrapper><ChangeList /></LazyWrapper>}</Route>
                      <Route path="/team/owner">{() => <LazyWrapper><OwnerDashboard /></LazyWrapper>}</Route>
                      <Route path="/releases">{() => <LazyWrapper><Releases /></LazyWrapper>}</Route>
                      <Route path="/team/area-owners">{() => <LazyWrapper><AdminAreaOwners /></LazyWrapper>}</Route>
                      <Route path="/training">{() => <Page title="Training">Coming soon</Page>}</Route>
                      <Route path="/testing">{() => <Page title="Testing">Coming soon</Page>}</Route>
                      <Route path="/logistics">{() => <Page title="Logistics">Coming soon</Page>}</Route>
                      <Route path="/actions/list">{() => <ActionsList />}</Route>
                      <Route path="/actions/kanban">{() => <ActionsKanban />}</Route>
                      <Route path="/stages">{() => <Page title="Stage Sign-Off">Coming soon</Page>}</Route>
                      <Route path="/integrations">{() => <Page title="Integrations & Tech">Coming soon</Page>}</Route>
                      <Route path="/reporting">{() => <LazyWrapper><Reporting /></LazyWrapper>}</Route>
                      <Route path="/wellness">{() => <Page title="Team Wellness">Coming soon</Page>}</Route>
                      <Route path="/financials">{() => <Page title="Financials">Coming soon</Page>}</Route>
                      <Route path="/admin/projects">{() => <ProjectManagement />}</Route>
                      <Route path="/admin/comms">{() => <Page title="Email Center">Coming soon</Page>}</Route>
                      <Route path="/admin/qa-tools">{() => <LazyWrapper><ProjectQATools /></LazyWrapper>}</Route>
                    
                    {/* Safety redirect for malformed project URLs - converted to wouter syntax */}
                    <Route path="/projects/undefined/*">{() => <Redirect to="/projects/select" />}</Route>
                    
                    {/* Non-project routes - converted to wouter syntax */}
                    <Route path="/projects/select">{() => <ProjectSelect />}</Route>
                    <Route path="/projects/new">{() => <ProjectManagement />}</Route>
                    <Route path="/projects/stages">{() => <ProjectStages projectId={value.projectId} />}</Route>
                    <Route path="/profile">{() => <Profile />}</Route>
                    <Route path="*">{() => <Page title="Not Found">Check the URL.</Page>}</Route>
                </main>
                <ChatDock orgId={value.orgId} projectId={value.projectId} />
                <SpotlightSearch />
                <ImpersonateBar />
              </AppShell>
            )}
        </ErrorBoundary>
        <Toaster />
      </div>
    </OrgCtx.Provider>
    </AuthGuard>
  )
}

function Sidebar(){
  const { projectId, userRole } = useOrg()
  const [uCount, setUCount] = useState(0);
  useEffect(()=>{ 
    let alive=true; 
    (async ()=>{ try{ const d=await getJSON(`/api/updates/count?project_id=${projectId}`); if(alive) setUCount(d.count||0);}catch{} })();
    const t=setInterval(async()=>{ try{ const d=await getJSON(`/api/updates/count?project_id=${projectId}`); if(alive) setUCount(d.count||0);}catch{} }, 15000);
    return ()=>{alive=false; clearInterval(t)};
  },[projectId]);
  const link = (to, label) => (
    <NavLink to={to}
      className={({isActive}) => `block px-4 py-2 rounded-lg text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'}`}
      data-testid={`nav-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
      {label}
    </NavLink>
  )
  return (
    <aside className="w-60 border-r border-slate-800 p-3 sticky top-0 h-screen overflow-y-auto">
      <div className="font-bold mb-3">TEAIM</div>
      {link('/dashboard','Dashboard')}
      {link('/timeline','Timeline')}
      {link('/workstreams','Workstreams')}
      {link('/integrations','Integrations & Tech')}
      {link('/actions','Actions')}
      {link('/actions/kanban','Actions Kanban')}
      {link('/projects/stages','Stage Sign-Off')}
      {link(`/projects/${projectId}/stages/manage`,'Manage Stages')}
      {link(`/projects/${projectId}/stages/wizard`,'Stage Wizard')}
      {link(`/projects/${projectId}/signoff/compose`,'Compose Sign-Off Package')}
      {link('/documents','Documents')}
      {link('/meetings','Meeting Summaries')}
      {link('/training','Training')}
      {link('/testing','Testing')}
      {link('/logistics','Logistics')}
      {link('/data','Data & Reporting')}
      {link('/wellness','Team Wellness')}
      {link('/financials','Financials')}
      <div className="mt-4 pt-4 border-t border-slate-700">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Admin</div>
        {link('/admin/projects','Projects Admin')}
        {link(`/projects/${projectId}/admin/health`,'System Health')}
        {link(`/projects/${projectId}/admin/integrations`,'Integrations Tracker')}
        {link('/admin/members','Members')}
        {link('/admin/branding','Branding & Logos')}
        {link(`/projects/${projectId}/admin/digest-preview`,'Digest Preview')}
        {link(`/projects/${projectId}/admin/backups`,'Admin Backups')}
        <RoleGate allow={['owner', 'admin']} role={userRole}>
          {link(`/projects/${projectId}/admin/rls-selftest`,'RLS Self-Test')}
          {link(`/projects/${projectId}/admin/schema-doctor`,'Schema Doctor')}
        </RoleGate>
        {link(`/projects/${projectId}/admin/audit-timeline`,'Audit Timeline')}
        {link(`/projects/${projectId}/admin/qa`,'QA Tools')}
        {link(`/projects/${projectId}/admin/smoke-run`,'Smoke Runner')}
        {link(`/projects/${projectId}/admin/test`,'Test Runner')}
        {link('/projects/new','New Project')}
        {link('/team','Team Management')}
        <div className="flex items-center justify-between">
          {link('/updates','PM Update Monitor')}
          {uCount > 0 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-semibold" data-testid="badge-pending-count">{uCount}</span>}
        </div>
        {link('/admin-email','Email Center')}
      </div>
      <div className="pb-8"></div>
    </aside>
  )
}

function AdminEmailPage(){
  const { orgId, projectId } = useOrg()
  return (
    <div className="space-y-6">
      <AdminEmailSend orgId={orgId} projectId={projectId} />
    </div>
  )
}

function ProjectsAdminPage(){
  const { orgId } = useOrg()
  return <ProjectsAdmin orgId={orgId} />
}

function ProjectWizardPage(){
  const { orgId, setProjectId } = useOrg()
  return <ProjectWizard 
    orgId={orgId} 
    onComplete={(projectId) => {
      setProjectId(projectId)
      // Could redirect to dashboard or project view
      window.location.href = '/dashboard'
    }} 
  />
}