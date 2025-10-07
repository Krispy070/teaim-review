import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { UserPlus, Save, Users } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Contact {
  id: string
  name: string
  email: string
  role: string
  workstream: string
}

interface Subscription {
  contact_id: string
  step_key: string
  is_enabled: boolean
}

interface TeamSubscriptionsProps {
  orgId: string
  projectId: string
}

const STEP_LABELS: Record<string, string> = {
  metrics: "Metrics",
  team: "Team Setup", 
  logistics: "Logistics",
  training: "Training",
  integrations: "Integrations",
  testing: "Testing",
  ocm: "Change Mgmt",
  data: "Data",
  financials: "Financials"
}

export default function TeamSubscriptions({ orgId, projectId }: TeamSubscriptionsProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  // State for new contact form
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContact, setNewContact] = useState({
    name: "",
    email: "",
    role: "",
    workstream: ""
  })
  
  // State for subscription matrix
  const [subscriptions, setSubscriptions] = useState<Record<string, boolean>>({})

  // Fetch team data
  const { data: teamData, isLoading } = useQuery({
    queryKey: ["team", "subscriptions", orgId, projectId],
    queryFn: async () => {
      const response = await fetch(`/api/team/subscriptions?org_id=${orgId}&project_id=${projectId}`)
      if (!response.ok) throw new Error("Failed to fetch team data")
      return response.json()
    },
    enabled: !!orgId && !!projectId
  })

  // Initialize subscriptions state when data loads
  useEffect(() => {
    if (teamData?.subs) {
      const subMap: Record<string, boolean> = {}
      teamData.subs.forEach((sub: Subscription) => {
        subMap[`${sub.contact_id}:${sub.step_key}`] = sub.is_enabled
      })
      setSubscriptions(subMap)
    }
  }, [teamData])

  // Add contact mutation
  const addContactMutation = useMutation({
    mutationFn: async (contact: typeof newContact) => {
      const response = await fetch("/api/team/contacts/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          ...contact
        })
      })
      if (!response.ok) throw new Error("Failed to add contact")
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", "subscriptions"] })
      setNewContact({ name: "", email: "", role: "", workstream: "" })
      setShowAddContact(false)
      toast({ title: "Contact added successfully" })
    }
  })

  // Save subscriptions mutation
  const saveSubscriptionsMutation = useMutation({
    mutationFn: async (subs: Record<string, boolean>) => {
      const items = Object.entries(subs).map(([key, enabled]) => {
        const [contact_id, step_key] = key.split(":")
        return { contact_id, step_key, is_enabled: enabled }
      })
      
      const response = await fetch("/api/team/subscriptions/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          items
        })
      })
      if (!response.ok) throw new Error("Failed to save subscriptions")
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team", "subscriptions"] })
      toast({ title: `Saved ${data.count} subscription changes` })
    }
  })

  const toggleSubscription = (contactId: string, stepKey: string) => {
    const key = `${contactId}:${stepKey}`
    setSubscriptions(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleSaveSubscriptions = () => {
    saveSubscriptionsMutation.mutate(subscriptions)
  }

  if (isLoading) {
    return <div data-testid="loading-team">Loading team data...</div>
  }

  const contacts = teamData?.contacts || []
  const steps = teamData?.steps || []

  return (
    <div className="space-y-6" data-testid="team-subscriptions">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Team Onboarding Subscriptions</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddContact(true)}
            data-testid="button-add-contact"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
          <Button
            onClick={handleSaveSubscriptions}
            disabled={saveSubscriptionsMutation.isPending}
            data-testid="button-save-subscriptions"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveSubscriptionsMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Add Contact Form */}
      {showAddContact && (
        <Card data-testid="form-add-contact">
          <CardHeader>
            <CardTitle>Add Team Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newContact.name}
                  onChange={(e) => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="input-contact-name"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newContact.email}
                  onChange={(e) => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                  data-testid="input-contact-email"
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  value={newContact.role}
                  onChange={(e) => setNewContact(prev => ({ ...prev, role: e.target.value }))}
                  data-testid="input-contact-role"
                />
              </div>
              <div>
                <Label htmlFor="workstream">Workstream</Label>
                <Input
                  id="workstream"
                  value={newContact.workstream}
                  onChange={(e) => setNewContact(prev => ({ ...prev, workstream: e.target.value }))}
                  data-testid="input-contact-workstream"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAddContact(false)}
                data-testid="button-cancel-add"
              >
                Cancel
              </Button>
              <Button
                onClick={() => addContactMutation.mutate(newContact)}
                disabled={addContactMutation.isPending || !newContact.name || !newContact.email}
                data-testid="button-submit-contact"
              >
                {addContactMutation.isPending ? "Adding..." : "Add Contact"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscriptions Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Step Subscriptions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select which team members should receive each onboarding step email
          </p>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-contacts">
              No team contacts added yet. Add some contacts to manage their onboarding subscriptions.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium min-w-[200px]">Contact</th>
                    <th className="text-left p-3 font-medium min-w-[120px]">Role</th>
                    {steps.map((step: string) => (
                      <th key={step} className="text-center p-2 font-medium min-w-[80px]">
                        <div className="transform -rotate-45 whitespace-nowrap">
                          {STEP_LABELS[step] || step}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact: Contact) => (
                    <tr key={contact.id} className="border-b hover:bg-muted/50">
                      <td className="p-3" data-testid={`contact-name-${contact.id}`}>
                        <div>
                          <div className="font-medium">{contact.name}</div>
                          <div className="text-sm text-muted-foreground">{contact.email}</div>
                        </div>
                      </td>
                      <td className="p-3 text-sm" data-testid={`contact-role-${contact.id}`}>
                        {contact.role}
                        {contact.workstream && (
                          <div className="text-xs text-muted-foreground">{contact.workstream}</div>
                        )}
                      </td>
                      {steps.map((step: string) => {
                        const key = `${contact.id}:${step}`
                        const isChecked = subscriptions[key] || false
                        return (
                          <td key={key} className="p-2 text-center">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleSubscription(contact.id, step)}
                              data-testid={`checkbox-${contact.id}-${step}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}