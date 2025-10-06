import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { fetchWithAuth } from "@/lib/supabase";
import PageHeading from "@/components/PageHeading";
import { getProjectId } from "@/lib/project";

interface TestCase {
  id: string;
  title: string;
  steps: string[];
  expected: string | null;
  priority: string;
  tags: string[];
  confidence: string;
  source: string | null;
  docId: string;
}

export default function Testing() {
  const [items, setItems] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [location] = useLocation();
  const projectId = getProjectId();

  useEffect(() => {
    (async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        const r = await fetchWithAuth(`/api/insights/tests?projectId=${encodeURIComponent(projectId)}`);
        const j = await r.json();
        setItems(j.items || []);
      } catch (err) {
        console.error("Failed to load test cases:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <PageHeading title="Test Cases" crumbs={[{label:"Overview"},{label:"Testing"}]} />
        <button
          className="px-3 py-2 border rounded-lg text-sm"
          onClick={() => {
            const pid = getProjectId();
            if (!pid) return;
            const a = document.createElement("a");
            a.href = `/api/exports/tests.csv?projectId=${encodeURIComponent(pid)}`;
            a.download = "";
            document.body.appendChild(a); a.click(); a.remove();
          }}
          data-testid="button-export-tests-csv"
        >
          Export Tests CSV
        </button>
      </div>
      <div className="p-6">
        {loading ? (
          <div className="opacity-70">Loading...</div>
        ) : (
          <ul className="space-y-3">
            {items.map(t => (
              <li key={t.id} className="p-3 border rounded-2xl" data-testid={`test-case-${t.id}`}>
                <div className="font-medium">
                  {t.title} <span className="text-xs opacity-70">({t.priority})</span>
                </div>
                {!!t.tags?.length && (
                  <div className="text-xs opacity-70 mt-1">
                    tags: {t.tags.join(", ")}
                  </div>
                )}
                {t.expected && (
                  <div className="text-sm mt-2">
                    <strong>Expected:</strong> {t.expected}
                  </div>
                )}
                {!!t.steps?.length && (
                  <ol className="mt-2 text-sm list-decimal ml-5 space-y-1">
                    {t.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                )}
                {t.source && (
                  <div className="text-xs mt-2 opacity-70">source: "{t.source}"</div>
                )}
              </li>
            ))}
            {!items.length && <li className="opacity-70">No test cases yet. Upload docs to populate.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
