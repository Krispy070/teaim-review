import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { fetchWithAuth } from "@/lib/supabase";
import PageHeading from "@/components/PageHeading";

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

export default function TestCasesInsights() {
  const [items, setItems] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [location] = useLocation();
  const projectId = location.split('/')[2];

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
      <PageHeading title="Test Cases" crumbs={[{label:"Overview"},{label:"Test Cases"}]} />
      <div className="p-6">
        {loading ? (
          <div className="opacity-70">Loading...</div>
        ) : (
          <ul className="space-y-3">
            {items.map(t => (
              <li key={t.id} className="p-3 border rounded-2xl" data-testid={`test-case-${t.id}`}>
                <div className="font-medium">{t.title}</div>
                <div className="text-xs opacity-70">Priority: {t.priority}</div>
                {t.steps && t.steps.length > 0 && (
                  <div className="text-sm mt-2">
                    <div className="font-medium">Steps:</div>
                    <ol className="list-decimal list-inside">
                      {t.steps.map((step, i) => (
                        <li key={i} className="text-xs opacity-80">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {t.expected && <div className="text-sm mt-1 opacity-80">Expected: {t.expected}</div>}
                {t.tags && t.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {t.tags.map(tag => (
                      <span key={tag} className="text-xs px-2 py-1 bg-muted rounded">{tag}</span>
                    ))}
                  </div>
                )}
                {t.source && <div className="text-xs mt-1 opacity-70">source: "{t.source}"</div>}
              </li>
            ))}
            {!items.length && <li className="opacity-70">No test cases yet.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
