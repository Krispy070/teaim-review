export function isUUID(v: any): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
export function oneOf<T extends string>(vals: readonly T[]) {
  const set = new Set(vals);
  return (v: any): v is T => typeof v === "string" && set.has(v as T);
}
export function isBoolish(v: any) {
  if (v === true || v === false) return true;
  if (typeof v === "string") return v === "1" || v === "0" || v === "true" || v === "false";
  return false;
}
export function toBool(v: any) {
  return v === true || v === "1" || v === "true";
}
export function isInt(v: any) { return Number.isInteger(typeof v === "string" ? Number(v) : v); }
export function clampInt(v: any, min: number, max: number, def: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
