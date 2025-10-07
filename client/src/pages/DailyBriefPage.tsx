import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useState } from "react";

export default function DailyBriefPage() {
  const pid = getProjectId();
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  async function gen() {
    setBusy(true);
    const r = await fetchWithAuth(`/api/briefs/generate`, {
      method: "POST",
      body: JSON.stringify({ projectId: pid }),
    });
    const j = await r.json();
    setTxt(j.brief?.text || "");
    setBusy(false);
  }
  return (
    <AppFrame sidebar={<SidebarV2 />}>
      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Daily Brief</h1>
          <button
            className="text-xs px-2 py-1 border rounded"
            onClick={gen}
            disabled={busy}
            data-testid="button-generate-brief"
          >
            {busy ? "Generating…" : "Generate now"}
          </button>
        </div>
        {!txt ? (
          <div className="text-sm opacity-70">Click "Generate now" or wait for the daily run.</div>
        ) : (
          <pre className="text-sm whitespace-pre-wrap p-4 border rounded-2xl bg-slate-900/40" data-testid="text-brief-content">
            {txt}
          </pre>
        )}
      </div>
    </AppFrame>
  );
}
