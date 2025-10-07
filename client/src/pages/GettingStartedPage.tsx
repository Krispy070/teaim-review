import { useState } from "react";
import { fetchWithAuth } from "@/lib/supabase";

export default function GettingStartedPage() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name || !code) {
      setMsg("Provide name & code");
      return;
    }
    
    setLoading(true);
    setMsg("Creating project...");

    try {
      const r = await fetchWithAuth(`/api/projects/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code })
      });
      
      const j = await r.json();
      
      if (!r.ok) {
        setMsg(j.error || "Create failed");
        setLoading(false);
        return;
      }

      localStorage.setItem("projectId", j.projectId);
      location.href = `/projects/${j.projectId}/setup`;
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="font-bold" data-testid="link-logo">TEAIM.app</a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="space-y-6 p-8 rounded-2xl border border-slate-800 bg-slate-900/50">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="heading-getting-started">Create Your Project</h1>
            <div className="text-sm opacity-70 mt-2">
              We'll seed releases, cadences, playbooks, and training in setup.
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm opacity-70 block mb-1">Project Name</label>
              <input
                className="w-full border rounded-xl px-3 py-2 bg-slate-950/60 border-slate-800"
                placeholder="Mars HCM/Payroll/FIN"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
                data-testid="input-name"
              />
            </div>
            
            <div>
              <label className="text-sm opacity-70 block mb-1">Project Code</label>
              <input
                className="w-full border rounded-xl px-3 py-2 bg-slate-950/60 border-slate-800"
                placeholder="MARS-WD"
                value={code}
                onChange={e => setCode(e.target.value)}
                disabled={loading}
                data-testid="input-code"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={create}
              disabled={loading}
              data-testid="button-create"
            >
              {loading ? "Creating..." : "Create & Continue"}
            </button>
            {msg && <div className="text-xs opacity-70" data-testid="text-message">{msg}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
