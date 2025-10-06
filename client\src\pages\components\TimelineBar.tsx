export function TimelineBar({label, progress, color}:{label:string; progress:number; color?:string}) {
  return (
    <div className="grid grid-cols-5 items-center gap-4">
      <div className="col-span-1 text-sm text-muted">{label}</div>
      <div className="col-span-4">
        <div className="h-2 w-full rounded-full bg-panelc border border-border">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${progress}%`, background: color || 'hsl(var(--primary))' }}
          />
        </div>
      </div>
    </div>
  );
}