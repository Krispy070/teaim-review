export type PiiSummary = Record<string, number>;
export type PiiPolicy = {
  mode: "strict" | "mask" | "none";
  allowEmailDomains: string[];
};

const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const PHONE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const DOB = /\b(?:19|20)\d{2}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g;
const CC = /\b(?:\d[ -]*?){13,19}\b/g;
const ROUTING = /\b\d{9}\b/g;
const PASSPORT = /\b[A-PR-WY][1-9]\d\s?\d{4}[1-9]\b/gi;
const DL = /\b[A-Z0-9]{1,3}-?[A-Z0-9]{3,8}\b/g;
const ADDRESS = /\b\d{1,5}\s+[A-Za-z][A-Za-z\s.-]{2,}\s+(?:Ave|Av|Ave\.|Rd|Rd\.|Road|St|St\.|Street|Blvd|Ln|Dr|Way|Ct|Hwy)\b/gi;

function luhnValid(s: string) {
  const digits = s.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

function mask(s: string, keep = 4) {
  return s.length <= keep ? "●".repeat(s.length) : "●".repeat(Math.max(0, s.length - keep)) + s.slice(-keep);
}

export function redact(text: string, policy: PiiPolicy) {
  if (!text || policy.mode === "none") return { redacted: text, summary: {} as PiiSummary, hadPii: false };
  let out = text;
  const summary: PiiSummary = {};
  const bump = (k: string, n = 1) => { summary[k] = (summary[k] || 0) + n; };

  out = out.replace(EMAIL, (m, domain) => {
    const allowed = policy.allowEmailDomains?.some(d => domain.toLowerCase().endsWith(d.toLowerCase()));
    if (allowed) return m;
    bump("email");
    return policy.mode === "mask" ? m.replace(/^[^@]+/, "***") : "[REDACTED:EMAIL]";
  });

  out = out.replace(SSN, (m) => { bump("ssn"); return policy.mode === "mask" ? mask(m, 2) : "[REDACTED:SSN]"; });

  out = out.replace(PHONE, (m) => { bump("phone"); return policy.mode === "mask" ? mask(m.replace(/\D/g,""), 2) : "[REDACTED:PHONE]"; });

  out = out.replace(DOB, (m) => { bump("dob"); return policy.mode === "mask" ? "***-**-**" : "[REDACTED:DOB]"; });

  out = out.replace(CC, (m) => {
    if (!luhnValid(m)) return m;
    bump("card");
    return policy.mode === "mask" ? mask(m.replace(/\s|-/g,"")) : "[REDACTED:CARD]";
  });

  out = out.replace(ROUTING, (m) => { bump("routing"); return policy.mode === "mask" ? mask(m, 2) : "[REDACTED:ROUTING]"; });

  out = out.replace(PASSPORT, (m) => { bump("passport"); return policy.mode === "mask" ? mask(m, 2) : "[REDACTED:PASSPORT]"; });
  out = out.replace(DL, (m) => { bump("driver_license"); return policy.mode === "mask" ? mask(m, 2) : "[REDACTED:DL]"; });
  out = out.replace(ADDRESS, () => { bump("address"); return policy.mode === "mask" ? "[ADDR]" : "[REDACTED:ADDRESS]"; });

  const hadPii = Object.keys(summary).length > 0;
  return { redacted: out, summary, hadPii };
}
