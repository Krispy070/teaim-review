export function hostOf(u: string) {
  try { return new URL(u).host.toLowerCase(); } catch { return "unknown"; }
}
