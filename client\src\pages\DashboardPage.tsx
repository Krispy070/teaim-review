import { useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import ChatDock from "@/components/ChatDock";
import { usePersistProjectId } from "@/lib/projectCtx";

export default function DashboardPage() {
  const [orgId, setOrgId] = useState('d915376c-2bd7-4e79-b9c9-aab9d7fcb5a8');
  const [projectId, setProjectId] = useState('dced0b98-87b4-46ff-b2a4-2cf8e627e8d2');
  usePersistProjectId(projectId);

  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <Header 
        orgId={orgId}
        projectId={projectId}
        onOrgIdChange={setOrgId}
        onProjectIdChange={setProjectId}
      />
      <div className="flex h-[calc(100vh-80px)]">
        <Sidebar />
        <Dashboard orgId={orgId} projectId={projectId} />
      </div>
      <ChatDock orgId={orgId} projectId={projectId} />
    </div>
  );
}
