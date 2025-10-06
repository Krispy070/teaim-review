import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { fetchWithAuth } from "@/lib/supabase";
import { Link, useLocation } from "wouter";
import { Eye, RefreshCw, FileSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Doc = {
  id: string; 
  name: string; 
  mime: string;
  sizeBytes: string; 
  summary?: string;
  keywords?: string[];
  createdAt: string;
};

interface DocListProps {
  projectId: string;
}

export interface DocListRef {
  refresh: () => void;
}

const DocList = forwardRef<DocListRef, DocListProps>(({ projectId }, ref) => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; docId?: string; docName?: string }>({ open: false });
  const [extractedData, setExtractedData] = useState<any>(null);
  const [extractedLoading, setExtractedLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/ingest/list?projectId=${encodeURIComponent(projectId)}`);
      const data = await res.json();
      setDocs(data.docs || []);
    } catch (error) {
      console.error("Failed to load docs:", error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteDoc(id: string) {
    try {
      const res = await fetchWithAuth(`/api/ingest/delete/${id}`, { method: "POST" });
      if (res.ok) {
        toast({ title: "Success", description: "Document deleted" });
        load();
      } else {
        toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({ title: "Error", description: "Error deleting document", variant: "destructive" });
    }
  }

  async function reembedDoc(id: string) {
    try {
      const res = await fetchWithAuth(`/api/ingest/reembed/${id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Success", description: `Re-embed queued (job ${data.jobId})` });
      } else {
        toast({ title: "Error", description: `Failed: ${JSON.stringify(data)}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error re-embedding document:", error);
      toast({ title: "Error", description: "Failed to re-embed document", variant: "destructive" });
    }
  }

  async function requeueDoc(id: string) {
    try {
      const res = await fetchWithAuth(`/api/docs/${id}/requeue`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, embed: true, parse: true })
      });
      if (res.ok) {
        toast({ title: "Success", description: "Document requeued for processing" });
      } else {
        toast({ title: "Error", description: "Failed to requeue document", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error requeueing document:", error);
      toast({ title: "Error", description: "Error requeueing document", variant: "destructive" });
    }
  }

  async function loadExtracted(id: string) {
    setExtractedLoading(true);
    try {
      const res = await fetchWithAuth(`/api/docs/${id}/insights?projectId=${projectId}`);
      const data = await res.json();
      if (res.ok) {
        setExtractedData(data);
        setSheetOpen(true);
      } else {
        toast({ title: "Error", description: "Failed to load insights", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error loading insights:", error);
      toast({ title: "Error", description: "Error loading insights", variant: "destructive" });
    } finally {
      setExtractedLoading(false);
    }
  }

  useEffect(() => { 
    load(); 
  }, [projectId]);

  // Expose refresh method via ref
  useImperativeHandle(ref, () => ({
    refresh: load
  }));

  async function exportZip() {
    try {
      const res = await fetchWithAuth(`/api/ingest/export.zip?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) {
        console.error("Failed to export ZIP");
        return;
      }
      // Download the ZIP file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documents-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting ZIP:", error);
    }
  }

  return (
    <div className="mt-4" data-testid="doc-list">
      {loading ? (
        <div data-testid="text-loading">Loading…</div>
      ) : null}
      
      {docs.length > 0 && (
        <div className="mb-3">
          <button 
            className="px-3 py-2 rounded-lg border hover:bg-gray-100"
            onClick={exportZip}
            data-testid="button-export-zip"
          >
            Export All as ZIP
          </button>
        </div>
      )}
      
      <ul className="grid gap-3 md:grid-cols-2">
        {docs.map(d => (
          <li 
            key={d.id} 
            className="p-4 border rounded-2xl"
            data-testid={`doc-item-${d.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium truncate max-w-[50%]" data-testid="text-doc-name">{d.name}</div>
              <div className="flex items-center gap-2">
                <Link 
                  href={`/projects/${projectId}/docs/${d.id}`}
                  data-testid={`button-view-${d.id}`}
                >
                  <button className="text-xs px-2 py-1 border rounded-lg hover:bg-primary/10 hover:border-primary flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    View
                  </button>
                </Link>
                <button 
                  onClick={() => requeueDoc(d.id)} 
                  className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-100 flex items-center gap-1"
                  data-testid={`button-requeue-${d.id}`}
                  title="Requeue for embed & parse"
                >
                  <RefreshCw className="h-3 w-3" />
                  Requeue
                </button>
                <button 
                  onClick={() => loadExtracted(d.id)} 
                  className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-100 flex items-center gap-1"
                  data-testid={`button-extracted-${d.id}`}
                  title="View extracted insights"
                >
                  <FileSearch className="h-3 w-3" />
                  Extracted
                </button>
                <button 
                  onClick={() => setDeleteConfirm({ open: true, docId: d.id, docName: d.name })} 
                  className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-100"
                  data-testid={`button-delete-${d.id}`}
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="text-xs opacity-70 mt-1">
              {d.mime} • {Number(d.sizeBytes).toLocaleString()} bytes • {new Date(d.createdAt).toLocaleString()}
            </div>
            {d.summary && (
              <div className="mt-2 text-sm" data-testid={`text-summary-${d.id}`}>
                {d.summary}
              </div>
            )}
            {!!d.keywords?.length && (
              <div className="mt-2 flex flex-wrap gap-2" data-testid={`keywords-${d.id}`}>
                {d.keywords.slice(0, 6).map(k => (
                  <span key={k} className="text-xs border rounded-full px-2 py-0.5" data-testid={`keyword-${k}`}>
                    {k}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <button 
        className="mt-3 px-3 py-2 rounded-lg border" 
        onClick={load}
        data-testid="button-refresh"
      >
        Refresh
      </button>

      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false })}
        title="Delete Document"
        body={`Are you sure you want to delete "${deleteConfirm.docName}"? This action cannot be undone.`}
        intent="danger"
        onConfirm={async () => {
          if (deleteConfirm.docId) {
            await deleteDoc(deleteConfirm.docId);
            setDeleteConfirm({ open: false });
          }
        }}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Extracted Insights</SheetTitle>
          </SheetHeader>
          {extractedLoading ? (
            <div className="py-4">Loading...</div>
          ) : extractedData ? (
            <div className="py-4 space-y-4">
              {extractedData.actions?.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Actions ({extractedData.actions.length})</h3>
                  <ul className="space-y-2">
                    {extractedData.actions.map((a: any) => (
                      <li key={a.id} className="text-sm p-2 border rounded">
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs opacity-70">
                          {a.assignee && `Assigned to: ${a.assignee}`}
                          {a.dueAt && ` • Due: ${new Date(a.dueAt).toLocaleDateString()}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {extractedData.risks?.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Risks ({extractedData.risks.length})</h3>
                  <ul className="space-y-2">
                    {extractedData.risks.map((r: any) => (
                      <li key={r.id} className="text-sm p-2 border rounded">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs opacity-70">Severity: {r.severity}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {extractedData.timeline?.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Timeline ({extractedData.timeline.length})</h3>
                  <ul className="space-y-2">
                    {extractedData.timeline.map((t: any) => (
                      <li key={t.id} className="text-sm p-2 border rounded">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs opacity-70">
                          {t.startsAt && new Date(t.startsAt).toLocaleDateString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {extractedData.decisions?.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Decisions ({extractedData.decisions.length})</h3>
                  <ul className="space-y-2">
                    {extractedData.decisions.map((dec: any) => (
                      <li key={dec.id} className="text-sm p-2 border rounded">
                        <div className="font-medium">{dec.decision}</div>
                        <div className="text-xs opacity-70">
                          {dec.decidedAt && new Date(dec.decidedAt).toLocaleDateString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!extractedData.actions?.length && !extractedData.risks?.length && 
               !extractedData.timeline?.length && !extractedData.decisions?.length && (
                <div className="text-sm opacity-70">No insights extracted from this document yet.</div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
});

DocList.displayName = "DocList";

export default DocList;
