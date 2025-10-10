import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { X, MessageSquare } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { pushToast } from "@/lib/toast";

export default function ConversationsPage() {
  const pid = getProjectId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ enabled: false, olderThanDays: 3, runAtHour: 2 });
  const [sweep, setSweep] = useState({ days: 3 });
  const [dlg, setDlg] = useState<{type:"merge"|"delete"|"sweep"|"bulk-apply"|null; intoId?:string} | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/conversations", pid],
    enabled: !!pid,
  });

  const conversations = Array.isArray(data) ? data : [];
  const ids = Object.keys(sel).filter(k => sel[k]);

  async function loadSettings() {
    if (!pid) return;
    const r = await fetchWithAuth(`/api/conversations/sweep-settings?projectId=${encodeURIComponent(pid)}`);
    if (r.ok) {
      const data = await r.json();
      setSettings({ enabled: data.enabled || false, olderThanDays: data.olderThanDays || 3, runAtHour: data.runAtHour || 2 });
    }
  }

  async function saveSettings() {
    if (!pid) return;
    const r = await fetchWithAuth(`/api/conversations/sweep-settings`, {
      method: "POST",
      body: JSON.stringify({ projectId: pid, ...settings }),
    });
    if (r.ok) {
      pushToast({ type: "success", message: "Settings saved" });
    } else {
      pushToast({ type: "error", message: "Failed to save settings" });
    }
  }

  useEffect(() => {
    loadSettings();
  }, [pid]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Conversations</h1>
        <div className="flex items-center gap-2">
          <button
            className="text-xs px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800 dark:border-slate-600"
            onClick={() => setShowSettings(!showSettings)}
            data-testid="button-toggle-settings"
          >
            {showSettings ? "Hide" : "Show"} Auto-Sweep Settings
          </button>
          {!showSettings && settings.enabled && (
            <span className="text-[10px] opacity-60" data-testid="text-settings-summary">
              {settings.olderThanDays}d @ {String(settings.runAtHour).padStart(2, '0')}:00 UTC
            </span>
          )}
          <button
            className="text-xs px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800 dark:border-slate-600"
            onClick={() => setDlg({type:"sweep"})}
            data-testid="button-sweep-empties"
          >
            Delete empties…
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="p-4 border rounded-2xl dark:border-slate-700 bg-slate-50 dark:bg-slate-900 mb-4" data-testid="section-auto-sweep-settings">
          <h2 className="text-sm font-semibold mb-3">Auto-Sweep Settings</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                data-testid="checkbox-sweep-enabled"
              />
              <label className="text-sm">Enable nightly auto-sweep</label>
            </div>
            <div>
              <label className="text-xs opacity-70 block mb-1">Delete conversations with 0 messages older than (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                className="w-32 border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
                value={settings.olderThanDays}
                onChange={(e) => setSettings({ ...settings, olderThanDays: Math.max(1, parseInt(e.target.value) || 3) })}
                data-testid="input-sweep-days"
              />
            </div>
            <div>
              <label className="text-xs opacity-70 block mb-1">Run at hour (UTC, 0-23)</label>
              <input
                type="number"
                min="0"
                max="23"
                className="w-32 border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
                value={settings.runAtHour}
                onChange={(e) => setSettings({ ...settings, runAtHour: Math.max(0, Math.min(23, parseInt(e.target.value) || 2)) })}
                data-testid="input-sweep-hour"
              />
            </div>
            <button
              className="text-xs px-3 py-1.5 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
              onClick={saveSettings}
              data-testid="button-save-settings"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}

        {ids.length > 0 && (
          <div className="p-2 border rounded-2xl flex items-center gap-2 bg-muted/20 mb-4">
            <span className="text-xs" data-testid="text-selected-count">Selected: {ids.length}</span>
            <button
              className="text-xs px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              data-testid="button-bulk-create-actions"
              onClick={() => setDlg({type:"bulk-apply"})}
            >
              Create Actions
            </button>
            <button
              className="text-xs px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              data-testid="button-bulk-merge"
              onClick={() => setDlg({type:"merge"})}
            >
              Merge…
            </button>
            <button
              className="text-xs px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              data-testid="button-bulk-delete"
              onClick={() => setDlg({type:"delete"})}
            >
              Delete…
            </button>
            <button
              className="text-xs px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              data-testid="button-bulk-clear"
              onClick={() => setSel({})}
            >
              Clear
            </button>
          </div>
        )}
        
        {isLoading && <div className="text-sm opacity-70">Loading...</div>}
        
        {!isLoading && conversations.length === 0 && (
          <div className="text-sm opacity-70">No conversations yet. Use Clip to TEAIM to capture conversations.</div>
        )}
        
        {!isLoading && conversations.length > 0 && (
          <div className="space-y-2">
            {conversations.map((conv: any) => (
              <div
                key={conv.id}
                className="p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                data-testid={`card-conversation-${conv.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!sel[conv.id]}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSel(s => ({ ...s, [conv.id]: e.target.checked }));
                      }}
                      data-testid={`checkbox-conversation-${conv.id}`}
                      className="cursor-pointer"
                    />
                    <div>
                      <div className="font-medium">
                        {conv.title || "(untitled)"}{" "}
                        <span className="text-[11px] opacity-60">[{conv.source}]</span>
                      </div>
                      <div className="text-[11px] opacity-70">
                        {new Date(conv.createdAt).toLocaleString()} • {conv.messages || 0} message(s)
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conv.sourceRef && (
                      <a
                        className="text-xs underline"
                        href={conv.sourceRef}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`link-source-${conv.id}`}
                      >
                        Open source
                      </a>
                    )}
                    <button
                      className="text-xs px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => setSelectedId(conv.id)}
                      data-testid={`button-open-${conv.id}`}
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {selectedId && (
        <ConvDrawer
          conversationId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Merge dialog */}
      <ConfirmDialog
        open={dlg?.type==="merge"} onClose={()=>setDlg(null)}
        title="Merge conversations" intent="neutral"
        body={
          <div className="space-y-2">
            <div>Merge <b>{ids.length-1}</b> conversation(s) into:</div>
            <input className="w-full border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
              placeholder="Target conversation ID"
              value={dlg?.intoId||""}
              onChange={e=>setDlg(d=>d?{...d, intoId:e.target.value}:d)}
            />
            <div className="text-[11px] opacity-70">Messages will be moved to target; sources deleted.</div>
          </div>
        }
        confirmText="Merge"
        onConfirm={async ()=>{
          if (!dlg?.intoId) throw new Error("Target required");
          await fetchWithAuth(`/api/conversations/merge`, {
            method:"POST",
            body: JSON.stringify({ projectId: pid, intoId: dlg.intoId, fromIds: ids.filter(x=>x!==dlg.intoId) })
          });
          setSel({}); refetch();
        }}
      />

      {/* Delete dialog */}
      <ConfirmDialog
        open={dlg?.type==="delete"} onClose={()=>setDlg(null)}
        title="Delete conversations" intent="danger"
        body={<div>Delete <b>{ids.length}</b> conversation(s)? This cannot be undone.</div>}
        confirmText="Delete"
        onConfirm={async ()=>{
          for (const id of ids) await fetchWithAuth(`/api/conversations/${id}`, { method:"DELETE" });
          setSel({}); refetch();
        }}
      />

      {/* Sweep dialog */}
      <ConfirmDialog
        open={dlg?.type==="sweep"} onClose={()=>setDlg(null)}
        title="Delete empty conversations" intent="danger"
        body={<div>Delete empties older than <b>{sweep.days}</b> day(s)?</div>}
        confirmText="Run sweep"
        onConfirm={async ()=>{
          await fetchWithAuth(`/api/conversations/sweep-empties`, {
            method:"POST", body: JSON.stringify({ projectId: pid, olderThanDays: sweep.days })
          });
          refetch();
        }}
      />

      {/* Bulk apply actions dialog */}
      <ConfirmDialog
        open={dlg?.type==="bulk-apply"} onClose={()=>setDlg(null)}
        title="Create Actions from Conversations" intent="neutral"
        body={<div>Create actions from <b>{ids.length}</b> conversation(s)? They will be de-duplicated by title (7d window).</div>}
        confirmText="Create Actions"
        onConfirm={async ()=>{
          const r = await fetchWithAuth(`/api/conversations/bulk-apply`, {
            method:"POST",
            body: JSON.stringify({ projectId: pid, ids }),
          });
          const j = await r.json();
          if (r.ok) {
            pushToast({ type: "success", message: `Created ${j.created} action(s)` });
          } else {
            pushToast({ type: "error", message: `Failed: ${j.error || "unknown"}` });
          }
          setSel({});
          refetch();
        }}
      />
    </div>
  );
}

function ConvDrawer({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("");
  const [sum, setSum] = useState("");
  const [counts, setCounts] = useState<any>(null);
  const [created, setCreated] = useState<{ id: string; title: string; status?: string; assignee?: string; dueAt?: string }[] | null>(null);
  const [openActionId, setOpenActionId] = useState<string|null>(null);
  const [openAction, setOpenAction] = useState<any|null>(null);
  const [showApplyDlg, setShowApplyDlg] = useState(false);

  const { data } = useQuery({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  const conversation = data as any;
  const messages = (data as any)?.messages || [];

  async function loadCreated() {
    const r = await fetchWithAuth(`/api/conversations/${conversationId}/actions`);
    const j = await r.json();
    setCreated(j.items || []);
  }

  async function loadAction(id:string){
    const r = await fetchWithAuth(`/api/actions/${id}`);
    const j = await r.json(); 
    if (r.ok) setOpenAction(j.item||null);
  }

  useEffect(() => {
    loadCreated();
  }, [conversationId]);

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const r = await fetchWithAuth(`/api/conversations/${conversationId}/summarize`, {
        method: "POST",
        body: JSON.stringify({ topic }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to summarize");
      return j;
    },
    onSuccess: (data) => {
      setSum(data.summary || "");
      setCounts(data.counts || null);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  async function applyActions() {
    const r = await fetchWithAuth(`/api/conversations/${conversationId}/apply-actions`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const j = await r.json();
    if (r.ok) {
      pushToast({ type: "success", message: `Created ${j.createdCount} action(s)` });
      loadCreated();
    } else {
      pushToast({ type: "error", message: "Failed to create actions" });
    }
  }

  if (conversation?.summary && !sum) {
    setSum(conversation.summary);
  }

  if (conversation?.insights && !counts) {
    const insights = conversation.insights;
    setCounts({
      actions: insights.actions?.length || 0,
      decisions: insights.decisions?.length || 0,
      risks: insights.risks?.length || 0,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="brand-card shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
          <h2 className="text-lg font-semibold" data-testid="text-conversation-title">
            {conversation?.title || "Conversation"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            data-testid="button-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-sm space-y-2">
            <div><strong>Source:</strong> {conversation?.source}</div>
            <div><strong>Created:</strong> {conversation?.createdAt ? new Date(conversation.createdAt).toLocaleString() : "N/A"}</div>
            {conversation?.sourceRef && (
              <div><strong>Link:</strong> <a href={conversation.sourceRef} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{conversation.sourceRef}</a></div>
            )}
          </div>

          <div className="mt-4 p-3 border rounded-lg dark:border-slate-700">
            <div className="text-sm font-medium mb-2">Summary & Insights</div>
            <div className="flex items-center gap-2 mb-2">
              <input
                className="flex-1 border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
                placeholder="Topic (optional)"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                data-testid="input-topic"
              />
              <button
                className="text-xs px-3 py-1.5 border rounded hover:bg-slate-100 dark:hover:bg-slate-800 dark:border-slate-600"
                onClick={() => summarizeMutation.mutate()}
                disabled={summarizeMutation.isPending}
                data-testid="button-summarize"
              >
                {summarizeMutation.isPending ? "Summarizing..." : "Summarize"}
              </button>
              {counts && (
                <span className="text-[11px] opacity-70" data-testid="text-counts">
                  A:{counts.actions} D:{counts.decisions} R:{counts.risks}
                </span>
              )}
            </div>
            {sum ? (
              <pre className="text-sm whitespace-pre-wrap p-2 border rounded bg-slate-900/40 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200" data-testid="text-summary">
                {sum}
              </pre>
            ) : (
              <div className="text-xs opacity-70">Click Summarize to generate TL;DR & call-outs.</div>
            )}
            <div className="mt-3">
              <button
                className="text-xs px-3 py-1.5 border rounded hover:bg-slate-100 dark:hover:bg-slate-800 dark:border-slate-600"
                onClick={() => setShowApplyDlg(true)}
                disabled={!counts || counts.actions === 0}
                data-testid="button-create-actions"
              >
                Create Actions from call-outs
              </button>
            </div>
          </div>

          <div className="mt-4 p-3 border rounded-2xl dark:border-slate-700">
            <div className="text-sm font-medium mb-1">Created Actions</div>
            {!created?.length && <div className="text-xs opacity-70">No actions yet. Use "Create Actions" above.</div>}

            {!!created?.length && (
              <ul className="space-y-2">
                {created.map((a) => (
                  <li key={a.id} className="p-2 border rounded-lg bg-slate-900/40 dark:bg-slate-800/60 dark:border-slate-600">
                    <div className="text-sm font-medium truncate">
                      <button 
                        className="underline" 
                        onClick={()=>{ setOpenActionId(a.id); loadAction(a.id); }}
                        data-testid={`button-action-${a.id}`}
                      >
                        {a.title}
                      </button>
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {a.assignee || "unassigned"} • {a.status || "open"}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {openActionId && openAction && (
              <div className="mt-3 p-3 border rounded-2xl bg-slate-900/30 dark:border-slate-600">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Action</div>
                  <button 
                    className="text-xs px-2 py-1 border rounded dark:border-slate-600" 
                    onClick={()=>{ setOpenActionId(null); setOpenAction(null); }}
                    data-testid="button-close-action"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-2 grid md:grid-cols-2 gap-2">
                  <label className="text-xs">Title</label>
                  <input 
                    className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
                    defaultValue={openAction.title}
                    onBlur={async e=>{
                      await fetchWithAuth(`/api/actions/${openAction.id}`, { 
                        method:"PATCH", 
                        body: JSON.stringify({ title: e.target.value }) 
                      });
                      loadAction(openAction.id); loadCreated();
                    }}
                    data-testid="input-action-title"
                  />

                  <label className="text-xs">Assignee</label>
                  <input 
                    className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
                    defaultValue={openAction.assignee||""}
                    onBlur={async e=>{
                      await fetchWithAuth(`/api/actions/${openAction.id}`, { 
                        method:"PATCH", 
                        body: JSON.stringify({ assignee: e.target.value || null }) 
                      });
                      loadAction(openAction.id); loadCreated();
                    }}
                    data-testid="input-action-assignee"
                  />

                  <label className="text-xs">Due</label>
                  <input 
                    type="date" 
                    className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
                    defaultValue={openAction.dueAt ? String(openAction.dueAt).slice(0,10) : ""}
                    onBlur={async e=>{
                      const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                      await fetchWithAuth(`/api/actions/${openAction.id}`, { 
                        method:"PATCH", 
                        body: JSON.stringify({ dueAt: v }) 
                      });
                      loadAction(openAction.id); loadCreated();
                    }}
                    data-testid="input-action-due"
                  />

                  <label className="text-xs">Priority</label>
                  <select 
                    className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
                    defaultValue={openAction.priority||"normal"}
                    onChange={async e=>{
                      await fetchWithAuth(`/api/actions/${openAction.id}`, { 
                        method:"PATCH", 
                        body: JSON.stringify({ priority: e.target.value }) 
                      });
                      loadAction(openAction.id); loadCreated();
                    }}
                    data-testid="select-action-priority"
                  >
                    <option value="low">low</option>
                    <option value="normal">normal</option>
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                  </select>

                  <label className="text-xs">Status</label>
                  <select 
                    className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"
                    defaultValue={openAction.status||"open"}
                    onChange={async e=>{
                      await fetchWithAuth(`/api/actions/${openAction.id}`, { 
                        method:"PATCH", 
                        body: JSON.stringify({ status: e.target.value }) 
                      });
                      loadAction(openAction.id); loadCreated();
                    }}
                    data-testid="select-action-status"
                  >
                    <option value="open">open</option>
                    <option value="in_progress">in_progress</option>
                    <option value="blocked">blocked</option>
                    <option value="done">done</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Messages ({messages.length})</div>
            <div className="space-y-2">
              {messages.map((msg: any, idx: number) => (
                <div key={msg.id || idx} className="p-2 border rounded dark:border-slate-700 text-sm" data-testid={`message-${idx}`}>
                  <div className="font-medium text-xs opacity-70 mb-1">
                    {msg.author || "Unknown"} • {msg.at ? new Date(msg.at).toLocaleString() : "N/A"}
                  </div>
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Apply actions dialog */}
      <ConfirmDialog
        open={showApplyDlg} onClose={()=>setShowApplyDlg(false)}
        title="Create Actions" intent="neutral"
        body={<div>Create actions from this conversation's call-outs?</div>}
        confirmText="Create Actions"
        onConfirm={async ()=>{
          await applyActions();
          setShowApplyDlg(false);
        }}
      />
    </div>
  );
}
