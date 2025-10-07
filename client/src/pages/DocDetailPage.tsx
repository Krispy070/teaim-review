import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { fetchWithAuth } from "@/lib/supabase";
import PageHeading from "@/components/PageHeading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText, AlertCircle, Eye, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DocDetailPage() {
  const [match, params] = useRoute("/projects/:projectId/docs/:id");
  const [location] = useLocation();
  const docId = params?.id;
  const projectId = params?.projectId;
  
  const focusChunk = new URLSearchParams(location.split('?')[1] || '').get("focusChunk");
  const [doc, setDoc] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("chunks");
  const [wordPreviewHtml, setWordPreviewHtml] = useState<string | null>(null);
  const [wordPreviewLoading, setWordPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      if (!docId) return;
      setLoading(true);
      setError(null);
      
      try {
        const r = await fetchWithAuth(`/api/ingest/detail/${docId}`);
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error || `Failed to load document (${r.status})`);
        }
        const j = await r.json(); 
        setDoc(j.doc);
        
        if (j.doc.signedUrl) {
          setSignedUrl(j.doc.signedUrl);
        }
        
        const r2 = await fetchWithAuth(`/api/docs/chunks?docId=${docId}`);
        if (!r2.ok) {
          const err = await r2.json();
          throw new Error(err.error || `Failed to load chunks (${r2.status})`);
        }
        const j2 = await r2.json(); 
        setChunks(j2.chunks || []);
        
        // Determine default tab: chunks for non-previewable types, original for PDFs
        if (focusChunk) {
          setActiveTab("chunks");
        } else if (j.doc.mime === 'application/pdf' && j.doc.signedUrl && !j.doc.signedUrl.startsWith('/api/')) {
          // Only use original tab for PDFs with Supabase URLs (which work in iframes)
          setActiveTab("original");
        } else {
          // Default to chunks for everything else
          setActiveTab("chunks");
        }
        
        if (focusChunk) {
          setTimeout(() => {
            const el = document.getElementById(`chunk-${focusChunk}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        }
      } catch (e: any) {
        console.error("Error loading document:", e);
        setError(e.message || "Failed to load document");
      } finally {
        setLoading(false);
      }
    })();
  }, [docId, focusChunk]);

  const handleWordPreview = async () => {
    if (!docId) return;
    setWordPreviewLoading(true);
    try {
      const r = await fetchWithAuth(`/api/docs/preview/${docId}`);
      if (!r.ok) throw new Error("Preview failed");
      const html = await r.text();
      setWordPreviewHtml(html);
      setActiveTab("preview");
    } catch (e: any) {
      toast({
        title: "Preview failed",
        description: e.message || "Could not generate preview",
        variant: "destructive"
      });
    } finally {
      setWordPreviewLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!doc || !signedUrl) {
      toast({
        title: "Download unavailable",
        description: "Unable to generate download link for this document",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Use plain fetch for all URLs now (local files have token in URL, Supabase URLs are signed)
      const response = await fetch(signedUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download complete",
        description: `Downloaded ${doc.name}`,
      });
    } catch (e: any) {
      console.error("Download error:", e);
      toast({
        title: "Download failed",
        description: e.message || "Failed to download document",
        variant: "destructive"
      });
    }
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        <span className="text-muted-foreground">Loading document...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="border border-destructive/50 rounded-lg p-6 bg-destructive/5">
        <div className="flex items-center gap-3 mb-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <h3 className="font-medium text-destructive">Error Loading Document</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => window.location.reload()}
          data-testid="button-retry"
        >
          Try Again
        </Button>
      </div>
    </div>
  );

  if (!doc) return (
    <div className="p-6">
      <div className="text-center text-muted-foreground">Document not found</div>
    </div>
  );

  return (
    <div className="p-3">
      <div className="p-6 space-y-3">
        <div className="flex items-start justify-between">
          <PageHeading 
            title={doc.name} 
            crumbs={[
              {label:"Overview"},
              {label:"Documents", href:`/projects/${projectId}/docs`},
              {label:doc.name}
            ]} 
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!signedUrl}
            data-testid="button-download"
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
        
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {doc.mime}
          </div>
          <div>•</div>
          <div>{Number(doc.sizeBytes).toLocaleString()} bytes</div>
          {chunks.length > 0 && (
            <>
              <div>•</div>
              <div>{chunks.length} {chunks.length === 1 ? 'chunk' : 'chunks'}</div>
            </>
          )}
        </div>

        <div className="flex gap-2 mt-2">
          <a 
            className="px-3 py-2 border rounded-lg text-sm hover:bg-accent" 
            href={`/api/docs/preview/${docId}`} 
            target="_blank" 
            rel="noopener noreferrer"
            data-testid="link-open-preview"
          >
            Open Preview
          </a>
          <button
            className="px-3 py-2 border rounded-lg text-sm hover:bg-accent"
            onClick={() => setShowPreview(s => !s)}
            data-testid="button-toggle-inline-preview"
          >
            {showPreview ? "Hide Inline Preview" : "Show Inline Preview"}
          </button>
        </div>

        {showPreview && (
          <div className="mt-4 border rounded-2xl overflow-hidden">
            <iframe
              src={`/api/docs/preview/${docId}?mode=embed`}
              className="w-full h-[70vh]"
              title={`${doc.name} preview`}
              data-testid="iframe-inline-preview"
            />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList>
            <TabsTrigger value="original" data-testid="tab-original">
              <Eye className="h-4 w-4 mr-2" />
              Original
            </TabsTrigger>
            <TabsTrigger value="chunks" data-testid="tab-chunks">
              <List className="h-4 w-4 mr-2" />
              Chunks
            </TabsTrigger>
            {(doc.mime.includes('word') || doc.mime.includes('document')) && (
              <TabsTrigger value="preview" data-testid="tab-preview">
                <FileText className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="original" className="mt-4">
            {signedUrl ? (
              doc.mime === 'application/pdf' || doc.mime === 'text/plain' ? (
                <div className="border rounded-lg overflow-hidden" style={{ height: '80vh' }}>
                  <iframe
                    src={signedUrl}
                    className="w-full h-full"
                    title={doc.name}
                    data-testid="iframe-document"
                  />
                </div>
              ) : (
                <div className="border border-dashed rounded-lg p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <div className="text-base font-medium mb-2">
                    Preview not available for this file type
                  </div>
                  <div className="text-sm text-muted-foreground mb-4">
                    {doc.mime.includes('word') || doc.mime.includes('document') 
                      ? 'Use the Preview tab for Word documents or switch to Chunks tab.'
                      : 'This file type cannot be previewed directly. Use the Download button above or switch to the Chunks tab.'}
                  </div>
                  <div className="flex gap-3 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      disabled={!signedUrl}
                      data-testid="button-download-inline"
                      className="flex items-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Download File
                    </Button>
                    {(doc.mime.includes('word') || doc.mime.includes('document')) && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleWordPreview}
                        disabled={wordPreviewLoading}
                        data-testid="button-word-preview"
                        className="flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        {wordPreviewLoading ? 'Loading...' : 'Preview Word Doc'}
                      </Button>
                    )}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setActiveTab("chunks")}
                      data-testid="button-view-chunks"
                      className="flex items-center gap-2"
                    >
                      <List className="h-4 w-4" />
                      View Chunks
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div className="border border-dashed rounded-lg p-8 text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  Unable to display original document
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  The document file may not be available or supported for preview
                </div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="preview" className="mt-4">
            {wordPreviewHtml ? (
              <div 
                className="border rounded-lg p-6 prose prose-sm max-w-none bg-white dark:bg-gray-900"
                dangerouslySetInnerHTML={{ __html: wordPreviewHtml }}
                data-testid="word-preview-content"
              />
            ) : (
              <div className="border border-dashed rounded-lg p-8 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <div className="text-base font-medium mb-2">
                  Word Document Preview
                </div>
                <div className="text-sm text-muted-foreground mb-4">
                  Click the button below to load the preview
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleWordPreview}
                  disabled={wordPreviewLoading}
                  data-testid="button-load-preview"
                  className="flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  {wordPreviewLoading ? 'Loading Preview...' : 'Load Preview'}
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="chunks" className="mt-4">
            <ul className="space-y-2">
              {chunks.map((c:any) => {
                const focused = String(c.id) === String(focusChunk);
                return (
                  <li 
                    key={c.id} 
                    id={`chunk-${c.id}`} 
                    className={`p-4 border rounded-lg transition-all ${
                      focused 
                        ? "ring-2 ring-primary border-primary bg-primary/5" 
                        : "hover:border-muted-foreground/30"
                    }`}
                    data-testid={`chunk-${c.id}`}
                  >
                    <div className="text-[11px] text-muted-foreground mb-2">
                      Chunk #{c.chunkIndex}
                    </div>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{c.chunk}</div>
                  </li>
                );
              })}
              {!chunks.length && (
                <li className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center">
                  <div className="mb-2">📄</div>
                  <div>Full text not chunked yet.</div>
                  <div className="text-xs mt-1">The embedding worker is processing this document. Try again shortly.</div>
                </li>
              )}
            </ul>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
