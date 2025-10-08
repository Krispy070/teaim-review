import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { fetchWithAuth } from "@/lib/supabase";
import PageHeading from "@/components/PageHeading";
import { getProjectId } from "@/lib/project";
import MemoryPrompt from "@/components/MemoryPrompt";
import { useMemoryPrompts } from "@/hooks/useMemoryPrompts";
import type { MemoryRecommendation } from "@shared/memory";

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
  const memory = useMemoryPrompts(projectId, "test");

  const memorySlot = useMemo(() => {
    if (!memory.featureEnabled || !memory.prompts.length) return null;
    return (
      <div className="flex w-full flex-col gap-3 lg:max-w-xs">
        {memory.prompts.map((prompt: MemoryRecommendation) => (
          <MemoryPrompt
            key={prompt.id}
            title={prompt.title}
            text={prompt.text}
            confidence={prompt.confidence ?? undefined}
            onApply={() => memory.applyPrompt(prompt)}
            onDismiss={() => memory.dismissPrompt(prompt)}
          />
        ))}
      </div>
    );
  }, [memory.applyPrompt, memory.dismissPrompt, memory.featureEnabled, memory.prompts]);

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
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center justify-between gap-3">
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
        {memorySlot}
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
