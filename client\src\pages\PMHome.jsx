import React from 'react'
import { useOrg } from '../App'
import { AppFrame } from '../components/layout/AppFrame'
import { Sidebar } from '../components/layout/Sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Activity, 
  Users, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  Clock,
  Calendar,
  Target,
  TrendingUp,
  MessageSquare
} from 'lucide-react'

const PMHome = () => {
  const { projectId, orgId, userRole } = useOrg()

  // Sample data - in real app, this would come from APIs
  const projectStats = {
    totalActions: 45,
    overdueActions: 7,
    pendingSignoffs: 3,
    teamWellness: 'Good',
    nextMilestone: 'Configuration Complete',
    daysToMilestone: 12
  }

  const recentActivity = [
    { id: 1, type: 'action', title: 'Security roles finalized', area: 'HCM', time: '2 hours ago' },
    { id: 2, type: 'signoff', title: 'Data mapping approved', area: 'Finance', time: '4 hours ago' },
    { id: 3, type: 'risk', title: 'Integration timeline concern', area: 'Technical', time: '1 day ago' },
    { id: 4, type: 'decision', title: 'Training approach confirmed', area: 'Change Mgmt', time: '2 days ago' }
  ]

  const upcomingMilestones = [
    { name: 'Configuration Complete', date: 'Oct 15', status: 'on-track' },
    { name: 'UAT Sign-off', date: 'Nov 2', status: 'at-risk' },
    { name: 'Go-Live', date: 'Dec 1', status: 'planned' }
  ]

  const getActivityIcon = (type) => {
    switch (type) {
      case 'action': return <CheckCircle className="h-4 w-4 text-blue-500" />
      case 'signoff': return <FileText className="h-4 w-4 text-green-500" />
      case 'risk': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'decision': return <Target className="h-4 w-4 text-purple-500" />
      default: return <Activity className="h-4 w-4" />
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'on-track': return <Badge className="bg-green-100 text-green-800">On Track</Badge>
      case 'at-risk': return <Badge className="bg-yellow-100 text-yellow-800">At Risk</Badge>
      case 'planned': return <Badge className="bg-gray-100 text-gray-800">Planned</Badge>
      default: return <Badge>Unknown</Badge>
    }
  }

  return (
    <AppFrame sidebar={<Sidebar />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold text-foreground">PM Command Center</h1>
          <p className="text-muted-foreground">Project overview and key metrics for implementation success</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-total-actions">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Actions</p>
                  <p className="text-2xl font-bold">{projectStats.totalActions}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-overdue-actions">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold text-yellow-600">{projectStats.overdueActions}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-pending-signoffs">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending Sign-offs</p>
                  <p className="text-2xl font-bold">{projectStats.pendingSignoffs}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-team-wellness">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Team Wellness</p>
                  <p className="text-2xl font-bold text-green-600">{projectStats.teamWellness}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card data-testid="card-recent-activity">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <span>Recent Activity</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-2 rounded-lg hover:bg-muted/50">
                    {getActivityIcon(activity.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline" className="text-xs">{activity.area}</Badge>
                        <span className="text-xs text-muted-foreground">{activity.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4" data-testid="button-view-all-activity">
                View All Activity
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Milestones */}
          <Card data-testid="card-upcoming-milestones">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Upcoming Milestones</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingMilestones.map((milestone, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg border">
                    <div>
                      <p className="text-sm font-medium">{milestone.name}</p>
                      <p className="text-xs text-muted-foreground">{milestone.date}</p>
                    </div>
                    {getStatusBadge(milestone.status)}
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4" data-testid="button-view-timeline">
                View Full Timeline
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-actions-overview">
                <CheckCircle className="h-5 w-5" />
                <span className="text-xs">Actions Overview</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-signoff-composer">
                <FileText className="h-5 w-5" />
                <span className="text-xs">Create Sign-off</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-team-wellness">
                <Users className="h-5 w-5" />
                <span className="text-xs">Team Wellness</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2" data-testid="button-project-timeline">
                <Clock className="h-5 w-5" />
                <span className="text-xs">Project Timeline</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  )
}

export default PMHome