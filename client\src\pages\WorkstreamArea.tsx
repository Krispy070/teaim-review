import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getJSON, postJSON } from "@/lib/queryClient";
import { useProjectId } from "@/hooks/useProjectId";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/App";
import { useAuth } from "@/contexts/AuthContext";
import AreaChips from "../components/AreaChips";
import { useAreaUpdates } from "../hooks/useAreaUpdates";
import { downloadGET } from "@/lib/download";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GuideEditor from "@/components/GuideEditor";
import SlashCommandInput from "@/components/SlashCommandInput";
import { BusinessProcessesPanel } from "@/components/BusinessProcessesPanel";

export default function WorkstreamArea(){
  const params = useParams();
  const projectId = useProjectId();
  const { toast } = useToast();
  const loc = useLocation(); 
  const nav = useNavigate();
  
  // Get context data for safe orgId derivation
  const project = useOrg();
  const { user: me } = useAuth();
  
  const areaKey = params.areaKey ? decodeURIComponent(params.areaKey) : null;
  
  // Derive a safe orgId; remove any org?.orgId uses
  const orgId =
    project?.orgId ??
    me?.orgId ??
    new URLSearchParams(loc.search).get("org") ??
    undefined;
  
  // Tab state management with deep-link and server-side persistence support
  const storeTabKey = `kap.area.tab.${projectId}.${areaKey}`;
  const validTabs = ["open", "risks", "decisions", "workbooks", "guides", "business_processes"] as const;
  type TabType = typeof validTabs[number];
  
  const [tab, setTab] = useState<TabType>("open");
  
  // Query for loading user preference
  const { data: tabPreference } = useQuery({
    queryKey: ['/api/user_preferences/simple/get', storeTabKey],
    queryFn: () => getJSON(`/api/user_preferences/simple/get?key=${encodeURIComponent(storeTabKey)}`),
    enabled: !!projectId && !!areaKey,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation for saving user preference
  const saveTabPreferenceMutation = useMutation({
    mutationFn: (value: string) => 
      apiRequest('POST', '/api/user_preferences/simple/set', { 
        key: storeTabKey, 
        value 
      }),
    retry: false,
    onError: (error, variables) => {
      // Silently fail and fall back to localStorage in development
      try {
        localStorage.setItem(storeTabKey, variables);
      } catch {}
    }
  });

  // Sync tab state when projectId, areaKey changes (initial load and area navigation)
  useEffect(() => {
    const sanitizeTab = (value: string | null): TabType => {
      return validTabs.includes(value as TabType) ? (value as TabType) : "open";
    };

    const hashTab = new URLSearchParams((window.location.hash || "").replace(/^#/, "")).get("tab");
    // First check URL hash, then server preference, fallback to localStorage, then default to "open"
    const serverTab = tabPreference?.value;
    const localTab = (() => {
      try {
        return localStorage.getItem(storeTabKey);
      } catch {
        return null;
      }
    })();
    const resolvedTab = sanitizeTab(hashTab || serverTab || localTab);
    
    setTab(resolvedTab);
  }, [projectId, areaKey, storeTabKey, tabPreference]);

  // Listen for hash changes (browser navigation, programmatic changes)
  useEffect(() => {
    const handleHashChange = () => {
      const sanitizeTab = (value: string | null): TabType => {
        return validTabs.includes(value as TabType) ? (value as TabType) : "open";
      };

      const hashTab = new URLSearchParams((window.location.hash || "").replace(/^#/, "")).get("tab");
      const resolvedTab = sanitizeTab(hashTab);
      
      if (tab !== resolvedTab) {
        setTab(resolvedTab);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [tab]);

  // Persist tab and update hash on change (with guards to prevent unnecessary updates)
  useEffect(() => {
    const currentHash = new URLSearchParams((loc.hash || "").replace(/^#/, "")).get("tab");
    
    if (currentHash !== tab) {
      // Save to server-side preferences (with localStorage fallback)
      saveTabPreferenceMutation.mutate(tab);
      
      const qs = new URLSearchParams((loc.hash || "").replace(/^#/, ""));
      qs.set("tab", tab);
      nav({ hash: qs.toString() }, { replace: true });
    }
  }, [tab, loc.hash, nav, saveTabPreferenceMutation]);
  
  const [msg, setMsg] = useState("");
  const [next, setNext] = useState<string>("");
  const [openItems, setOpenItems] = useState<any[]>([]);
  const [suggest, setSuggest] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [workbooks, setWorkbooks] = useState<any[]>([]);
  const [editor, setEditor] = useState<any|null>(null);

  // Get area updates hook to mark as seen on view
  const { markAreaAsSeen } = useAreaUpdates({ projectId });

  // Query for comment counts (to ensure we have count data before marking as seen)
  const { data: commentCountData } = useQuery({
    queryKey: [`/api/area_comments/count?project_id=${projectId}`],
    enabled: !!projectId,
  });

  // Mark area as seen when user views the area page (wait for comment count data to avoid race)
  useEffect(() => {
    if (areaKey && projectId && commentCountData?.areas) {
      // Only mark as seen if we have the count data to ensure proper lastCount storage
      const areaData = commentCountData.areas.find((a: any) => a.area === areaKey);
      if (areaData) {
        markAreaAsSeen(areaKey);
      }
    }
  }, [areaKey, projectId, commentCountData, markAreaAsSeen]);

  // Load next meeting data
  useEffect(() => {
    (async () => {
      try {
        const n = await getJSON(`/api/area/next_meeting?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`);
        setNext(n.next_meeting || "");
      } catch {
        // Silently handle error
      }
    })();
  }, [projectId, areaKey]);

  // Load open items
  useEffect(() => {
    (async () => {
      try {
        const d = await getJSON(`/api/actions/by_area?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}&status=open`);
        setOpenItems(d.items || []);
      } catch {
        setOpenItems([]);
      }
    })();
  }, [projectId, areaKey]);

  // Load recent meetings for suggestions
  useEffect(() => {
    (async () => {
      try {
        const r = await getJSON(`/api/meetings/recent?project_id=${projectId}&limit=5`);
        setSuggest(r.items || []);
      } catch {
        setSuggest([]);
      }
    })();
  }, [projectId]);

  // Load audit data for "What changed (7d)"
  useEffect(() => {
    (async () => {
      try {
        const d = await getJSON(`/api/areas/audit7d?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`);
        setAudit(d.items || []);
      } catch {
        setAudit([]);
      }
    })();
  }, [projectId, areaKey]);

  // Load risks data
  useEffect(() => {
    (async () => {
      try {
        const d = await getJSON(`/api/actions/by_area?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}&type=risk`);
        setRisks(d.items || []);
      } catch {
        setRisks([]);
      }
    })();
  }, [projectId, areaKey]);

  // Load decisions data
  useEffect(() => {
    (async () => {
      try {
        const d = await getJSON(`/api/actions/by_area?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}&type=decision`);
        setDecisions(d.items || []);
      } catch {
        setDecisions([]);
      }
    })();
  }, [projectId, areaKey]);

  // Load workbooks data
  useEffect(() => {
    (async () => {
      try {
        const d = await getJSON(`/api/workbooks/by_area?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`);
        setWorkbooks(d.items || []);
      } catch {
        setWorkbooks([]);
      }
    })();
  }, [projectId, areaKey]);


  // Query for all areas to get this area's summary
  const { data: areasData, isLoading: areasLoading, error: areasError } = useQuery({
    queryKey: [`/api/areas/summary_all?project_id=${projectId}`],
    enabled: !!projectId,
    onError: () => toast({ title: "Failed to load area summary", variant: "destructive" })
  });

  // Query for comments
  const { data: commentsData, isLoading: commentsLoading, error: commentsError } = useQuery({
    queryKey: [`/api/area_comments/list?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`],
    enabled: !!projectId && !!areaKey,
    onError: () => toast({ title: "Failed to load comments", variant: "destructive" })
  });

  // Query for area owners
  const { data: ownersData } = useQuery({
    queryKey: [`/api/stages/owners_by_area?project_id=${projectId}`],
    enabled: !!projectId
  });

  // Query for guides (only when guides tab is active)
  const { data: guidesData, isLoading: guidesLoading } = useQuery({
    queryKey: ['/api/guides/list', projectId, areaKey],
    enabled: !!projectId && !!areaKey && tab === 'guides'
  });

  // Mutation for adding comments
  const addCommentMutation = useMutation({
    mutationFn: (content: string) => apiRequest('POST', `/api/area_comments/add?project_id=${projectId}`, { area: areaKey, content }),
    onSuccess: () => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({ queryKey: [`/api/area_comments/list?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/area_comments/count?project_id=${projectId}`] });
      setMsg("");
      toast({ title: "Comment added successfully" });
      
      // Mark as seen using the hook to keep state consistent
      if (areaKey) {
        markAreaAsSeen(areaKey);
      }
    },
    onError: (error) => {
      console.error('Failed to add comment:', error);
      toast({ title: "Failed to add comment", variant: "destructive" });
    }
  });

  // Mutation for promoting comment to guide
  const promoteCommentMutation = useMutation({
    mutationFn: (commentId: string) => apiRequest('POST', `/api/guides/promote_comment?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}&comment_id=${commentId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guides/list', projectId, areaKey] });
      toast({ title: "Comment promoted to guide successfully" });
    },
    onError: (error) => {
      console.error('Failed to promote comment:', error);
      toast({ title: "Failed to promote comment", variant: "destructive" });
    }
  });

  const areaSummary = areasData?.items?.find((item: any) => item.area === areaKey);
  const sum = areaSummary?.metrics || {};
  const comments = commentsData?.comments || [];
  const guides = guidesData?.items || [];
  const owners: {[key: string]: string[]} = ownersData?.owners || {};
  const isLoading = areasLoading || commentsLoading;

  const addComment = () => {
    if (!msg.trim() || !areaKey) return;
    addCommentMutation.mutate(msg.trim());
  };

  // Parse area-specific command pattern: /area "Area Name" <text> #guide|#comment
  const parseAreaCommand = (text: string) => {
    // More robust regex allowing areas with spaces, hyphens, and optional trailing spaces
    // Supports: /area HCM <text> #guide, /area "Data Conversion" <text> #comment, defaults to #comment
    const trimmed = text.trim();
    const areaMatch = trimmed.match(/\/area\s+([\w-]+(?:\s+[\w-]+)*)\s+([\s\S]*?)\s*(?:#(guide|comment))?\s*$/i);
    if (areaMatch) {
      const [, targetArea, content, type = 'comment'] = areaMatch;
      return { 
        targetArea: targetArea.trim(), 
        content: content.trim(), 
        type: type.toLowerCase() 
      };
    }
    return null;
  };

  // Validate and suggest area names
  const findMatchingArea = (inputArea: string) => {
    const areas = Object.keys(owners || {});
    const exactMatch = areas.find(area => area.toLowerCase() === inputArea.toLowerCase());
    if (exactMatch) return exactMatch;
    
    // Find close matches for suggestions
    const closeMatches = areas.filter(area => 
      area.toLowerCase().includes(inputArea.toLowerCase()) || 
      inputArea.toLowerCase().includes(area.toLowerCase())
    );
    return { suggestions: closeMatches };
  };

  // Slash commands for quick actions - memoized for stability
  const slashCommands = useMemo(() => [
    {
      command: 'area',
      pattern: '<area> <text> #guide|#comment',
      description: 'Create content for any area from here',
      icon: '🎯',
      expectsArgs: true,
      action: (args: string = '') => {
        const parsed = parseAreaCommand(args);
        if (parsed) {
          const { targetArea, content, type } = parsed;
          
          // Validate area exists
          const matchResult = findMatchingArea(targetArea);
          if (typeof matchResult === 'string') {
            // Exact match found, proceed with action
            const validArea = matchResult;
            
            if (type === 'guide') {
              // Create a guide for the target area
              const newGuide = {
                id: null,
                title: content.slice(0, 60) + (content.length > 60 ? '...' : ''),
                area: validArea,
                owner: '',
                tags: [],
                steps: [content],
                org_id: orgId || '',
                project_id: projectId || '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              setEditor(newGuide);
              setMsg(''); // Clear input
              toast({ title: `Creating guide for ${validArea}` });
            } else {
              // Add comment to the target area
              apiRequest('POST', `/api/area_comments/add?project_id=${projectId}`, { 
                area: validArea, 
                content 
              }).then(() => {
                setMsg(''); // Clear input
                toast({ title: `Comment added to ${validArea}` });
                // Invalidate queries if it's the current area
                if (validArea === areaKey) {
                  queryClient.invalidateQueries({ queryKey: [`/api/area_comments/list?project_id=${projectId}&area=${encodeURIComponent(areaKey)}`] });
                  queryClient.invalidateQueries({ queryKey: [`/api/area_comments/count?project_id=${projectId}`] });
                }
              }).catch(() => {
                toast({ title: `Failed to add comment to ${validArea}`, variant: "destructive" });
              });
            }
          } else {
            // No exact match, show suggestions
            const suggestions = matchResult.suggestions || [];
            if (suggestions.length > 0) {
              toast({ 
                title: `Area "${targetArea}" not found`, 
                description: `Did you mean: ${suggestions.slice(0, 3).join(', ')}?`,
                variant: "destructive" 
              });
            } else {
              toast({ 
                title: `Area "${targetArea}" not found`, 
                description: `Available areas: ${Object.keys(owners || {}).slice(0, 5).join(', ')}`,
                variant: "destructive" 
              });
            }
          }
        } else {
          toast({ 
            title: "Invalid format", 
            description: "Use: /area <AreaName> <your text> [#guide or #comment]",
            variant: "destructive" 
          });
        }
      }
    },
    {
      command: 'guide',
      description: 'Create a new guide for this area',
      icon: '📋',
      action: () => {
        const newGuide = {
          id: null,
          title: '',
          area: areaKey || '',
          owner: '',
          tags: [],
          steps: [''],
          org_id: orgId || '',
          project_id: projectId || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setEditor(newGuide);
      }
    },
    {
      command: 'comment',
      description: 'Add a regular comment (default behavior)',
      icon: '💬',
      action: () => {
        // Just focus back on the input - this is the default behavior
        // The input will remain focused and user can type normally
      }
    },
    {
      command: 'risk',
      description: 'Switch to risks tab to add a risk',
      icon: '⚠️',
      action: () => {
        setTab('risks');
      }
    },
    {
      command: 'decision',
      description: 'Switch to decisions tab to view decisions',
      icon: '✅',
      action: () => {
        setTab('decisions');
      }
    },
    {
      command: 'workbooks',
      description: 'Switch to workbooks tab to view workbooks',
      icon: '📚',
      action: () => {
        setTab('workbooks');
      }
    },
    {
      command: 'guides',
      description: 'Switch to guides tab to view guides',
      icon: '📖',
      action: () => {
        setTab('guides');
      }
    },
    {
      command: 'open',
      description: 'Switch to open items tab (default view)',
      icon: '📋',
      action: () => {
        setTab('open');
      }
    }
  ], [areaKey, projectId, orgId, setEditor, setTab, setMsg, toast, queryClient]);

  function setOwner(aid: string, owner: string) {
    setOpenItems(items => items.map(i => i.id === aid ? { ...i, owner } : i));
    fetch(`/api/actions/update_small?id=${encodeURIComponent(aid)}&project_id=${projectId}&owner=${encodeURIComponent(owner)}`, { method: "POST", credentials: "include" });
  }

  function setStatus(aid: string, status: string) {
    setOpenItems(items => items.map(i => i.id === aid ? { ...i, status } : i));
    fetch(`/api/actions/update_small?id=${encodeURIComponent(aid)}&project_id=${projectId}&status=${encodeURIComponent(status)}`, { method: "POST", credentials: "include" });
  }

  function applySuggest(s: string) {
    setNext(s.replace('Z', '')); // ISO handling
  }

  const saveNext = async () => {
    if (!next || !areaKey || !projectId) return;
    try {
      await postJSON(`/api/area/next_meeting?project_id=${projectId}`, { area: areaKey, starts_at: next });
      // Update local summary data
      const areaSummary = areasData?.items?.find((item: any) => item.area === areaKey);
      if (areaSummary) {
        areaSummary.metrics.next_meeting = next;
      }
      toast({ title: "Next meeting saved successfully" });
    } catch (error) {
      toast({ title: "Failed to save next meeting", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="area-loading">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-32 mb-4"></div>
          <div className="h-32 bg-muted rounded mb-4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (areasError || commentsError) {
    return (
      <div className="space-y-4" data-testid="area-error">
        <div className="text-center text-red-500">
          <div className="text-sm">
            {areasError && "Failed to load area summary."}
            {commentsError && " Failed to load comments."}
            {" Please try again."}
          </div>
        </div>
      </div>
    );
  }

  if (!areaKey) {
    return (
      <div className="space-y-4" data-testid="area-error">
        <div className="text-center text-muted-foreground">
          <div className="text-sm">Invalid area specified.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="workstream-area-page">
      {/* Area chips for quick navigation */}
      <AreaChips currentArea={areaKey || undefined} />
      
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="area-title">{areaKey}</h1>
        <div className="flex items-center gap-2">
          <a className="brand-btn text-xs" target="_blank" rel="noreferrer"
             href={`/api/area/preview.html?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`}
             data-testid="preview-area-button">
            Preview Area Package
          </a>
          <button className="brand-btn text-xs" 
                  onClick={() => downloadGET(`/api/area/export.zip?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`, `area_${areaKey}.zip`)}
                  data-testid="export-area-button-top">
            Export Area Package
          </button>
        </div>
      </div>

      {/* Summary Card */}
      <div className="brand-card p-4" data-testid="area-summary-card">
        <div className="text-lg font-medium mb-3">{areaKey} — Summary</div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>
            Actions open: <b data-testid="actions-open-count">{sum?.actions_open??"—"}</b> · 
            Risks: <b data-testid="risks-open-count">{sum?.risks_open??"—"}</b> · 
            Decisions: <b data-testid="decisions-count">{sum?.decisions??"—"}</b>
          </div>
          <div>
            Workbooks: <b data-testid="workbooks-progress">{sum?.workbooks_done??0}/{sum?.workbooks_total??0}</b> · 
            Days to due: <b data-testid="days-to-due">{sum?.days_to_due??"—"}</b>
          </div>
          <div>
            Next meeting: <span data-testid="next-meeting">{sum?.next_meeting? new Date(sum.next_meeting).toLocaleString() : "—"}</span> · 
            Last update: <span data-testid="last-update">{sum?.last_update? new Date(sum.last_update).toLocaleString(): "—"}</span>
          </div>
        </div>
        <div className="mt-2 flex gap-1 flex-wrap" data-testid={`area-owners-${areaKey?.toLowerCase().replace(/\s+/g, '-')}`}>
          {(owners[areaKey || ""]||[]).slice(0,3).map(u=><span key={u} className="text-[11px] px-1.5 py-[1px] rounded bg-slate-500/15 text-slate-600" data-testid={`owner-chip-${u}`}>{u}</span>)}
        </div>
      </div>

      {/* Next meeting control */}
      <div className="brand-card p-3" data-testid="next-meeting-section">
        <div className="text-sm font-medium mb-1">Next Meeting</div>
        <div className="flex items-center gap-2">
          <input 
            type="datetime-local" 
            className="border rounded p-2 text-sm" 
            value={next} 
            onChange={e => setNext(e.target.value)}
            data-testid="next-meeting-input"
          />
          <button 
            className="brand-btn text-xs" 
            onClick={saveNext}
            disabled={!next}
            data-testid="save-next-meeting-button"
          >
            Save
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">Recent:
          {suggest.map((m: any) => (
            <button key={m.id} className="underline ml-2" onClick={() => applySuggest(m.starts_at)}
                    data-testid={`meeting-suggest-${m.id}`}>
              {new Date(m.starts_at).toLocaleString()} {m.title ? `• ${m.title}` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Tabbed Content */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabType)} className="w-full" data-testid="workstream-tabs">
        <TabsList className="grid w-full grid-cols-6" data-testid="tabs-list">
          <TabsTrigger value="open" data-testid="tab-open">Open Items</TabsTrigger>
          <TabsTrigger value="risks" data-testid="tab-risks">Risks</TabsTrigger>
          <TabsTrigger value="decisions" data-testid="tab-decisions">Decisions</TabsTrigger>
          <TabsTrigger value="workbooks" data-testid="tab-workbooks">Workbooks</TabsTrigger>
          <TabsTrigger value="guides" data-testid="tab-guides">Guides</TabsTrigger>
          <TabsTrigger value="business_processes" data-testid="tab-business-processes">Business Processes</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-4" data-testid="tab-content-open">
          {/* Open Items */}
          <div className="brand-card p-3" data-testid="open-items-section">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Open Items</div>
              <a className="brand-btn text-xs" href={`/projects/${projectId}/actions/list#openFilters=1&area=${encodeURIComponent(areaKey || '')}`}>Manage in Actions</a>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr><th className="text-left p-1">Title</th><th className="text-left p-1">Owner</th><th className="text-left p-1">Status</th><th className="text-left p-1">Created</th></tr></thead>
                <tbody>
                  {openItems.map((a: any) => (
                    <tr key={a.id}>
                      <td className="p-1"><a className="underline" href={`/projects/${projectId}/actions/list#openFilters=1&area=${encodeURIComponent(areaKey || '')}&id=${a.id}`}>{a.title || a.id}</a></td>
                      <td className="p-1 w-[28%]">
                        <input className="border rounded p-1 w-full" value={a.owner || ""} 
                               onChange={e => setOwner(a.id, e.target.value)}
                               data-testid={`owner-input-${a.id}`} />
                      </td>
                      <td className="p-1 w-[22%]">
                        <select className="border rounded p-1 w-full" value={a.status || "open"} 
                                onChange={e => setStatus(a.id, e.target.value)}
                                data-testid={`status-select-${a.id}`}>
                          {["open", "in_progress", "blocked", "done"].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="p-1">{a.created_at ? new Date(a.created_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {!openItems.length && <tr><td className="p-2 text-muted-foreground" colSpan={4}>No open items.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* What changed (7d) Section */}
          <div className="brand-card p-3" data-testid="audit-section">
            <div className="text-sm font-medium mb-2">What changed (last 7 days)</div>
            <div className="text-xs max-h-[32vh] overflow-auto">
              {(audit||[]).map((e:any)=>(
                <div key={`${e.table}-${e.id}`} className="border-b py-1" data-testid={`audit-item-${e.table}-${e.id}`}>
                  {new Date(e.created_at).toLocaleString()} • <b>{e.table}</b> — {e.title}
                </div>
              ))}
              {!audit.length && <div className="text-muted-foreground" data-testid="no-audit-message">No recent changes.</div>}
            </div>
          </div>

          {/* Comments Section */}
          <div className="brand-card p-4" data-testid="comments-section">
            <div className="text-lg font-medium mb-3">Comments / Notes</div>
            
            {/* Comments List */}
            <div className="space-y-2 max-h-[40vh] overflow-auto mb-4" data-testid="comments-list">
              {comments.map((c: any, i: number)=>(
                <div key={i} className="border rounded p-3 text-sm" data-testid={`comment-${i}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-muted-foreground text-xs mb-1" data-testid={`comment-meta-${i}`}>
                      {new Date(c.created_at).toLocaleString()} • {c.author_name || c.author_email}
                    </div>
                    <button 
                      className="brand-btn text-[11px]" 
                      onClick={() => promoteCommentMutation.mutate(c.id)}
                      disabled={promoteCommentMutation.isPending}
                      data-testid={`button-promote-comment-${i}`}
                      title="Promote to Guide"
                    >
                      📋
                    </button>
                  </div>
                  <div data-testid={`comment-message-${i}`}>{c.content}</div>
                </div>
              ))}
              {!comments.length && (
                <div className="text-sm text-muted-foreground" data-testid="no-comments-message">
                  No comments yet.
                </div>
              )}
            </div>
            
            {/* Add Comment Form */}
            <div className="flex items-center gap-2" data-testid="add-comment-form">
              <SlashCommandInput
                value={msg}
                onChange={setMsg}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()}
                placeholder="Add a note, question, or correction… (type / for commands)"
                commands={slashCommands}
                disabled={addCommentMutation.isPending}
                data-testid="comment-input"
              />
              <button 
                className="brand-btn text-sm px-4 py-2" 
                onClick={addComment}
                disabled={!msg.trim() || addCommentMutation.isPending}
                data-testid="post-comment-button"
              >
                {addCommentMutation.isPending ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="risks" className="space-y-4" data-testid="tab-content-risks">
          <div className="brand-card p-3" data-testid="risks-section">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Risks</div>
              <a className="brand-btn text-xs" href={`/projects/${projectId}/actions/list#openFilters=1&area=${encodeURIComponent(areaKey || '')}&type=risk`}>Manage Risks</a>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr><th className="text-left p-1">Title</th><th className="text-left p-1">Owner</th><th className="text-left p-1">Status</th><th className="text-left p-1">Created</th></tr></thead>
                <tbody>
                  {risks.map((r: any) => (
                    <tr key={r.id}>
                      <td className="p-1"><a className="underline" href={`/projects/${projectId}/actions/list#openFilters=1&area=${encodeURIComponent(areaKey || '')}&id=${r.id}`}>{r.title || r.id}</a></td>
                      <td className="p-1">{r.owner || "—"}</td>
                      <td className="p-1">{r.status || "—"}</td>
                      <td className="p-1">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {!risks.length && <tr><td className="p-2 text-muted-foreground" colSpan={4}>No risks found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4" data-testid="tab-content-decisions">
          <div className="brand-card p-3" data-testid="decisions-section">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Decisions</div>
              <a className="brand-btn text-xs" href={`/projects/${projectId}/actions/list#openFilters=1&area=${encodeURIComponent(areaKey || '')}&type=decision`}>Manage Decisions</a>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr><th className="text-left p-1">Title</th><th className="text-left p-1">Owner</th><th className="text-left p-1">Status</th><th className="text-left p-1">Created</th></tr></thead>
                <tbody>
                  {decisions.map((d: any) => (
                    <tr key={d.id}>
                      <td className="p-1"><a className="underline" href={`/projects/${projectId}/actions/list#openFilters=1&area=${encodeURIComponent(areaKey || '')}&id=${d.id}`}>{d.title || d.id}</a></td>
                      <td className="p-1">{d.owner || "—"}</td>
                      <td className="p-1">{d.status || "—"}</td>
                      <td className="p-1">{d.created_at ? new Date(d.created_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {!decisions.length && <tr><td className="p-2 text-muted-foreground" colSpan={4}>No decisions found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workbooks" className="space-y-4" data-testid="tab-content-workbooks">
          <div className="brand-card p-3" data-testid="workbooks-section">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Workbooks</div>
              <a className="brand-btn text-xs" href={`/projects/${projectId}/workbooks#area=${encodeURIComponent(areaKey || '')}`}>Manage Workbooks</a>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr><th className="text-left p-1">Title</th><th className="text-left p-1">Status</th><th className="text-left p-1">Progress</th><th className="text-left p-1">Updated</th></tr></thead>
                <tbody>
                  {workbooks.map((w: any) => (
                    <tr key={w.id}>
                      <td className="p-1"><a className="underline" href={`/projects/${projectId}/workbooks/${w.id}`}>{w.title || w.id}</a></td>
                      <td className="p-1">{w.status || "—"}</td>
                      <td className="p-1">{w.progress || "—"}</td>
                      <td className="p-1">{w.updated_at ? new Date(w.updated_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {!workbooks.length && <tr><td className="p-2 text-muted-foreground" colSpan={4}>No workbooks found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="guides" className="space-y-4" data-testid="tab-content-guides">
          <div className="brand-card p-3" data-testid="guides-section">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Guides</div>
              <div className="flex items-center gap-2">
                <button 
                  className="brand-btn text-xs" 
                  onClick={() => setEditor({})}
                  data-testid="button-new-guide"
                >
                  New Guide
                </button>
                <button 
                  className="brand-btn text-xs" 
                  onClick={() => downloadGET(`/api/guides/export.csv?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`, "guides.csv")}
                  data-testid="button-export-guides"
                >
                  Export CSV
                </button>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-2 mt-3">
              {guides.map(g => (
                <div key={g.id} className="brand-card p-2 text-xs" data-testid={`guide-item-${g.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium" data-testid={`guide-title-${g.id}`}>{g.title}</div>
                    <div className="text-[11px] text-muted-foreground" data-testid={`guide-status-${g.id}`}>{g.status}</div>
                  </div>
                  <div className="text-muted-foreground" data-testid={`guide-meta-${g.id}`}>
                    Owner: {g.owner || "—"} • Tags: {(g.tags || []).join(", ") || "—"}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button 
                      className="brand-btn text-[11px]" 
                      onClick={() => setEditor(g)}
                      data-testid={`button-edit-guide-${g.id}`}
                    >
                      Edit
                    </button>
                    <a 
                      className="brand-btn text-[11px]" 
                      target="_blank" 
                      rel="noreferrer" 
                      href={`/api/guides/export.html?project_id=${projectId}&id=${g.id}`}
                      data-testid={`button-print-guide-${g.id}`}
                    >
                      Print
                    </a>
                  </div>
                </div>
              ))}
              {!guides.length && (
                <div className="text-muted-foreground text-xs" data-testid="no-guides-message">
                  No guides yet.
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="business_processes" className="space-y-4" data-testid="tab-content-business-processes">
          {areaKey && projectId && (
            <BusinessProcessesPanel 
              areaKey={areaKey} 
              projectId={projectId} 
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Area Export */}
      <div className="flex items-center gap-2" data-testid="area-export-section">
        <a className="brand-btn text-xs" target="_blank" rel="noreferrer"
           href={`/api/area/preview.html?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`}
           data-testid="preview-area-button-bottom">
          Preview Area Package
        </a>
        <button 
          className="brand-btn text-xs" 
          onClick={() => downloadGET(`/api/area/export.zip?project_id=${projectId}&area=${encodeURIComponent(areaKey || '')}`, `area_${areaKey}.zip`)}
          data-testid="export-area-button-bottom"
        >
          Export Area Package
        </button>
      </div>
      
      {/* Guide Editor Modal */}
      {editor && (
        <GuideEditor 
          projectId={projectId!} 
          area={areaKey} 
          initial={editor} 
          onClose={() => { setEditor(null); queryClient.invalidateQueries({ queryKey: ['/api/guides/list', projectId, areaKey] }); }}
        />
      )}
    </div>
  );
}