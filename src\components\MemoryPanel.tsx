import { useEffect, useState } from "react";
import { kapmemQuery } from "../lib/kapmem"; // if @ alias works, you can switch back to "@/lib/kapmem"

const HAS_MEM = !!(import.meta as any).env?.VITE_KAPMEM_URL; // proxy path or URL

export default function MemoryPanel({ project = "TEAIM" }: { project?: string }) {
  if (!HAS_MEM) return null;
  const [q, setQ] = useState("test cases");
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");

  const run = async () => {
    setErr("");
    try { setRows(await kapmemQuery(q, project, 8)); }
    catch(e:any){ setErr(e.message||String(e)); }
  };

  useEffect(() => { void run(); }, []);

  return (
    <div>
      <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:8}}>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Search memory…"
          style={{flex:1}}
        />
        <button onClick={run}>Search</button>
      </div>
      {err && <div style={{color:"crimson"}}>{err}</div>}
      <div style={{display:"grid", gap:8}}>
        {rows.map((r,i)=>(
          <div key={r.id||i} style={{border:"1px solid #eee", padding:12, borderRadius:10}}>
            <div style={{fontSize:12,opacity:.7}}>
              {r.meta?.project} • {r.meta?.source || r.id}
            </div>
            <div style={{whiteSpace:"pre-wrap", marginTop:6}}>
              {(r.text||"").slice(0,800)}
            </div>
          </div>
        ))}
        {rows.length===0 && <div>No memory hits yet.</div>}
      </div>
    </div>
  );
}
