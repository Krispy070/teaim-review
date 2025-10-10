import { getProjectId } from "@/lib/project";
import { authFetch } from "@/lib/authFetch";
import { useEffect, useState } from "react";
import OriginBadge from "@/components/OriginBadge";

export default function MARisks() {
  const pid = getProjectId();
  const [matrix, setMatrix] = useState<number[][]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<{p?:number,i?:number}>({});
  
  const [pbin, setPbin] = useState<{min:number,max:number}>({min:1,max:5});
  const [ibin, setIbin] = useState<{min:number,max:number}>({min:1,max:5});
  const [statusF, setStatusF] = useState<string>("any");
  const [tagF, setTagF] = useState<string>("");
  const [originF, setOriginF] = useState<string>("all");

  async function load() {
    const r1 = await authFetch(`/api/ma/risks/heatmap?projectId=${encodeURIComponent(pid!)}`); 
    const j1 = await r1.json(); setMatrix(j1.matrix || []);
    const params = new URLSearchParams({ projectId: pid! });
    if (originF && originF !== "all") params.set("originType", originF);
    const r2 = await authFetch(`/api/ma/risks?${params.toString()}`);
    const j2 = await r2.json(); setItems(j2.items || []);
  }
  useEffect(()=>{ if(pid) load(); },[pid, originF]);

  function bucket(p:number){ return Math.max(1, Math.min(5, Math.ceil(p/20))); }
  function impactBin(i:number){ return Math.max(1, Math.min(5, i)); }
  const filtered = items.filter(r=>{
    if (filter.p && bucket(r.probability)!==filter.p) return false;
    if (filter.i && impactBin(r.impact)!==filter.i) return false;
    return true;
  });

  return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Risks</h1>
          <div className="flex items-center gap-2">
            <a className="text-xs px-2 py-1 border rounded-lg" href={`/api/ma/risks/export.csv?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-csv">Export CSV</a>
            <a className="text-xs px-2 py-1 border rounded-lg" href={`/api/ma/risks/heatmap.svg?projectId=${encodeURIComponent(pid!)}`} target="_blank" rel="noreferrer" data-testid="link-heatmap">Download Heatmap</a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-3 border rounded-2xl">
          <div className="text-xs opacity-70">Prob bin</div>
          <select className="border rounded px-2 py-1 text-sm" value={pbin.min} onChange={e=>setPbin(v=>({...v, min:Number(e.target.value)})) } data-testid="select-pmin">{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select>
          <span>to</span>
          <select className="border rounded px-2 py-1 text-sm" value={pbin.max} onChange={e=>setPbin(v=>({...v, max:Number(e.target.value)}))} data-testid="select-pmax">{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select>
          <div className="text-xs opacity-70 ml-3">Impact</div>
          <select className="border rounded px-2 py-1 text-sm" value={ibin.min} onChange={e=>setIbin(v=>({...v, min:Number(e.target.value)}))} data-testid="select-imin">{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select>
          <span>to</span>
          <select className="border rounded px-2 py-1 text-sm" value={ibin.max} onChange={e=>setIbin(v=>({...v, max:Number(e.target.value)}))} data-testid="select-imax">{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select>
          <select className="border rounded px-2 py-1 text-sm ml-3" value={statusF} onChange={e=>setStatusF(e.target.value)} data-testid="select-status">
            <option value="any">any status</option>
            <option value="open">open</option>
            <option value="mitigating">mitigating</option>
            <option value="accepted">accepted</option>
            <option value="closed">closed</option>
          </select>
          <input className="border rounded px-2 py-1 text-sm" placeholder="tag contains…" value={tagF} onChange={e=>setTagF(e.target.value)} data-testid="input-tag" />
          <select className="border rounded px-2 py-1 text-sm" value={originF} onChange={e=>setOriginF(e.target.value)} data-testid="select-origin">
            <option value="all">any origin</option>
            <option value="meeting">meeting</option>
            <option value="conversation">conversation</option>
            <option value="doc">document</option>
          </select>
          <a
            className="text-xs px-2 py-1 border rounded-lg"
            href={`/api/ma/risks/export.csv?projectId=${encodeURIComponent(pid!)}&pmin_bin=${pbin.min}&pmax_bin=${pbin.max}&imin=${ibin.min}&imax=${ibin.max}${statusF!=="any" ? `&status=${encodeURIComponent(statusF)}` : ""}${tagF ? `&tag=${encodeURIComponent(tagF)}` : ""}`}
            data-testid="link-export-filtered"
          >
            Export filtered CSV
          </a>
        </div>

        {/* Heatmap */}
        <div>
          <div className="text-sm mb-2">Heatmap (Probability × Impact)</div>
          <div className="grid grid-cols-6 gap-1 items-center">
            <div></div>{[1,2,3,4,5].map(i=><div key={i} className="text-center text-xs">I{i}</div>)}
            {matrix.map((row, pi)=>(
              <>
                <div className="text-xs text-right pr-1">P{pi+1}</div>
                {row.map((n, ii)=>{
                  const active = filter.p===pi+1 && filter.i===ii+1;
                  const shade = n===0 ? "bg-slate-800" : n<3 ? "bg-emerald-700" : n<6 ? "bg-amber-600" : "bg-red-700";
                  return (
                    <button key={`${pi}-${ii}`}
                      onClick={()=> setFilter(f=> (f.p===pi+1 && f.i===ii+1) ? {} : {p:pi+1, i:ii+1})}
                      className={`h-8 rounded ${shade} ${active?"ring-2 ring-white":""}`}
                      title={`P${pi+1}×I${ii+1}: ${n}`} >
                      <span className="text-xs">{n}</span>
                    </button>
                  );
                })}
              </>
            ))}
          </div>
          { (filter.p||filter.i) && <button className="mt-2 text-xs underline" onClick={()=>setFilter({})}>Clear filter</button>}
        </div>

        {/* List */}
        <ul className="space-y-2">
          {filtered.map(r=>(
            <li key={r.id} className="p-3 border rounded-2xl text-sm">
              <div className="flex items-center gap-2">
                <div className="font-medium flex-1">{r.title}</div>
                <OriginBadge type={r.origin_type} id={r.origin_id} />
              </div>
              <div className="text-xs opacity-70">P{r.probability}% × I{r.impact} → Sev {r.severity_score}</div>
              {r.mitigation && <div className="text-xs mt-1">Mitigation: {r.mitigation}</div>}
            </li>
          ))}
          {!filtered.length && <li className="opacity-70 text-sm">No risks in this bucket.</li>}
        </ul>
      </div>
  );
}
