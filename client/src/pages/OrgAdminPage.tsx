import { fetchWithAuth } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Guard from "@/components/Guard";

export default function OrgAdminPage(){
  return <Guard need="admin"><OrgAdminPageInner /></Guard>;
}

function OrgAdminPageInner(){
  const [s, setS] = useState<any>({});
  const [msg, setMsg] = useState("");

  useEffect(()=>{ (async()=>{
    const r = await fetchWithAuth(`/api/org/sso`); const j = await r.json();
    const raw = j.settings || {};
    setS({
      orgName: raw.org_name || "",
      domain: raw.domain || "",
      provider: raw.provider || "saml",
      entityId: raw.entity_id || "",
      acsUrl: raw.acs_url || "",
      metadataUrl: raw.metadata_url || "",
      audience: raw.audience || "",
      certFingerprint: raw.cert_fpr || "",
      defaultRole: raw.default_role || "member",
      enabled: !!raw.enabled
    });
  })(); },[]);

  async function save(){
    const r = await fetchWithAuth(`/api/org/sso`, { method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(s) });
    setMsg(r.ok ? "Saved" : "Failed"); setTimeout(()=>setMsg(""), 800);
  }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold" data-testid="heading-org-admin">Organization / SSO</h1>
      <div className="text-xs opacity-70" data-testid="text-message">{msg}</div>

      <div className="p-4 border rounded-2xl grid md:grid-cols-2 gap-3">
        <label className="text-sm">Org name</label>
        <input className="border rounded px-2 py-1" value={s.orgName||""} onChange={e=>setS({...s, orgName:e.target.value})} data-testid="input-org-name"/>
        <label className="text-sm">Primary domain</label>
        <input className="border rounded px-2 py-1" value={s.domain||""} onChange={e=>setS({...s, domain:e.target.value})} data-testid="input-domain"/>
        <label className="text-sm">Provider</label>
        <select className="border rounded px-2 py-1" value={s.provider||"saml"} onChange={e=>setS({...s, provider:e.target.value})} data-testid="select-provider">
          <option value="saml">SAML</option>
          <option value="oidc" disabled>OIDC (soon)</option>
        </select>
        <label className="text-sm">Default project role</label>
        <select className="border rounded px-2 py-1" value={s.defaultRole||"member"} onChange={e=>setS({...s, defaultRole:e.target.value})} data-testid="select-role">
          <option value="viewer">viewer</option>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <label className="text-sm">Enabled</label>
        <div><input type="checkbox" checked={!!s.enabled} onChange={e=>setS({...s, enabled:e.target.checked})} data-testid="checkbox-enabled"/> <span className="text-sm">Enable SSO</span></div>
      </div>

      <div className="p-4 border rounded-2xl grid md:grid-cols-2 gap-3">
        <div className="font-medium md:col-span-2">SAML Settings</div>
        <label className="text-sm">IdP Metadata URL</label>
        <input className="border rounded px-2 py-1" value={s.metadataUrl||""} onChange={e=>setS({...s, metadataUrl:e.target.value})} data-testid="input-metadata-url"/>
        <label className="text-sm">Entity ID</label>
        <input className="border rounded px-2 py-1" value={s.entityId||""} onChange={e=>setS({...s, entityId:e.target.value})} data-testid="input-entity-id"/>
        <label className="text-sm">ACS URL</label>
        <input className="border rounded px-2 py-1" value={s.acsUrl||""} onChange={e=>setS({...s, acsUrl:e.target.value})} data-testid="input-acs-url"/>
        <label className="text-sm">Audience</label>
        <input className="border rounded px-2 py-1" value={s.audience||""} onChange={e=>setS({...s, audience:e.target.value})} data-testid="input-audience"/>
        <label className="text-sm">Cert fingerprint</label>
        <input className="border rounded px-2 py-1" value={s.certFingerprint||""} onChange={e=>setS({...s, certFingerprint:e.target.value})} data-testid="input-cert"/>
      </div>

      <div className="flex items-center gap-2">
        <button className="px-3 py-2 border rounded-lg" onClick={save} data-testid="button-save">Save</button>
        <a className="text-xs underline" href="/api/org/sso/sp-metadata" target="_blank" rel="noreferrer" data-testid="link-metadata">Download SP metadata (stub)</a>
      </div>

      <div className="text-[11px] opacity-60">
        This is a scaffold: store IdP configuration now; when we wire a SAML/OIDC library or Supabase SSO, we'll flip auth to your IdP. Default role controls new member creation based on email domain.
      </div>
    </div>
  );
}
