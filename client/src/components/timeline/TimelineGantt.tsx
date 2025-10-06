import { useMemo } from "react";

type Item = { 
  id: string; 
  title: string; 
  startsAt?: string; 
  endsAt?: string; 
  type?: string 
};

export default function TimelineGantt({ items }: { items: Item[] }) {
  const data = items.filter(i => i.startsAt).map(i => ({
    ...i,
    start: new Date(i.startsAt!),
    end: i.endsAt ? new Date(i.endsAt) : new Date(new Date(i.startsAt!).getTime() + 24*60*60*1000)
  }));

  const { min, max } = useMemo(() => {
    if (!data.length) return { min: new Date(), max: new Date() };
    const t = data.map(d => d.start.getTime()).concat(data.map(d => d.end.getTime()));
    return { min: new Date(Math.min(...t)), max: new Date(Math.max(...t)) };
  }, [items]);

  const span = Math.max(1, (max.getTime() - min.getTime()));
  function pct(date: Date) { 
    return ((date.getTime() - min.getTime()) / span) * 100; 
  }

  const colors: Record<string, string> = {
    meeting: "bg-blue-500", 
    phase: "bg-purple-500", 
    milestone: "bg-green-500", 
    other: "bg-gray-400"
  };

  if (!data.length) {
    return (
      <div className="border rounded-2xl p-6 text-center opacity-60" data-testid="timeline-gantt-empty">
        No timeline events with dates yet.
      </div>
    );
  }

  return (
    <div className="border rounded-2xl p-4" data-testid="timeline-gantt">
      <div className="text-xs opacity-60 mb-4">
        {min.toLocaleDateString()} → {max.toLocaleDateString()}
      </div>
      <div className="relative" style={{ minHeight: `${data.length * 50}px` }}>
        {data.map((d, index) => {
          const left = pct(d.start);
          const width = Math.max(0.5, pct(d.end) - pct(d.start));
          const color = colors[d.type || "other"] || colors.other;
          const top = index * 50;
          
          return (
            <div 
              key={d.id} 
              className="absolute" 
              style={{ 
                left: `${left}%`, 
                width: `${width}%`,
                top: `${top}px`
              }}
              data-testid={`timeline-bar-${d.id}`}
            >
              <div 
                className={`h-6 ${color} rounded-md opacity-80 hover:opacity-100 transition-opacity cursor-pointer`}
                title={`${d.title} (${d.start.toLocaleDateString()} - ${d.end.toLocaleDateString()})`}
              />
              <div className="text-[11px] mt-1 truncate max-w-[200px]">{d.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
