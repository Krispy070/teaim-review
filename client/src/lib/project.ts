export function getStoredProjectId(): string | null {
  return localStorage.getItem("projectId");
}

export function setStoredProjectId(pid: string) {
  localStorage.setItem("projectId", pid);
}

/** Derive projectId from URL (?projectId=…), else localStorage */
export function deriveProjectId(): string | null {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get("projectId");
  if (fromUrl) {
    setStoredProjectId(fromUrl);
    // optional: clean URL
    url.searchParams.delete("projectId");
    history.replaceState(null, "", url.toString());
    return fromUrl;
  }
  return getStoredProjectId();
}

// Legacy compatibility
export function getProjectId(): string | null {
  // 1) from URL path: /projects/:projectId/*
  const m = location.pathname.match(/\/projects\/([0-9a-f\-]{36})\b/i);
  if (m) return m[1];

  // 2) from query ?projectId=...
  const sp = new URLSearchParams(location.search);
  const q = sp.get("projectId");
  if (q) return q;

  // 3) from localStorage (last used)
  return getStoredProjectId();
}

export function setProjectId(id: string) {
  setStoredProjectId(id);
}

export function ensureProjectPath(pathSuffix: string): string {
  const id = getProjectId();
  return id ? `/projects/${id}${pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`}` : pathSuffix;
}
