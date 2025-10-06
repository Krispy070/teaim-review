import { getPersistedProjectId } from "@/lib/projectCtx";

export function resolveProjectId(paramsPid?: string, ctxPid?: string): string | null {
  // Priority: URL → context → persisted
  if (paramsPid && paramsPid !== "undefined" && paramsPid !== ":projectId") return paramsPid;
  if (ctxPid && ctxPid !== "undefined") return ctxPid;
  const stored = getPersistedProjectId();
  return stored && stored !== "undefined" ? stored : null;
}