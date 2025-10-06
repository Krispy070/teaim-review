import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, FileText, ExternalLink, Search, Download, ChevronDown, ChevronUp } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { downloadCsv, downloadGET } from "@/lib/download";
import { useToast } from "@/hooks/use-toast";
import { usePersistProjectId } from "@/lib/projectCtx";
import { postJSON } from "@/lib/authFetch";

interface Meeting {
  artifact_id: string;
  title: string;
  source: string;
  meeting_date: string;
  created_at: string;
  summary: string;
  risks_count: number;
  decisions_count: number;
  actions_count: number;
  url: string;
}

interface ExtractedItem {
  title?: string;
  text?: string;
  owner?: string;
  area?: string;
  severity?: string;
  decided_by?: string;
}

interface MeetingsProps {
  orgId?: string;
  projectId?: string;
}

function ExtractedItem({ artifactId, kind, idx, item, projectId }:{
  artifactId:string; kind:"action"|"risk"|"decision"; idx:number; item:any; projectId:string;
}){
  const [conf,setConf]=useState([82]);
  const [area,setArea]=useState(item.area || "");
  const [busy,setBusy]=useState(false);
  const { toast } = useToast();

  async function proposeOne(){
    setBusy(true);
    try{
      await postJSON(`/api/summaries/propose?project_id=${projectId}`, {
        items: [{ artifact_id: artifactId, kind, index: idx, confidence: conf[0] / 100, area: area || undefined }]
      });
      toast({ title: "Success", description: "Proposed to Updates Monitor" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to propose item", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center justify-between border rounded p-2 text-sm">
      <div className="truncate">{item.title || item.text}</div>
      <div className="flex items-center gap-2">
        <Input 
          className="w-[90px] h-7 text-xs" 
          placeholder="Area" 
          value={area} 
          onChange={e=>setArea(e.target.value)}
          data-testid={`input-area-${artifactId}-${kind}-${idx}`}
        />
        <label className="text-xs">conf</label>
        <div className="flex items-center gap-1">
          <Slider
            value={conf}
            onValueChange={setConf}
            max={100}
            min={1}
            step={1}
            className="w-16"
            data-testid={`slider-confidence-${artifactId}-${kind}-${idx}`}
          />
          <span className="text-xs w-8">{conf[0]}%</span>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          className="h-7 px-2 text-xs" 
          onClick={proposeOne} 
          disabled={busy}
          data-testid={`button-propose-${artifactId}-${kind}-${idx}`}
        >
          {busy?"…":"Propose"}
        </Button>
      </div>
    </div>
  );
}

export default function Meetings({ orgId = "demo-org", projectId = "demo-project" }: MeetingsProps) {
  usePersistProjectId(projectId);
  const [items, setItems] = useState<Meeting[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [downloading, setDownloading] = useState<{ [key: string]: boolean }>({});
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const [meetingDetails, setMeetingDetails] = useState<{[key: string]: {risks: ExtractedItem[], decisions: ExtractedItem[], actions: ExtractedItem[]}}>({});
  const [sel, setSel] = useState<{artifact_id:string; kind:"action"|"risk"|"decision"; index:number; area?:string}[]>([]);
  const [confidence, setConfidence] = useState<number[]>([82]); // Default to 82%
  const { toast } = useToast();

  async function load() {
    if (!orgId || !projectId) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/meetings?org_id=${orgId}&project_id=${projectId}&q=${encodeURIComponent(q)}`);
      const js = await r.json();
      setItems(js.items || []);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [orgId, projectId]);

  const handleSearch = () => {
    load();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

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

  const toggleMeetingExpanded = async (artifactId: string) => {
    const newExpanded = new Set(expandedMeetings);
    if (expandedMeetings.has(artifactId)) {
      newExpanded.delete(artifactId);
    } else {
      newExpanded.add(artifactId);
      // Fetch detailed meeting data if not already loaded
      if (!meetingDetails[artifactId]) {
        try {
          const r = await fetch(`/api/meetings/${artifactId}?org_id=${orgId}&project_id=${projectId}`);
          const data = await r.json();
          setMeetingDetails(prev => ({
            ...prev,
            [artifactId]: {
              risks: data.risks || [],
              decisions: data.decisions || [],
              actions: data.actions || []
            }
          }));
        } catch (e) {
          console.error('Failed to fetch meeting details:', e);
        }
      }
    }
    setExpandedMeetings(newExpanded);
  };

  function toggleSel(aid:string, kind:"action"|"risk"|"decision", idx:number) {
    const key = `${aid}-${kind}-${idx}`;
    const existing = sel.findIndex(s => `${s.artifact_id}-${s.kind}-${s.index}` === key);
    if (existing >= 0) {
      setSel(prev => prev.filter((_, i) => i !== existing));
    } else {
      setSel(prev => [...prev, { artifact_id: aid, kind, index: idx }]);
    }
  }

  async function proposeSelected() {
    if (sel.length === 0) {
      toast({ title: "No items selected", description: "Please select items to propose", variant: "destructive" });
      return;
    }
    try {
      await postJSON(`/api/summaries/propose?project_id=${projectId}`, { 
        items: sel.map(s => ({...s, confidence: confidence[0] / 100 }))
      });
      toast({ title: "Success", description: "Proposed to Updates Monitor" });
      setSel([]); // Clear selections
    } catch (e) {
      toast({ title: "Error", description: "Failed to propose items", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 p-6 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="meetings-title">Meeting Summaries</h1>
          <p className="text-muted-foreground">
            View and search through all meeting transcripts, minutes, and summaries
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1">
            <Button 
              onClick={() => handleExport('actions')}
              variant="outline"
              size="sm"
              disabled={downloading.actions}
              data-testid="meetings-export-actions"
            >
              <Download className="w-4 h-4 mr-1" />
              {downloading.actions ? "..." : "Actions"}
            </Button>
            <Button 
              onClick={() => handleExport('risks')}
              variant="outline"
              size="sm"
              disabled={downloading.risks}
              data-testid="meetings-export-risks"
            >
              <Download className="w-4 h-4 mr-1" />
              {downloading.risks ? "..." : "Risks"}
            </Button>
            <Button 
              onClick={() => handleExport('decisions')}
              variant="outline"
              size="sm"
              disabled={downloading.decisions}
              data-testid="meetings-export-decisions"
            >
              <Download className="w-4 h-4 mr-1" />
              {downloading.decisions ? "..." : "Decisions"}
            </Button>
          </div>
          
          {sel.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Confidence:</span>
                <div className="w-20">
                  <Slider
                    value={confidence}
                    onValueChange={setConfidence}
                    max={100}
                    min={1}
                    step={1}
                    className="w-full"
                    data-testid="confidence-slider"
                  />
                </div>
                <span className="text-sm font-medium w-8" data-testid="confidence-value">
                  {confidence[0]}%
                </span>
              </div>
              <Button
                onClick={proposeSelected}
                variant="default"
                size="sm"
                data-testid="propose-selected"
              >
                Propose Selected ({sel.length})
              </Button>
            </div>
          )}
          <Input 
            className="w-64" 
            placeholder="Search title/summary..." 
            value={q} 
            onChange={e => setQ(e.target.value)} 
            onKeyPress={handleKeyPress}
            data-testid="meetings-search-input"
          />
          <Button onClick={handleSearch} data-testid="meetings-search-button">
            <Search className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground" data-testid="meetings-loading">
          Loading meetings...
        </div>
      )}

      {err && (
        <div className="text-sm text-destructive" data-testid="meetings-error">
          {err}
        </div>
      )}

      <div className="grid gap-4">
        {items.map(m => (
          <Card key={m.artifact_id} data-testid={`meeting-card-${m.artifact_id}`}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold" data-testid={`meeting-title-${m.artifact_id}`}>
                      {m.title || "(untitled)"}
                    </h3>
                    {m.source && (
                      <Badge variant="outline" data-testid={`meeting-source-${m.artifact_id}`}>
                        {m.source}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span data-testid={`meeting-date-${m.artifact_id}`}>
                        {m.meeting_date || new Date(m.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                {m.url ? (
                  <Button 
                    variant="outline" 
                    size="sm"
                    asChild
                    data-testid={`meeting-open-${m.artifact_id}`}
                  >
                    <a href={m.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Open
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">no link</span>
                )}
              </div>

              {m.summary && (
                <div className="mb-4">
                  <p className="text-sm whitespace-pre-wrap" data-testid={`meeting-summary-${m.artifact_id}`}>
                    {m.summary}
                  </p>
                </div>
              )}

              {!m.summary && (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground italic">
                    No summary extracted yet.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <span data-testid={`meeting-actions-${m.artifact_id}`}>
                      {m.actions_count} actions
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                    <span data-testid={`meeting-risks-${m.artifact_id}`}>
                      {m.risks_count} risks
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span data-testid={`meeting-decisions-${m.artifact_id}`}>
                      {m.decisions_count} decisions
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Export Summary Button */}
                  {(m.actions_count > 0 || m.risks_count > 0 || m.decisions_count > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => downloadGET(`/api/meetings/export_html?project_id=${projectId}&artifact_id=${m.artifact_id}`, "meeting_summary.html")}
                      data-testid={`export-meeting-${m.artifact_id}`}
                    >
                      Export Summary (HTML)
                    </Button>
                  )}
                  
                  {(m.actions_count > 0 || m.risks_count > 0 || m.decisions_count > 0) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMeetingExpanded(m.artifact_id)}
                      data-testid={`expand-meeting-${m.artifact_id}`}
                    >
                      {expandedMeetings.has(m.artifact_id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded extracted items section */}
              {expandedMeetings.has(m.artifact_id) && meetingDetails[m.artifact_id] && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="space-y-4">
                    {/* Actions */}
                    {meetingDetails[m.artifact_id].actions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">Actions</h4>
                        <div className="space-y-2">
                          {meetingDetails[m.artifact_id].actions.map((item, idx) => (
                            <ExtractedItem 
                              key={idx}
                              artifactId={m.artifact_id}
                              kind="action"
                              idx={idx}
                              item={item}
                              projectId={projectId}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Risks */}
                    {meetingDetails[m.artifact_id].risks.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Risks</h4>
                        <div className="space-y-2">
                          {meetingDetails[m.artifact_id].risks.map((item, idx) => (
                            <ExtractedItem 
                              key={idx}
                              artifactId={m.artifact_id}
                              kind="risk"
                              idx={idx}
                              item={item}
                              projectId={projectId}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Decisions */}
                    {meetingDetails[m.artifact_id].decisions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">Decisions</h4>
                        <div className="space-y-2">
                          {meetingDetails[m.artifact_id].decisions.map((item, idx) => (
                            <ExtractedItem 
                              key={idx}
                              artifactId={m.artifact_id}
                              kind="decision"
                              idx={idx}
                              item={item}
                              projectId={projectId}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {!items.length && !loading && (
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">No meetings yet</h3>
              <p className="text-sm text-muted-foreground" data-testid="meetings-empty-state">
                Upload a transcript or meeting minutes and it will appear here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}