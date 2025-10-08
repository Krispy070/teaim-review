export type MemoryPhase =
  | "onboarding"
  | "release"
  | "test"
  | (string & {});

export interface MemoryRecommendation {
  id: string;
  title: string;
  text: string;
  confidence?: number | null;
  memoryId?: string;
  source?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MemoryContextItem {
  id: string;
  text: string;
  score?: number;
  source?: string | null;
  metadata?: Record<string, unknown>;
}
