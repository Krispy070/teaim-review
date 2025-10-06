import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";

export default function ReleaseTestsPage() {
  const { id: releaseId } = useParams();
  const [location] = useLocation();
  const pid = getProjectId();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("");
  const [status, setStatus] = useState("");
  const [reqOnly, setReqOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const [order, setOrder] = useState<"createdAt"|"dueAt"|"status"|"title">("createdAt");
  const [dir, setDir] = useState<"asc"|"desc">("desc");
  const [msg, setMsg] = useState("");
  const [, navigate] = useLocation();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const ids = Object.keys(sel).filter(k => sel[k]);
  const [bulkStatus, setBulkStatus] = useState("in_progress");

  useEffect(() => {
    if (location) {
      const qp = new URLSearchParams(location.split('?')[1]);
      const m = qp.get("module");
      if (m) setMod(m);
    }
    
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem("release_tests_filters");
      if (saved) {
        try {
          const s = JSON.parse(saved);
          if (s.mod) setMod(s.mod);
          if (s.status) setStatus(s.status);
          if (s.reqOnly !== undefined) setReqOnly(s.reqOnly);
          if (s.search) setSearch(s.search);
          if (s.owner) setOwner(s.owner);
          if (s.order) setOrder(s.order);
          if (s.dir) setDir(s.dir);
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem("release_tests_filters", JSON.stringify({ mod, status, reqOnly, search, owner, order, dir }));
    }
  }, [mod, status, reqOnly, search, owner, order, dir]);

  async function load() {
    if (!pid || !releaseId) return;
    const params = new URLSearchParams({
      projectId: pid,
      limit: "100",
      offset: "0",
      order,
      dir,
      ...(mod && { module: mod }),
      ...(status && { status }),
      ...(reqOnly && { requiredOnly: "1" }),
      ...(search && { search }),
      ...(owner && { owner })
    });
    
    const r = await fetchWithAuth(`/api/releases/${releaseId}/tests?${params}`);
    const j = await r.json();
    if (r.ok) {
      setItems(j.items || []);
      setMsg("");
    } else {
      setMsg(j.error || "load failed");
    }
  }

  useEffect(() => {
    load();
  }, [mod, status, reqOnly, search, owner, order, dir, releaseId]);

  const reqCount = items.filter(t=>t.isRequired).length;

  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Release Tests</h1>
            <span className="text-xs px-2 py-1 border rounded bg-muted/10" data-testid="badge-required-count">
              {reqCount} required
            </span>
          </div>
          <button
            className="text-xs px-2 py-1 border rounded"
            onClick={() => navigate(`/projects/${pid}/releases`)}
            data-testid="button-back"
          >
            Back
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] mb-2">
          <span className="opacity-70 mr-1">Modules:</span>
          {["HCM","Absence","Payroll","Time","Benefits","FIN","Security","Integrations","Custom"].map(m=>(
            <button key={m}
              className={`px-2 py-0.5 border rounded ${mod===m?"bg-slate-800":""}`}
              onClick={()=> setMod(prev=> prev===m ? "" : m)}
              data-testid={`chip-module-${m}`}>
              {m}
            </button>
          ))}
          {mod && <button className="px-2 py-0.5 border rounded" onClick={()=>setMod("")} data-testid="chip-module-clear">Clear</button>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Search title/module..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search"
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Owner..."
            value={owner}
            onChange={e => setOwner(e.target.value)}
            data-testid="input-owner"
          />
          <select
            className="border rounded px-2 py-1 text-sm"
            value={mod}
            onChange={e => setMod(e.target.value)}
            data-testid="select-module"
          >
            <option value="">All modules</option>
            <option>HCM</option>
            <option>Absence</option>
            <option>Payroll</option>
            <option>Time</option>
            <option>Benefits</option>
            <option>FIN</option>
            <option>Security</option>
            <option>Integrations</option>
            <option>Custom</option>
          </select>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={status}
            onChange={e => setStatus(e.target.value)}
            data-testid="select-status"
          >
            <option value="">All status</option>
            <option>planned</option>
            <option>in_progress</option>
            <option>blocked</option>
            <option>passed</option>
            <option>failed</option>
          </select>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={order}
            onChange={e => setOrder(e.target.value as any)}
            data-testid="select-order"
          >
            <option value="createdAt">Sort: created</option>
            <option value="dueAt">Sort: due</option>
            <option value="status">Sort: status</option>
            <option value="title">Sort: title</option>
          </select>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={dir}
            onChange={e => setDir(e.target.value as any)}
            data-testid="select-dir"
          >
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </select>
          <a 
            className="text-xs px-2 py-1 border rounded ml-auto"
            href={`/api/releases/${releaseId}/tests/export.csv?${new URLSearchParams({
              projectId: pid!,
              ...(mod && { module: mod }),
              ...(status && { status }),
              ...(reqOnly && { requiredOnly: "1" }),
              ...(search && { search }),
              ...(owner && { owner }),
              order,
              dir
            }).toString()}`}
            data-testid="link-export-csv"
          >
            Export CSV
          </a>
        </div>

        {/* Quick sort chips */}
        <div className="flex items-center gap-2 text-[11px] mb-2">
          <span className="opacity-70">Sort:</span>
          {["createdAt","dueAt","status","title"].map((k)=>(
            <button
              key={k}
              className={`px-2 py-0.5 border rounded ${order===k ? "bg-slate-800" : ""}`}
              onClick={()=> setOrder(k as any)}
              title={`Sort by ${k}`}
              data-testid={`chip-sort-${k}`}
            >
              {k}
            </button>
          ))}
          <button
            className="px-2 py-0.5 border rounded"
            onClick={()=> setDir(dir==="asc" ? "desc" : "asc")}
            title="Toggle asc/desc"
            data-testid="chip-sort-dir"
          >
            {dir==="asc" ? "↑ asc" : "↓ desc"}
          </button>
          <button
            className={`px-2 py-0.5 border rounded ${reqOnly?"bg-slate-800":""}`}
            onClick={()=> setReqOnly(v=>!v)}
            data-testid="chip-required-only"
          >
            Required only
          </button>
        </div>

        <div className="text-xs opacity-70" data-testid="text-message">{msg}</div>
        
        <label className="text-[11px] flex items-center gap-1 mb-1">
          <input type="checkbox" onChange={e => {
            const checked = e.target.checked;
            const next: { [k: string]: boolean } = { ...sel };
            items.forEach(t => next[t.id] = checked);
            setSel(next);
          }} data-testid="checkbox-select-all"/>
          Select all (filtered)
        </label>

        {ids.length > 0 && (
          <div className="p-2 border rounded-2xl flex items-center gap-2 bg-muted/10 mb-2" data-testid="bulk-toolbar">
            <span className="text-xs">Selected: {ids.length}</span>
            <select className="border rounded px-2 py-1 text-xs" value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} data-testid="select-bulk-status">
              <option>planned</option>
              <option>in_progress</option>
              <option>blocked</option>
              <option>passed</option>
              <option>failed</option>
            </select>
            <button className="text-xs px-2 py-1 border rounded" onClick={async () => {
              await fetchWithAuth(`/api/releases/${releaseId}/tests/bulk`, { method: "POST", body: JSON.stringify({ projectId: pid, ids, set: { status: bulkStatus } }) });
              setSel({}); load();
            }} data-testid="button-set-status">Set status</button>
            <button className="text-xs px-2 py-1 border rounded" title="All filtered" onClick={async () => {
              await fetchWithAuth(`/api/releases/${releaseId}/tests/bulk-by-filter`, {
                method: "POST", body: JSON.stringify({ projectId: pid, filter: { module: mod || undefined, status: status || undefined, requiredOnly: reqOnly || undefined }, set: { status: bulkStatus } })
              });
              setSel({}); load();
            }} data-testid="button-set-status-filtered">Set status (filtered)</button>
            <button className="text-xs px-2 py-1 border rounded" onClick={() => setSel({})} data-testid="button-clear-selection">Clear</button>
          </div>
        )}
        
        <div className="border rounded-2xl overflow-auto">
          <table className="text-sm min-w-[900px] w-full">
            <thead className="bg-slate-900/40 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">☑</th>
                <th className="text-left px-2 py-1">Module</th>
                <th className="text-left px-2 py-1">Title</th>
                <th className="text-left px-2 py-1">Owner</th>
                <th className="text-left px-2 py-1">Due</th>
                <th className="text-left px-2 py-1">Status</th>
                <th className="text-left px-2 py-1">Req</th>
              </tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t.id} className="border-b border-slate-800" data-testid={`row-test-${t.id}`}>
                  <td className="px-2 py-1">
                    <input type="checkbox" checked={!!sel[t.id]} onChange={e => setSel(s => ({ ...s, [t.id]: e.target.checked }))} data-testid={`checkbox-select-${t.id}`}/>
                  </td>
                  <td className="px-2 py-1">{t.module}</td>
                  <td className="px-2 py-1">{t.title}</td>
                  <td className="px-2 py-1">{t.owner || "—"}</td>
                  <td className="px-2 py-1">{t.dueAt ? new Date(t.dueAt).toLocaleDateString() : ""}</td>
                  <td className="px-2 py-1">{t.status}</td>
                  <td className="px-2 py-1">
                    <input type="checkbox" defaultChecked={!!t.isRequired} onChange={async e=>{
                      const r=await fetchWithAuth(`/api/releases/test/${t.id}/required`, { method:"POST", body: JSON.stringify({ projectId: pid, isRequired: e.target.checked }) });
                      if (!r.ok) alert("Failed");
                    }} data-testid={`checkbox-required-${t.id}`}/>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td className="px-2 py-2 text-xs opacity-70" colSpan={7} data-testid="text-no-tests">
                    No tests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
