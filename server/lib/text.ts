import sw from "stopword";

export function extractKeywords(text: string, max = 8): string[] {
  const words = text.toLowerCase().match(/[a-z0-9\-]{3,}/g) || [];
  const filtered = sw.removeStopwords(words);
  const freq = new Map<string, number>();
  for (const w of filtered) freq.set(w, (freq.get(w) || 0) + 1);
  return Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0, max).map(([w])=>w);
}

export function summarize(text: string, maxChars = 400): string {
  if (!text) return "";
  const s = text.trim().replace(/\s+/g, " ");
  return s.length <= maxChars ? s : s.slice(0, maxChars) + "…";
}
