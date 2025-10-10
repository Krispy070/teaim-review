import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function MeetingsPage() {
  const pid = getProjectId();
  const [cons, setCons] = useState<any[]>([]);
  const [mtgs, setMtgs] = useState<any[]>([]);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const [a, b] = await Promise.all([
      fetchWithAuth(`/api/calendar/connectors?projectId=${encodeURIComponent(pid!)}`).then((r: Response) => r.json()),
      fetchWithAuth(`/api/calendar/meetings?projectId=${encodeURIComponent(pid!)}`).then((r: Response) => r.json()),
    ]);
    setCons(a.items || []);
    setMtgs(b.items || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function addConnector() {
    const r = await fetchWithAuth(`/api/calendar/connectors/add`, {
      method: "POST",
      body: JSON.stringify({ projectId: pid, label, url }),
    });
    setMsg(r.ok ? "Added" : "Failed");
    setTimeout(() => setMsg(""), 800);
    setLabel("");
    setUrl("");
    load();
  }
  async function pull() {
    const r = await fetchWithAuth(`/api/calendar/pull`, { method: "POST", body: JSON.stringify({ projectId: pid }) });
    const j = await r.json();
    setMsg(`Pulled ${j.imported}`);
    load();
  }

  return (
    
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Meetings</h1>
          <button className="text-xs px-2 py-1 border rounded" onClick={pull} data-testid="button-pull-ics">
            Pull ICS now
          </button>
        </div>
        <div className="text-xs opacity-70" data-testid="text-message">
          {msg}
        </div>

        <section className="p-4 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Calendar Connectors (ICS)</div>
          <div className="grid md:grid-cols-3 gap-2">
            <input
              className="border rounded px-2 py-1"
              placeholder="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              data-testid="input-connector-label"
            />
            <input
              className="border rounded px-2 py-1 md:col-span-2"
              placeholder="https://calendar.google.com/calendar/ical/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              data-testid="input-connector-url"
            />
          </div>
          <div className="mt-2">
            <button className="text-xs px-2 py-1 border rounded" onClick={addConnector} data-testid="button-add-connector">
              Add
            </button>
          </div>
          <ul className="mt-2 text-xs space-y-1">
            {cons.map((c) => (
              <li key={c.id} data-testid={`connector-${c.id}`}>
                {c.label || "(no label)"} — {c.url}
              </li>
            ))}
            {!cons.length && <li className="opacity-60">No connectors yet.</li>}
          </ul>
          <div className="text-[11px] opacity-60 mt-1">
            Tip: Most calendars can publish a secret read-only ICS URL. Paste it here to keep TEAIM in sync.
          </div>
        </section>

        <section className="p-4 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Recent Meetings</div>
          <table className="w-full text-sm">
            <thead className="text-xs opacity-70">
              <tr>
                <th className="text-left px-2 py-1">When</th>
                <th className="text-left px-2 py-1">Title</th>
                <th className="text-left px-2 py-1">Link</th>
                <th className="text-left px-2 py-1">Transcript</th>
                <th className="text-left px-2 py-1">Insights</th>
              </tr>
            </thead>
            <tbody>
              {mtgs.map((m) => (
                <tr key={m.id} className="border-b border-slate-800" data-testid={`meeting-${m.id}`}>
                  <td className="px-2 py-1">{new Date(m.startsAt).toLocaleString()}</td>
                  <td className="px-2 py-1">{m.title}</td>
                  <td className="px-2 py-1">
                    {m.link ? (
                      <a className="underline" href={m.link} target="_blank" rel="noreferrer" data-testid={`link-meeting-${m.id}`}>
                        Join
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <button
                      className="text-xs px-2 py-1 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={async () => {
                        const t = prompt("Paste transcript (or key notes)", "") || "";
                        if (!t) return;
                        await fetchWithAuth(`/api/calendar/meetings/${m.id}/transcript`, {
                          method: "POST",
                          body: JSON.stringify({ transcriptText: t }),
                        });
                        alert("Saved & queued insights.");
                      }}
                      data-testid={`button-transcript-${m.id}`}
                    >
                      Add transcript
                    </button>
                  </td>
                  <td className="px-2 py-1">
                    <button
                      className="text-xs px-2 py-1 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={async () => {
                        const r = await fetchWithAuth(`/api/meetings/insights/generate`, {
                          method: "POST",
                          body: JSON.stringify({ meetingId: m.id }),
                        });
                        const j = await r.json();
                        alert(r.ok ? `Summary & call-outs created.\nActions: ${j.actions} Risks: ${j.risks} Decisions: ${j.decisions}` : "Failed - no transcript?");
                        load();
                      }}
                      data-testid={`button-insights-${m.id}`}
                    >
                      Generate Insights
                    </button>
                  </td>
                </tr>
              ))}
              {!mtgs.length && (
                <tr>
                  <td className="opacity-70 text-sm px-2 py-2" colSpan={5}>
                    No meetings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    
  );
}
