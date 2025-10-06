import { useLocation } from "wouter";
import { apiPost } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function ProjectQATools(){
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  const { toast } = useToast();
  const [busy,setBusy] = useState(false);

  async function seed(){
    setBusy(true);
    toast({ title: "Seeding sample docs…", description: "SOW + CO + Kickoff + Sign-off package" });
    
    // Defensive check and extract projectId from URL if params fail
    let finalProjectId = projectId;
    if (!finalProjectId) {
      const pathParts = window.location.pathname.split('/');
      const projectIndex = pathParts.indexOf('projects');
      if (projectIndex !== -1 && pathParts[projectIndex + 1]) {
        finalProjectId = pathParts[projectIndex + 1];
      }
    }
    
    console.log("Using projectId for seeding:", finalProjectId);
    
    if (!finalProjectId) {
      toast({ title: "Error", description: "Project ID not found", variant: "destructive" });
      setBusy(false);
      return;
    }
    
    try {
      const d = await apiPost("/dev/seed-simple", undefined, { project_id: finalProjectId });
      toast({ title: "Seeded", description: `${d.count} docs ingested` });
    } catch (e:any) {
      toast({ title: "Seed failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-xl" data-testid="qa-tools-page">
      <h1 className="text-xl font-semibold">QA Tools</h1>
      <p className="text-sm text-muted-foreground">One-click demo data for end-to-end smoke tests.</p>
      <button 
        disabled={busy} 
        className="px-3 py-2 rounded border" 
        onClick={seed}
        data-testid="seed-button"
      >
        {busy ? "Seeding…" : "Seed Sample Project Docs"}
      </button>
    </div>
  );
}