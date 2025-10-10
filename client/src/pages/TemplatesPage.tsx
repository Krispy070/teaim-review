import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function TemplatesPage() {
  const pid = getProjectId();
  const [partner, setPartner] = useState<any[]>([]);
  const [project, setProject] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const p1 = await (await fetchWithAuth(`/api/templates/list?scope=partner`)).json();
    const p2 = await (await fetchWithAuth(`/api/templates/list?projectId=${encodeURIComponent(pid!)}&scope=project`)).json();
    setPartner(p1.items || []);
    setProject(p2.items || []);
    setMsg("");
  }
  
  useEffect(() => { load(); }, []);

  return (
    
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Templates & Change Orders</h1>
          <div className="flex items-center gap-2">
            <CreateTemplate scope="project" onDone={load} />
          </div>
        </div>
        <div className="text-xs opacity-70">{msg}</div>

        <section className="p-3 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Partner Library</div>
          <TemplateList items={partner} canInstantiate onDone={load} />
        </section>
        <section className="p-3 border rounded-2xl">
          <div className="text-sm font-medium mb-2">Project Templates</div>
          <TemplateList items={project} canInstantiate onDone={load} />
        </section>
      </div>
    
  );
}

function TemplateList({ items, canInstantiate, onDone }: { items: any[]; canInstantiate?: boolean; onDone: () => void }) {
  return (
    <ul className="space-y-2">
      {items.map(t => (
        <li key={t.id} className="p-2 border rounded flex items-center justify-between" data-testid={`item-template-${t.id}`}>
          <div>
            <div className="font-medium">{t.name} <span className="text-[11px] opacity-70">({t.category})</span></div>
            <div className="text-[11px] opacity-70">Vars: {(t.vars || []).join(", ") || "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            {canInstantiate && <InstantiateButton tpl={t} onDone={onDone} />}
          </div>
        </li>
      ))}
      {!items.length && <li className="text-xs opacity-70" data-testid="text-no-templates">No templates.</li>}
    </ul>
  );
}

function CreateTemplate({ scope, onDone }: { scope: "partner" | "project"; onDone: () => void }) {
  const pid = getProjectId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cat, setCat] = useState("change_order");
  const [vars, setVars] = useState("AMOUNT, DATE, REASON");
  const [body, setBody] = useState("<h3>Change Order</h3><p>Amount ${AMOUNT}, Date ${DATE}</p><p>${REASON}</p>");
  
  async function save() {
    await fetchWithAuth(`/api/templates/upsert`, {
      method: "POST",
      body: JSON.stringify({
        scope,
        projectId: scope === "project" ? pid : null,
        name,
        category: cat,
        vars: vars.split(",").map(s => s.trim()).filter(Boolean),
        body
      })
    });
    setOpen(false);
    setName("");
    onDone();
  }
  
  return (
    <>
      <button className="text-xs px-2 py-1 border rounded" onClick={() => setOpen(true)} data-testid="button-new-template">New template…</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,92vw)] bg-background border rounded-2xl p-4 space-y-2">
            <div className="text-sm font-medium">Create Template ({scope})</div>
            <input className="border rounded px-2 py-1 w-full" placeholder="Name" value={name} onChange={e => setName(e.target.value)} data-testid="input-template-name" />
            <select className="border rounded px-2 py-1 w-full" value={cat} onChange={e => setCat(e.target.value)} data-testid="select-template-category">
              <option value="change_order">Change Order</option>
              <option value="signoff">Sign-off</option>
              <option value="rfc">RfC</option>
              <option value="other">Other</option>
            </select>
            <input className="border rounded px-2 py-1 w-full" placeholder="Variables (comma-separated)" value={vars} onChange={e => setVars(e.target.value)} data-testid="input-template-vars" />
            <textarea className="border rounded px-2 py-1 w-full h-40" value={body} onChange={e => setBody(e.target.value)} data-testid="textarea-template-body" />
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded" onClick={save} data-testid="button-save-template">Save</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={() => setOpen(false)} data-testid="button-cancel-template">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InstantiateButton({ tpl, onDone }: { tpl: any; onDone: () => void }) {
  const pid = getProjectId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${tpl.category.toUpperCase()} — ${tpl.name}`);
  const [filled, setFilled] = useState<Record<string, string>>({});
  
  useEffect(() => {
    const m: any = {};
    (tpl.vars || []).forEach((v: string) => m[v] = "");
    setFilled(m);
  }, [tpl]);

  async function gen() {
    const r = await fetchWithAuth(`/api/templates/instantiate`, {
      method: "POST",
      body: JSON.stringify({ projectId: pid, templateId: tpl.id, name, filled })
    });
    const j = await r.json();
    if (r.ok) {
      alert("Generated.\nPath: " + j.path);
      setOpen(false);
      onDone();
    } else {
      alert(j.error || "generate failed");
    }
  }
  
  async function ticket() {
    const rr = await fetchWithAuth(`/api/templates/instantiate`, {
      method: "POST",
      body: JSON.stringify({ projectId: pid, templateId: tpl.id, name, filled })
    });
    const jj = await rr.json();
    if (!rr.ok) {
      alert(jj.error || "generate failed");
      return;
    }
    const t = await fetchWithAuth(`/api/templates/${jj.id}/ticket`, {
      method: "POST",
      body: JSON.stringify({ projectId: pid })
    });
    const tj = await t.json();
    if (t.ok) {
      alert("Ticket created: " + tj.ticketId);
      setOpen(false);
      onDone();
    } else {
      alert(tj.error || "ticket failed");
    }
  }

  return (
    <>
      <button className="text-xs px-2 py-1 border rounded" onClick={() => setOpen(true)} data-testid={`button-use-template-${tpl.id}`}>Use…</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(620px,92vw)] bg-background border rounded-2xl p-4 space-y-2">
            <div className="text-sm font-medium">Instantiate "{tpl.name}"</div>
            <input className="border rounded px-2 py-1 w-full" placeholder="Instance name" value={name} onChange={e => setName(e.target.value)} data-testid="input-instance-name" />
            <div className="grid md:grid-cols-2 gap-2">
              {(tpl.vars || []).map((v: string) => (
                <div key={v}>
                  <div className="text-[11px] opacity-70">{v}</div>
                  <input className="border rounded px-2 py-1 w-full text-sm" value={filled[v] || ""} onChange={e => setFilled({ ...filled, [v]: e.target.value })} data-testid={`input-var-${v}`} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-2 py-1 border rounded" onClick={gen} data-testid="button-generate">Generate</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={ticket} data-testid="button-create-ticket">Create Ticket</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={() => setOpen(false)} data-testid="button-close-instantiate">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
