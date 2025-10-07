import React, { useState, useEffect } from 'react'
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', icon: Clock, color: 'secondary' },
  { value: 'in_progress', label: 'In Progress', icon: AlertTriangle, color: 'yellow' },
  { value: 'connected', label: 'Connected', icon: CheckCircle, color: 'green' },
  { value: 'validated', label: 'Validated', icon: CheckCircle, color: 'green' },
  { value: 'blocked', label: 'Blocked', icon: XCircle, color: 'destructive' }
]

export default function IntegrationsTracker({ projectId }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    transport: '',
    schedule: '',
    status: 'not_started',
    owner_email: '',
    notes: ''
  })

  async function fetchIntegrations() {
    if (!projectId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/integrations/list?project_id=${encodeURIComponent(projectId)}`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setItems(data.items || [])
      } else {
        const error = await response.text()
        throw new Error(error)
      }
    } catch (error) {
      toast({ 
        title: "Failed to load integrations", 
        description: String(error?.message || error), 
        variant: "destructive" 
      })
    } finally {
      setLoading(false)
    }
  }

  async function saveIntegration() {
    try {
      const payload = { ...formData }
      if (editingItem) {
        payload.id = editingItem.id
      }

      const response = await fetch(`/api/integrations/upsert?project_id=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      
      if (response.ok) {
        toast({ 
          title: editingItem ? "Integration updated" : "Integration created", 
          description: `${formData.name} has been saved` 
        })
        setDialogOpen(false)
        resetForm()
        fetchIntegrations()
      } else {
        const error = await response.text()
        throw new Error(error)
      }
    } catch (error) {
      toast({ 
        title: "Save failed", 
        description: String(error?.message || error), 
        variant: "destructive" 
      })
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      transport: '',
      schedule: '',
      status: 'not_started',
      owner_email: '',
      notes: ''
    })
    setEditingItem(null)
  }

  function openAddDialog() {
    resetForm()
    setDialogOpen(true)
  }

  function openEditDialog(item) {
    setFormData({
      name: item.name || '',
      transport: item.transport || '',
      schedule: item.schedule || '',
      status: item.status || 'not_started',
      owner_email: item.owner_email || '',
      notes: item.notes || ''
    })
    setEditingItem(item)
    setDialogOpen(true)
  }

  function getStatusConfig(status) {
    return STATUS_OPTIONS.find(opt => opt.value === status) || STATUS_OPTIONS[0]
  }

  useEffect(() => {
    fetchIntegrations()
  }, [projectId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Integrations Tracker</h2>
          <p className="text-muted-foreground">Track and manage project integrations status</p>
        </div>
        <Button onClick={openAddDialog} data-testid="button-add-integration">
          <Plus className="h-4 w-4 mr-2" />
          Add Integration
        </Button>
      </div>

      {/* Integrations Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const statusConfig = getStatusConfig(item.status)
          const StatusIcon = statusConfig.icon
          
          return (
            <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEditDialog(item)} data-testid={`card-integration-${item.id}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>{item.name}</span>
                  <Badge variant={statusConfig.color} className="flex items-center gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {statusConfig.label}
                  </Badge>
                </CardTitle>
                {item.transport && (
                  <CardDescription>{item.transport}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {item.schedule && (
                    <div>
                      <span className="font-medium">Schedule:</span> {item.schedule}
                    </div>
                  )}
                  {item.owner_email && (
                    <div>
                      <span className="font-medium">Owner:</span> {item.owner_email}
                    </div>
                  )}
                  {item.last_checked && (
                    <div className="text-muted-foreground">
                      Last checked: {new Date(item.last_checked).toLocaleDateString()}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-muted-foreground mt-2 text-xs">
                      {item.notes.substring(0, 100)}{item.notes.length > 100 ? '...' : ''}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {items.length === 0 && !loading && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <div className="space-y-2">
              <p>No integrations tracked yet.</p>
              <Button variant="outline" onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Integration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) resetForm()
      }}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Integration' : 'Add New Integration'}</DialogTitle>
            <DialogDescription>
              Track the status and details of a project integration.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Integration Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Workday SFTP, Active Directory, etc."
                data-testid="input-integration-name"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="transport">Transport</Label>
                <Input
                  id="transport"
                  value={formData.transport}
                  onChange={(e) => setFormData(prev => ({ ...prev, transport: e.target.value }))}
                  placeholder="SFTP, OIDC, API, etc."
                  data-testid="input-integration-transport"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                  <SelectTrigger data-testid="select-integration-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule">Schedule</Label>
                <Input
                  id="schedule"
                  value={formData.schedule}
                  onChange={(e) => setFormData(prev => ({ ...prev, schedule: e.target.value }))}
                  placeholder="daily 01:00 UTC"
                  data-testid="input-integration-schedule"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="owner_email">Owner Email</Label>
                <Input
                  id="owner_email"
                  type="email"
                  value={formData.owner_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, owner_email: e.target.value }))}
                  placeholder="owner@company.com"
                  data-testid="input-integration-owner"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional details, configurations, or requirements..."
                data-testid="textarea-integration-notes"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveIntegration} disabled={!formData.name.trim()} data-testid="button-save-integration">
              {editingItem ? 'Update' : 'Create'} Integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}