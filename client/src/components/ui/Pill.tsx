export function Pill({tone='neutral', children}:{tone?:'neutral'|'success'|'warning'|'error'|'info'; children:React.ReactNode;}) {
  const map = {
    neutral: 'bg-panelc text-fg',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    error:   'bg-error/15 text-error',
    info:    'bg-accent/15 text-accent',
  } as const;
  return <span className={`text-xs px-2 py-0.5 rounded-full border border-border ${map[tone]}`}>{children}</span>;
}