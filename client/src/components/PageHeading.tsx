import { Link } from "wouter";

export default function PageHeading({
  title, crumbs, actions
}:{ title:string; crumbs?: { label:string; to?:string }[]; actions?: React.ReactNode[] }){
  return (
    <div className="mb-3">
      {crumbs && crumbs.length>0 && (
        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
          {crumbs.map((c,i)=>(
            <span key={i} className="flex items-center gap-1">
              {c.to ? <Link to={c.to} className="underline hover:opacity-80">{c.label}</Link> : <span>{c.label}</span>}
              {i<crumbs.length-1 && <span>›</span>}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold heading">{title}</div>
        {actions && actions.length > 0 && (
          <div className="flex items-center gap-2">
            {actions.map((action, i) => (
              <span key={i}>{action}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}