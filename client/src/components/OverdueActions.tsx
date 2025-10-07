import { useState, useEffect } from 'react'
import { Clock, AlertTriangle, AlarmClock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Link } from 'wouter'
import { apiGet } from '@/lib/api'

interface OverdueAction {
  id: string
  title: string
  description?: string
  due_date: string
  owner?: string
  status: string
  created_at: string
}

interface OverdueActionsResponse {
  actions: OverdueAction[]
  total_count: number
}

interface OverdueActionsProps {
  projectId: string
  maxDisplay?: number
  showSnooze?: boolean
}

export function OverdueActions({ projectId, maxDisplay = 5, showSnooze = true }: OverdueActionsProps) {
  const [actions, setActions] = useState<OverdueAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snoozingAction, setSnoozingAction] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!projectId) {
      setActions([])
      setLoading(false)
      return
    }

    const fetchOverdueActions = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const url = `/api/actions/overdue?project_id=${projectId}&limit=${maxDisplay}`
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
        const response = await res.json() as OverdueActionsResponse
        
        setActions(response.actions || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load overdue actions')
        setActions([])
      } finally {
        setLoading(false)
      }
    }

    fetchOverdueActions()
  }, [projectId, maxDisplay])

  const handleSnooze = async (actionId: string) => {
    if (!projectId) return
    
    // Snooze for 7 days from today
    const snoozeDate = new Date()
    snoozeDate.setDate(snoozeDate.getDate() + 7)
    
    try {
      setSnoozingAction(actionId)
      
      const url = `/api/actions/snooze/${actionId}?project_id=${projectId}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          snooze_until: snoozeDate.toISOString().split('T')[0]
        })
      })
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
      
      // Remove the action from the list since it's now snoozed
      setActions(prev => prev.filter(action => action.id !== actionId))
      
      toast({
        title: "Action snoozed",
        description: `Snoozed until ${snoozeDate.toLocaleDateString()}`,
      })
    } catch (err) {
      toast({
        title: "Failed to snooze action",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      })
    } finally {
      setSnoozingAction(null)
    }
  }

  const formatDaysOverdue = (dueDate: string): string => {
    const due = new Date(dueDate)
    const today = new Date()
    const diffTime = today.getTime() - due.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return '1 day overdue'
    return `${diffDays} days overdue`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Overdue Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-slate-500 py-4">Loading overdue actions...</div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Overdue Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-amber-600 py-4">
            Unable to load overdue actions. Try again later.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (actions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-emerald-500" />
            Overdue Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-emerald-600 py-4">
            🎉 No overdue actions! Great work!
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Overdue Actions
            <Badge variant="destructive" className="ml-2">
              {actions.length}
            </Badge>
          </div>
          <Link href="/actions" data-testid="link-view-all-actions">
            <Button variant="ghost" size="sm">
              <ExternalLink className="w-4 h-4 mr-2" />
              View All
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {actions.map((action) => (
            <div 
              key={action.id} 
              className="flex items-start justify-between p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
              data-testid={`overdue-action-${action.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <h4 className="font-medium text-sm truncate" data-testid={`text-action-title-${action.id}`}>
                    {action.title}
                  </h4>
                </div>
                <p className="text-xs text-red-600 dark:text-red-400 mb-2" data-testid={`text-days-overdue-${action.id}`}>
                  {formatDaysOverdue(action.due_date)}
                </p>
                {action.owner && (
                  <p className="text-xs text-slate-600 dark:text-slate-400" data-testid={`text-action-owner-${action.id}`}>
                    Owner: {action.owner}
                  </p>
                )}
              </div>
              {showSnooze && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSnooze(action.id)}
                  disabled={snoozingAction === action.id}
                  className="ml-2 flex-shrink-0"
                  data-testid={`button-snooze-${action.id}`}
                >
                  <AlarmClock className="w-3 h-3 mr-1" />
                  {snoozingAction === action.id ? 'Snoozing...' : '7d'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default OverdueActions