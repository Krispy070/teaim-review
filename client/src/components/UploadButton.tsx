import { useRef, useState } from "react";

interface UploadButtonProps {
  orgId?: string;
  projectId?: string;
}

export default function UploadButton({ orgId, projectId }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    
    if (!orgId || !projectId) { 
      alert('Set org_id and project_id first'); 
      return; 
    }
    
    const fd = new FormData();
    fd.append('org_id', orgId);
    fd.append('project_id', projectId);
    fd.append('source', 'doc');
    fd.append('file', f);
    
    setBusy(true);
    
    try {
      const res = await fetch('/api/ingest-sync', { method: 'POST', body: fd });
      
      if (!res.ok) {
        let errorMessage = 'Upload failed. Please try again.';
        try {
          const errorData = await res.json();
          if (res.status === 429) {
            errorMessage = 'Rate limit exceeded. Please wait before uploading again.';
          } else if (res.status === 400) {
            errorMessage = `Upload error: ${errorData.detail || 'Invalid file or parameters.'}`;
          } else if (res.status === 500) {
            errorMessage = `Server error: ${errorData.detail || 'Please try again later.'}`;
          } else {
            errorMessage = errorData.detail || errorData.error || 'Upload failed.';
          }
        } catch {
          errorMessage = `Upload failed (${res.status}). Please try again.`;
        }
        alert(errorMessage);
        return;
      }
      
      try {
        const js = await res.json();
        alert(`Successfully uploaded: ${f.name}\nArtifact ID: ${js.artifact_id || 'N/A'}\nChunks: ${js.chunks || 0}`);
      } catch {
        alert(`File uploaded successfully: ${f.name}`);
      }
    } catch (e) {
      alert('Connection failed. Please check if the API is running and try again.');
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <>
      <input 
        ref={inputRef} 
        type="file" 
        className="hidden" 
        onChange={onPick}
        data-testid="file-input"
      />
      <button 
        onClick={() => inputRef.current?.click()} 
        disabled={busy} 
        className="px-3 py-1.5 border rounded-full text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        data-testid="upload-button"
      >
        {busy ? 'Uploading…' : 'Upload Document'}
      </button>
    </>
  );
}