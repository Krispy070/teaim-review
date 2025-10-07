import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { fetchWithAuth } from "@/lib/supabase";
import PageHeading from "@/components/PageHeading";
import { getProjectId, ensureProjectPath } from "@/lib/project";

type Action = {
  id: string; 
  title: string; 
  assignee?: string; 
  dueAt?: string;
  priority?: string; 
  status?: string; 
  source?: string; 
  docId: string;
};

export default function ActionsInsights() {
  const [items, setItems] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filterStatus, setFilterStatus] = useState<string>("any");
  const [filterPriority, setFilterPriority] = useState<string>("any");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [location] = useLocation();
  const projectId = getProjectId();

  async function load() {
    if (!projectId) return;
    setLoading(true);
    const p = new URLSearchParams({ projectId, includeArchived: String(showArchived) });
    const r = await fetchWithAuth(`/api/actions/list?${p.toString()}`);
    const j = await r.json();
    setItems(j.items || []);
    setSelected({});
    setLoading(false);
  }
  
  useEffect(() => { load(); }, [projectId, showArchived]);

  async function patch(id: string, body: any) {
    const r = await fetchWithAuth(`/api/actions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (r.ok) load();
  }
  
  async function complete(id: string) {
    const r = await fetchWithAuth(`/api/actions/${id}/complete`, { method: "POST" });
    if (r.ok) load();
  }
  
  async function archive(id: string) {
    if (!confirm("Archive this action?")) return;
    const r = await fetchWithAuth(`/api/actions/${id}/archive`, { method: "POST" });
    if (r.ok) load();
  }

  async function bulkUpdate(set: any) {
    const ids = Object.keys(selected).filter(k=>selected[k]);
    if (!ids.length) return;
    await fetchWithAuth(`/api/actions/bulk`, {
      method: "POST",
      body: JSON.stringify({ projectId, ids, set })
    });
    load();
  }

  const filtered = items.filter(a =>
    (filterStatus==="any" || (a.status||"open")===filterStatus) &&
    (filterPriority==="any" || (a.priority||"normal")===filterPriority) &&
    (!filterAssignee || (a.assignee||"").toLowerCase().includes(filterAssignee.toLowerCase()))
  );

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="p-3">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <PageHeading title="Actions" crumbs={[{label:"Overview"},{label:"Actions"}]} />
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 border rounded-lg text-sm"
              onClick={() => {
                const pid = getProjectId();
                if (!pid) return;
                const a = document.createElement("a");
                a.href = `/api/exports/actions.csv?projectId=${encodeURIComponent(pid)}`;
                a.download = "";
                document.body.appendChild(a); a.click(); a.remove();
              }}
              data-testid="button-export-actions-csv"
            >
              Export CSV
            </button>
            <label className="text-sm flex items-center gap-2" data-testid="checkbox-show-archived-label">
              <input 
                type="checkbox" 
                checked={showArchived} 
                onChange={e => setShowArchived(e.target.checked)}
                data-testid="checkbox-show-archived"
              />
              Show archived
            </label>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid md:grid-cols-4 gap-2">
          <select 
            className="border rounded px-2 py-1" 
            value={filterStatus} 
            onChange={e=>setFilterStatus(e.target.value)}
            data-testid="filter-status"
          >
            <option value="any">Any status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
            <option value="archived">Archived</option>
          </select>
          <select 
            className="border rounded px-2 py-1" 
            value={filterPriority} 
            onChange={e=>setFilterPriority(e.target.value)}
            data-testid="filter-priority"
          >
            <option value="any">Any priority</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <input 
            className="border rounded px-2 py-1" 
            placeholder="Filter by assignee" 
            value={filterAssignee} 
            onChange={e=>setFilterAssignee(e.target.value)}
            data-testid="filter-assignee"
          />
          <div className="text-sm flex items-center opacity-70">
            {filtered.length} {filtered.length === 1 ? 'action' : 'actions'}
          </div>
        </div>

        {/* Bulk Action Toolbar */}
        {selectedCount > 0 && (
          <div className="p-3 border rounded-xl flex items-center gap-2 bg-muted/30" data-testid="bulk-toolbar">
            <span className="text-sm font-medium">{selectedCount} selected:</span>
            <button 
              className="text-xs px-3 py-1.5 border rounded bg-background hover:bg-muted" 
              onClick={()=>bulkUpdate({ status:"done" })}
              data-testid="bulk-mark-done"
            >
              Mark Done
            </button>
            <button 
              className="text-xs px-3 py-1.5 border rounded bg-background hover:bg-muted" 
              onClick={async()=>{
                const assignee = prompt("Assign to:");
                if (assignee !== null) bulkUpdate({ assignee: assignee || null });
              }}
              data-testid="bulk-assign"
            >
              Assign…
            </button>
            <button 
              className="text-xs px-3 py-1.5 border rounded bg-background hover:bg-muted" 
              onClick={async()=>{
                const due = prompt("Due date (YYYY-MM-DD):");
                if (due === null) return;
                if (due && Number.isNaN(Date.parse(due))) {
                  alert("Invalid date format. Please use YYYY-MM-DD format.");
                  return;
                }
                bulkUpdate({ dueAt: due ? new Date(due).toISOString() : null });
              }}
              data-testid="bulk-set-due"
            >
              Set Due…
            </button>
            <button 
              className="text-xs px-3 py-1.5 border rounded bg-background hover:bg-muted" 
              onClick={()=>bulkUpdate({ priority:"high" })}
              data-testid="bulk-priority-high"
            >
              Priority High
            </button>
            <button 
              className="text-xs px-3 py-1.5 border rounded bg-background hover:bg-muted" 
              onClick={()=>bulkUpdate({ status:"in_progress" })}
              data-testid="bulk-in-progress"
            >
              In Progress
            </button>
            <button 
              className="text-xs px-2 py-1 ml-auto opacity-60 hover:opacity-100" 
              onClick={()=>setSelected({})}
              data-testid="bulk-clear-selection"
            >
              Clear
            </button>
          </div>
        )}

        {loading && <div data-testid="loading-state">Loading…</div>}
        {!loading && !filtered.length && <div className="opacity-70" data-testid="empty-state">No actions to show.</div>}

        <ul className="space-y-3">
          {filtered.map(a => (
            <li key={a.id} className="p-3 border rounded-2xl" data-testid={`action-item-${a.id}`}>
              <div className="flex items-start gap-2 mb-2">
                <input 
                  type="checkbox" 
                  className="mt-2"
                  checked={!!selected[a.id]}
                  onChange={e=>setSelected(s=>({ ...s, [a.id]: e.target.checked }))}
                  data-testid={`checkbox-select-${a.id}`}
                />
                <input
                  className="border rounded px-2 py-1 flex-1"
                  value={a.title}
                  onChange={e => setItems(s => s.map(x => x.id===a.id?{...x, title:e.target.value}:x))}
                  onBlur={e => patch(a.id, { title: e.target.value })}
                  data-testid={`input-title-${a.id}`}
                />
              </div>

              <div className="grid md:grid-cols-4 gap-2 text-sm ml-6">
                <input
                  placeholder="assignee"
                  className="border rounded px-2 py-1"
                  value={a.assignee || ""}
                  onChange={e => setItems(s => s.map(x => x.id===a.id?{...x, assignee:e.target.value}:x))}
                  onBlur={e => patch(a.id, { assignee: e.target.value || null })}
                  data-testid={`input-assignee-${a.id}`}
                />
                <input
                  type="date"
                  className="border rounded px-2 py-1"
                  value={a.dueAt ? a.dueAt.slice(0,10) : ""}
                  onChange={e => setItems(s => s.map(x => x.id===a.id?{...x, dueAt:e.target.value? new Date(e.target.value).toISOString(): null}:x))}
                  onBlur={e => patch(a.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  data-testid={`input-due-date-${a.id}`}
                />
                <select
                  className="border rounded px-2 py-1"
                  value={a.priority || "normal"}
                  onChange={e => { setItems(s=>s.map(x=>x.id===a.id?{...x, priority:e.target.value}:x)); patch(a.id, { priority: e.target.value }); }}
                  data-testid={`select-priority-${a.id}`}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <select
                  className="border rounded px-2 py-1"
                  value={a.status || "open"}
                  onChange={e => { setItems(s=>s.map(x=>x.id===a.id?{...x, status:e.target.value}:x)); patch(a.id, { status: e.target.value }); }}
                  data-testid={`select-status-${a.id}`}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="mt-3 flex items-center gap-2 ml-6">
                <button 
                  className="text-xs px-2 py-1 border rounded-lg" 
                  onClick={() => complete(a.id)}
                  data-testid={`button-mark-done-${a.id}`}
                >
                  Mark Done
                </button>
                <button 
                  className="text-xs px-2 py-1 border rounded-lg" 
                  onClick={() => archive(a.id)}
                  data-testid={`button-archive-${a.id}`}
                >
                  Archive
                </button>
                <a 
                  className="text-xs underline ml-auto" 
                  href={ensureProjectPath(`/docs/${a.docId}`)}
                  data-testid={`link-source-doc-${a.id}`}
                >
                  Open source doc
                </a>
              </div>

              {a.source && <div className="text-xs mt-2 opacity-70 ml-6" data-testid={`text-source-${a.id}`}>source: "{a.source}"</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
