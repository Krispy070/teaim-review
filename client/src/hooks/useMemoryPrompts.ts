import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemoryPhase, MemoryRecommendation } from "@shared/memory";
import { fetchWithAuth } from "@/lib/supabase";

const SHOW_MEMORY_PROMPTS = import.meta.env.VITE_SHOW_MEMORY_PROMPTS === "1";
const LOCAL_MEMORY_ENABLED = import.meta.env.VITE_MEMORY_ENABLED === "1";

function detectMemoryEnabled(): boolean {
  if (LOCAL_MEMORY_ENABLED) return true;
  if (typeof window === "undefined") return false;
  const w = window as any;
  const candidates = [
    w.MEMORY_ENABLED,
    w.__MEMORY_ENABLED,
    w.__ENV?.MEMORY_ENABLED,
    w.__FLAGS?.MEMORY_ENABLED,
    w.__TEAIM?.flags?.MEMORY_ENABLED,
    w.__TEAIM?.features?.memory,
    w.__CONFIG?.MEMORY_ENABLED,
  ];
  if (candidates.some((value) => value === true || value === "1" || value === 1 || value === "enabled")) {
    return true;
  }
  try {
    const stored = window.localStorage?.getItem?.("MEMORY_ENABLED");
    if (stored === "1" || stored === "true") {
      return true;
    }
  } catch {
    // ignore storage access errors
  }
  return false;
}

function normaliseRecommendations(
  items: Array<Record<string, unknown>>,
  phase: MemoryPhase
): MemoryRecommendation[] {
  return items
    .filter(Boolean)
    .slice(0, 2)
    .map((item, index) => {
      const memoryId =
        (item.memory_id as string | number | undefined) ??
        (item.entry_id as string | number | undefined) ??
        (item.id as string | number | undefined) ??
        `${phase}-${index}`;
      const title =
        (item.title as string | undefined) ??
        (item.heading as string | undefined) ??
        (item.summary as string | undefined) ??
        "AI suggestion";
      const text =
        (item.text as string | undefined) ??
        (item.body as string | undefined) ??
        (item.content as string | undefined) ??
        "";
      const confidenceValue = (item.confidence ?? item.confidence_score ?? item.score) as
        | number
        | undefined
        | null;

      return {
        id: String(memoryId),
        memoryId: String(memoryId),
        title,
        text,
        confidence: typeof confidenceValue === "number" ? confidenceValue : null,
        source: (item.source as string | undefined) ?? (item.phase as string | undefined) ?? null,
        metadata: item,
      } satisfies MemoryRecommendation;
    })
    .filter((rec) => rec.text.trim().length > 0);
}

export interface UseMemoryPromptsResult {
  prompts: MemoryRecommendation[];
  featureEnabled: boolean;
  loading: boolean;
  applyPrompt: (prompt: MemoryRecommendation) => void;
  dismissPrompt: (prompt: MemoryRecommendation) => void;
}

export function useMemoryPrompts(projectId: string | null | undefined, phase: MemoryPhase): UseMemoryPromptsResult {
  const [prompts, setPrompts] = useState<MemoryRecommendation[]>([]);
  const [loading, setLoading] = useState(false);

  const featureEnabled = useMemo(() => SHOW_MEMORY_PROMPTS && detectMemoryEnabled(), []);

  useEffect(() => {
    if (!featureEnabled) {
      setPrompts([]);
      return;
    }
    if (!projectId) {
      setPrompts([]);
      return;
    }

    let cancelled = false;
    const fetchPrompts = async () => {
      setLoading(true);
      try {
        const url = `/api/memory/recommendations?project_id=${encodeURIComponent(projectId)}&phase=${encodeURIComponent(phase)}`;
        const response = await fetchWithAuth(url);
        if (!response.ok) {
          return;
        }
        const payload = await response.json().catch(() => ({}));
        const rawList = Array.isArray(payload?.recommendations)
          ? payload.recommendations
          : Array.isArray(payload?.items)
            ? payload.items
            : [];
        if (!cancelled) {
          setPrompts(normaliseRecommendations(rawList, phase));
        }
      } catch (error) {
        console.warn("Memory prompts fetch failed", error);
        if (!cancelled) {
          setPrompts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPrompts();
    return () => {
      cancelled = true;
    };
  }, [featureEnabled, phase, projectId]);

  const sendTelemetry = useCallback(
    async (action: "apply" | "dismiss", prompt: MemoryRecommendation) => {
      if (!featureEnabled || !projectId) return;
      try {
        await fetchWithAuth("/api/memory/telemetry", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            project_id: projectId,
            action,
            phase,
            promptId: prompt.memoryId || prompt.id,
            memoryId: prompt.memoryId || prompt.id,
            confidence: prompt.confidence ?? undefined,
          }),
        });
      } catch (error) {
        console.warn("Memory telemetry failed", error);
      }
    },
    [featureEnabled, phase, projectId]
  );

  const applyPrompt = useCallback(
    (prompt: MemoryRecommendation) => {
      setPrompts((prev) => prev.filter((item) => item.id !== prompt.id));
      void sendTelemetry("apply", prompt);
    },
    [sendTelemetry]
  );

  const dismissPrompt = useCallback(
    (prompt: MemoryRecommendation) => {
      setPrompts((prev) => prev.filter((item) => item.id !== prompt.id));
      void sendTelemetry("dismiss", prompt);
    },
    [sendTelemetry]
  );

  return {
    prompts,
    featureEnabled,
    loading,
    applyPrompt,
    dismissPrompt,
  };
}
