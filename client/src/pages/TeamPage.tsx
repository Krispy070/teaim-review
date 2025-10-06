import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { getProjectId } from "@/lib/project";
import { useToast } from "@/hooks/use-toast";
import { supa } from "@/lib/supabase";

function InboundSignatureVerifierCard() {
  const pid = getProjectId();
  const [isAdmin, setIsAdmin] = useState(false);
  const [provider, setProvider] = useState<"mailgun"|"postmark">("mailgun");

  const [mgTs, setMgTs]   = useState("");
  const [mgTok, setMgTok] = useState("");
  const [mgSig, setMgSig] = useState("");

  const [pmSig, setPmSig] = useState("");
  const [pmRaw, setPmRaw] = useState("");

  const [result, setResult] = useState<string>("");

  useEffect(()=>{
    supa.auth.getUser().then(u=>{
      const role = (u.data.user?.app_metadata as any)?.user_role || "member";
      setIsAdmin(role === "admin");
    });
  },[]);

  if (!isAdmin) return null;

  async function verify() {
    const body:any = { provider };
    if (provider === "mailgun") {
      body.mailgun = { timestamp: mgTs.trim(), token: mgTok.trim(), signatureHex: mgSig.trim() };
    } else {
      body.postmark = { signatureHeaderBase64: pmSig.trim(), rawBody: pmRaw };
    }
    const r = await authFetch(`/api/inbound/verify?projectId=${encodeURIComponent(pid!)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    setResult(r.ok ? (j.valid ? "✅ Signature valid" : `❌ Invalid (expected ${j.expected})`) : `❌ ${j.error||"failed"}`);
  }

  return (
    <div className="p-4 border rounded-2xl" data-testid="signature-verifier-card">
      <div className="text-lg font-medium">Inbound Webhook Signature Verifier (Admin)</div>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-sm">Provider</label>
        <select className="border rounded px-2 py-1" value={provider} onChange={e=>setProvider(e.target.value as any)} data-testid="select-provider">
          <option value="mailgun">Mailgun</option>
          <option value="postmark">Postmark</option>
        </select>
      </div>

      {provider==="mailgun" ? (
        <div className="grid md:grid-cols-2 gap-2 mt-2">
          <input className="border rounded px-2 py-1" placeholder="timestamp" value={mgTs} onChange={e=>setMgTs(e.target.value)} data-testid="input-mailgun-timestamp" />
          <input className="border rounded px-2 py-1" placeholder="token" value={mgTok} onChange={e=>setMgTok(e.target.value)} data-testid="input-mailgun-token" />
          <input className="border rounded px-2 py-1 md:col-span-2" placeholder="signature (hex)" value={mgSig} onChange={e=>setMgSig(e.target.value)} data-testid="input-mailgun-signature" />
        </div>
      ) : (
        <div className="grid gap-2 mt-2">
          <input className="border rounded px-2 py-1" placeholder="X-Postmark-Webhook-Signature (base64)" value={pmSig} onChange={e=>setPmSig(e.target.value)} data-testid="input-postmark-signature" />
          <textarea className="border rounded px-2 py-1 h-36" placeholder="Raw request body (JSON)" value={pmRaw} onChange={e=>setPmRaw(e.target.value)} data-testid="input-postmark-body" />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button className="text-xs px-2 py-1 border rounded-lg" onClick={verify} data-testid="button-verify">Verify</button>
        <span className="text-xs" data-testid="text-verify-result">{result}</span>
      </div>
      <div className="text-[11px] opacity-60 mt-1">
        For Mailgun paste <code>timestamp</code>, <code>token</code>, <code>signature</code> from the webhook payload.
        For Postmark paste the signature header and exact raw JSON body.
      </div>
    </div>
  );
}

function InboundTesterCard() {
  const pid = getProjectId();
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    supa.auth.getUser().then(u => {
      const r = (u.data.user?.app_metadata as any)?.user_role || "member";
      setIsAdmin(r === "admin");
    });
  }, []);

  if (!isAdmin) return null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement)?.files?.[0];
    if (!file || !pid) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", pid);
    const r = await authFetch("/api/inbound/test", { method: "POST", body: fd });
    const j = await r.json();
    setStatus(r.ok ? `OK: docId ${j.docId}` : "Failed: " + JSON.stringify(j));
  }

  return (
    <div className="p-4 border rounded-2xl" data-testid="inbound-tester-card">
      <div className="text-lg font-medium">Email Ingest Tester (Admin)</div>
      <form onSubmit={onSubmit} className="mt-2 flex items-center gap-2">
        <input type="file" name="file" className="text-sm" data-testid="input-inbound-file" />
        <button className="text-xs px-2 py-1 border rounded-lg" data-testid="button-send-inbound">Send</button>
        <span className="text-xs opacity-70" data-testid="text-inbound-status">{status}</span>
      </form>
      <div className="text-[11px] opacity-60 mt-1">
        This uses the same pipeline as provider webhooks and lands in the current project.
      </div>
    </div>
  );
}

function AlertsCard() {
  const pid = getProjectId();
  const [isAdmin, setIsAdmin] = useState(false);
  const [enableErrorSpike, setEnableErrorSpike] = useState(false);
  const [enableQueueStuck, setEnableQueueStuck] = useState(false);
  const [enableTrainingEmails, setEnableTrainingEmails] = useState(false);
  const [enableCadenceEmails, setEnableCadenceEmails] = useState(false);
  const [alertEmails, setAlertEmails] = useState("");
  const [alertPhone, setAlertPhone] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    supa.auth.getUser().then(u => {
      const r = (u.data.user?.app_metadata as any)?.user_role || "member";
      setIsAdmin(r === "admin");
    });
  }, []);

  useEffect(() => {
    if (!pid || !isAdmin) return;
    (async () => {
      const r = await authFetch(`/api/alerts/settings?projectId=${encodeURIComponent(pid)}`);
      if (r.ok) {
        const j = await r.json();
        setEnableErrorSpike(!!j.enableErrorSpike);
        setEnableQueueStuck(!!j.enableQueueStuck);
        setEnableTrainingEmails(!!j.enableTrainingEmails);
        setEnableCadenceEmails(!!j.enableCadenceEmails);
        setAlertEmails(j.alertEmails || "");
        setAlertPhone(j.alertPhone || "");
      }
    })();
  }, [pid, isAdmin]);

  async function save() {
    const r = await authFetch(`/api/alerts/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: pid,
        enableErrorSpike,
        enableQueueStuck,
        enableTrainingEmails,
        enableCadenceEmails,
        alertEmails: alertEmails.trim() || null,
        alertPhone: alertPhone.trim() || null
      })
    });
    setStatus(r.ok ? "Saved" : "Failed");
    setTimeout(() => setStatus(""), 1000);
  }

  if (!isAdmin) return null;

  return (
    <div className="p-4 border rounded-2xl" data-testid="alerts-card">
      <div className="text-lg font-medium">Alerts & Notifications</div>
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={enableErrorSpike} onChange={e => setEnableErrorSpike(e.target.checked)} data-testid="input-enable-error-spike" id="enable-error-spike" />
          <label htmlFor="enable-error-spike" className="text-sm">Alert on error spike (5+ errors in 1 min)</label>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={enableQueueStuck} onChange={e => setEnableQueueStuck(e.target.checked)} data-testid="input-enable-queue-stuck" id="enable-queue-stuck" />
          <label htmlFor="enable-queue-stuck" className="text-sm">Alert on stuck job queue (10+ pending for 5 min)</label>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={enableTrainingEmails} onChange={e => setEnableTrainingEmails(e.target.checked)} data-testid="input-enable-training-emails" id="enable-training-emails" />
          <label htmlFor="enable-training-emails" className="text-sm">Send training session reminder emails</label>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={enableCadenceEmails} onChange={e => setEnableCadenceEmails(e.target.checked)} data-testid="input-enable-cadence-emails" id="enable-cadence-emails" />
          <label htmlFor="enable-cadence-emails" className="text-sm">Send cadence reminder emails</label>
        </div>
        <div className="grid md:grid-cols-3 gap-2 items-center mt-3">
          <label className="text-sm">Alert emails (comma separated)</label>
          <input className="border rounded px-2 py-1 md:col-span-2" placeholder="admin@company.com, alerts@company.com" value={alertEmails} onChange={e => setAlertEmails(e.target.value)} data-testid="input-alert-emails" />
          <label className="text-sm">Alert phone (SMS)</label>
          <input className="border rounded px-2 py-1 md:col-span-2" placeholder="+1234567890" value={alertPhone} onChange={e => setAlertPhone(e.target.value)} data-testid="input-alert-phone" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button className="text-xs px-2 py-1 border rounded-lg" onClick={save} data-testid="button-save-alerts">Save</button>
        <span className="text-xs opacity-70" data-testid="text-alerts-status">{status}</span>
      </div>
      <div className="text-[11px] opacity-60 mt-2">
        Alert emails receive error spike and queue stuck notifications. Training/cadence reminders go to session attendees or alert emails as fallback.
      </div>
    </div>
  );
}

function RetentionCard() {
  const pid = getProjectId();
  const [orig, setOrig] = useState(0);
  const [doc, setDoc] = useState(0);
  const [hard, setHard] = useState(false);
  const [artDays, setArtDays] = useState(30);
  const [artGB, setArtGB] = useState(10);
  const [status, setStatus] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supa.auth.getUser().then(u => {
      const r = (u.data.user?.app_metadata as any)?.user_role || "member";
      setIsAdmin(r === "admin");
    });
  }, []);

  useEffect(() => {
    if (!pid || !isAdmin) return;
    (async () => {
      const r = await authFetch(`/api/retention?projectId=${encodeURIComponent(pid)}`);
      const j = await r.json();
      setOrig(j.originalDays||0); setDoc(j.docDays||0); setHard(!!j.hardDelete);
      setArtDays(j.artifactDays || j.artifact_retention_days || 30);
      setArtGB(j.artifactMaxGB || j.artifact_max_gb || 10);
    })();
  }, [pid, isAdmin]);

  async function save() {
    const r = await authFetch(`/api/retention`, {
      method:"POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        projectId: pid, 
        originalDays: Number(orig), 
        docDays: Number(doc), 
        hardDelete: hard,
        artifactDays: artDays,
        artifactMaxGB: artGB
      })
    });
    setStatus(r.ok ? "Saved" : "Failed");
    setTimeout(()=>setStatus(""), 1000);
  }

  if (!isAdmin) return null;

  return (
    <div className="p-4 border rounded-2xl" data-testid="retention-card">
      <div className="text-lg font-medium">Retention</div>
      <div className="grid md:grid-cols-3 gap-2 mt-2 items-center">
        <label className="text-sm">Delete original files after (days)</label>
        <input type="number" min={0} className="border rounded px-2 py-1 md:col-span-2" value={orig} onChange={e=>setOrig(Number(e.target.value||0))} data-testid="input-retention-original" />
        <label className="text-sm">Hard-delete documents after (days)</label>
        <input type="number" min={0} className="border rounded px-2 py-1 md:col-span-2" value={doc} onChange={e=>setDoc(Number(e.target.value||0))} data-testid="input-retention-doc" />
        <label className="text-sm">Hard delete</label>
        <div className="md:col-span-2"><input type="checkbox" checked={hard} onChange={e=>setHard(e.target.checked)} data-testid="input-retention-hard" /> <span className="text-sm">Permanently remove docs & chunks</span></div>
        <label className="text-sm">Artifact retention (days)</label>
        <input type="number" className="border rounded px-2 py-1 md:col-span-2" value={artDays} onChange={e=>setArtDays(Number(e.target.value||0))} data-testid="input-retention-artifact-days" />
        <label className="text-sm">Artifact cap (GB)</label>
        <input type="number" className="border rounded px-2 py-1 md:col-span-2" value={artGB} onChange={e=>setArtGB(Number(e.target.value||0))} data-testid="input-retention-artifact-gb" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button className="text-xs px-2 py-1 border rounded-lg" onClick={save} data-testid="button-save-retention">Save</button>
        <span className="text-xs opacity-70" data-testid="text-retention-status">{status}</span>
      </div>
    </div>
  );
}

function WebhooksCard() {
  const pid = getProjectId();
  const [items, setItems] = useState<any[]>([]);
  const [type, setType] = useState<"slack"|"generic">("slack");
  const [url, setUrl] = useState("");
  const [events, setEv] = useState<string>("errors,queue,run_failed,run_success,run_missed_sla");
  const [status, setStatus] = useState("");

  async function load() {
    if (!pid) return;
    const r = await authFetch(`/api/webhooks/list?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json();
    setItems(j.items || []);
  }

  useEffect(() => { load(); }, [pid]);

  async function add() {
    if (!pid || !url.trim()) return;
    const evArr = events.split(",").map(s=>s.trim()).filter(Boolean);
    const r = await authFetch(`/api/webhooks/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: pid, type, url: url.trim(), events: evArr })
    });
    if (r.ok) {
      setUrl("");
      setStatus("Added");
      setTimeout(() => setStatus(""), 2000);
      load();
    } else {
      setStatus("Failed");
      setTimeout(() => setStatus(""), 2000);
    }
  }

  async function remove(id: string) {
    const r = await authFetch(`/api/webhooks/${id}`, { method: "DELETE" });
    if (r.ok) load();
  }

  return (
    <div className="p-4 border rounded-2xl" data-testid="webhooks-card">
      <div className="text-lg font-medium mb-2">Webhooks & Slack Alerts</div>
      <div className="text-xs opacity-70 mb-3">
        Configure Slack or custom webhooks to receive notifications for integration runs, errors, and queue issues.
      </div>

      <ul className="space-y-2 mb-3">
        {items.map((w: any) => (
          <li key={w.id} className="text-sm p-2 border rounded-lg flex items-center justify-between" data-testid={`webhook-${w.id}`}>
            <div className="flex-1 truncate">
              <span className="font-medium">{w.type}</span> • <span className="opacity-70 text-xs">{w.url}</span>
              <div className="text-xs opacity-60 mt-1">Events: {(w.events||[]).join(", ")}</div>
            </div>
            <button 
              className="text-xs px-2 py-1 border rounded-lg text-red-400" 
              onClick={() => remove(w.id)}
              data-testid={`button-delete-${w.id}`}
            >
              Delete
            </button>
          </li>
        ))}
        {!items.length && <li className="text-xs opacity-70">No webhooks configured yet.</li>}
      </ul>

      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <div className="text-xs opacity-70 mb-1">Type</div>
          <select 
            className="w-full border rounded px-2 py-1 text-sm bg-transparent" 
            value={type} 
            onChange={e => setType(e.target.value as "slack"|"generic")}
            data-testid="select-webhook-type"
          >
            <option value="slack">Slack</option>
            <option value="generic">Generic</option>
          </select>
        </div>
        <div>
          <div className="text-xs opacity-70 mb-1">Webhook URL</div>
          <input 
            className="w-full border rounded px-2 py-1 text-sm" 
            placeholder="https://hooks.slack.com/..." 
            value={url} 
            onChange={e => setUrl(e.target.value)}
            data-testid="input-webhook-url"
          />
        </div>
        <div className="md:col-span-2">
          <div className="text-xs opacity-70 mb-1">Events (comma-separated)</div>
          <input 
            className="w-full border rounded px-2 py-1 text-sm" 
            placeholder="errors,queue,run_failed,run_success,run_missed_sla" 
            value={events} 
            onChange={e => setEv(e.target.value)}
            data-testid="input-webhook-events"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button 
          className="text-xs px-2 py-1 border rounded-lg" 
          onClick={add}
          data-testid="button-add-webhook"
        >
          Add Webhook
        </button>
        {status && <span className="text-xs opacity-70">{status}</span>}
      </div>
    </div>
  );
}

function EventWebhookMatrixCard() {
  const pid = getProjectId();
  const [hooks, setHooks] = useState<any[]>([]);
  const events = ["errors", "queue", "run_failed", "run_success", "training_upcoming", "cadence_upcoming", "daily_brief"];

  async function loadHooks() {
    if (!pid) return;
    const w = await authFetch(`/api/webhooks/list?projectId=${encodeURIComponent(pid!)}`);
    const j = await w.json();
    setHooks(j.items || []);
  }

  useEffect(() => { loadHooks(); }, [pid]);

  return (
    <div className="p-4 border rounded-2xl">
      <div className="text-lg font-medium mb-2">Slack Channels by Event</div>
      {!hooks.length && <div className="text-xs opacity-70">No project webhooks yet. Add one on the Team page (Webhooks card).</div>}
      {!!hooks.length && (
        <div className="overflow-auto">
          <table className="text-xs min-w-[720px] w-full">
            <thead className="bg-slate-900/40 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">Webhook</th>
                {events.map(ev => <th key={ev} className="text-left px-2 py-1">{ev}</th>)}
              </tr>
            </thead>
            <tbody>
              {hooks.map(h => {
                const set = new Set(h.events || []);
                return (
                  <tr key={h.id} className="border-b border-slate-800">
                    <td className="px-2 py-1">{h.label || h.url}</td>
                    {events.map(ev => (
                      <td key={ev} className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={set.has(ev)}
                          onChange={async e => {
                            const next = new Set(h.events || []);
                            if (e.target.checked) next.add(ev); else next.delete(ev);
                            await authFetch(`/api/webhooks/${h.id}`, { 
                              method: "PATCH", 
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ events: Array.from(next), label: h.label }) 
                            });
                            loadHooks();
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TeamPage() {
  const projectId = getProjectId();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    if (!projectId) return;
    try {
      const r = await authFetch(`/api/project-members/list?projectId=${encodeURIComponent(projectId)}`);
      const j = await r.json();
      setItems(j.items || []);
    } catch (error) {
      console.error('Failed to load team members:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function add() {
    if (!projectId || !email.trim()) return;
    setAdding(true);
    try {
      await authFetch(`/api/project-members/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, email: email.trim(), role })
      });
      setEmail("");
      setRole("member");
      toast({ title: "Member added", description: `${email} has been invited to the project.` });
      load();
    } catch (error) {
      console.error('Failed to add member:', error);
      toast({ variant: "destructive", title: "Failed to add member", description: "An error occurred while adding the member." });
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Team Access</h1>
      
      <AlertsCard />
      <WebhooksCard />
      <EventWebhookMatrixCard />
      <InboundTesterCard />
      <InboundSignatureVerifierCard />
      <RetentionCard />
      
      <div className="flex gap-2 items-center">
        <input 
          className="border rounded px-3 py-2 flex-1" 
          placeholder="email@company.com" 
          value={email} 
          onChange={e=>setEmail(e.target.value)}
          data-testid="input-member-email"
        />
        <select 
          className="border rounded px-3 py-2" 
          value={role} 
          onChange={e=>setRole(e.target.value)}
          data-testid="select-member-role"
        >
          <option value="guest">Guest</option>
          <option value="member">Member</option>
          <option value="lead">Lead</option>
          <option value="pm">PM</option>
          <option value="admin">Admin</option>
        </select>
        <button 
          className="border rounded px-3 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50" 
          onClick={add}
          disabled={adding || !email.trim()}
          data-testid="button-add-member"
        >
          {adding ? "Adding..." : "Invite"}
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((m:any)=>(
          <li key={m.userId} className="p-3 border rounded-2xl text-sm flex justify-between border-border bg-card" data-testid={`member-${m.userId}`}>
            <span className="truncate">{m.email}</span>
            <span className="opacity-70">{m.role}</span>
          </li>
        ))}
        {!items.length && <li className="opacity-70 text-sm">No members yet.</li>}
      </ul>
    </div>
  );
}
