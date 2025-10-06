import { useRef } from "react";
import DocUploader from "@/components/docs/DocUploader";
import DocList from "@/components/docs/DocList";
import DocSearch from "@/components/docs/DocSearch";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DocsPage() {
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  const docListRef = useRef<{ refresh: () => void }>(null);
  
  // TODO: pull real orgId from context; using dev/default for now:
  const orgId = "d915376c-2bd7-4e79-b9c9-aab9d7fcb5a8";
  
  // Use projectId from URL params or fallback to default
  const effectiveProjectId = projectId || "e1ec6ad0-a4e8-45dd-87b0-e123776ffe6e";
  
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold" data-testid="heading-docs">Documents</h1>
      
      <Tabs defaultValue="upload" className="w-full">
          <TabsList>
            <TabsTrigger value="upload" data-testid="tab-upload">Upload & Manage</TabsTrigger>
            <TabsTrigger value="search" data-testid="tab-search">Search</TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="space-y-4">
            <DocUploader 
              orgId={orgId} 
              projectId={effectiveProjectId}
              onUploadSuccess={() => docListRef.current?.refresh()}
            />
            <DocList ref={docListRef} projectId={effectiveProjectId} />
          </TabsContent>
          
          <TabsContent value="search" className="space-y-4">
            <DocSearch projectId={effectiveProjectId} />
          </TabsContent>
        </Tabs>
    </div>
  );
}
