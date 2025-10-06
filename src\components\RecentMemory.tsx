import { useEffect, useState } from "react";
import { kapmemQuery } from "../lib/kapmem";

const HAS_MEM = !!(import.meta as any).env?.VITE_KAPMEM_URL;

export default function RecentMemory({ project="TEAIM" }: { project?: string }) {
  if (!HAS_MEM) return null;
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");

  const refresh = async () => {
    setErr("");
    try {
      const hits = await kapmemQuery("test", project, 5);
      setRows(hits);
    } catch (e:any) {
      setErr(e.message || String(e));
    }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <div style={{margin:"12px 0 16px"}}>
      <div style={{fontWeight:600, marginBottom:8}}>Recent Memory</div>
      {err && <div style={{color:"crimson"}}>{err}</div>}
      <div style={{display:"grid", gap:8}}>
        {rows.map((r,i)=>(
          <div key={r.id||i} style={{border:"1px solid #eee", padding:10, borderRadius:8}}>
            <div style={{fontSize:12,opacity:.7}}>{r.meta?.project} • {r.meta?.source || r.id}</div>
            <div style={{whiteSpace:"pre-wrap", marginTop:4}}>
              {(r.text||"").slice(0,200)}{(r.text||"").length>200?"…":""}
            </div>
          </div>
        ))}
        {rows.length===0 && <div style={{opacity:.7}}>No recent memory yet.</div>}
      </div>
    </div>
  );
}
