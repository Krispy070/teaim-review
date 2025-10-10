import { useEffect, useState } from "react";
import { getJSON } from "@/lib/authFetch";
import PageHeaderHint from "@/components/PageHeaderHint";

export default function AdminSchemaDoctor(){
  const [data,setData] = useState<any>(null); 
  const [loading,setLoading] = useState(false);
  
  async function run(){
    setLoading(true);
    try{ 
      setData(await getJSON("/api/admin/schema_doctor")); 
    } catch(e){ 
      setData({ok:false, error:String(e)}); 
    }
    setLoading(false);
  }
  
  useEffect(()=>{ run(); },[]);
  
  return (
    <div className="p-6 space-y-3">
      <PageHeaderHint 
        id="schema-doctor" 
        title="Schema Doctor"
        intro="Detect missing tables/columns and get ready-to-copy DDL to fix local/dev."
        bullets={["Uses information_schema to check coverage","Shows SQL to add missing columns (e.g., area)"]}
      />
      
      <button
        className="brand-btn text-sm"
        onClick={run}
        disabled={loading}
        data-testid="button-rerun-check"
      >
        {loading ? "Checking…" : "Re-run check"}
      </button>
      
      {data && (
        <div className="mt-3 space-y-3">
          <div className={`px-3 py-2 rounded ${data.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'}`}>
            {data.ok ? "All required schema present" : "Missing items detected"}
          </div>
          
          {!data.ok && data.missing?.length > 0 && (
            <div className="brand-card p-2 text-sm">
              <div className="font-medium mb-2 text-[var(--text-strong)]">Missing Schema Items:</div>
              {data.missing.map((m:any,i:number)=>(
                <div key={i} className="border-b border-[var(--brand-card-border)] last:border-0 py-1 text-[var(--text)]">
                  <b>{m.table}</b>: {m.missing || (m.missing_columns||[]).join(", ")}
                </div>
              ))}
            </div>
          )}

          {data.suggested_sql?.length > 0 && (
            <div className="brand-card p-2">
              <div className="text-sm font-medium mb-2 text-[var(--text-strong)]">Suggested SQL (copy-paste ready):</div>
              <pre className="text-xs whitespace-pre-wrap font-mono rounded border border-[var(--brand-card-border)] bg-[color-mix(in_srgb,var(--brand-card-bg) 92%, rgba(255,255,255,0.08) 8%)] text-[var(--text)] p-2">
                {data.suggested_sql.join("\n")}
              </pre>
            </div>
          )}
          
          {data.error && (
            <div className="border border-red-300 dark:border-red-600 rounded p-2 bg-red-50 dark:bg-red-900/20">
              <div className="text-sm font-medium mb-1 text-red-800 dark:text-red-200">Error:</div>
              <div className="text-xs text-red-700 dark:text-red-300">{data.error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}