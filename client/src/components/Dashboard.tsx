import ProgramTimeline from "./ProgramTimeline";
import WellnessMatrix from "./WellnessMatrix";
import WellnessChip from "./WellnessChip";
import DigestChip from "./DigestChip";
import OverdueChip from "./OverdueChip";
import DueSoonChip from "./DueSoonChip";
import RestoreLog from "./RestoreLog";
import AnalyticsCards from "./AnalyticsCards";
import { OverdueActions } from "./OverdueActions";
import CompactDigest from "./CompactDigest";
import PageHeaderHint from "./PageHeaderHint";
import CountUp from "./CountUp";
import DeltaBadge from "./DeltaBadge";
import DigestChangesGrid from "./DigestChangesGrid";
import { Download, Share, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { downloadCsv } from '@/lib/download';
import { useToast } from '@/hooks/use-toast';
import { postJSON } from '@/lib/authFetch';

interface DashboardProps {
  projectId: string;
}

export function LiveDashboardWidgets({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any>(null);
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [err, setErr] = useState<string>("");
  const [downloading, setDownloading] = useState<{ [key: string]: boolean }>({});
  const [checkingIntegrations, setCheckingIntegrations] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      apiGet("/dashboard/overview", { project_id: projectId }),
      apiGet("/integrations/status", { project_id: projectId })
    ])
      .then(([ov, ig]) => {
        setKpis(ov.kpis); setRedFlags(ov.redFlags); setPending(ov.pending);
        setIntegrations(ig.items || []);
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleExport = async (type: 'actions' | 'risks' | 'decisions') => {
    if (!projectId) return;
    
    setDownloading(prev => ({ ...prev, [type]: true }));
    try {
      await downloadCsv(type, projectId, {
        onSuccess: () => {
          toast({
            title: "Export successful",
            description: `${type.charAt(0).toUpperCase() + type.slice(1)} exported to CSV file`,
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
      setDownloading(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleCheckIntegrations = async () => {
    if (!projectId || checkingIntegrations) return;
    
    setCheckingIntegrations(true);
    try {
      const result = await postJSON(`/api/integrations/check-now?project_id=${projectId}`, {});
      if (result.ok) {
        // Refresh integrations list
        const ig = await apiGet("/integrations/status", { project_id: projectId });
        setIntegrations(ig.items || []);
        toast({
          title: "Integrations checked",
          description: `${result.checked_count} integrations checked successfully`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Check failed",
        description: error.message || "Failed to check integrations",
        variant: "destructive",
      });
    } finally {
      setCheckingIntegrations(false);
    }
  };

  const getIntegrationStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
      case "completed":
      case "deployed": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
      case "in_progress":
      case "testing": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100";
      case "error":
      case "failed": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100";
      case "not_started":
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100";
    }
  };

  if (!projectId) return <div className="text-sm text-amber-600">Set project_id to load live data.</div>;
  if (loading) return <div className="text-sm text-slate-500">Loading live dashboard…</div>;
  if (err) return <div className="text-sm text-amber-500">Dashboard data isn't ready yet. Upload a doc or try again shortly.</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Project Overview</h3>
          <div className="flex gap-1">
            <Button 
              onClick={() => handleExport('actions')}
              variant="outline"
              size="sm"
              disabled={downloading.actions}
              data-testid="dashboard-export-actions"
            >
              <Download className="w-4 h-4 mr-1" />
              {downloading.actions ? "..." : "Actions"}
            </Button>
            <Button 
              onClick={() => handleExport('risks')}
              variant="outline"
              size="sm"
              disabled={downloading.risks}
              data-testid="dashboard-export-risks"
            >
              <Download className="w-4 h-4 mr-1" />
              {downloading.risks ? "..." : "Risks"}
            </Button>
            <Button 
              onClick={() => handleExport('decisions')}
              variant="outline"
              size="sm"
              disabled={downloading.decisions}
              data-testid="dashboard-export-decisions"
            >
              <Download className="w-4 h-4 mr-1" />
              {downloading.decisions ? "..." : "Decisions"}
            </Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <KpiCard label="Artifacts" value={kpis?.totalArtifacts || 0}/>
          <KpiCard label="Actions" value={kpis?.totalActions || 0}/>
          <KpiCard label="Overdue" value={kpis?.overdueActions || 0}/>
          <KpiCard label="Decisions (7d)" value={kpis?.decisionsLast7d || 0}/>
        </div>
      </div>

      <AnalyticsCards projectId={projectId} />

      <OverdueActions projectId={projectId} />

      <CompactDigest projectId={projectId} />

      {!!redFlags.length && (
        <div className="rounded-2xl border p-4">
          <div className="font-semibold mb-2">Red Flags</div>
          <ul className="list-disc pl-5 text-sm">{redFlags.map((r,i)=><li key={i}>{r}</li>)}</ul>
        </div>
      )}

      {!!pending.length && (
        <div className="rounded-2xl border p-4">
          <div className="font-semibold mb-2">Pending Items</div>
          <ul className="list-disc pl-5 text-sm">
            {pending.map((p,i)=><li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <FunctionalAreas projectId={projectId} />

      <div className="rounded-2xl border p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="font-semibold">Integrations</div>
          <Button 
            onClick={handleCheckIntegrations}
            variant="outline"
            size="sm"
            disabled={checkingIntegrations}
            data-testid="check-integrations-button"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${checkingIntegrations ? 'animate-spin' : ''}`} />
            {checkingIntegrations ? "Checking..." : "Check Now"}
          </Button>
        </div>
        {!integrations.length ? (
          <div className="text-sm text-slate-500">No integrations configured yet.</div>
        ) : (
          <div className="space-y-2">
            {integrations.map((integration, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`integration-item-${i}`}>
                <div className="flex items-center gap-3">
                  <div className="font-medium text-sm">{integration.name}</div>
                  <Badge className={getIntegrationStatusColor(integration.status || 'not_started')} data-testid={`integration-status-${i}`}>
                    {integration.status || 'not_started'}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500">
                  {integration.last_checked ? 
                    `Checked: ${new Date(integration.last_checked).toLocaleString()}` :
                    'Never checked'
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RestoreLog projectId={projectId} />
    </div>
  );
}

export function FunctionalAreas({ projectId }:{
  projectId:string
}) {
  const [areas, setAreas] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string>("")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<any[]>([])

  // PM role check - TODO: Get from auth context
  const isPM = true // For now, assume PM permissions

  async function loadAreas(){
    if(!projectId) return
    setLoading(true)
    try {
      const js = await apiGet("/workstreams", { project_id: projectId })
      setAreas(js.items || [])
    } catch(e) {
      // Fallback to dashboard endpoint if direct workstreams fails
      const js = await apiGet("/dashboard/workstreams", { project_id: projectId })
      setAreas(js.workstreams || [])
    }
    setLoading(false)
  }

  useEffect(()=>{ 
    if(projectId) loadAreas()
  }, [projectId])

  async function saveAreas(){
    try {
      await apiPost("/workstreams/set", { items: draft }, { project_id: projectId })
      setEditing(false)
      loadAreas()
    } catch(e) {
      setErr("Failed to save areas")
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Functional Areas</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">{areas.length}/30</div>
          {isPM && !editing && (
            <button 
              className="text-xs px-2 py-1 border rounded" 
              onClick={()=>{ setDraft([...areas]); setEditing(true) }}
              data-testid="edit-areas-button"
            >
              Edit Areas
            </button>
          )}
        </div>
      </div>
      {loading && <div className="text-sm text-slate-500 mt-2">Loading…</div>}
      {err && <div className="text-sm text-rose-600 mt-2">{err}</div>}
      
      {editing && (
        <div className="mt-3 p-3 border rounded-xl" data-testid="editing-panel">
          <div className="text-sm mb-2">Up to 30 areas. Drag to reorder; edit names/descriptions.</div>
          {draft.map((it,idx)=>(
            <div key={idx} className="flex gap-2 items-center mb-1">
              <input 
                className="border px-2 py-1 text-sm w-52" 
                value={it.name || ""}
                onChange={e=>{ const d=[...draft]; d[idx].name=e.target.value; setDraft(d) }}
                data-testid={`area-name-${idx}`}
              />
              <input 
                className="border px-2 py-1 text-sm flex-1" 
                placeholder="description"
                value={it.description||""}
                onChange={e=>{ const d=[...draft]; d[idx].description=e.target.value; setDraft(d) }}
                data-testid={`area-description-${idx}`}
              />
              <button 
                className="text-xs px-2 py-1 border rounded"
                onClick={()=>{ const d=[...draft]; d.splice(idx,1); setDraft(d) }}
                data-testid={`remove-area-${idx}`}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <button 
              className="text-xs px-2 py-1 border rounded" 
              onClick={()=> setDraft([...draft, {name:"New Area", description:"", sort_order: draft.length}])}
              data-testid="add-area-button"
            >
              + Add Area
            </button>
            <div className="text-xs text-slate-500">{draft.length}/30</div>
            <div className="flex-1" />
            <button 
              className="text-xs px-3 py-1 border rounded" 
              onClick={()=>setEditing(false)}
              data-testid="cancel-edit-button"
            >
              Cancel
            </button>
            <button 
              className="text-xs px-3 py-1 border rounded bg-sky-600 text-white" 
              onClick={saveAreas}
              data-testid="save-areas-button"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
        {areas.map((ws) => (
          <div key={ws.name} className="p-3 border rounded-xl" data-testid={`functional-area-${ws.name}`}>
            <div className="flex items-center justify-between">
              <div className="font-semibold" title={ws.description || ''}>{ws.name}</div>
              <span className={`text-xs ${ws.health==='red'?'text-rose-600':ws.health==='amber'?'text-amber-600':'text-emerald-600'}`}>
                {ws.health || '—'}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">Updated: {ws.updated || '—'}</div>
            <div className="text-xs mt-1">Overdue: {ws.overdue || 0}</div>
            {ws.description && (
              <div className="text-xs text-slate-600 mt-1" title={ws.description}>
                {ws.description.substring(0, 50)}{ws.description.length > 50 ? '...' : ''}
              </div>
            )}
          </div>
        ))}
        {!areas.length && !loading && (
          <div className="text-sm text-slate-500 col-span-full">
            No functional areas configured yet. Add them from the SOW or via API.
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({label, value}:{label:string, value:number}) {
  return (
    <div className="p-3 border rounded-xl">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold">
        <CountUp to={value} />
        <DeltaBadge value={value} />
      </div>
    </div>
  );
}

export default function Dashboard({ orgId, projectId }: DashboardProps & { orgId: string }) {
  const userRole = "pm"; // TODO: Get from auth context
  const showWellness = userRole === "pm" || userRole === "owner" || userRole === "admin";
  
  const [changes,setChanges]=useState<any[]>([]);
  useEffect(()=>{ (async()=>{
    try{
      const r = await fetch(`/api/digest/changes?project_id=${projectId}&org_id=${orgId}&days=7`, {credentials:"include"});
      const d = await r.json(); setChanges(d.items||[]);
    }catch{ setChanges([]); }
  })(); },[projectId, orgId]);

  return (
    <main className="flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto pb-20">
        {/* Dashboard Header */}
        <div className="p-6 border-b border-border">
          <PageHeaderHint
            id="dashboard"
            title="Project Dashboard"
            intro="This page summarizes project health and activity."
            bullets={[
              "KPIs: Documents, Actions, Risks, Decisions, Stages in review",
              "Chips: Wellness, Digest schedule, Overdue / Due soon",
              "Widgets: Restore activity, Overdue actions, Analytics burn-up",
            ]}
          />
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <WellnessChip projectId={projectId} />
              <DigestChip orgId={orgId} projectId={projectId} />
              <OverdueChip />
              <DueSoonChip days={3} />
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" data-testid="export-report-button">
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
              <Button variant="outline" data-testid="share-button">
                <Share className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-6">
          <LiveDashboardWidgets projectId={projectId} />
          <ProgramTimeline />
          
          {/* Recent Changes Grid */}
          <div className="mb-6">
            <DigestChangesGrid projectId={projectId} changes={changes} />
          </div>
          
          {/* Team Wellness */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <RestoreLog projectId={projectId} />
            </div>
            {showWellness && <WellnessMatrix />}
          </div>
        </div>
      </div>
    </main>
  );
}
