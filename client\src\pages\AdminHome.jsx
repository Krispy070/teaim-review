import React from 'react'
import { useOrg } from '../App'
import { AppFrame } from '../components/layout/AppFrame'
import { Sidebar } from '../components/layout/Sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Settings, 
  Users, 
  Database, 
  Shield, 
  Server,
  Activity,
  Palette,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Monitor,
  UserCheck,
  Archive
} from 'lucide-react'

const AdminHome = () => {
  const { projectId, orgId, userRole } = useOrg()

  // Sample data - in real app, this would come from APIs
  const systemStats = {
    activeProjects: 12,
    totalUsers: 47,
    systemHealth: 'Healthy',
    queueLength: 3,
    lastBackup: '2 hours ago',
    storageUsed: '78%'
  }

  const recentAdminActivity = [
    { id: 1, type: 'user', title: 'New user invited to Project Alpha', time: '1 hour ago', status: 'success' },
    { id: 2, type: 'system', title: 'Scheduled backup completed', time: '2 hours ago', status: 'success' },
    { id: 3, type: 'security', title: 'RLS test passed for all projects', time: '4 hours ago', status: 'success' },
    { id: 4, type: 'alert', title: 'Storage approaching 80% capacity', time: '6 hours ago', status: 'warning' }
  ]

  const systemHealth = [
    { component: 'Database', status: 'healthy', uptime: '99.9%' },
    { component: 'API Server', status: 'healthy', uptime: '99.8%' },
    { component: 'Background Jobs', status: 'healthy', uptime: '99.7%' },
    { component: 'File Storage', status: 'warning', uptime: '99.5%' }
  ]

  const getActivityIcon = (type) => {
    switch (type) {
      case 'user': return <Users className="h-4 w-4 text-blue-500" />
      case 'system': return <Server className="h-4 w-4 text-green-500" />
      case 'security': return <Shield className="h-4 w-4 text-purple-500" />
      case 'alert': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      default: return <Activity className="h-4 w-4" />
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'success': return <Badge className="bg-green-100 text-green-800">Success</Badge>
      case 'warning': return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>
      case 'error': return <Badge className="bg-red-100 text-red-800">Error</Badge>
      default: return <Badge>Unknown</Badge>
    }
  }

  return (
    <AppFrame sidebar={<Sidebar />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold text-foreground">Admin Hub</h1>
          <p className="text-muted-foreground">Organization and system administration center</p>
        </div>

        {/* System Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-active-projects">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Projects</p>
                  <p className="text-2xl font-bold">{systemStats.activeProjects}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-total-users">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-bold">{systemStats.totalUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-system-health">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Monitor className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">System Health</p>
                  <p className="text-2xl font-bold text-green-600">{systemStats.systemHealth}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-queue-length">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Database className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Queue Length</p>
                  <p className="text-2xl font-bold">{systemStats.queueLength}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Admin Activity */}
          <Card data-testid="card-admin-activity">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Recent Admin Activity</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentAdminActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-2 rounded-lg hover:bg-muted/50">
                    {getActivityIcon(activity.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        {getStatusBadge(activity.status)}
                        <span className="text-xs text-muted-foreground">{activity.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4" data-testid="button-view-all-admin-activity">
                View All Activity
              </Button>
            </CardContent>
          </Card>

          {/* System Health */}
          <Card data-testid="card-system-health-details">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Monitor className="h-5 w-5" />
                <span>System Health</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {systemHealth.map((component, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(component.status)}
                      <span className="text-sm font-medium">{component.component}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Uptime</p>
                      <p className="text-sm font-mono">{component.uptime}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4" data-testid="button-view-health-dashboard">
                View Health Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Admin Quick Actions */}
        <Card data-testid="card-admin-quick-actions">
          <CardHeader>
            <CardTitle>Administration Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-projects-admin">
                <FileText className="h-5 w-5" />
                <span className="text-xs">Projects</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-members-admin">
                <Users className="h-5 w-5" />
                <span className="text-xs">Members</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-branding-settings">
                <Palette className="h-5 w-5" />
                <span className="text-xs">Branding</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-security-test">
                <Shield className="h-5 w-5" />
                <span className="text-xs">Security</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-system-health">
                <Monitor className="h-5 w-5" />
                <span className="text-xs">Health</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-backups-admin">
                <Archive className="h-5 w-5" />
                <span className="text-xs">Backups</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-storage-info">
            <CardContent className="p-4">
              <div className="text-center">
                <Database className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                <p className="text-sm font-medium text-muted-foreground">Storage Used</p>
                <p className="text-xl font-bold">{systemStats.storageUsed}</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-backup-info">
            <CardContent className="p-4">
              <div className="text-center">
                <Archive className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="text-sm font-medium text-muted-foreground">Last Backup</p>
                <p className="text-xl font-bold">{systemStats.lastBackup}</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-org-info">
            <CardContent className="p-4">
              <div className="text-center">
                <Settings className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                <p className="text-sm font-medium text-muted-foreground">Organization</p>
                <p className="text-xl font-bold">TEAIM Customer</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppFrame>
  )
}

export default AdminHome