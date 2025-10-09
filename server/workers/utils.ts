const loggedSchemaErrors = new Set<string>();

export function workersDisabled(): boolean {
  return process.env.WORKERS_ENABLED === "0";
}

export function handleWorkerError(worker: string, error: unknown): boolean {
  const maybeCode =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: string }).code)
      : undefined;

  if (maybeCode === "42P01" || maybeCode === "42P10") {
    const key = `${worker}:${maybeCode}`;
    if (!loggedSchemaErrors.has(key)) {
      loggedSchemaErrors.add(key);
      console.warn(
        `[${worker}] skipped tick because required database relation is missing (${maybeCode}).`
      );
    }
    return true;
  }

  console.error(`[${worker}] error`, error);
  return false;
}
