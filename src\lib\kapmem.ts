
// src/lib/kapmem.ts
// Prefer Vite proxy; fall back to env URL if provided
const URL =
  (import.meta as any).env?.VITE_KAPMEM_URL || "/kapmem";
const TOKEN =
  (import.meta as any).env?.VITE_KAPMEM_TOKEN || "";

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

export async function kapmemQuery(q: string, project?: string, n = 5) {
  // PowerShell-curl shape that worked:
  // { "q": "test cases", "n": 3 }
  const body: any = { q, n };
  // Optional flat 'where' (no $and)
  if (project) body.where = { project };

  const r = await fetch(`${URL}/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  // Helpful diagnostics while we iterate
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`KapMem query ${r.status} :: ${text.slice(0,180)}`);
  }

  const j = await r.json();
  return (j.matches ?? []) as Array<{ id: string; text: string; meta: any }>;
}

export async function kapmemSave(text: string, meta: Record<string, any>) {
  // server accepts: [{ text, source, project, kind, tags }]
  const items = [{
    text,
    source: meta.source || "teaim",
    project: meta.project || "TEAIM",
    kind: meta.kind || "note",
    tags: meta.tags || ""
  }];

  const r = await fetch(`${URL}/ingest/json`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(items),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`KapMem save ${r.status} :: ${text.slice(0,180)}`);
  }
  return await r.json(); // { added: n }
}
