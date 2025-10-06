import { useIngestHealth } from "@/data/useHealth";
import { ensureProjectPath } from "@/lib/project";

export default function IngestBanner() {
  const { data } = useIngestHealth(15000);
  if (!data) return null;
  const pend = Number(data.embed?.pending || 0) + Number(data.parse?.pending || 0);
  if (pend < 5) return null;
  return (
    <div className="p-2 bg-amber-900/30 border-b border-amber-700 text-xs flex items-center justify-between">
      <div>
        Ingestion backlog: embed={data.embed?.pending || 0} parse={data.parse?.pending || 0} • last 24h runs: ✓{data.runs24?.success || 0} ✗
        {data.runs24?.failed || 0}
      </div>
      <div className="flex items-center gap-2">
        <a className="px-2 py-0.5 border rounded hover:bg-amber-800/50" href={ensureProjectPath("/ops")} title="Open Ops / Health">
          Ops / Health
        </a>
        <a className="px-2 py-0.5 border rounded hover:bg-amber-800/50" href={ensureProjectPath("/brief")} title="Daily Brief">
          Daily Brief
        </a>
      </div>
    </div>
  );
}
