import { useState, useRef } from "react";
import { authFetch } from "@/lib/authFetch";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useProject } from "@/contexts/ProjectContext";

interface DocUploaderProps {
  orgId: string;
  projectId?: string;
  onUploadSuccess?: () => void;
}

export default function DocUploader({ orgId, projectId: propProjectId, onUploadSuccess }: DocUploaderProps) {
  const { selectedProject } = useProject();
  const projectId = propProjectId || selectedProject?.id || "";
  const [status, setStatus] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fileInput = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const files = fileInput?.files;
    if (!files || files.length === 0) return;

    console.log("📤 Starting upload with orgId:", orgId, "projectId:", projectId);

    // Validate projectId
    if (!projectId || projectId === "select" || projectId.length < 10) {
      setStatus("❌ Please select a valid project first");
      setTimeout(() => setStatus(""), 5000);
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    let lastError = "";

    // Check for duplicate filenames first
    const duplicates: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const checkRes = await authFetch(
          `/api/ingest/check-filename?project_id=${encodeURIComponent(projectId)}&filename=${encodeURIComponent(file.name)}`
        );
        const checkData = await checkRes.json();
        if (checkData.exists) {
          duplicates.push(file.name);
        }
      } catch (error) {
        console.warn("Failed to check for duplicates:", error);
      }
    }

    // If duplicates found, show warning and abort
    if (duplicates.length > 0) {
      setUploading(false);
      setStatus(
        `⚠️ Cannot upload: ${duplicates.length} file(s) already exist in this project. Please rename these files to avoid duplicates: ${duplicates.join(", ")}`
      );
      setTimeout(() => setStatus(""), 12000);
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Uploading ${i + 1}/${files.length}: ${file.name}...`);

      const fd = new FormData();
      fd.append("file", file);
      fd.append("orgId", orgId);
      fd.append("projectId", projectId);

      try {
        const res = await authFetch("/api/ingest/doc", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          console.error("Upload failed for", file.name, ":", data);
          lastError = data.message || data.error || data.detail || "Unknown error";
          failCount++;
        } else {
          console.log("✅ Uploaded:", file.name);
          successCount++;
        }
      } catch (error: any) {
        console.error("Upload error for", file.name, ":", error);
        lastError = error.message || "Network error";
        failCount++;
      }
    }

    setUploading(false);
    if (failCount === 0) {
      setStatus(`✅ Successfully uploaded ${successCount} document(s)`);
      formRef.current?.reset();
    } else if (successCount === 0) {
      setStatus(`❌ Upload failed: ${lastError}`);
    } else {
      setStatus(`⚠️ Uploaded ${successCount}, failed ${failCount}: ${lastError}`);
    }
    
    if (onUploadSuccess && successCount > 0) onUploadSuccess();
    
    setTimeout(() => setStatus(""), 10000);
  }

  return (
    <div className="rounded-2xl border p-4 mb-4" data-testid="container-doc-uploader">
      <div className="font-semibold text-slate-700 mb-3">Upload Documents</div>
      <form ref={formRef} onSubmit={onSubmit} className="flex items-center gap-3" data-testid="form-doc-upload">
        <input 
          type="file" 
          name="file"
          multiple
          accept=".pdf,.docx,.txt,.doc"
          className="block text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
          data-testid="input-file"
          disabled={uploading}
        />
        <Button 
          type="submit"
          disabled={uploading}
          className="flex items-center gap-2"
          data-testid="button-upload"
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Uploading..." : "Upload"}
        </Button>
      </form>
      {status && (
        <div className="text-sm mt-3 text-slate-600" data-testid="text-upload-status">
          {status}
        </div>
      )}
    </div>
  );
}
