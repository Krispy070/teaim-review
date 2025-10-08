export function phaseBoost(phase?: string, lineage?: any): number {
  if (!phase) return 1;
  const normalized = phase.toLowerCase();
  const lineagePhase = typeof lineage === "string"
    ? lineage.toLowerCase()
    : typeof lineage?.phase === "string"
      ? String(lineage.phase).toLowerCase()
      : undefined;

  if (!lineagePhase) {
    return 0.9; // slight de-prioritisation if we cannot align to the phase
  }

  if (lineagePhase === normalized) {
    return 1.25;
  }

  if (lineagePhase.includes(normalized) || normalized.includes(lineagePhase)) {
    return 1.1;
  }

  return 0.85;
}
