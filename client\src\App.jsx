import React, { useState, createContext, useContext, useEffect, Suspense, lazy } from 'react'
import { Router, Route, Link, useLocation, Redirect } from 'wouter'
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/queryClient"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider, AuthGuard } from "./contexts/AuthContext"
import { isBrandV2 } from "@/lib/brand"
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
import ProjectsAdmin from './pages/ProjectsAdmin'
import ProjectWizard from './pages/ProjectWizard'
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
import Testing from './pages/Testing'
import TeamWellness from './pages/TeamWellness'
import TeamAccess from './pages/TeamAccess'
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
import { Sidebar as LayoutSidebar } from './components/layout/Sidebar'
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

// Navigation wrapper to ensure all pages have sidebar
const PageWithNavigation = ({ children }) => {
  return (
    <AppFrame sidebar={<LayoutSidebar />}>
      {children}
    </AppFrame>
  )
}

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
          <AppContent value={value} />
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
  const brandV2 = isBrandV2()
  
  // Extract userRole from value for RoleGate usage
  const { userRole } = value

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
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Route path="/login" component={Login} />
        <Route path="/auth/forgot-password" component={ForgotPassword} />
        <Toaster />
      </div>
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
                <ScrollToTop />
                  <Route path="/">{() => 
                    <RoleBasedLanding>
                      {brandV2 ? <DashboardV2 /> : <MainDashboard orgId={value.orgId} projectId={value.projectId} />}
                    </RoleBasedLanding>
                  }</Route>
                  <Route path="/dashboard">{() => brandV2 ? <DashboardV2 /> : <MainDashboard orgId={value.orgId} projectId={value.projectId} />}</Route>
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
                  <Route path="/team">{() => <BrandV2Layout><TeamAccess /></BrandV2Layout>}</Route>
                  <Route path="/updates">{() => <BrandV2Layout><UpdatesReview /></BrandV2Layout>}</Route>
                  <Route path="/admin-email">{() => <BrandV2Layout><Page title="Email Center"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Communication Hub</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Manage email communications, notifications, and team messaging for your project.</p></div></Page></BrandV2Layout>}</Route>
                  <Route path="/admin/projects">{() => <BrandV2Layout><ProjectsAdmin /></BrandV2Layout>}</Route>
                  <Route path="/admin/members">{() => <BrandV2Layout><AdminMembers /></BrandV2Layout>}</Route>
                  
                  {/* Role-based home routes */}
                  <Route path="/home/admin">{() => <BrandV2Layout><LazyWrapper><SystemAdminHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/pm/:projectId">{(params) => <BrandV2Layout><LazyWrapper><ProjectManagerHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/exec/:projectId">{(params) => <BrandV2Layout><LazyWrapper><ExecutiveCustomerHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/exec-partner">{() => <BrandV2Layout><LazyWrapper><ExecutivePartnerHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/functional/:projectId">{(params) => <BrandV2Layout><LazyWrapper><FunctionalLeadHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/data/:projectId">{(params) => <BrandV2Layout><LazyWrapper><DataLeadHome /></LazyWrapper></BrandV2Layout>}</Route>
                  <Route path="/home/worker/:projectId">{(params) => <BrandV2Layout><LazyWrapper><WorkerHome /></LazyWrapper></BrandV2Layout>}</Route>
                  
                  {/* PM/Admin Home Routes - converted to wouter syntax with guards inside render functions */}
                  <Route path="/pm">{() => <RequireRole allow={['owner', 'org_admin', 'pm_admin', 'admin', 'pm']}><PMHome /></RequireRole>}</Route>
                  <Route path="/admin">{() => <RequireRole allow={['owner', 'org_admin', 'admin']}><AdminHome /></RequireRole>}</Route>
                  
                  {/* Admin routes moved to project-scoped section for proper navigation */}
                  <Route path="/admin/stage-templates">{() => <RoleGate allow={['owner', 'admin', 'pm']} role={userRole}><LazyWrapper><StageTemplateEditor /></LazyWrapper></RoleGate>}</Route>
                  {/* Project-scoped routes flattened for wouter compatibility */}
                  <Route path="/projects/:projectId">{(params) => <ProjectLayout><Redirect to={`/projects/${params.projectId}/dashboard`} /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/dashboard">{(params) => <ProjectLayout>{brandV2 ? <DashboardV2 /> : <MainDashboard orgId={value.orgId} projectId={params.projectId} />}</ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/timeline">{(params) => <ProjectLayout><TimelinePage /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/documents">{(params) => <ProjectLayout><LazyWrapper><Library orgId={value.orgId} projectId={params.projectId} /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/meetings">{(params) => <ProjectLayout><LazyWrapper><Meetings projectId={params.projectId} /></LazyWrapper></ProjectLayout>}</Route>
                  
                  {/* Flattened project routes - converted from nested structure to absolute paths */}
                  <Route path="/projects/:projectId/tests">{(params) => <ProjectLayout><LazyWrapper><TestsLibrary projectId={params.projectId} /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/updates/review">{(params) => <ProjectLayout><UpdatesReview /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/updates">{(params) => <ProjectLayout><Redirect to={`/projects/${params.projectId}/updates/review`} /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/actions">{(params) => <ProjectLayout><ActionsList /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/actions/list">{(params) => <ProjectLayout><ActionsList /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/actions/kanban">{(params) => <ProjectLayout><ActionsKanban /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/chat">{(params) => <ProjectLayout><Page title="Chat"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">💬</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Team Chat</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Real-time messaging and collaboration space for your project team.</p></div></Page></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/analytics">{(params) => <ProjectLayout><Redirect to={`/projects/${params.projectId}/reporting`} /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/reports">{(params) => <ProjectLayout><Redirect to={`/projects/${params.projectId}/reporting`} /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/reporting">{(params) => <ProjectLayout><LazyWrapper><Reporting /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/signoffs">{(params) => <ProjectLayout><Redirect to={`/projects/${params.projectId}/signoff/compose`} /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/signoff/compose">{(params) => <ProjectLayout><LazyWrapper><SignoffComposer /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/stages/manage">{(params) => <ProjectLayout><Stages /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/stages/wizard">{(params) => <ProjectLayout><StageWizard /></ProjectLayout>}</Route>
                  
                  {/* Admin routes - flattened from nested structure */}
                  <Route path="/projects/:projectId/admin/ops">{(params) => <ProjectLayout><Page title="Operations"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">⚙️</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Operations Dashboard</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor operational metrics, system health, and administrative tasks.</p></div></Page></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/branding">{(params) => <ProjectLayout><RoleGate allow={['owner', 'admin']} role={userRole}><LazyWrapper><BrandingSettings /></LazyWrapper></RoleGate></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/digest-preview">{(params) => <ProjectLayout><RoleGate allow={['owner', 'admin', 'pm', 'lead']} role={userRole}><LazyWrapper><DigestPreview /></LazyWrapper></RoleGate></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/method">{(params) => <ProjectLayout><Page title="Method Insights"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📈</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Implementation Analytics</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Insights and analytics about your Workday implementation methodology and progress.</p></div></Page></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/invite">{(params) => <ProjectLayout><AdminMembers /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/members">{(params) => <ProjectLayout><AdminMembers /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/team-access">{(params) => <ProjectLayout><TeamAccess /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/backups">{(params) => <ProjectLayout><LazyWrapper><AdminBackups projectId={params.projectId} /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/rls-selftest">{(params) => <ProjectLayout><LazyWrapper><RlsSelfTest /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/health">{(params) => <ProjectLayout><LazyWrapper><AdminHealthDashboard projectId={params.projectId} /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/schema-doctor">{(params) => <ProjectLayout><LazyWrapper><AdminSchemaDoctor /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/integrations">{(params) => <ProjectLayout><LazyWrapper><IntegrationsTracker projectId={params.projectId} /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/share-links">{(params) => <ProjectLayout><LazyWrapper><ShareLinksManager /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/audit-timeline">{(params) => <ProjectLayout><LazyWrapper><AuditTimeline /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/qa">{(params) => <ProjectLayout><LazyWrapper><ProjectQATools /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/smoke-run">{(params) => <ProjectLayout><LazyWrapper><ProjectSmokeRun /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/admin/test">{(params) => <BrandV2Layout><LazyWrapper><TestRunner /></LazyWrapper></BrandV2Layout>}</Route>
                  
                  {/* Additional project routes - flattened from nested structure */}
                  <Route path="/projects/:projectId/workstreams">{(params) => <ProjectLayout><LazyWrapper><Workstreams /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/workstreams/:areaKey">{(params) => <ProjectLayout><LazyWrapper><WorkstreamArea /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/changes/intake">{(params) => <ProjectLayout><LazyWrapper><ChangeIntake /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/changes/board">{(params) => <ProjectLayout><LazyWrapper><ChangeKanban /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/changes/list">{(params) => <ProjectLayout><LazyWrapper><ChangeList /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/team/owner">{(params) => <ProjectLayout><LazyWrapper><OwnerDashboard /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/team/area-owners">{(params) => <ProjectLayout><LazyWrapper><AdminAreaOwners /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/releases">{(params) => <ProjectLayout><LazyWrapper><Releases /></LazyWrapper></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/training">{(params) => <ProjectLayout><Training /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/testing">{(params) => <ProjectLayout><Testing /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/logistics">{(params) => <ProjectLayout><Page title="Logistics"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">📦</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Resource Management</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Track project resources, equipment allocation, and logistical coordination for your Workday implementation.</p></div></Page></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/stages">{(params) => <ProjectLayout><Page title="Stage Sign-Off"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">✅</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Stage Approvals</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Manage stage-based approvals and sign-offs for your implementation milestones.</p></div></Page></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/integrations">{(params) => <ProjectLayout><Page title="Integrations & Tech"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">🔧</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">System Integrations</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor and configure integrations with external systems and technical infrastructure.</p></div></Page></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/wellness">{(params) => <ProjectLayout><TeamWellness /></ProjectLayout>}</Route>
                  <Route path="/projects/:projectId/financials">{(params) => <ProjectLayout><Page title="Financials"><div className="text-center py-12 space-y-4"><div className="text-4xl mb-4">💰</div><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Budget & Cost Tracking</h3><p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Monitor project budgets, track expenses, and manage financial aspects of your implementation.</p></div></Page></ProjectLayout>}</Route>
                  
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
                <div className="fixed right-3 top-3 z-[96]">
                  <NotificationDrawer />
                </div>
              </>
            ) : (
              // Original layout system for non Brand V2
              <AppShell sidebar={<Sidebar />}>
                <ScrollToTop />
                <Topbar />
                <main className="max-w-7xl mx-auto px-4 py-6">
                    <Route path="/">{() => <MainDashboard orgId={value.orgId} projectId={value.projectId} />}</Route>
                    <Route path="/dashboard">{() => <MainDashboard orgId={value.orgId} projectId={value.projectId} />}</Route>
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
                    <Route path="/admin/projects">{() => <ProjectsAdmin />}</Route>
                    <Route path="/admin/members">{() => <AdminMembers />}</Route>
                    <Route path="/admin/branding">{() => <RoleGate allow={['owner', 'admin']} role={userRole}><LazyWrapper><BrandingSettings /></LazyWrapper></RoleGate>}</Route>
                    <Route path="/admin/stage-templates">{() => <RoleGate allow={['owner', 'admin', 'pm']} role={userRole}><LazyWrapper><StageTemplateEditor /></LazyWrapper></RoleGate>}</Route>
                    {/* Project-scoped routes converted to wouter syntax */}
                    <Route path="/projects/:projectId">{(params) => <ProjectLayout><Redirect to={`/projects/${params.projectId}/dashboard`} /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/dashboard">{(params) => <ProjectLayout><MainDashboard orgId={value.orgId} projectId={params.projectId} /></ProjectLayout>}</Route>
                    <Route path="/projects/:projectId/timeline">{(params) => <ProjectLayout><TimelinePage /></ProjectLayout>}</Route>
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
                      <Route path="/admin/projects">{() => <ProjectsAdmin />}</Route>
                      <Route path="/admin/comms">{() => <Page title="Email Center">Coming soon</Page>}</Route>
                      <Route path="/admin/qa-tools">{() => <LazyWrapper><ProjectQATools /></LazyWrapper>}</Route>
                    
                    {/* Safety redirect for malformed project URLs - converted to wouter syntax */}
                    <Route path="/projects/undefined/*">{() => <Redirect to="/projects/select" />}</Route>
                    
                    {/* Non-project routes - converted to wouter syntax */}
                    <Route path="/projects/select">{() => <ProjectSelect />}</Route>
                    <Route path="/projects/new">{() => <ProjectWizard />}</Route>
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



function TeamPage(){
  const { orgId, projectId } = useOrg()
  return (
    <div className="space-y-6">
      <TeamSubscriptions orgId={orgId} projectId={projectId} />
    </div>
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