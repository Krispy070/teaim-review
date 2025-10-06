import { Link, useLocation, useParams } from "wouter";

const labelMap: Record<string,string> = {
  dashboard: "Dashboard",
  timeline: "Timeline",
  documents: "Documents",
  meetings: "Meeting Summaries",
  "actions/kanban": "Actions Kanban",
  "actions/list": "Actions",
  stages: "Stage Sign-Off",
  "stages/manage": "Stages",
  "stages/wizard": "Stage Wizard",
  "signoff/compose": "Compose Sign-Off Package",
  "signoff/docs": "Sign-Off Docs",
  integrations: "Integrations & Tech",
  reporting: "Data & Reporting",
  wellness: "Team Wellness",
  financials: "Financials",
  "updates/review": "PM Update Monitor",
  "admin/ops": "System Health",
  "admin/method": "Method Insights",
  "admin/audit-timeline": "Audit Timeline",
  "admin/projects": "Projects Admin",
  "admin/members": "Members",
  "admin/team-access": "Team Management",
  "admin/invite": "Invite",
  "admin/integrations": "Integrations Tracker",
  "admin/backups": "Admin Backups",
  "admin/rls-selftest": "RLS Self-Test",
  "admin/qa-tools": "QA Tools",
  "admin/smoke-run": "Smoke Runner",
  "admin/comms": "Email Center",
};

function findLabel(pathname: string): string {
  // strip /projects/:id/
  const m = pathname.match(/\/projects\/[^/]+\/(.+)/);
  const key = m ? m[1] : "";
  // try exact, then trim segments
  if (labelMap[key]) return labelMap[key];
  const parts = key.split("/");
  while (parts.length) {
    const k = parts.join("/");
    if (labelMap[k]) return labelMap[k];
    parts.pop();
  }
  return "Overview";
}

export default function HeaderCrumbs({ projectLabel }:{ projectLabel?: string }){
  const [location] = useLocation();
  const { projectId } = useParams();
  const page = findLabel(location);

  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1">
      <Link to={`/projects/${projectId}/dashboard`} className="underline">Project {projectLabel || (projectId?.slice(0,8) || "")}</Link>
      <span>›</span>
      <span>{page}</span>
    </div>
  );
}