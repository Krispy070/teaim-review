import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Mail, Users, Clock, CheckCircle, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Contact {
  id: string
  name: string
  email: string
  role: string
}

interface EmailLogItem {
  id: number
  to_email: string
  subject: string
  template_key: string
  status: string
  error?: string
  provider_id?: string
  created_at: string
}

interface AdminEmailSendProps {
  orgId: string
  projectId: string
}

const ONBOARDING_TEMPLATES = [
  { key: "metrics", label: "Metrics Request", description: "Request project success metrics" },
  { key: "team", label: "Team Setup", description: "Collect team roster and meeting preferences" },
  { key: "logistics", label: "Logistics Setup", description: "Communication tools and processes" },
  { key: "reminder", label: "Reminder", description: "Gentle reminder for pending items" },
  { key: "complete", label: "Onboarding Complete", description: "Welcome message and next steps" }
]

export default function AdminEmailSend({ orgId, projectId }: AdminEmailSendProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  // State for send form
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [variables, setVariables] = useState({
    project_code: "",
    first_name: ""
  })

  // Fetch team contacts
  const { data: contactsData } = useQuery({
    queryKey: ["team", "contacts", orgId, projectId],
    queryFn: async () => {
      const response = await fetch(`/api/team/contacts?org_id=${orgId}&project_id=${projectId}`)
      if (!response.ok) throw new Error("Failed to fetch contacts")
      return response.json()
    },
    enabled: !!orgId && !!projectId
  })

  // Fetch email log
  const { data: emailLogData, refetch: refetchLog } = useQuery({
    queryKey: ["admin", "emails", "log", orgId, projectId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/emails/log?org_id=${orgId}&project_id=${projectId}`)
      if (!response.ok) throw new Error("Failed to fetch email log")
      return response.json()
    },
    enabled: !!orgId && !!projectId
  })

  // Send email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async (payload: {
      template_key: string
      to_emails: string[]
      variables: Record<string, string>
    }) => {
      const response = await fetch("/api/admin/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          ...payload
        })
      })
      if (!response.ok) throw new Error("Failed to send emails")
      return response.json()
    },
    onSuccess: (data) => {
      refetchLog()
      setSelectedContacts([])
      setSelectedTemplate("")
      setVariables({ project_code: "", first_name: "" })
      
      const { sent, failed } = data
      if (sent.length > 0) {
        toast({
          title: "Emails sent successfully",
          description: `Sent to ${sent.length} recipient${sent.length > 1 ? 's' : ''}`
        })
      }
      if (failed.length > 0) {
        toast({
          title: "Some emails failed",
          description: `Failed to send to ${failed.length} recipient${failed.length > 1 ? 's' : ''}`,
          variant: "destructive"
        })
      }
    }
  })

  const handleSendEmails = () => {
    if (!selectedTemplate || selectedContacts.length === 0) {
      toast({
        title: "Missing required fields",
        description: "Please select a template and at least one recipient",
        variant: "destructive"
      })
      return
    }

    const contacts = contactsData?.contacts || []
    const toEmails = selectedContacts.map(contactId => {
      const contact = contacts.find((c: Contact) => c.id === contactId)
      return contact?.email
    }).filter(Boolean)

    sendEmailMutation.mutate({
      template_key: selectedTemplate,
      to_emails: toEmails,
      variables
    })
  }

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    )
  }

  const selectAllContacts = () => {
    const contacts = contactsData?.contacts || []
    setSelectedContacts(contacts.map((c: Contact) => c.id))
  }

  const clearContactSelection = () => {
    setSelectedContacts([])
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  const contacts = contactsData?.contacts || []
  const emailLog = emailLogData?.items || []

  return (
    <div className="space-y-6" data-testid="admin-email-send">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Admin Email Center</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send Email Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send Campaign
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Selection */}
            <div>
              <Label htmlFor="template">Email Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger data-testid="select-template">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {ONBOARDING_TEMPLATES.map(template => (
                    <SelectItem key={template.key} value={template.key}>
                      <div>
                        <div className="font-medium">{template.label}</div>
                        <div className="text-xs text-muted-foreground">{template.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Variables */}
            <div className="space-y-3">
              <Label>Template Variables</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="project_code" className="text-xs">Project Code</Label>
                  <Input
                    id="project_code"
                    placeholder="e.g. WD-ACME"
                    value={variables.project_code}
                    onChange={(e) => setVariables(prev => ({ ...prev, project_code: e.target.value }))}
                    data-testid="input-project-code"
                  />
                </div>
                <div>
                  <Label htmlFor="first_name" className="text-xs">First Name</Label>
                  <Input
                    id="first_name"
                    placeholder="e.g. John"
                    value={variables.first_name}
                    onChange={(e) => setVariables(prev => ({ ...prev, first_name: e.target.value }))}
                    data-testid="input-first-name"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Recipients ({selectedContacts.length})
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllContacts}
                    disabled={contacts.length === 0}
                    data-testid="button-select-all"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearContactSelection}
                    disabled={selectedContacts.length === 0}
                    data-testid="button-clear-selection"
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-contacts">
                  No contacts available. Add team members to send emails.
                </p>
              ) : (
                <ScrollArea className="h-[200px] border rounded-md p-3">
                  <div className="space-y-2">
                    {contacts.map((contact: Contact) => (
                      <div
                        key={contact.id}
                        className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted ${
                          selectedContacts.includes(contact.id) ? "bg-primary/10" : ""
                        }`}
                        onClick={() => toggleContactSelection(contact.id)}
                        data-testid={`contact-${contact.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedContacts.includes(contact.id)}
                          onChange={() => toggleContactSelection(contact.id)}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{contact.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {contact.email}
                          </div>
                          {contact.role && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {contact.role}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleSendEmails}
              disabled={sendEmailMutation.isPending || !selectedTemplate || selectedContacts.length === 0}
              data-testid="button-send-emails"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendEmailMutation.isPending ? "Sending..." : `Send to ${selectedContacts.length} recipient${selectedContacts.length !== 1 ? 's' : ''}`}
            </Button>
          </CardContent>
        </Card>

        {/* Email Log */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Email Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {emailLog.length === 0 ? (
              <p className="text-center text-muted-foreground py-8" data-testid="text-no-logs">
                No email activity yet. Send your first campaign to see logs here.
              </p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {emailLog.map((log: EmailLogItem) => (
                    <div
                      key={log.id}
                      className="border rounded-lg p-3 space-y-2"
                      data-testid={`log-${log.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          <Badge variant="outline" className="text-xs">
                            {log.template_key}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(log.created_at)}
                        </div>
                      </div>
                      <div className="text-sm">
                        <div className="font-medium">{log.subject}</div>
                        <div className="text-muted-foreground">To: {log.to_email}</div>
                        {log.error && (
                          <div className="text-red-500 text-xs mt-1">{log.error}</div>
                        )}
                        {log.provider_id && (
                          <div className="text-xs text-muted-foreground">ID: {log.provider_id}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}