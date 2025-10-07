import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { downloadGET } from "@/lib/download";
import { useToast } from "@/hooks/use-toast";
import PageHeaderHint from "@/components/PageHeaderHint";
import { Button } from "@/components/ui/button";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";

function useProjectId() {
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const m = location.match(/\/projects\/([^/]+)/);
  if (m) return m[1];
  return sessionStorage.getItem("kap.projectId") || "";
}

export default function AuditTimeline(){
  const projectId = useProjectId();
  const [location] = useLocation();
  const { toast } = useToast();
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [kind,setKind]=useState("");
  const [actor,setActor]=useState("");
  const [after,setAfter]=useState("");
  const [before,setBefore]=useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // Parse hash for deep links
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const openFilters = params.get("openFilters") === "1";
    const tab = params.get("tab");
    const eventId = params.get("id");
    
    if (openFilters) {
      setFiltersOpen(true);
    }
    
    if (tab) {
      setActiveTab(tab);
      // Set kind filter based on tab
      if (tab === "risks") setKind("risk");
      else if (tab === "decisions") setKind("decision");
      else if (tab === "actions") setKind("action");
    }
    
    // Scroll to specific event if ID provided
    if (eventId) {
      // Wait for items to load before scrolling
      const scrollToEvent = () => {
        const element = document.querySelector(`[data-testid="event-${eventId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("ring-2", "ring-blue-500");
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-blue-500");
          }, 3000);
        }
      };
      // Try immediately and also after a delay to handle loading
      scrollToEvent();
      setTimeout(scrollToEvent, 500);
    }
  }, [location]);

  async function load(){
    if (!projectId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ project_id: projectId });
      if (kind) qs.set("kind", kind);
      if (actor) qs.set("actor_id", actor);
      if (after) qs.set("after", after);
      if (before) qs.set("before", before);
      const d = await getJSON<{events:any[]}>(`/api/audit/list?${qs.toString()}`);
      setItems(d.events||[]);
    }
    catch {
      setItems([]);
    }
    finally {
      setLoading(false);
    }
  }
  
  useEffect(()=>{ load(); },[projectId]);
  
  // Auto-apply filters when they change
  useEffect(()=>{ 
    if (projectId) load(); 
  },[projectId, kind, actor, after, before]);

  async function exportCSV(){
    try {
      const qs = new URLSearchParams({ 
        project_id: projectId, 
        kind, 
        actor_id: actor, 
        after, 
        before 
      });
      await downloadGET(`/api/audit/export.csv?${qs.toString()}`, "audit_timeline.csv");
      toast({ title: "CSV exported", description: "Audit timeline exported successfully" });
    }
    catch(e:any){
      toast({ title: "Export failed", description: String(e?.message||e), variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-3">
      <PageHeaderHint
        id="audit-timeline"
        title="Audit Timeline"
        intro="Recent activity and system events."
        bullets={[
          "Filter by kind/actor/time",
          "CSV export",
        ]}
      />
      <div className="flex items-center justify-between">
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
        <button 
          className="px-3 py-2 border rounded" 
          onClick={exportCSV}
          data-testid="button-export-audit-csv"
        >
          Export CSV
        </button>
      </div>
      
      {filtersOpen && (
        <div className="border rounded p-4 bg-gray-50 dark:bg-gray-900">
          <div className="space-y-3">
            <div className="flex gap-2 text-xs">
              <button 
                className={`px-2 py-1 rounded ${activeTab === "all" ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700"}`}
                onClick={() => { setActiveTab("all"); setKind(""); load(); }}
                data-testid="tab-all"
              >
                All Events
              </button>
              <button 
                className={`px-2 py-1 rounded ${activeTab === "risks" ? "bg-red-500 text-white" : "bg-gray-200 dark:bg-gray-700"}`}
                onClick={() => { setActiveTab("risks"); setKind("risk"); load(); }}
                data-testid="tab-risks"
              >
                Risks
              </button>
              <button 
                className={`px-2 py-1 rounded ${activeTab === "decisions" ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700"}`}
                onClick={() => { setActiveTab("decisions"); setKind("decision"); load(); }}
                data-testid="tab-decisions"
              >
                Decisions
              </button>
              <button 
                className={`px-2 py-1 rounded ${activeTab === "actions" ? "bg-orange-500 text-white" : "bg-gray-200 dark:bg-gray-700"}`}
                onClick={() => { setActiveTab("actions"); setKind("action"); load(); }}
                data-testid="tab-actions"
              >
                Actions
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <input 
                className="border rounded p-2" 
                placeholder="kind (e.g., stage.approved)" 
                value={kind} 
                onChange={e=>setKind(e.target.value)}
                data-testid="input-filter-kind"
              />
              <input 
                className="border rounded p-2" 
                placeholder="actor_id" 
                value={actor} 
                onChange={e=>setActor(e.target.value)}
                data-testid="input-filter-actor"
              />
              <input 
                type="datetime-local" 
                className="border rounded p-2" 
                value={after} 
                onChange={e=>setAfter(e.target.value)}
                data-testid="input-filter-after"
              />
              <input 
                type="datetime-local" 
                className="border rounded p-2" 
                value={before} 
                onChange={e=>setBefore(e.target.value)}
                data-testid="input-filter-before"
              />
              <button 
                className="px-3 py-2 border rounded" 
                onClick={load}
                data-testid="button-apply-filters"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="border rounded">
        {loading && <div className="p-3 text-sm">Loading…</div>}
        {items.map((e,i)=>(
          <div key={e.id || i} className="p-2 border-b last:border-0 text-sm" data-testid={`event-${e.id || i}`}>
            <div className="text-xs text-muted-foreground">
              {new Date(e.created_at).toLocaleString()}
            </div>
            <div>
              <b>{e.kind}</b> — {e.actor_id || "system"}
            </div>
            <div className="text-xs text-muted-foreground break-all">
              {JSON.stringify(e.details)}
            </div>
          </div>
        ))}
        {!items.length && !loading && (
          <div className="p-3 text-sm text-muted-foreground">No events.</div>
        )}
      </div>
    </div>
  );
}