import { useEffect, useState, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, Upload } from "lucide-react";

export default function GuideEditor({projectId,area,initial,onClose}:{projectId:string;area?:string;initial?:any;onClose:()=>void}){
  const [g,setG]=useState<any>(initial||{title:"", area, owner:"", tags:[], steps:[""], status:"draft"});
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  function setStep(i:number, val:string){ setG((s:any)=>{ const a=[...(s.steps||[])]; a[i]=val; return {...s, steps:a}; }); }
  function addStep(){ setG((s:any)=> ({...s, steps:[...(s.steps||[]), ""]})); }
  function remStep(i:number){ setG((s:any)=> ({...s, steps:(s.steps||[]).filter((_:any,idx:number)=>idx!==i)})); }
  const { toast } = useToast();

  // File upload handler
  async function handleFileUpload(stepIndex: number, file: File) {
    if (!file) return;
    
    setUploadingStep(stepIndex);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // Use apiRequest with FormData for proper auth handling
      const result = await apiRequest('POST', `/api/guides/upload?project_id=${projectId}`, formData);
      
      // Insert markdown into the step at current cursor position or append
      const currentStep = g.steps[stepIndex] || '';
      const newStepContent = currentStep + (currentStep ? '\n\n' : '') + result.markdown;
      setStep(stepIndex, newStepContent);
      
      toast({ title: `File uploaded: ${result.filename}` });
      
    } catch (error: any) {
      toast({ 
        title: "Upload failed", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    } finally {
      setUploadingStep(null);
      // Clear the file input
      if (fileInputRefs.current[stepIndex]) {
        fileInputRefs.current[stepIndex]!.value = '';
      }
    }
  }

  // Trigger file input for specific step
  function triggerFileUpload(stepIndex: number) {
    fileInputRefs.current[stepIndex]?.click();
  }
  async function save(){
    try {
      await apiRequest('POST', `/api/guides/upsert?project_id=${projectId}`, g);
      queryClient.invalidateQueries({ queryKey: ['/api/guides/list', projectId] });
      toast({ title: "Guide saved successfully" });
      onClose();
    } catch (error) {
      toast({ title: "Failed to save guide", variant: "destructive" });
    }
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-[210]" onClick={onClose} data-testid="guide-editor-backdrop">
      <div className="mx-auto mt-[6vh] w-[820px] max-w-[97%] bg-white dark:bg-neutral-900 rounded shadow-xl border" onClick={e=>e.stopPropagation()} data-testid="guide-editor-modal">
        <div className="p-2 border-b text-sm font-medium" data-testid="guide-editor-title">{g.id? "Edit Guide":"New Guide"}</div>
        <div className="p-3 space-y-2">
          <input 
            className="border rounded p-2 w-full" 
            placeholder="Title" 
            value={g.title||""} 
            onChange={e=>setG({...g, title:e.target.value})}
            data-testid="input-guide-title"
          />
          <div className="grid md:grid-cols-3 gap-2">
            <input 
              className="border rounded p-2" 
              placeholder="Area" 
              value={g.area||""} 
              onChange={e=>setG({...g, area:e.target.value})}
              data-testid="input-guide-area"
            />
            <input 
              className="border rounded p-2" 
              placeholder="Owner (email)" 
              value={g.owner||""} 
              onChange={e=>setG({...g, owner:e.target.value})}
              data-testid="input-guide-owner"
            />
            <select 
              className="border rounded p-2" 
              value={g.status||"draft"} 
              onChange={e=>setG({...g, status:e.target.value})}
              data-testid="select-guide-status"
            >
              {["draft","approved","archived"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <input 
            className="border rounded p-2 w-full" 
            placeholder="Tags (comma separated)" 
            value={(g.tags||[]).join(",")} 
            onChange={e=>setG({...g, tags: e.target.value.split(",").map(t=>t.trim()).filter(Boolean)})}
            data-testid="input-guide-tags"
          />
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Steps</div>
            {(g.steps||[]).map((s:string, i:number)=>(
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2">
                  <textarea 
                    className="border rounded p-2 text-sm w-full" 
                    rows={3} 
                    value={s} 
                    onChange={e=>setStep(i,e.target.value)}
                    data-testid={`textarea-guide-step-${i}`}
                    placeholder="Enter step description (supports markdown)..."
                  />
                  <div className="flex flex-col gap-1">
                    <button 
                      className="brand-btn text-[10px] p-1 flex items-center gap-1" 
                      onClick={()=>triggerFileUpload(i)}
                      disabled={uploadingStep === i}
                      data-testid={`button-upload-step-${i}`}
                      title="Upload file/image"
                    >
                      {uploadingStep === i ? (
                        <Upload className="w-3 h-3 animate-spin" />
                      ) : (
                        <Paperclip className="w-3 h-3" />
                      )}
                    </button>
                    <button 
                      className="brand-btn text-[11px] p-1" 
                      onClick={()=>remStep(i)}
                      data-testid={`button-remove-step-${i}`}
                      title="Remove step"
                    >
                      –
                    </button>
                  </div>
                </div>
                {/* Hidden file input for each step */}
                <input
                  type="file"
                  ref={el => fileInputRefs.current[i] = el}
                  style={{ display: 'none' }}
                  accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.gif,.svg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(i, file);
                  }}
                  data-testid={`file-input-step-${i}`}
                />
              </div>
            ))}
            <button 
              className="brand-btn text-[11px]" 
              onClick={addStep}
              data-testid="button-add-step"
            >
              + Step
            </button>
          </div>
        </div>
        <div className="p-2 border-t flex justify-end gap-2">
          <button 
            className="brand-btn text-xs" 
            onClick={onClose}
            data-testid="button-cancel-guide"
          >
            Cancel
          </button>
          <button 
            className="brand-btn text-xs swoosh" 
            onClick={save}
            data-testid="button-save-guide"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}