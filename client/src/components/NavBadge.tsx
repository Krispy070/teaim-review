import { useEffect, useState } from "react";

export default function NavBadge({ projectId, kind }: { projectId: string; kind: string }) {
  const [n, setN] = useState<number>(0);
  
  useEffect(() => { 
    (async () => {
      try {
        const r = await fetch(`/api/review/pending-count?project_id=${projectId}&kind=${encodeURIComponent(kind)}`, { 
          credentials: "include" 
        });
        if (r.ok) setN((await r.json()).count || 0);
      } catch {}
    })(); 
  }, [projectId, kind]);

  if (!n) return null;
  
  return (
    <span 
      className="ml-1 inline-flex items-center justify-center text-[10px] leading-none px-1.5 h-4 rounded-full bg-red-600 text-white"
      data-testid={`badge-${kind}-${n}`}
    >
      {n}
    </span>
  );
}