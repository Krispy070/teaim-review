export function Card({title, actions, children}:{title?:string; actions?:React.ReactNode; children:React.ReactNode}) {
  return (
    <div className="rounded-2xl bg-panel border border-border overflow-hidden">
      {(title || actions) && (
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <div className="font-medium">{title}</div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}