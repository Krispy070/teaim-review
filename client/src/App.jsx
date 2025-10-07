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
import NotificationBell from './components/NotificationBell'
import NotificationToaster from './components/NotificationToaster'
import BrandedHeader from './components/BrandedHeader'
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
import AppShellLayout from '@/layouts/AppShell'

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
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))

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
              // Brand V2 uses AppShell wrapper once for all routes
              <AppShellLayout>
                  <Route path="/">{() => 
                    <RoleBasedLanding>
                      <DashboardV2 />
                    </RoleBasedLanding>
                  }</Route>
                  <Route path="/dashboard">{() => {
                    if (!value.projectId) {
                      return <ProjectSelect />;
                    }
                    return <Redirect to={`/projects/${value.projectId}/dashboard`} />;
                  }}</Route>
                  <Route path="/timeline">{() => <TimelinePage />}</Route>
                  <Route path="/workstreams">{() => <LazyWrapper><Workstreams /></LazyWrapper>}</Route>
                  <Route path="/integrations">{() => <Page title="Integrations & Tech"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">🔧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">System Integrations</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor and configure integrations with external systems and technical infrastructure.</p></div></Page>}</Route>
                  <Route path="/actions">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/actions`} /> : <ProjectSelect />}</Route>
                  <Route path="/actions/list">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/actions/list`} /> : <ProjectSelect />}</Route>
                  <Route path="/actions/kanban">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/actions/kanban`} /> : <ProjectSelect />}</Route>
                  <Route path="/documents">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/documents`} /> : <ProjectSelect />}</Route>
                  <Route path="/meetings">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/meetings`} /> : <ProjectSelect />}</Route>
                  <Route path="/training">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/training`} /> : <ProjectSelect />}</Route>
                  <Route path="/testing">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/testing`} /> : <ProjectSelect />}</Route>
                  <Route path="/logistics">{() => <Page title="Logistics"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📦</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Resource Management</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Track project resources, equipment allocation, and logistical coordination for your Workday implementation.</p></div></Page>}</Route>
                  <Route path="/data">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/reporting`} /> : <ProjectSelect />}</Route>
                  <Route path="/reporting">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/reporting`} /> : <ProjectSelect />}</Route>
                  <Route path="/wellness">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/wellness`} /> : <ProjectSelect />}</Route>
                  <Route path="/financials">{() => <Page title="Financials"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">💰</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Budget & Cost Tracking</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor project budgets, track expenses, and manage financial aspects of your implementation.</p></div></Page>}</Route>
                  <Route path="/team">{() => <TeamPage />}</Route>
                  <Route path="/updates">{() => <UpdatesReview />}</Route>
                  <Route path="/admin-email">{() => <Page title="Email Center"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Communication Hub</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Manage email communications, notifications, and team messaging for your project.</p></div></Page>}</Route>
                  <Route path="/admin/projects">{() => <ProjectManagement />}</Route>
                  <Route path="/admin/members">{() => <AdminMembers />}</Route>
                  <Route path="/admin/branding">{() => <RoleGate allow={['owner', 'admin']} role={userRole}><LazyWrapper><BrandingSettings /></LazyWrapper></RoleGate>}</Route>
                  <Route path="/admin/schema-doctor">{() => <LazyWrapper><AdminSchemaDoctor /></LazyWrapper>}</Route>
                  
                  {/* Role-based home routes */}
                  <Route path="/home/admin">{() => <LazyWrapper><SystemAdminHome /></LazyWrapper>}</Route>
                  <Route path="/home/pm/:projectId">{(params) => <LazyWrapper><ProjectManagerHome /></LazyWrapper>}</Route>
                  <Route path="/home/exec/:projectId">{(params) => <LazyWrapper><ExecutiveCustomerHome /></LazyWrapper>}</Route>
                  <Route path="/home/exec-partner">{() => <LazyWrapper><ExecutivePartnerHome /></LazyWrapper>}</Route>
                  <Route path="/home/functional/:projectId">{(params) => <LazyWrapper><FunctionalLeadHome /></LazyWrapper>}</Route>
                  <Route path="/home/data/:projectId">{(params) => <LazyWrapper><DataLeadHome /></LazyWrapper>}</Route>
                  <Route path="/home/worker/:projectId">{(params) => <LazyWrapper><WorkerHome /></LazyWrapper>}</Route>
                  
                  {/* PM/Admin Home Routes - converted to wouter syntax with guards inside render functions */}
                  <Route path="/pm">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/dashboard`} /> : <ProjectSelect />}</Route>
                  <Route path="/admin">{() => value.projectId ? <Redirect to={`/projects/${value.projectId}/dashboard`} /> : <ProjectSelect />}</Route>
                  
                  {/* Admin routes moved to project-scoped section for proper navigation */}
                  <Route path="/admin/stage-templates">{() => <RoleGate allow={['owner', 'admin', 'pm']} role={userRole}><LazyWrapper><StageTemplateEditor /></LazyWrapper></RoleGate>}</Route>
                  {/* Project-scoped routes flattened for wouter compatibility */}
                  <Route path="/projects/:projectId">{(params) => <Redirect to={`/projects/${params.projectId}/dashboard`} />}</Route>
                  <Route path="/projects/:projectId/dashboard">{(params) => <DashboardV2 />}</Route>
                  <Route path="/projects/:projectId/timeline">{(params) => <TimelinePage />}</Route>
                  <Route path="/projects/:projectId/documents">{(params) => <LazyWrapper><DocsPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/library">{(params) => <LazyWrapper><Library orgId={value.orgId} projectId={params.projectId} /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/ingest">{(params) => <LazyWrapper><IngestDoc /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/meetings">{(params) => <LazyWrapper><Meetings projectId={params.projectId} /></LazyWrapper>}</Route>
                  
                  {/* M&A Module routes */}
                  <Route path="/projects/:projectId/ma/hub">{(params) => <LazyWrapper><MAndAHubPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/ma/playbooks">{(params) => <LazyWrapper><MAPlaybooks /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/ma/integrations">{(params) => <LazyWrapper><MAIntegrations /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/ma/risks">{(params) => <LazyWrapper><MARisks /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/ma/lessons">{(params) => <LazyWrapper><MALessons /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/ma/issues">{(params) => <LazyWrapper><IssuesBoard /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/stakeholders/matrix">{(params) => <LazyWrapper><StakeholderMatrixPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/search">{(params) => <LazyWrapper><GlobalSearchPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/brief">{(params) => <LazyWrapper><DailyBriefPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/calendar">{(params) => <LazyWrapper><CalendarMeetingsPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/tickets">{(params) => <LazyWrapper><TicketsPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/clip">{(params) => <LazyWrapper><ClipPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/roadmap">{(params) => <LazyWrapper><RoadmapPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/plan">{(params) => <LazyWrapper><PlanBuilderPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/onboarding">{(params) => <LazyWrapper><OnboardingPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/onboarding/push-history">{(params) => <LazyWrapper><OnboardingPushHistoryPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/releases">{(params) => <LazyWrapper><ReleaseManagerPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/releases/:id/tests">{(params) => <LazyWrapper><ReleaseTestsPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/templates">{(params) => <LazyWrapper><TemplatesPage /></LazyWrapper>}</Route>
                  <Route path="/viewer">{() => <LazyWrapper><ArtifactViewerPage /></LazyWrapper>}</Route>
                  
                  {/* M&A shorthand routes that use project from context */}
                  <Route path="/ma/hub">{() => <Redirect to={`/projects/${value.projectId}/ma/hub`} />}</Route>
                  <Route path="/ma/playbooks">{() => <Redirect to={`/projects/${value.projectId}/ma/playbooks`} />}</Route>
                  <Route path="/ma/integrations">{() => <Redirect to={`/projects/${value.projectId}/ma/integrations`} />}</Route>
                  <Route path="/ma/risks">{() => <Redirect to={`/projects/${value.projectId}/ma/risks`} />}</Route>
                  <Route path="/ma/lessons">{() => <Redirect to={`/projects/${value.projectId}/ma/lessons`} />}</Route>
                  <Route path="/ma/issues">{() => <Redirect to={`/projects/${value.projectId}/ma/issues`} />}</Route>
                  
                  {/* Project Setup Wizard */}
                  <Route path="/projects/:projectId/setup">{(params) => <LazyWrapper><ProjectSetupPage /></LazyWrapper>}</Route>
                  
                  {/* Activity & Ops (Fix Pack v28, v29, v32, v33, v34) */}
                  <Route path="/projects/:projectId/activity">{(params) => <LazyWrapper><ActivityPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/ops">{(params) => <LazyWrapper><OpsPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/api-keys">{(params) => <LazyWrapper><ProjectApiKeysPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/backup">{(params) => <LazyWrapper><ProjectBackupPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/tenants">{(params) => <LazyWrapper><TenantsPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/tenants/diff">{(params) => <LazyWrapper><TenantsDiffPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/tenants/snapshots">{(params) => <LazyWrapper><TenantSnapshotsPage /></LazyWrapper>}</Route>
                  <Route path="/org/admin">{() => <LazyWrapper><OrgAdminPage /></LazyWrapper>}</Route>
                  
                  {/* Flattened project routes - converted from nested structure to absolute paths */}
                  <Route path="/projects/:projectId/tests">{(params) => <LazyWrapper><TestsLibrary projectId={params.projectId} /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/updates/review">{(params) => <UpdatesReview />}</Route>
                  <Route path="/projects/:projectId/updates">{(params) => <Redirect to={`/projects/${params.projectId}/updates/review`} />}</Route>
                  <Route path="/projects/:projectId/actions">{(params) => <ActionsList />}</Route>
                  <Route path="/projects/:projectId/actions/list">{(params) => <ActionsList />}</Route>
                  <Route path="/projects/:projectId/actions/kanban">{(params) => <ActionsKanban />}</Route>
                  <Route path="/projects/:projectId/chat">{(params) => <Page title="Chat"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">💬</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Team Chat</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Real-time messaging and collaboration space for your project team.</p></div></Page>}</Route>
                  <Route path="/projects/:projectId/analytics">{(params) => <Redirect to={`/projects/${params.projectId}/reporting`} />}</Route>
                  <Route path="/projects/:projectId/reports">{(params) => <Redirect to={`/projects/${params.projectId}/reporting`} />}</Route>
                  <Route path="/projects/:projectId/reporting">{(params) => <LazyWrapper><Reporting /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/signoffs">{(params) => <Redirect to={`/projects/${params.projectId}/signoff/compose`} />}</Route>
                  <Route path="/projects/:projectId/signoff/compose">{(params) => <LazyWrapper><SignoffComposer /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/signoff/docs">{(params) => <Page title="Sign-Off Documents"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📄</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Sign-Off Documents</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">View and manage sign-off documents for your implementation milestones.</p></div></Page>}</Route>
                  <Route path="/projects/:projectId/stages/manage">{(params) => <Stages />}</Route>
                  <Route path="/projects/:projectId/stages/wizard">{(params) => <StageWizard />}</Route>
                  
                  {/* Admin routes - flattened from nested structure */}
                  <Route path="/projects/:projectId/admin/ops">{(params) => <Page title="Operations"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">⚙️</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Operations Dashboard</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor operational metrics, system health, and administrative tasks.</p></div></Page>}</Route>
                  <Route path="/projects/:projectId/admin/branding">{(params) => <RoleGate allow={['owner', 'admin']} role={userRole}><LazyWrapper><BrandingSettings /></LazyWrapper></RoleGate>}</Route>
                  <Route path="/projects/:projectId/admin/digest-preview">{(params) => <RoleGate allow={['owner', 'admin', 'pm', 'lead']} role={userRole}><LazyWrapper><DigestPreview /></LazyWrapper></RoleGate>}</Route>
                  <Route path="/projects/:projectId/admin/method">{(params) => <Page title="Method Insights"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📈</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Implementation Analytics</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Insights and analytics about your Workday implementation methodology and progress.</p></div></Page>}</Route>
                  <Route path="/projects/:projectId/admin/invite">{(params) => <AdminMembers />}</Route>
                  <Route path="/projects/:projectId/admin/members">{(params) => <AdminMembers />}</Route>
                  <Route path="/projects/:projectId/admin/team-access">{(params) => <TeamAccess />}</Route>
                  <Route path="/projects/:projectId/admin/backups">{(params) => <LazyWrapper><AdminBackups projectId={params.projectId} /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/rls-selftest">{(params) => <LazyWrapper><RlsSelfTest /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/health">{(params) => <LazyWrapper><AdminHealthDashboard projectId={params.projectId} /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/schema-doctor">{(params) => <LazyWrapper><AdminSchemaDoctor /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/integrations">{(params) => <LazyWrapper><IntegrationsTracker projectId={params.projectId} /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/share-links">{(params) => <LazyWrapper><ShareLinksManager /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/audit-timeline">{(params) => <LazyWrapper><AuditTimeline /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/qa">{(params) => <LazyWrapper><ProjectQATools /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/qa-tools">{(params) => <LazyWrapper><ProjectQATools /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/comms">{(params) => <Page title="Email Center"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Communication Hub</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Manage email communications, notifications, and team messaging for your project.</p></div></Page>}</Route>
                  <Route path="/projects/:projectId/admin/smoke-run">{(params) => <LazyWrapper><ProjectSmokeRun /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/admin/test">{(params) => <LazyWrapper><TestRunner /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/docs/:id">{(params) => <LazyWrapper><DocDetailPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/docs">{(params) => <LazyWrapper><DocsPage /></LazyWrapper>}</Route>
                  <Route path="/docs">{() => <LazyWrapper><DocsPage /></LazyWrapper>}</Route>
                  
                  {/* Additional project routes - flattened from nested structure */}
                  <Route path="/projects/:projectId/workstreams">{(params) => <LazyWrapper><Workstreams /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/workstreams/:areaKey">{(params) => <LazyWrapper><WorkstreamArea /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/changes/intake">{(params) => <LazyWrapper><ChangeIntake /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/changes/board">{(params) => <LazyWrapper><ChangeKanban /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/changes/list">{(params) => <LazyWrapper><ChangeList /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/team/owner">{(params) => <LazyWrapper><OwnerDashboard /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/team/area-owners">{(params) => <LazyWrapper><AdminAreaOwners /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/releases">{(params) => <LazyWrapper><Releases /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/training">{(params) => <TrainingPage />}</Route>
                  <Route path="/projects/:projectId/testing">{(params) => <Testing />}</Route>
                  <Route path="/projects/:projectId/logistics">{(params) => <Page title="Logistics"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📦</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Resource Management</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Track project resources, equipment allocation, and logistical coordination for your Workday implementation.</p></div></Page>}</Route>
                  <Route path="/projects/:projectId/stages">{(params) => <Page title="Stage Sign-Off"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">✅</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Stage Approvals</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Manage stage-based approvals and sign-offs for your implementation milestones.</p></div></Page>}</Route>
                  <Route path="/projects/:projectId/integrations">{(params) => <LazyWrapper><IntegrationsPage /></LazyWrapper>}</Route>
                  <Route path="/projects/:projectId/wellness">{(params) => <TeamWellness />}</Route>
                  <Route path="/projects/:projectId/team">{(params) => <TeamPage />}</Route>
                  <Route path="/projects/:projectId/financials">{(params) => <Page title="Financials"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">💰</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Budget & Cost Tracking</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor project budgets, track expenses, and manage financial aspects of your implementation.</p></div></Page>}</Route>
                  
                  {/* Insights routes */}
                  <Route path="/projects/:projectId/insights/timeline">{(params) => <TimelineEventsPage />}</Route>
                  <Route path="/projects/:projectId/insights/risks">{(params) => <RisksInsightsPage />}</Route>
                  <Route path="/projects/:projectId/insights/actions">{(params) => <ActionsInsights />}</Route>
                  <Route path="/projects/:projectId/insights/decisions">{(params) => <DecisionsInsights />}</Route>
                  <Route path="/projects/:projectId/insights/tests">{(params) => <Testing />}</Route>
                  
                  {/* Safety redirect for malformed project URLs */}
                  <Route path="/projects/undefined/*">{() => <Redirect to="/projects/select" />}</Route>
                  
                  {/* Non-project routes with proper layout */}
                  <Route path="/projects/select">{() => <ProjectSelect />}</Route>
                  <Route path="/projects/new">{() => <ProjectWizard />}</Route>
                  <Route path="/projects/stages">{() => <ProjectStages projectId={value.projectId} />}</Route>
                  <Route path="/profile">{() => <Profile />}</Route>
                  <Route path="*">{() => <Page title="Not Found">Check the URL.</Page>}</Route>
                <ChatDock orgId={value.orgId} projectId={value.projectId} />
                <SpotlightSearch />
                <ImpersonateBar />
              </AppShellLayout>
            ) : (
              // Original layout system for non Brand V2
              <AppShell sidebar={<Sidebar />}>
                <Topbar />
                <main className="max-w-7xl mx-auto px-4 py-6">
                    <Route path="/">{() => {
                      if (!value.projectId) {
                        return <ProjectSelect />;
                      }
                      return <Redirect to={`/projects/${value.projectId}/dashboard`} />;
                    }}</Route>
                    <Route path="/dashboard">{() => {
                      if (!value.projectId) {
                        return <ProjectSelect />;
                      }
                      return <Redirect to={`/projects/${value.projectId}/dashboard`} />;
                    }}</Route>
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

function Topbar(){
  const { orgId, projectId, setOrgId, setProjectId } = useOrg()
  const brandV2 = isBrandV2()
  
  if (brandV2) {
    console.log('🔍 Topbar Brand V2 rendering - BASIC TEST');
    return (
      <header className="border-b" style={{borderColor: 'var(--brand-primary, #111111)'}}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Left side - Branding with project awareness */}
          <div className="flex items-center">
            <BrandedHeader variant="compact" showFallback={true} projectId={projectId} />
          </div>
          
          {/* Right side - Controls with brand styling */}
          <div className="flex items-center gap-2">
            <input className="px-2 py-1 border rounded-full text-sm w-48 brand-card"
                   placeholder="org_id (UUID)" value={orgId} onChange={e=>{window.__ORG__=e.target.value||''; setOrgId(e.target.value)}} data-testid="input-org-id" />
            <input className="px-2 py-1 border rounded-full text-sm w-56 brand-card"
                   placeholder="project_id (UUID)" value={projectId} onChange={e=>{window.__PROJ__=e.target.value||''; setProjectId(e.target.value)}} data-testid="input-project-id" />
          </div>
        </div>
      </header>
    )
  }
  
  console.log('🔍 Topbar Legacy rendering - BASIC TEST');
  return (
    <header className="border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Left side - Branding */}
        <div className="flex items-center">
          <BrandedHeader variant="compact" showFallback={true} />
        </div>
        
        {/* Right side - Controls */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <NotificationToaster />
          <input className="px-2 py-1 border rounded-full text-sm w-48 bg-slate-900 border-slate-700"
                 placeholder="org_id (UUID)" value={orgId} onChange={e=>{window.__ORG__=e.target.value||''; setOrgId(e.target.value)}} data-testid="input-org-id" />
          <input className="px-2 py-1 border rounded-full text-sm w-56 bg-slate-900 border-slate-700"
                 placeholder="project_id (UUID)" value={projectId} onChange={e=>{window.__PROJ__=e.target.value||''; setProjectId(e.target.value)}} data-testid="input-project-id" />
        </div>
      </div>
    </header>
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