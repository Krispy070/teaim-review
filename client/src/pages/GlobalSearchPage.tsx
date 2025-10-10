import { authFetch } from "@/lib/authFetch";
import { getProjectId, ensureProjectPath } from "@/lib/project";
import { useEffect, useState } from "react";

export default function GlobalSearchPage() {
  const pid = getProjectId();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [page, setPage] = useState(0);
  const limit = 10;

  async function run() {
    if (!q.trim()) {
      setMsg("Enter a query");
      return;
    }
    const p = new URLSearchParams({
      projectId: pid!,
      q,
      limit: String(limit),
      offset: String(page * limit),
    });
    const r = await authFetch(`/api/search/global?${p.toString()}`);
    const j = await r.json();
    setRes(j);
    setMsg("");
  }

  useEffect(() => {
    if (q && pid) run();
  }, [page]);

  return (
    
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Search</h1>
        <div className="flex items-center gap-2">
          <input
            className="border rounded px-3 py-2 flex-1"
            placeholder="Search docs, integrations, issues, actions, risks…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            data-testid="input-search-query"
          />
          <button className="px-3 py-2 border rounded" onClick={run} data-testid="button-search">
            Search
          </button>
          <div className="text-xs opacity-70">{msg}</div>
        </div>

        {!res ? (
          <div className="text-sm opacity-70">Type a query and press Search.</div>
        ) : (
          <div className="space-y-6">
            <Section title="Docs (semantic)">
              <ul className="space-y-1">
                {res.docs.map((d: any) => (
                  <li key={d.id} className="text-sm flex items-center justify-between" data-testid={`result-doc-${d.id}`}>
                    <span className="truncate">{d.name}</span>
                    <a className="text-xs underline" href={ensureProjectPath(`/docs/${d.id}`)} data-testid={`link-doc-${d.id}`}>
                      Open
                    </a>
                  </li>
                ))}
                {!res.docs?.length && <li className="opacity-60">No matches.</li>}
              </ul>
            </Section>

            <Section title="Integrations">
              <ul className="space-y-1">
                {res.integrations.map((i: any) => (
                  <li key={i.id} className="text-sm flex items-center justify-between" data-testid={`result-integration-${i.id}`}>
                    <span className="truncate">
                      {i.name} • {i.status}
                    </span>
                    <a className="text-xs underline" href={ensureProjectPath(`/ma/integrations`)} data-testid={`link-integration-${i.id}`}>
                      Open
                    </a>
                  </li>
                ))}
                {!res.integrations?.length && <li className="opacity-60">No matches.</li>}
              </ul>
            </Section>

            <Section title="Issues">
              <ul className="space-y-1">
                {res.issues.map((x: any) => (
                  <li key={x.id} className="text-sm flex items-center justify-between" data-testid={`result-issue-${x.id}`}>
                    <span className="truncate">
                      {x.title} • {x.status}
                    </span>
                    <a className="text-xs underline" href={ensureProjectPath(`/ma/issues`)} data-testid={`link-issue-${x.id}`}>
                      Open board
                    </a>
                  </li>
                ))}
                {!res.issues?.length && <li className="opacity-60">No matches.</li>}
              </ul>
            </Section>

            <Section title="Actions">
              <ul className="space-y-1">
                {res.actions.map((a: any) => (
                  <li key={a.id} className="text-sm flex items-center justify-between" data-testid={`result-action-${a.id}`}>
                    <span className="truncate">
                      {a.title} • {a.status}
                    </span>
                    <a className="text-xs underline" href={ensureProjectPath(`/insights/actions`)} data-testid={`link-action-${a.id}`}>
                      Open
                    </a>
                  </li>
                ))}
                {!res.actions?.length && <li className="opacity-60">No matches.</li>}
              </ul>
            </Section>

            <Section title="Risks">
              <ul className="space-y-1">
                {res.risks.map((r: any) => (
                  <li key={r.id} className="text-sm flex items-center justify-between" data-testid={`result-risk-${r.id}`}>
                    <span className="truncate">
                      {r.title} • Sev {r.severity}
                    </span>
                    <a className="text-xs underline" href={ensureProjectPath(`/ma/risks`)} data-testid={`link-risk-${r.id}`}>
                      Open
                    </a>
                  </li>
                ))}
                {!res.risks?.length && <li className="opacity-60">No matches.</li>}
              </ul>
            </Section>

            <div className="flex items-center gap-2">
              <button
                className="text-xs px-2 py-1 border rounded"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                data-testid="button-prev-page"
              >
                Prev
              </button>
              <div className="text-xs opacity-70" data-testid="text-page-number">Page {page + 1}</div>
              <button
                className="text-xs px-2 py-1 border rounded"
                onClick={() => setPage((p) => p + 1)}
                data-testid="button-next-page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <section>
      <div className="text-sm font-medium mb-1">{title}</div>
      {children}
    </section>
  );
}
