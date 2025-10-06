import { useParams } from "wouter";
import ProgramTimeline from "@/components/ProgramTimeline";
import PageHeading from "@/components/PageHeading";

export default function TimelinePage(){
  const params = useParams();
  const projectId = params.projectId;
  return (
    <div className="p-3">
      <PageHeading title="Timeline" crumbs={[{label:"Overview"},{label:"Timeline"}]} />
      <ProgramTimeline projectId={projectId!} />
    </div>
  );
}