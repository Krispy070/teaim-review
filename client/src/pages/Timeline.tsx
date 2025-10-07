import { useLocation } from "wouter";
import ProgramTimeline from "@/components/ProgramTimeline";
import PageHeading from "@/components/PageHeading";

export default function TimelinePage(){
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  return (
    <div className="p-3">
      <PageHeading title="Timeline" crumbs={[{label:"Overview"},{label:"Timeline"}]} />
      <ProgramTimeline projectId={projectId!} />
    </div>
  );
}