import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { downloadPOST } from "@/lib/download";
import { usePersistProjectId } from "@/lib/projectCtx";

type Artifact = { id:string; name:string };

export default function SignoffComposer(){
  const [match, params] = useRoute('/projects/:projectId/signoff/compose');
  const [location] = useLocation();
  const { toast } = useToast();
  const projectId = params?.projectId;
  usePersistProjectId(projectId);
  const [stageTitle,setStageTitle] = useState("Discovery");
  const [stageArea, setStageArea] = useState("");
  const [message,setMessage] = useState("");
  const [emailTo,setEmailTo] = useState("");
  const [actions,setActions] = useState(true);
  const [risks,setRisks]     = useState(true);
  const [decisions,setDecisions] = useState(true);
  const [arts,setArts] = useState<Artifact[]>([]);
  const [existingAreas, setExistingAreas] = useState<string[]>([]);
  const [chk,setChk]   = useState<Record<string,boolean>>({});
  const [html,setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [kapOpen,setKapOpen]=useState(false);
  const [kapSummary,setKapSummary]=useState("");
  const [kapBullets,setKapBullets]=useState("Scope finalized|Cutover window confirmed");

  useEffect(()=>{ (async ()=>{
    const r = await apiGet<{items:Artifact[]}>("/documents/list", { project_id: projectId! }).catch(()=>null);
    if (r && (r as any).items) {
      setArts((r as any).items);
      
      // Check for pre-selected documents from URL params
      const searchParams = new URLSearchParams(location.split('?')[1] || '');
      const preselectedIds = searchParams.get('selected');
      if (preselectedIds) {
        const selectedIdArray = preselectedIds.split(',');
        const initialChk: Record<string, boolean> = {};
        selectedIdArray.forEach(id => {
          // Only pre-select if the artifact exists in the list
          if ((r as any).items.some((artifact: Artifact) => artifact.id === id)) {
            initialChk[id] = true;
          }
        });
        setChk(initialChk);
      }
    }
    
    // Load existing stages and extract unique areas
    const stagesResult = await apiGet<{items: Array<{area?: string}>}>("/api/stages/list", { project_id: projectId! }).catch(()=>null);
    if (stagesResult && stagesResult.items) {
      const areas = stagesResult.items
        .map(stage => stage.area)
        .filter((area): area is string => !!area && area.trim() !== '')
        .filter((area, index, self) => self.indexOf(area) === index) // unique values
        .sort();
      setExistingAreas(areas);
    }
  })(); },[projectId, location]);

  async function preview(){
    const body = {
      stage_title: stageTitle,
      area: stageArea,
      artifact_ids: arts.filter(a=>chk[a.id]).map(a=>a.id),
      include_actions: actions, include_risks: risks, include_decisions: decisions,
      message
    };
    const d = await apiPost<{html:string}>("/signoff/package/preview", body, { project_id: projectId! });
    setHtml(d.html);
  }

  async function send(){
    const body = {
      stage_title: stageTitle,
      area: stageArea,
      artifact_ids: arts.filter(a=>chk[a.id]).map(a=>a.id),
      include_actions: actions, include_risks: risks, include_decisions: decisions,
      message, email_to: emailTo
    };
    const d = await apiPost<{token_link?:string}>("/signoff/package/send", body, { project_id: projectId! });
    toast({ title: "Sent", description: d.token_link ? "External sign link created." : "Requested (may be quiet hours)" });
  }

  async function downloadZip(){
    const body = {
      stage_title: stageTitle,
      area: stageArea,
      artifact_ids: arts.filter(a=>chk[a.id]).map(a=>a.id),
      include_actions: actions, include_risks: risks, include_decisions: decisions,
      message
    };
    try {
      setBusy(true);
      await downloadPOST(`/api/signoff/package/zip?project_id=${projectId}`, body,
        `signoff_${stageTitle.replace(/\s+/g,'_')}.zip`);
      toast({ title: "ZIP downloaded" });
    } catch (e: any) {
      toast({ title: "ZIP download failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function generateKap(){
    const body = {
      stage_id: "", area: stageArea || undefined,
      title: stageTitle || "Customer Acknowledgement",
      summary: kapSummary,
      bullets: kapBullets.split("|").map(s=>s.trim()).filter(Boolean),
      acceptance: "I acknowledge and approve the above.",
      footer: "Signed electronically via TEAIM"
    };
    await apiPost(`/signoff/docs/generate_from_prompt?project_id=${projectId}`, body);
    setKapOpen(false); 
    toast({ title: "Draft created", description: "Draft created in Sign-Off Docs" });
  }

  return (
    <div className="p-6 grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold" data-testid="heading-compose-signoff">Compose Sign-Off Package</h1>
        <div className="space-y-2">
          <input 
            className="border rounded p-2 w-full" 
            placeholder="Stage title" 
            value={stageTitle} 
            onChange={e=>setStageTitle(e.target.value)}
            data-testid="input-stage-title"
          />
          <div className="flex items-center justify-between">
            <div className="flex-1 flex gap-2">
              {existingAreas.length > 0 ? (
                <>
                  <select 
                    className="border rounded p-2 flex-1" 
                    value={existingAreas.includes(stageArea) ? stageArea : ''}
                    onChange={e=>setStageArea(e.target.value)}
                    data-testid="select-stage-area"
                  >
                    <option value="">Select existing area...</option>
                    {existingAreas.map(area => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                  <input 
                    className="border rounded p-2 flex-1" 
                    placeholder="Or enter new area" 
                    value={!existingAreas.includes(stageArea) ? stageArea : ''} 
                    onChange={e=>setStageArea(e.target.value)}
                    data-testid="input-new-stage-area"
                  />
                </>
              ) : (
                <input 
                  className="border rounded p-2 flex-1" 
                  placeholder="Stage area (e.g., HCM, Payroll)" 
                  value={stageArea} 
                  onChange={e=>setStageArea(e.target.value)}
                  data-testid="input-stage-area"
                />
              )}
            </div>
            <button className="px-2 py-1 border rounded text-xs" onClick={()=>setKapOpen(true)}>Generate Kap Draft</button>
            <Link 
              href={`/projects/${projectId}/stages`}
              className="ml-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 underline"
              data-testid="link-manage-stages"
            >
              Manage stages
            </Link>
          </div>
        </div>
        <textarea 
          className="border rounded p-2 w-full" 
          placeholder="Message to recipient (optional)" 
          value={message} 
          onChange={e=>setMessage(e.target.value)}
          data-testid="input-message"
        />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={decisions} 
              onChange={e=>setDecisions(e.target.checked)}
              data-testid="checkbox-decisions"
            /> 
            Decisions
          </label>
          <label className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={risks} 
              onChange={e=>setRisks(e.target.checked)}
              data-testid="checkbox-risks"
            /> 
            Risks
          </label>
          <label className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={actions} 
              onChange={e=>setActions(e.target.checked)}
              data-testid="checkbox-actions"
            /> 
            Actions
          </label>
        </div>
        <div className="border rounded p-2">
          <div className="text-sm font-medium mb-1">Select Artifacts</div>
          <div className="max-h-[220px] overflow-auto space-y-1" data-testid="artifacts-list">
            {arts.map(a=>(
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input 
                  type="checkbox" 
                  checked={!!chk[a.id]} 
                  onChange={e=>setChk(prev=>({...prev, [a.id]: e.target.checked}))}
                  data-testid={`checkbox-artifact-${a.id}`}
                />
                <span className="truncate">{a.name || a.id}</span>
              </label>
            ))}
            {!arts.length && <div className="text-xs text-muted-foreground">No documents listed yet.</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="px-3 py-2 border rounded" 
            onClick={preview}
            data-testid="button-preview"
          >
            Preview
          </button>
          <input 
            className="border rounded p-2 flex-1" 
            placeholder="Recipient email" 
            value={emailTo} 
            onChange={e=>setEmailTo(e.target.value)}
            data-testid="input-email"
          />
          <button 
            className="px-3 py-2 border rounded" 
            onClick={send}
            data-testid="button-send"
          >
            Send for Sign-Off
          </button>
          <button 
            className="px-3 py-2 border rounded" 
            onClick={downloadZip}
            disabled={busy}
            data-testid="button-download-zip"
          >
            {busy ? "Building…" : "Download ZIP"}
          </button>
        </div>
      </div>
      <div className="brand-card p-3">
        <div className="text-sm mb-2">Preview</div>
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{__html: html}}
          data-testid="preview-content"
        />
      </div>
      {kapOpen && (
        <div className="fixed inset-0 bg-black/30 z-[80] flex items-center justify-center" onClick={()=>setKapOpen(false)}>
          <div className="w-[580px] brand-card shadow-xl p-3" onClick={e=>e.stopPropagation()}>
            <div className="text-sm font-medium mb-2">Generate Kap Draft</div>
            <textarea
              className="teaim-input w-full h-[120px] resize-none text-sm"
              placeholder="PM summary for this sign-off…"
              value={kapSummary}
              onChange={e=>setKapSummary(e.target.value)}
            />
            <input
              className="teaim-input w-full mt-2"
              placeholder="Bullets (separate with |)"
              value={kapBullets}
              onChange={e=>setKapBullets(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button className="brand-btn text-sm" onClick={generateKap}>Generate</button>
              <button className="k-btn text-sm" onClick={()=>setKapOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}