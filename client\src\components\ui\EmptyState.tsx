export function EmptyState({title, hint, cta}:{title:string; hint?:string; cta?:React.ReactNode}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-panel p-8 text-center">
      <div className="text-lg font-medium">{title}</div>
      {hint && <div className="mt-1 text-muted">{hint}</div>}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}