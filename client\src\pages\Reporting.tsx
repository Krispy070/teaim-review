import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useOrg } from "../App";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkbookTimeline from "@/components/WorkbookTimeline";
import WorkbookRunsExpander from "@/components/WorkbookRunsExpander";
import SignoffRequestModal from "@/components/SignoffRequestModal";
import { SchedulerHealthCard } from "@/components/SchedulerHealthCard";
import { getJSON } from "@/lib/authFetch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function downloadGET(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

interface Workbook {
  id: string;
  name: string;
  area: string;
  status: string;
  due_date?: string;
  start_date?: string;
  iterations_planned?: number;
  iterations_done?: number;
  asof_date?: string;
  notes?: string;
  late_reason?: string;
}

interface Report {
  id: string;
  name: string;
  owner?: string;
  status: string;
  legacy_system?: string;
  frequency?: string;
  due_date?: string;
  wd_type?: string;
  wd_report_name?: string;
  design_doc_url?: string;
  sample_url?: string;
  notes?: string;
}

interface WorkbookMetrics {
  summary: {
    total: number;
    in_progress: number;
    done: number;
    blocked: number;
    overdue: number;
    at_risk: number;
  };
  upcoming: Workbook[];
}

export default function Reporting() {
  const params = useParams<{projectId: string}>();
  const { projectId } = useOrg();
  const { toast } = useToast();
  
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [workbookMetrics, setWorkbookMetrics] = useState<WorkbookMetrics | null>(null);
  const [runAgg, setRunAgg] = useState<{counts?: any}>({});
  const [ownerFilter, setOwnerFilter] = useState("");
  const [reqOpen, setReqOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string>("");
  const [wbFormOpen, setWbFormOpen] = useState(false);
  const [wbForm, setWbForm] = useState<Partial<Workbook>>({});

  const dataDocLink = `/api/workbooks/export.csv?project_id=${projectId}`;

  const saveWorkbook = async (data: Partial<Workbook>) => {
    try {
      const response = await fetch(`/api/workbooks/upsert?project_id=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.ok) {
        toast({ title: "Success", description: "Workbook saved successfully" });
        loadWorkbooks(); // Refresh the list
        setWbFormOpen(false);
        setWbForm({});
      } else {
        toast({ title: "Error", description: result.error || "Failed to save workbook", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save workbook", variant: "destructive" });
    }
  };

  // Load workbooks
  const loadWorkbooks = async () => {
    try {
      const wbData = await getJSON(`/api/workbooks/list?project_id=${projectId}`);
      setWorkbooks(wbData?.items || []);
      
      const metricsData = await getJSON(`/api/workbooks/metrics?project_id=${projectId}`);
      setWorkbookMetrics(metricsData || null);

      // Load run aggregate KPIs
      const runData = await getJSON(`/api/workbooks/runs/aggregate_summary?project_id=${projectId}`);
      setRunAgg(runData || {});
    } catch {
      setWorkbooks([]);
      setWorkbookMetrics(null);
      setRunAgg({});
    }
  };

  // Load reports
  const loadReports = async () => {
    try {
      const reportData = await getJSON(`/api/reports/list?project_id=${projectId}`);
      setReports(reportData?.items || []);
    } catch {
      setReports([]);
    }
  };

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([loadWorkbooks(), loadReports()]).finally(() => setLoading(false));
  }, [projectId]);

  // Helper functions for workbook chips
  function _chip(w: Workbook) {
    const badge = (cls: string, txt: string) => <span className={`ml-1 text-[11px] px-2 py-[1px] rounded ${cls}`}>{txt}</span>;
    const today = new Date().toISOString().slice(0,10);
    if (w.due_date && w.due_date < today) return badge("bg-red-500/15 text-red-500", "Overdue");
    // at-risk: in_progress & due within 3d or iteration shortfall
    const d = (w.due_date || ""); const dd = d ? new Date(d+"T00:00:00"): null;
    if ((w.status==="in_progress") && dd){
      const days = Math.ceil((+dd - +new Date())/86400000);
      if (days >=0 && days <=3) return badge("bg-amber-500/15 text-amber-600", "At-Risk");
    }
    return null;
  }

  // Helper function for report pipeline chips
  function _pClass(s?: string) {
    const t = (s || "planned").toLowerCase();
    if (t === "delivered") return "bg-[var(--brand-good)]/20 text-[var(--brand-good)]";
    if (t === "validated") return "bg-emerald-500/15 text-emerald-600";
    if (t === "built") return "bg-sky-500/15 text-sky-600";
    if (t === "mapped") return "bg-indigo-500/15 text-indigo-600";
    if (t === "blocked") return "bg-red-500/15 text-red-500";
    return "bg-amber-500/15 text-amber-600"; // planned
  }

  // Filter reports by owner
  const filteredReports = reports.filter(r => 
    !ownerFilter || (r.owner || "").toLowerCase().includes(ownerFilter.toLowerCase())
  );

  // Get unique owners for filter chips
  const owners = Array.from(new Set(reports.map(r => (r.owner || "").trim()).filter(Boolean))).sort();

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6" data-testid="reporting-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data & Reporting</h1>
          <p className="text-muted-foreground">Manage workbooks, reports, and data migration tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scheduler Health Card */}
        <div className="lg:col-span-1">
          <SchedulerHealthCard />
        </div>
        {/* Workbooks Card */}
        <div className="lg:col-span-1">
          <Card data-testid="workbooks-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Workbooks
              </CardTitle>
              <CardDescription>
                Data migration workbooks with status tracking
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                id="workbook-csv-upload"
                onChange={async (e) => {
                  const f = e.target.files?.[0]; 
                  if (!f) return;
                  const fd = new FormData(); 
                  fd.append("file", f);
                  try {
                    await fetch(`/api/workbooks/import_csv?project_id=${projectId}`, { 
                      method: "POST", 
                      body: fd, 
                      credentials: "include" 
                    });
                    await loadWorkbooks();
                    toast({ title: "Import successful", description: "Workbooks imported from CSV" });
                  } catch {
                    toast({ title: "Import failed", description: "Failed to import CSV", variant: "destructive" });
                  }
                }} 
                data-testid="workbook-csv-input"
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => document.getElementById('workbook-csv-upload')?.click()}
                data-testid="button-workbook-import"
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => {setWbForm({}); setWbFormOpen(true);}} data-testid="button-add-workbook">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {workbookMetrics && (
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                <div className="grid grid-cols-5 gap-2 text-sm">
                  <div className="text-center">
                    <div className="font-semibold text-lg">{workbookMetrics.summary.total}</div>
                    <div className="text-muted-foreground text-xs">WB Total</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg">{workbookMetrics.summary.in_progress}</div>
                    <div className="text-muted-foreground text-xs">In progress</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg">{workbookMetrics.summary.done}</div>
                    <div className="text-muted-foreground text-xs">Done</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-red-600">{workbookMetrics.summary.overdue}</div>
                    <div className="text-muted-foreground text-xs">Overdue</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-emerald-600">{runAgg?.counts?.loaded ?? "—"}</div>
                    <div className="text-muted-foreground text-xs">Runs (loaded)</div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {workbooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No workbooks yet. Import from CSV or add manually.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Timeline</th>
                        <th className="text-left p-2">Runs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workbooks.map((w) => (
                        <>
                          <tr key={w.id} className="border-b hover:bg-muted/50" data-testid={`workbook-row-${w.id}`}>
                            <td className="p-2">
                              <div className="font-medium">{w.name}</div>
                              {w.area && <div className="text-xs text-muted-foreground">{w.area}</div>}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center">
                                <span>{w.status || "—"}</span>
                                {_chip(w)}
                                {w.late_reason && <span className="ml-1 text-[11px] text-muted-foreground">• {w.late_reason}</span>}
                              </div>
                            </td>
                            <td className="p-2">
                              <WorkbookTimeline start={w.start_date} end={w.due_date} runs={[]} />
                            </td>
                            <td className="p-2">
                              <button className="text-xs underline" onClick={() => setOpenId(openId === w.id ? "" : (w.id || ""))}
                                      data-testid={`button-toggle-runs-${w.id}`}>
                                {openId === w.id ? "Hide runs" : "Show runs"}
                              </button>
                            </td>
                          </tr>
                          {openId === w.id && (
                            <tr key={`${w.id}-expander`}>
                              <td colSpan={4}>
                                <WorkbookRunsExpander projectId={projectId} workbookId={w.id!} />
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Button 
                className="brand-btn text-xs"
                onClick={() => setReqOpen(true)}
                data-testid="button-request-signoff"
              >
                Request Data Migration Sign-Off
              </Button>
              <Button 
                className="brand-btn text-xs"
                onClick={() => downloadGET(`/api/workbooks/export_last_runs.zip?project_id=${projectId}`, "migration_package.zip")}
                data-testid="button-export-migration-package"
              >
                Export migration package
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>

        {/* Reports Card */}
        <div className="lg:col-span-1">
        <Card data-testid="reports-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Reports
              </CardTitle>
              <CardDescription>
                Report registry with delivery tracking
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                id="reports-csv-upload"
                onChange={async (e) => {
                  const f = e.target.files?.[0]; 
                  if (!f) return;
                  const fd = new FormData(); 
                  fd.append("file", f);
                  try {
                    await fetch(`/api/reports/import_csv?project_id=${projectId}`, { 
                      method: "POST", 
                      body: fd, 
                      credentials: "include" 
                    });
                    await loadReports();
                    toast({ title: "Import successful", description: "Reports imported from CSV" });
                  } catch {
                    toast({ title: "Import failed", description: "Failed to import CSV", variant: "destructive" });
                  }
                }} 
                data-testid="reports-csv-input"
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => document.getElementById('reports-csv-upload')?.click()}
                data-testid="button-reports-import"
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button size="sm" data-testid="button-add-report">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input 
                className="text-sm" 
                placeholder="Filter by owner..." 
                value={ownerFilter} 
                onChange={(e) => setOwnerFilter(e.target.value)}
                data-testid="input-owner-filter"
              />
              {owners.length > 0 && (
                <div className="flex items-center gap-2 text-xs mt-2">
                  {owners.slice(0, 8).map(o => (
                    <button 
                      key={o} 
                      className="brand-btn text-[11px]" 
                      onClick={() => setOwnerFilter(o)}
                      data-testid={`chip-owner-${o.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {o}
                    </button>
                  ))}
                  <button 
                    className="brand-btn text-[11px]" 
                    onClick={() => setOwnerFilter("")}
                    data-testid="button-clear-owner-filter"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {filteredReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No reports found. Import from CSV or add manually.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Owner</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Frequency</th>
                        <th className="text-left p-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/50" data-testid={`report-row-${r.id}`}>
                          <td className="p-2">
                            <div className="font-medium">{r.name}</div>
                            {r.legacy_system && <div className="text-xs text-muted-foreground">{r.legacy_system}</div>}
                          </td>
                          <td className="p-2">
                            <span className="text-[11px] px-2 py-[1px] rounded bg-slate-500/15 text-slate-600" data-testid={`chip-owner-${r.id}`}>
                              {r.owner || "—"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className={`text-[11px] px-2 py-[1px] rounded ${_pClass(r.status)}`} data-testid={`chip-status-${r.id}`}>
                              {r.status || "planned"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className="text-[11px] px-2 py-[1px] rounded bg-indigo-500/15 text-indigo-600" data-testid={`chip-frequency-${r.id}`}>
                              {r.frequency || "ad-hoc"}
                            </span>
                          </td>
                          <td className="p-2 text-muted-foreground">{r.wd_type || "Standard"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Sign-off Request Modal */}
      {reqOpen && (
        <SignoffRequestModal
          projectId={projectId}
          stageId={"data-migration"}
          stageTitle={"Data Migration Sign-Off"}
          stageArea={"Integrations"}
          onClose={() => setReqOpen(false)}
        />
      )}

      {/* Workbook Form Modal */}
      <Dialog open={wbFormOpen} onOpenChange={setWbFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{wbForm.id ? "Edit Workbook" : "Add Workbook"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="wb-name">Name *</Label>
              <Input
                id="wb-name"
                data-testid="input-workbook-name"
                value={wbForm.name || ""}
                onChange={(e) => setWbForm({...wbForm, name: e.target.value})}
                placeholder="Workbook name"
              />
            </div>

            <div>
              <Label htmlFor="wb-area">Area</Label>
              <Input
                id="wb-area"
                data-testid="input-workbook-area"
                value={wbForm.area || ""}
                onChange={(e) => setWbForm({...wbForm, area: e.target.value})}
                placeholder="Business area"
              />
            </div>

            <div>
              <Label htmlFor="wb-status">Status</Label>
              <Select value={wbForm.status || "planned"} onValueChange={(v) => setWbForm({...wbForm, status: v})}>
                <SelectTrigger data-testid="select-workbook-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="wb-start">Start Date</Label>
                <Input
                  id="wb-start"
                  type="date"
                  data-testid="input-workbook-start-date"
                  value={wbForm.start_date || ""}
                  onChange={(e) => setWbForm({...wbForm, start_date: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="wb-due">Due Date</Label>
                <Input
                  id="wb-due"
                  type="date"
                  data-testid="input-workbook-due-date"
                  value={wbForm.due_date || ""}
                  onChange={(e) => setWbForm({...wbForm, due_date: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="wb-planned">Iterations Planned</Label>
                <Input
                  id="wb-planned"
                  type="number"
                  data-testid="input-workbook-iterations-planned"
                  value={wbForm.iterations_planned || ""}
                  onChange={(e) => setWbForm({...wbForm, iterations_planned: parseInt(e.target.value) || 0})}
                  placeholder="0"
                />
              </div>
              
              <div>
                <Label htmlFor="wb-done">Iterations Done</Label>
                <Input
                  id="wb-done"
                  type="number"
                  data-testid="input-workbook-iterations-done"
                  value={wbForm.iterations_done || ""}
                  onChange={(e) => setWbForm({...wbForm, iterations_done: parseInt(e.target.value) || 0})}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="wb-late-reason">Late/At-Risk Reason</Label>
              <Input
                id="wb-late-reason"
                data-testid="input-workbook-late-reason"
                value={wbForm.late_reason || ""}
                onChange={(e) => setWbForm({...wbForm, late_reason: e.target.value})}
                placeholder="Late/At-Risk reason (optional)"
              />
            </div>

            <div>
              <Label htmlFor="wb-notes">Notes</Label>
              <Textarea
                id="wb-notes"
                data-testid="textarea-workbook-notes"
                value={wbForm.notes || ""}
                onChange={(e) => setWbForm({...wbForm, notes: e.target.value})}
                placeholder="Additional notes (optional)"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setWbFormOpen(false)} data-testid="button-cancel-workbook">
              Cancel
            </Button>
            <Button 
              onClick={() => saveWorkbook(wbForm)}
              disabled={!wbForm.name?.trim()}
              data-testid="button-save-workbook"
            >
              {wbForm.id ? "Update" : "Add"} Workbook
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}