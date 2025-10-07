import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function BusinessProcessesPanel({ areaKey, projectId }: { areaKey: string; projectId: string }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [bpForChange, setBpForChange] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bps", projectId, areaKey],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/areas/${areaKey}/bps?project_id=${projectId}`);
      return res.json();
    },
    staleTime: 30_000
  });

  const items = data?.items ?? [];
  if (isLoading) return <div className="card p-4">Loading BPs…</div>;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="card__title">Business Processes</h3>
        <button className="k-btn k-btn--primary" onClick={() => setShowCreate(true)} data-testid="button-add-bp">Add BP</button>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-text-muted">
            <tr><th className="text-left py-2">Code</th><th className="text-left py-2">Name</th><th className="text-left py-2">Type</th><th className="text-left py-2">Owner</th><th className="text-left py-2">Status</th><th className="text-left py-2">Actions</th></tr>
          </thead>
          <tbody>
            {items.map((bp: any) => (
              <tr key={bp.id} className="border-t border-border" data-testid={`bp-row-${bp.code}`}>
                <td className="py-2" data-testid={`bp-code-${bp.code}`}>{bp.code}</td>
                <td className="py-2" data-testid={`bp-name-${bp.code}`}>{bp.name}</td>
                <td className="py-2" data-testid={`bp-type-${bp.code}`}>{bp.type}</td>
                <td className="py-2" data-testid={`bp-owner-${bp.code}`}>{bp.owner || "—"}</td>
                <td className="py-2"><span className="k-pill k-pill--gold" data-testid={`bp-status-${bp.code}`}>{bp.status}</span></td>
                <td className="py-2">
                  <button className="k-btn" onClick={() => setBpForChange(bp)} data-testid={`button-log-change-${bp.code}`}>Log change</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="py-4 text-text-muted" data-testid="no-bps-message">No BPs yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateBPDrawer
          areaKey={areaKey}
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["bps", projectId, areaKey] }); setShowCreate(false); }}
        />
      )}

      {bpForChange && (
        <LogBPChangeDrawer
          bp={bpForChange}
          onClose={() => setBpForChange(null)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return <label className="flex flex-col gap-1 mb-3"><span className="text-sm text-text-muted">{label}</span>{children}</label>;
}

export function CreateBPDrawer({ areaKey, projectId, onClose, onSaved }: {
  areaKey: string; projectId: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = React.useState({ code: "", name: "", type: "task", owner: "", status: "in_scope" });
  const save = async () => {
    try {
      await apiRequest('POST', `/api/areas/${areaKey}/bps?project_id=${projectId}`, form);
      onSaved();
    } catch (error) {
      alert("Failed to save BP");
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" data-testid="create-bp-drawer">
      <div className="card p-4 w-[520px]">
        <h3 className="card__title mb-2">Add Business Process</h3>
        <Field label="Code"><input className="k-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} data-testid="input-bp-code" /></Field>
        <Field label="Name"><input className="k-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-bp-name" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className="k-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} data-testid="select-bp-type">
              <option value="task">task</option><option value="approval">approval</option><option value="sub-process">sub-process</option><option value="integration">integration</option>
            </select>
          </Field>
          <Field label="Owner"><input className="k-input" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} data-testid="input-bp-owner" /></Field>
        </div>
        <Field label="Status">
          <select className="k-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} data-testid="select-bp-status">
            <option value="in_scope">in_scope</option><option value="configured">configured</option><option value="tested">tested</option><option value="signed_off">signed_off</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button className="k-btn" onClick={onClose} data-testid="button-cancel-bp">Cancel</button>
          <button className="k-btn k-btn--primary" onClick={save} data-testid="button-save-bp">Save</button>
        </div>
      </div>
    </div>
  );
}

export function LogBPChangeDrawer({ bp, onClose }: { bp: any; onClose: () => void }) {
  const [form, setForm] = React.useState({
    changeType: "modify",
    description: "",
    driver: "",
    configPath: "",
    impactedSecurity: "",
    integrationsTouched: "",
    testCases: ""
  });
  const save = async () => {
    const payload = {
      changeType: form.changeType,
      description: form.description,
      driver: form.driver || undefined,
      configPath: form.configPath || undefined,
      impactedSecurity: form.impactedSecurity ? form.impactedSecurity.split(",").map(s => s.trim()) : [],
      integrationsTouched: form.integrationsTouched ? form.integrationsTouched.split(",").map(s => s.trim()) : [],
      testCases: form.testCases ? form.testCases.split(",").map(s => s.trim()) : [],
    };
    try {
      await apiRequest('POST', `/api/bps/${bp.id}/changes`, payload);
      onClose();
    } catch (error) {
      alert("Failed to save change");
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" data-testid="log-change-drawer">
      <div className="card p-4 w-[620px]">
        <h3 className="card__title mb-2">Log Change — {bp.code}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="text-sm text-text-muted">Change Type</span>
            <select className="k-input" value={form.changeType} onChange={e => setForm({ ...form, changeType: e.target.value })} data-testid="select-change-type">
              <option value="modify">modify</option><option value="add">add</option><option value="remove">remove</option>
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="text-sm text-text-muted">Driver</span>
            <input className="k-input" value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} data-testid="input-driver" />
          </label>
        </div>
        <label className="flex flex-col gap-1 mb-3"><span className="text-sm text-text-muted">Description</span>
          <textarea className="k-input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="textarea-description" />
        </label>
        <label className="flex flex-col gap-1 mb-3"><span className="text-sm text-text-muted">Config Path</span>
          <input className="k-input" value={form.configPath} onChange={e => setForm({ ...form, configPath: e.target.value })} data-testid="input-config-path" />
        </label>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <label className="flex flex-col gap-1"><span className="text-sm text-text-muted">Impacted Security</span>
            <input className="k-input" value={form.impactedSecurity} onChange={e => setForm({ ...form, impactedSecurity: e.target.value })} placeholder="comma,separated" data-testid="input-impacted-security" />
          </label>
          <label className="flex flex-col gap-1"><span className="text-sm text-text-muted">Integrations</span>
            <input className="k-input" value={form.integrationsTouched} onChange={e => setForm({ ...form, integrationsTouched: e.target.value })} placeholder="comma,separated" data-testid="input-integrations-touched" />
          </label>
          <label className="flex flex-col gap-1"><span className="text-sm text-text-muted">Test Cases</span>
            <input className="k-input" value={form.testCases} onChange={e => setForm({ ...form, testCases: e.target.value })} placeholder="comma,separated" data-testid="input-test-cases" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button className="k-btn" onClick={onClose} data-testid="button-cancel-change">Cancel</button>
          <button className="k-btn k-btn--primary" onClick={save} data-testid="button-save-change">Save</button>
        </div>
      </div>
    </div>
  );
}