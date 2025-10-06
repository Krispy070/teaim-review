import { useState } from "react";
import { useLocation } from "wouter";
import { fetchWithAuth } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function IngestDoc() {
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const projectId = location.split('/')[2];
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", projectId || "");

      const res = await fetchWithAuth("/api/ingest/doc", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Upload failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      setUploadStatus(
        `✅ ${data.filename} uploaded successfully! ${data.chunks_created} chunks created.`
      );
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/docs/list", projectId] });
    },
    onError: (error: Error) => {
      setUploadStatus(`❌ Upload failed: ${error.message}`);
    },
  });

  const { data: docsData, isLoading } = useQuery({
    queryKey: ["/api/docs/list", projectId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/docs/list?project_id=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!projectId,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus("");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    uploadMutation.mutate(selectedFile);
  };

  const documents = docsData?.documents || [];

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Document Ingestion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="file-upload"
              className="block text-sm font-medium"
            >
              Select Document
            </label>
            <input
              id="file-upload"
              type="file"
              onChange={handleFileSelect}
              accept=".pdf,.docx,.txt,.doc"
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              data-testid="input-file-upload"
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploadMutation.isPending}
            className="w-full"
            data-testid="button-upload"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload Document
              </>
            )}
          </Button>

          {uploadStatus && (
            <div
              className={`p-3 rounded-md text-sm ${
                uploadStatus.startsWith("✅")
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
              data-testid="text-upload-status"
            >
              {uploadStatus.startsWith("✅") ? (
                <CheckCircle className="w-4 h-4 inline mr-2" />
              ) : (
                <AlertCircle className="w-4 h-4 inline mr-2" />
              )}
              {uploadStatus}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Uploaded Documents ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-8">
              No documents uploaded yet. Upload your first document above.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                  data-testid={`card-document-${doc.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()} • {doc.chunks_count || 0} chunks
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {doc.mime_type}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
