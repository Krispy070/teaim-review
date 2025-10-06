export function getProjectId(): string | null {
  // 1) from URL path: /projects/:projectId/*
  const m = location.pathname.match(/\/projects\/([0-9a-f\-]{36})\b/i);
  if (m) return m[1];

  // 2) from query ?projectId=...
  const sp = new URLSearchParams(location.search);
  const q = sp.get("projectId");
  if (q) return q;

  // 3) from localStorage (last used) - use same key as rest of app
  return localStorage.getItem("kap.projectId");
}

export function setProjectId(id: string) {
  localStorage.setItem("kap.projectId", id);
}

export function ensureProjectPath(pathSuffix: string): string {
  const id = getProjectId();
  return id ? `/projects/${id}${pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`}` : pathSuffix;
}
