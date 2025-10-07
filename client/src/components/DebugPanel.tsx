import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { fetchWithAuth } from "@/lib/supabase";

type ApiLog = { method: string; url: string; status: number; traceId?: string; at: string };

function getProjectId(): string {
  const m = location.pathname.match(/\/projects\/([^/]+)/);
  return m?.[1] || "";
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [annot, setAnnot] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const env = {
    sandbox: import.meta.env.VITE_ADAPTER_SANDBOX === "on",
    sftpMode: import.meta.env.VITE_SFTP_MODE || "real",
  };

  useEffect(() => {
    (window as any).__dbg = (window as any).__dbg || {};
    const buf: ApiLog[] = (window as any).__dbg.api || [];
    setLogs(buf.slice(-25));
  }, [open]);

  async function report() {
    setSending(true);
    try {
      const pid = getProjectId();
      const ctx = {
        url: location.href,
        userAgent: navigator.userAgent,
        traceId: (window as any).__dbg?.lastTraceId || "",
        lastError: (window as any).__dbg?.lastError || null,
        api: logs,
        env,
      };
      const body = {
        projectId: pid,
        title: "Bug report from Debug Panel",
        description: `${annot}\n\nContext:\n${JSON.stringify(ctx, null, 2)}`,
        status: "triage",
        priority: "high",
        source: "bug-bash",
      } as any;
      await fetchWithAuth(`/api/tickets`, { method: "POST", body: JSON.stringify(body) });
      setAnnot("");
      setOpen(false);
      alert("Reported as ticket.");
    } finally {
      setSending(false);
    }
  }

  function copy() {
    const ctx = {
      url: location.href,
      userAgent: navigator.userAgent,
      traceId: (window as any).__dbg?.lastTraceId || "",
      lastError: (window as any).__dbg?.lastError || null,
      api: logs,
      env,
    };
    navigator.clipboard.writeText(JSON.stringify(ctx, null, 2));
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Debug Panel"
      footer={
        <>
          <button className="text-xs px-2 py-1 border rounded" onClick={copy}>
            Copy context
          </button>
          <button className="text-xs px-2 py-1 border rounded" onClick={report} disabled={sending}>
            {sending ? "Reporting…" : "Report issue"}
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="text-xs opacity-70">Press Ctrl/Cmd+Shift+D to toggle</div>
        <div>
          <b>Project:</b> {getProjectId()}
        </div>
        <div>
          <b>Trace-Id (last):</b> {(window as any).__dbg?.lastTraceId || "(none)"}
        </div>
        <div>
          <b>Env:</b> sandbox={String(env.sandbox)}; sftpMode={String(env.sftpMode)}
        </div>

        <div className="mt-2">
          <div className="text-xs opacity-70 mb-1">Notes</div>
          <textarea className="w-full border rounded px-2 py-1 h-24" value={annot} onChange={(e) => setAnnot(e.target.value)} />
        </div>

        <div className="mt-2">
          <div className="text-xs opacity-70 mb-1">Recent API calls</div>
          <div className="max-h-48 overflow-auto border rounded">
            <table className="text-xs min-w-[520px] w-full">
              <thead className="bg-slate-900/30">
                <tr>
                  <th className="text-left px-2 py-1">At</th>
                  <th className="text-left px-2 py-1">Meth</th>
                  <th className="text-left px-2 py-1">Status</th>
                  <th className="text-left px-2 py-1">Trace</th>
                  <th className="text-left px-2 py-1">URL</th>
                </tr>
              </thead>
              <tbody>
                {logs
                  .slice()
                  .reverse()
                  .map((l, i) => (
                    <tr key={i} className="border-b border-slate-800">
                      <td className="px-2 py-1">{new Date(l.at).toLocaleTimeString()}</td>
                      <td className="px-2 py-1">{l.method}</td>
                      <td className="px-2 py-1">{l.status}</td>
                      <td className="px-2 py-1">{l.traceId || ""}</td>
                      <td className="px-2 py-1">{l.url}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs opacity-70">
          Last error: {(window as any).__dbg?.lastError ? JSON.stringify((window as any).__dbg.lastError).slice(0, 200) : "(none)"}
        </div>
      </div>
    </Modal>
  );
}
