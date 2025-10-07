import { useEffect, useState } from "react";
import { useOrg } from "../App";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, User, Filter, ChevronDown, ChevronUp, Calendar, FileText } from "lucide-react";
import { downloadCsv } from "@/lib/download";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/authFetch";
import OwnerPicker from "@/components/OwnerPicker";
import OriginBadge from "@/components/OriginBadge";

const STATUS_COLORS = {
  todo: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300", 
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
};

const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress", 
  done: "Done"
};

export default function ActionsList(){
  const { projectId } = useOrg();
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { toast } = useToast();

  async function load(){
    if (!projectId) return;
    try {
      // Build query parameters with filters
      const params = new URLSearchParams({ projectId: projectId });
      
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (ownerFilter && ownerFilter !== "all") {
        params.set("owner", ownerFilter);
      }
      if (areaFilter && areaFilter !== "all") {
        params.set("area", areaFilter);
      }
      if (originFilter && originFilter !== "all") {
        params.set("originType", originFilter);
      }
      
      const r = await authFetch(`/api/actions/list?${params.toString()}`);
      if (r.ok) setItems((await r.json()).items||[]);
    } catch (error) {
      console.error('Failed to load actions:', error);
    }
  }

  async function loadMembers(){
    try {
      const r = await authFetch(`/api/members/list?project_id=${projectId}`);
      if (r.ok) setMembers((await r.json()).members||[]);
    } catch (error) {
      console.error('Failed to load members:', error);
    }
  }

  useEffect(()=>{ 
    if(projectId) {
      load();
      loadMembers();
    }
  },[projectId]);

  // Auto-reload when filters change
  useEffect(()=>{ 
    if(projectId) load(); 
  },[projectId, ownerFilter, areaFilter, statusFilter, originFilter]);

  async function setStatus(id:string, status:string){
    try {
      await authFetch(`/api/actions/set-status?action_id=${id}&project_id=${projectId}`, {
        method:"POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify({status})
      });
      setItems(prev=> prev.map(a=> a.id===id ? {...a, status} : a));
      toast({ title: "Status updated", description: `Action moved to ${STATUS_LABELS[status as keyof typeof STATUS_LABELS]}` });
    } catch (error) {
      console.error('Failed to update action status:', error);
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  }

  async function setOwner(id:string, owner:string|null){
    try {
      await authFetch(`/api/actions/set-owner?action_id=${id}&project_id=${projectId}`, {
        method:"POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify({owner})
      });
      setItems(prev=> prev.map(a=> a.id===id ? {...a, owner} : a));
      toast({ title: "Owner updated", description: owner ? `Assigned to ${owner}` : "Unassigned" });
    } catch (error) {
      console.error('Failed to update action owner:', error);
      toast({ title: "Failed to update owner", variant: "destructive" });
    }
  }

  if (!projectId) {
    return <div className="p-6">Loading...</div>;
  }

  async function exportActions() {
    if (!projectId) return;
    setDownloading(true);
    try {
      await downloadCsv('actions', projectId, {
        onSuccess: () => {
          toast({
            title: "Export successful",
            description: "Actions exported to CSV file",
          });
        },
        onError: (error) => {
          toast({
            title: "Export failed", 
            description: error.message,
            variant: "destructive",
          });
        }
      });
    } catch (error) {
      // Error already handled by downloadCsv
    } finally {
      setDownloading(false);
    }
  }

  // Filter items by owner
  const filteredItems = ownerFilter === "all" ? items : items.filter(item => 
    ownerFilter === "unassigned" ? !item.owner : item.owner === ownerFilter
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Actions List</h1>
        <div className="flex gap-2 items-center">
          <Button 
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
            data-testid="toggle-filters"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {filtersOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>
          <Button 
            onClick={exportActions}
            variant="outline"
            size="sm"
            disabled={downloading}
            data-testid="list-export-actions"
          >
            <Download className="w-4 h-4 mr-2" />
            {downloading ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {filtersOpen && (
        <div className="border rounded p-4 mb-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-48" data-testid="filter-owner">
                  <SelectValue placeholder="Filter by owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48" data-testid="filter-status">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger className="w-48" data-testid="filter-origin">
                  <SelectValue placeholder="Filter by origin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All origins</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="conversation">Conversation</SelectItem>
                  <SelectItem value="doc">Document</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-40">Owner</TableHead>
              <TableHead className="w-32">Area</TableHead>
              <TableHead className="w-24">Origin</TableHead>
              <TableHead className="w-32">Due Date</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                  No actions found. Try adjusting your filters or create a new action.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((action, index) => (
                <TableRow key={action.id} data-testid={`action-row-${action.id}`}>
                  <TableCell className="font-medium text-gray-500">
                    #{index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {action.title || 'Untitled Action'}
                    </div>
                    {action.description && (
                      <div className="text-sm text-gray-500 mt-1 max-w-md truncate">
                        {action.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={action.status || 'todo'} 
                      onValueChange={(status) => setStatus(action.id, status)}
                    >
                      <SelectTrigger className="w-full" data-testid={`status-select-${action.id}`}>
                        <SelectValue>
                          <Badge 
                            className={STATUS_COLORS[action.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.todo}
                          >
                            {STATUS_LABELS[action.status as keyof typeof STATUS_LABELS] || 'To Do'}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">
                          <Badge className={STATUS_COLORS.todo}>To Do</Badge>
                        </SelectItem>
                        <SelectItem value="in_progress">
                          <Badge className={STATUS_COLORS.in_progress}>In Progress</Badge>
                        </SelectItem>
                        <SelectItem value="done">
                          <Badge className={STATUS_COLORS.done}>Done</Badge>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <OwnerPicker
                      value={action.owner}
                      onValueChange={(owner: string | null) => setOwner(action.id, owner)}
                      members={members}
                      data-testid={`owner-picker-${action.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {action.area || 'General'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <OriginBadge type={action.originType} id={action.originId} />
                  </TableCell>
                  <TableCell>
                    {action.due_date ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="w-3 h-3" />
                        <span className={new Date(action.due_date) < new Date() ? 'text-red-600' : 'text-gray-600'}>
                          {new Date(action.due_date).toLocaleDateString()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No due date</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {/* Add edit functionality */}}
                        data-testid={`edit-action-${action.id}`}
                      >
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filteredItems.length > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          Showing {filteredItems.length} action{filteredItems.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}