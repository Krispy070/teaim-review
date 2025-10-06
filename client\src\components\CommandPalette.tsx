import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

type Cmd = { label: string; path: string; group: string };

const ROUTES: Cmd[] = [
  // Overview
  { label: "Dashboard", path: "dashboard", group:"Overview" },
  { label: "Timeline", path: "timeline", group:"Overview" },

  // Execution
  { label: "Documents", path: "documents", group:"Execution" },
  { label: "Meeting Summaries", path: "meetings", group:"Execution" },
  { label: "Actions Kanban", path: "actions/kanban", group:"Execution" },
  { label: "Actions", path: "actions/list", group:"Execution" },
  { label: "Stage Sign-Off", path: "stages", group:"Execution" },
  { label: "Compose Sign-Off Package", path: "signoff/compose", group:"Execution" },
  { label: "Integrations & Tech", path: "integrations", group:"Execution" },
  { label: "Data & Reporting", path: "reporting", group:"Execution" },
  { label: "Team Wellness", path: "wellness", group:"Execution" },
  { label: "Financials", path: "financials", group:"Execution" },

  // Planning
  { label: "Stages", path: "stages/manage", group:"Planning" },
  { label: "Stage Wizard", path: "stages/wizard", group:"Planning" },
  { label: "Workstreams", path: "workstreams", group:"Planning" },
  { label: "Training", path: "training", group:"Planning" },
  { label: "Testing", path: "testing", group:"Planning" },
  { label: "Logistics", path: "logistics", group:"Planning" },

  // Governance
  { label: "PM Update Monitor", path: "updates/review", group:"Governance" },
  { label: "Sign-Off Docs", path: "signoff/docs", group:"Governance" },

  // Insights
  { label: "Method Insights", path: "admin/method", group:"Insights" },
  { label: "Audit Timeline", path: "admin/audit-timeline", group:"Insights" },

  // Admin
  { label: "Projects Admin", path: "admin/projects", group:"Admin" },
  { label: "Members", path: "admin/members", group:"Admin" },
  { label: "Team Management", path: "admin/team-access", group:"Admin" },
  { label: "Invite", path: "admin/invite", group:"Admin" },
  { label: "Integrations Tracker", path: "admin/integrations", group:"Admin" },
  { label: "Admin Backups", path: "admin/backups", group:"Admin" },
  { label: "System Health", path: "admin/ops", group:"Admin" },
  { label: "RLS Self-Test", path: "admin/rls-selftest", group:"Admin" },
  { label: "Schema Doctor", path: "admin/schema-doctor", group:"Admin" },
  { label: "QA Tools", path: "admin/qa-tools", group:"Admin" },
  { label: "Smoke Runner", path: "admin/smoke-run", group:"Admin" },
  { label: "Email Center", path: "admin/comms", group:"Admin" },
  { label: "New Project", path: "/projects/new", group:"Admin" }, // absolute
];

function fuseScore(s:string, q:string){
  // simple fuzzy: each query char must appear in order
  s=s.toLowerCase(); q=q.toLowerCase();
  let i=0; for (const c of q){ i=s.indexOf(c, i); if (i===-1) return false; i++; }
  return true;
}

export default function CommandPalette(){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [selectedIndex,setSelectedIndex]=useState(0);
  const [location, navigate] = useLocation();
  
  // Get projectId from URL pathname (works with both react-router and wouter)
  const pathSegments = location.split('/');
  const projectIndex = pathSegments.indexOf('projects');
  const projectId = projectIndex >= 0 && projectIndex < pathSegments.length - 1 
    ? pathSegments[projectIndex + 1] 
    : 'e1ec6ad0-a4e8-45dd-87b0-e123776ffe6e'; // fallback to current project

  const hits = useMemo(()=>{
    if (!q.trim()) return ROUTES;
    return ROUTES.filter(r => fuseScore(r.label, q));
  },[q]);

  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      const cmd = (e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k";
      if (cmd){ e.preventDefault(); setOpen(true); }
      if (e.key==="Escape"){ setOpen(false); }
      
      // Arrow navigation and Enter selection when palette is open
      if (open) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(hits.length - 1, prev + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
        } else if (e.key === "Enter" && hits[selectedIndex]) {
          e.preventDefault();
          go(hits[selectedIndex]);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return ()=>window.removeEventListener("keydown", onKey);
  },[open, selectedIndex, hits]);

  // Reset selection when hits change
  useEffect(() => {
    setSelectedIndex(0);
  }, [hits]);

  function go(r: Cmd){
    setOpen(false);
    setQ("");
    setSelectedIndex(0);
    const isAbs = r.path.startsWith("/");
    navigate(isAbs ? r.path : `/projects/${projectId || "select"}/${r.path}`);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-[200]" onClick={()=>setOpen(false)} data-testid="command-palette-overlay">
      <div className="mx-auto mt-[10vh] w-[640px] max-w-[90%] bg-white dark:bg-neutral-900 rounded shadow-xl border" onClick={e=>e.stopPropagation()}>
        <div className="p-2 border-b">
          <input
            autoFocus
            placeholder="Go to… (try: timeline, actions, sign-off) • Use ↑↓ to navigate, Enter to select"
            className="w-full p-2 text-sm border rounded"
            value={q} onChange={e=>setQ(e.target.value)}
            data-testid="command-palette-input"
          />
        </div>
        <div className="max-h-[50vh] overflow-auto">
          {["Overview","Execution","Planning","Governance","Insights","Admin"].map(g=>{
            const groupHits = hits.filter(h=>h.group===g);
            if (groupHits.length === 0) return null;
            return (
              <div key={g}>
                <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-gray-400">{g}</div>
                {groupHits.map((r, groupIndex) => {
                  const globalIndex = hits.indexOf(r);
                  const isSelected = globalIndex === selectedIndex;
                  return (
                    <button key={r.label} 
                            className={`w-full text-left px-2 py-1 transition-colors ${
                              isSelected 
                                ? 'bg-blue-100 dark:bg-blue-900/30 border-l-2 border-blue-500' 
                                : 'hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                            onClick={()=>go(r)}
                            data-testid={`command-palette-item-${r.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <div className="text-sm">{r.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.path.startsWith("/") ? r.path : `/projects/:projectId/${r.path}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}