import { useEffect, useState } from "react";

export default function WellnessChip({ projectId }:{ projectId: string }) {
  const [avg, setAvg] = useState<number | null>(null);
  const [down, setDown] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/wellness/summary?project_id=${projectId}`, { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json();
        setAvg(d.avg7 ?? null);
        setDown(!!d.trend_down);
      } catch {}
    })();
  }, [projectId]);

  if (avg === null) return null;

  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border text-sm" data-testid="wellness-chip">
      <span className="font-medium">Wellness</span>
      <span className={`px-1.5 rounded ${down ? "bg-yellow-500 text-white" : "bg-green-600 text-white"}`}>
        {avg.toFixed(2)}
      </span>
      {down && <span className="text-xs">⚠️ trend↓</span>}
    </div>
  );
}