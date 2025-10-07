export function enabled(flag: string, def = true): boolean {
  const v = (process.env[flag] || "").toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  if (v === "1" || v === "true"  || v === "on")  return true;
  return def;
}

/** call fn() every 'baseMs' with +/- jitter% variance, after an initial delay */
export function withJitter(fn: () => void, baseMs: number, jitterPct = 0.15, initialMs = 500) {
  setTimeout(function tick(){
    const variance = baseMs * jitterPct;
    const wait = Math.max(250, baseMs + (Math.random()*2-1) * variance);
    Promise.resolve().then(fn).finally(() => setTimeout(tick, wait));
  }, Math.max(0, initialMs + Math.random()*initialMs));
}
