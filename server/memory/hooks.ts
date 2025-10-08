import fetch, { type Response } from "node-fetch";
import type { MemoryContextItem, MemoryPhase, MemoryRecommendation } from "@shared/memory";

const API_BASE = (() => {
  const direct = process.env.MEMORY_API_BASE || process.env.MEMORY_SERVICE_URL;
  if (direct && direct.trim()) return direct.replace(/\/$/, "");
  const fastApiPort = process.env.FASTAPI_PORT || process.env.PORT || "8000";
  return `http://127.0.0.1:${fastApiPort}`.replace(/\/$/, "");
})();

const AUTH_HEADER = process.env.MEMORY_API_TOKEN
  ? { Authorization: `Bearer ${process.env.MEMORY_API_TOKEN}` }
  : undefined;

function buildUrl(path: string, query?: Record<string, string | undefined | null>) {
  const url = new URL(path, API_BASE.startsWith("http") ? API_BASE : `http://${API_BASE}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Memory API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

type RecommendationsResponse = {
  recommendations?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
};

type RetrieveResponse = {
  results?: Array<Record<string, unknown>>;
  contexts?: Array<Record<string, unknown>>;
};

function normaliseRecommendations(
  raw: Array<Record<string, unknown>>,
  phase: MemoryPhase
): MemoryRecommendation[] {
  return raw.slice(0, 4).map((item, index) => {
    const id = String(
      (item.id as string | number | undefined) ??
        (item.memory_id as string | number | undefined) ??
        (item.entry_id as string | number | undefined) ??
        `${phase}-${index}`
    );
    const title =
      (item.title as string | undefined) ??
      (item.heading as string | undefined) ??
      (item.summary as string | undefined) ??
      "Suggested follow-up";
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
      id,
      title,
      text,
      confidence: typeof confidenceValue === "number" ? confidenceValue : null,
      memoryId: (item.memory_id as string | undefined) ?? (item.entry_id as string | undefined) ?? id,
      source: (item.source as string | undefined) ?? (item.phase as string | undefined) ?? null,
      metadata: item,
    } satisfies MemoryRecommendation;
  });
}

function normaliseContexts(raw: Array<Record<string, unknown>>): MemoryContextItem[] {
  return raw.map((item, index) => {
    const id = String((item.id as string | number | undefined) ?? index);
    return {
      id,
      text: (item.text as string | undefined) ?? (item.content as string | undefined) ?? "",
      score: (item.score as number | undefined) ?? (item.similarity as number | undefined),
      source: (item.source as string | undefined) ?? null,
      metadata: item,
    } satisfies MemoryContextItem;
  });
}

export async function getRecommendations(
  projectId: string,
  phase: MemoryPhase
): Promise<MemoryRecommendation[]> {
  const url = buildUrl("/api/memory/recommendations", {
    project_id: projectId,
    phase: phase || undefined,
  });
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(AUTH_HEADER || {}),
    },
  });
  const data = await handleResponse<RecommendationsResponse>(res);
  const raw = Array.isArray(data.recommendations)
    ? data.recommendations
    : Array.isArray(data.items)
      ? data.items
      : [];
  return normaliseRecommendations(raw, phase).slice(0, 2);
}

export async function getContexts(
  projectId: string,
  query: string,
  phase?: MemoryPhase
): Promise<MemoryContextItem[]> {
  const res = await fetch(buildUrl("/api/memory/retrieve"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(AUTH_HEADER || {}),
    },
    body: JSON.stringify({
      project_id: projectId,
      query,
      ...(phase ? { phase } : {}),
    }),
  });
  const data = await handleResponse<RetrieveResponse>(res);
  const raw = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data.contexts)
      ? data.contexts
      : [];
  return normaliseContexts(raw);
}
