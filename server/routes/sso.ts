import { Router } from "express";
import { db } from "../db/client";
import { requireRole } from "../auth/supabaseAuth";
import { sql } from "drizzle-orm";

export const sso = Router();

// GET /api/org/sso
sso.get("/", requireRole("admin"), async (_req, res) => {
  const { rows } = await db.execute(sql`select * from sso_settings order by created_at desc limit 1`);
  res.json({ ok:true, settings: rows?.[0] || null });
});

// POST /api/org/sso  { orgName, domain, provider?, entityId, acsUrl, metadataUrl, audience, certFingerprint, defaultRole, enabled }
sso.post("/", requireRole("admin"), async (req, res) => {
  const s = req.body||{};
  await db.execute(
    sql`insert into sso_settings (org_name, domain, provider, entity_id, acs_url, metadata_url, audience, cert_fpr, default_role, enabled)
     values (${s.orgName||null}, ${s.domain}, ${s.provider||"saml"}, ${s.entityId||null}, ${s.acsUrl||null}, ${s.metadataUrl||null}, ${s.audience||null}, ${s.certFingerprint||null}, ${s.defaultRole||"member"}, ${!!s.enabled})
     on conflict (domain) do update set
       org_name=${s.orgName||null}, provider=${s.provider||"saml"}, entity_id=${s.entityId||null}, acs_url=${s.acsUrl||null}, metadata_url=${s.metadataUrl||null}, audience=${s.audience||null}, cert_fpr=${s.certFingerprint||null}, default_role=${s.defaultRole||"member"}, enabled=${!!s.enabled}, updated_at=now()`
  );
  res.json({ ok:true });
});

// GET /api/org/sso/sp-metadata (placeholder SP metadata)
sso.get("/sp-metadata", requireRole("admin"), async (_req, res) => {
  const base = process.env.PUBLIC_URL || "";
  const entityId = `${base}/login/sso/saml`;
  const acs = `${base}/login/sso/acs`;
  const xml = `<?xml version="1.0"?>
<EntityDescriptor entityID="${entityId}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService index="0" isDefault="true" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acs}"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
  res.type("application/samlmetadata+xml").send(xml);
});
