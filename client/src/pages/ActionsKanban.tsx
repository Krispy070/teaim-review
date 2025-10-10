import { useEffect, useState } from "react";
import { useOrg } from "../App";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, User, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { downloadCsv } from "@/lib/download";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/authFetch";
import OwnerPicker from "@/components/OwnerPicker";

const COLUMNS = [
  { key:"todo",        title:"Todo" },
  { key:"in_progress", title:"In Progress" },
  { key:"done",        title:"Done" },
];

export default function ActionsKanban(){
  const { projectId } = useOrg();
  const [location] = useLocation();
  const [items,setItems] = useState<any[]>([]);
  const [members,setMembers] = useState<any[]>([]);
  const [role,setRole] = useState<string>("member");
  const [downloading, setDownloading] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { toast } = useToast();

  // Parse URL params for deep links
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    const urlParams = new URLSearchParams(search);
    
    // Support both hash and query parameters for flexibility
    const openFilters = hashParams.get("openFilters") === "1" || urlParams.get("openFilters") === "1";
    const actionId = hashParams.get("id") || urlParams.get("id");
    const owner = urlParams.get("owner");
    const area = urlParams.get("area");
    const status = urlParams.get("status");
    
    if (openFilters) {
      setFiltersOpen(true);
    }
    
    // Apply deep link filters
    if (owner) {
      setOwnerFilter(owner);
    }
    if (area) {
      setAreaFilter(area);
    }
    if (status) {
      setStatusFilter(status);
    }
    
    // Scroll to specific action if ID provided
    if (actionId) {
      setTimeout(() => {
        const element = document.querySelector(`[data-testid="kanban-item-${actionId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("ring-2", "ring-blue-500");
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-blue-500");
          }, 3000);
        }
      }, 500);
    }
  }, [location]);

  async function load(){
    if (!projectId) return;
    try {
      // Build query parameters with filters
      const params = new URLSearchParams({ project_id: projectId });
      
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (ownerFilter && ownerFilter !== "all") {
        params.set("owner", ownerFilter);
      }
      if (areaFilter && areaFilter !== "all") {
        params.set("area", areaFilter);
      }
      
      const r = await authFetch(`/api/actions/list?${params.toString()}`);
      if (r.ok) setItems((await r.json()).actions||[]);
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
  },[projectId, ownerFilter, areaFilter, statusFilter]);

  async function setStatus(id:string, status:string){
    try {
      await authFetch(`/api/actions/set-status?action_id=${id}&project_id=${projectId}`, {
        method:"POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify({status})
      });
      setItems(prev=> prev.map(a=> a.id===id ? {...a, status} : a));
    } catch (error) {
      console.error('Failed to update action status:', error);
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

  function onDrop(e:any, status:string){
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setStatus(id, status);
  }
  function onDragStart(e:any, id:string){ e.dataTransfer.setData("text/plain", id); }
  function onDragOver(e:any){ e.preventDefault(); }

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
        <h1 className="text-xl font-semibold">Actions Kanban</h1>
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
            data-testid="kanban-export-actions"
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
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        {COLUMNS.map(col=>(
          <div
            key={col.key}
            onDragOver={onDragOver}
            onDrop={e=>onDrop(e, col.key)}
            className="brand-card min-h-[320px] p-2"
               data-testid={`kanban-column-${col.key}`}>
            <div className="text-sm font-medium mb-2 text-[var(--text-muted)]">{col.title}</div>
            <div className="space-y-2">
              {filteredItems.filter(a=>a.status===col.key).map(a=>(
                <div key={a.id} draggable onDragStart={e=>onDragStart(e, a.id)}
                     className="rounded-lg border border-[var(--brand-card-border)] bg-[var(--brand-card-bg)] p-3 cursor-move hover:shadow-md transition-shadow"
                     data-testid={`kanban-item-${a.id}`}>
                  <div className="text-sm font-medium text-[var(--text-strong)] mb-2">{a.title}</div>
                  <div className="flex items-center justify-between">
                    <OwnerPicker
                      value={a.owner}
                      onValueChange={(value) => setOwner(a.id, value)}
                      members={members}
                      placeholder="Assign"
                      className="min-w-[140px]"
                      data-testid={`assign-${a.id}`}
                    />
                  </div>
                </div>
              ))}
              {filteredItems.filter(a=>a.status===col.key).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4" data-testid={`empty-column-${col.key}`}>
                  {ownerFilter === "all" ? `No ${col.title.toLowerCase()} items` : `No ${col.title.toLowerCase()} items for selected owner`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}