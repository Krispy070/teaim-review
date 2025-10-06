import { usePageFeed } from "@/data/useHealth";

export default function PageHealthBadge({ section }: { section: "docs" | "actions" | "risks" | "decisions" | "timeline" | "integrations" | "meetings" | "training" | "all" }) {
  const { counts } = usePageFeed(60000);
  if (!counts) return null;
  const colors = "px-2 py-0.5 text-[11px] rounded-full border";
  if (section === "all") {
    const sum = Object.values(counts).reduce((a: number, b: any) => a + Number(b || 0), 0);
    return <span className={colors}>Feed: {sum} items</span>;
  }
  const n = Number((counts as any)[section] || 0);
  const ok = n > 0;
  const statusColor = ok ? "border-emerald-500 text-emerald-300" : "border-amber-500 text-amber-300";
  return (
    <span className={`${colors} ${statusColor}`}>
      {String(section)}: {n || 0}
      {ok ? "" : " (empty)"}
    </span>
  );
}
