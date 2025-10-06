import { openDigestActivityLink, openDigestAreaLink } from "@/lib/digestLinks";

export default function DigestChangesGrid({
  projectId, changes
}:{ projectId:string; changes:{ table:"actions"|"risks"|"decisions"; id:string; title?:string; owner?:string; area?:string }[] }){
  if (!changes?.length) return null;
  const byArea: Record<string, typeof changes> = {};
  changes.forEach(c=> { const a=c.area||"Unassigned"; byArea[a]=[...(byArea[a]||[]), c]; });
  return (
    <div className="brand-card p-3">
      <div className="text-sm font-medium mb-1">Changes by Area</div>
      <div className="grid md:grid-cols-2 gap-3">
        {Object.keys(byArea).map(a=>(
          <div key={a} className="border rounded p-2">
            <div className="text-xs font-medium mb-1">{a}</div>
            <ul className="text-xs list-disc pl-4">
              {byArea[a].slice(0,8).map(c=>{
                const href = c.table==="actions" 
                  ? openDigestActivityLink(projectId, "actions", 7)
                  : openDigestAreaLink(projectId, c.area || "General", c.table as "risks" | "decisions");
                return <li key={`${c.table}-${c.id}`}><a className="underline" href={href}>{c.title || c.id}</a></li>;
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}