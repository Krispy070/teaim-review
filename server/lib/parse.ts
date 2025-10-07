export function parseISOorNull(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function parseIntClamp(v: any, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function parseBool(v: any, def=false): boolean {
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (s==="1" || s==="true" || s==="on") return true;
    if (s==="0" || s==="false" || s==="off") return false;
  }
  return def;
}
