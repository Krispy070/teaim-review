import { useEffect, useState } from "react";

type Props = {
  id: string;                    // unique per page, e.g. "dashboard"
  title: string;                 // H1
  intro?: string;                // brief sentence
  bullets?: string[];            // what will appear here
};

export default function PageHeaderHint({ id, title, intro, bullets }: Props) {
  const key = `teaim.hint.dismissed:${id}`;
  const [hide, setHide] = useState<boolean>(false);
  
  useEffect(() => { 
    setHide(localStorage.getItem(key) === "1"); 
  }, [key]);
  
  if (hide) return (
    <div className="flex items-center justify-between mb-3">
      <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">{title}</h1>
      <button 
        className="text-xs underline text-muted-foreground hover:text-foreground transition-colors" 
        onClick={() => { localStorage.removeItem(key); setHide(false); }}
        data-testid="button-show-hint"
      >
        Show hint
      </button>
    </div>
  );
  
  return (
    <div className="mb-3">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">{title}</h1>
        <button 
          className="text-xs underline text-muted-foreground hover:text-foreground transition-colors" 
          onClick={() => { localStorage.setItem(key, "1"); setHide(true); }}
          data-testid="button-dismiss-hint"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-2 border rounded-lg p-4 bg-card text-card-foreground shadow-sm">
        {intro && <div className="text-sm mb-2 text-muted-foreground">{intro}</div>}
        {bullets && bullets.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}