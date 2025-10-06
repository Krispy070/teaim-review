export function guardRecipients(to: string[]): { to: string[]; note?: string } {
  const env = process.env.NODE_ENV || "development";

  // 1) Hard sink in non-prod: route everything to a single address
  const sink = process.env.EMAIL_SINK;
  if (sink && env !== "production") {
    const original = to.join(", ");
    return { to: [sink], note: `(SINKED • originally: ${original})` };
  }

  // 2) Optional allowlist for light dev/prod canaries
  const allowRe = process.env.EMAIL_ALLOWLIST_REGEX
    ? new RegExp(process.env.EMAIL_ALLOWLIST_REGEX, "i")
    : null;

  if (allowRe) {
    const kept = to.filter((a) => allowRe.test(a));
    if (kept.length) return { to: kept };
    if (sink) return { to: [sink], note: "(SINKED • none matched allowlist)" };
    return { to: [] };
  }

  return { to };
}
