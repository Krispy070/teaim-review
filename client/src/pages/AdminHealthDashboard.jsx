import React, { useState, useEffect } from 'react'
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import AdminOps from '@/components/AdminOps'
import AdminWellness from '@/components/AdminWellness'

export default function AdminHealthDashboard({ projectId }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [checks, setChecks] = useState([])
  const [overallOk, setOverallOk] = useState(null)

  async function fetchHealthStatus() {
    if (!projectId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/health?project_id=${encodeURIComponent(projectId)}`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setChecks(data.checks || [])
        setOverallOk(data.ok)
      } else {
        const error = await response.text()
        throw new Error(error)
      }
    } catch (error) {
      toast({ 
        title: "Health check failed", 
        description: String(error?.message || error), 
        variant: "destructive" 
      })
    } finally {
      setLoading(false)
    }
  }

  async function reloadSchema() {
    try {
      const response = await fetch('/api/_debug/reload_schema', { 
        method: 'POST', 
        credentials: 'include' 
      })
      
      if (response.ok) {
        toast({
          title: "Schema reload signaled",
          description: "PostgREST schema cache has been refreshed"
        })
      } else {
        const errorText = await response.text()
        throw new Error(errorText)
      }
    } catch (error) {
      toast({
        title: "Schema reload failed",
        description: String(error?.message || error),
        variant: "destructive"
      })
    }
  }

  useEffect(() => {
    fetchHealthStatus()
  }, [projectId])

  function getStatusIcon(check) {
    if (check.ok === true) return <CheckCircle className="h-4 w-4 text-green-600" />
    if (check.ok === false) return <XCircle className="h-4 w-4 text-red-600" />
    return <Clock className="h-4 w-4 text-yellow-600" />
  }

  function getStatusText(check) {
    if (check.ok === true) return "OK"
    if (check.ok === false) return "FAILED"
    return "UNKNOWN"
  }

  function formatValue(check) {
    if (check.count !== undefined) return `${check.count} items`
    if (check.value) {
      if (check.value.includes('T') && check.value.includes('Z')) {
        // ISO timestamp
        return new Date(check.value).toLocaleString()
      }
      return check.value
    }
    return ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Health Dashboard</h2>
          <p className="text-muted-foreground">Monitor system components and infrastructure status</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={fetchHealthStatus} 
            disabled={loading}
            data-testid="button-refresh-health"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
          <Button 
            onClick={reloadSchema}
            variant="outline"
            data-testid="button-reload-schema"
          >
            Reload Schema
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {overallOk === true ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : overallOk === false ? (
              <XCircle className="h-5 w-5 text-red-600" />
            ) : (
              <Clock className="h-5 w-5 text-yellow-600" />
            )}
            Overall System Status
          </CardTitle>
          <CardDescription>
            {overallOk === true && "All systems operational"}
            {overallOk === false && "Issues detected - see details below"}
            {overallOk === null && "Status unknown"}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Admin Operations Panel */}
      <AdminOps />

      {/* Health Checks and Wellness */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AdminWellness />
        {checks.map((check, index) => (
          <Card key={index} data-testid={`card-health-${check.name}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="capitalize">{check.name.replace(/\./g, ' ')}</span>
                {getStatusIcon(check)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="text-sm">
                  Status: <span className={`font-medium ${
                    check.ok === true ? 'text-green-600' : 
                    check.ok === false ? 'text-red-600' : 
                    'text-yellow-600'
                  }`}>
                    {getStatusText(check)}
                  </span>
                </div>
                
                {formatValue(check) && (
                  <div className="text-sm text-muted-foreground">
                    {formatValue(check)}
                  </div>
                )}
                
                {check.err && (
                  <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 p-2 rounded">
                    {check.err}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {checks.length === 0 && !loading && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No health checks available. Click Refresh to load system status.
          </CardContent>
        </Card>
      )}
    </div>
  )
}