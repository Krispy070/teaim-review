import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useOrg } from "../App";

interface SearchResult {
  type: string;
  id: string;
  title: string;
  snippet: string;
  ts: string;
}

export default function SpotlightSearch(){
  const orgContext = useOrg();
  if (!orgContext) return null;
  const { projectId } = orgContext;
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      const mac = navigator.platform.toUpperCase().includes("MAC");
      if ((mac && e.metaKey && e.key.toLowerCase()==="k") || (!mac && e.ctrlKey && e.key.toLowerCase()==="k")){
        e.preventDefault(); setOpen(true);
      }
      if (e.key==="Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey); 
    return ()=>window.removeEventListener("keydown", onKey);
  },[]);

  async function run(){
    if (!q.trim() || !projectId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&project_id=${projectId}`, { credentials:"include" });
      if (r.ok) {
        const data = await r.json();
        setItems(data.items || []);
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  }

  function go(it: SearchResult){
    // Navigate to existing routes without project prefix for better compatibility
    if (it.type==="artifact") setLocation(`/documents#artifact=${it.id}`);
    else if (it.type==="action")  setLocation(`/dashboard?tab=actions`);
    else if (it.type==="risk")    setLocation(`/dashboard?tab=risks`);
    else if (it.type==="decision")setLocation(`/dashboard?tab=decisions`);
    else if (String(it.type).startsWith("mem:")) setLocation(`/timeline`);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      run();
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-start justify-center pt-24" onClick={()=>setOpen(false)}>
      <div className="w-[640px] bg-white dark:bg-neutral-900 border rounded-xl shadow-xl" onClick={e=>e.stopPropagation()}>
        <div className="p-3 border-b">
          <input 
            className="w-full bg-transparent outline-none text-black dark:text-white" 
            autoFocus 
            placeholder="Search project (⌘/Ctrl+K)…"
            value={q} 
            onChange={e=>setQ(e.target.value)} 
            onKeyDown={handleKeyDown}
            data-testid="input-search"
          />
        </div>
        <div className="max-h-[360px] overflow-auto divide-y">
          {loading && (
            <div className="p-3 text-sm text-muted-foreground" data-testid="text-loading">
              Searching...
            </div>
          )}
          {!loading && items.map((it,i)=>(
            <div 
              key={i} 
              className="p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer" 
              onClick={()=>go(it)}
              data-testid={`search-result-${it.type}-${i}`}
            >
              <div className="text-sm text-black dark:text-white">
                <b className="capitalize">{it.type}</b> — {it.title}
              </div>
              {it.snippet && <div className="text-xs text-muted-foreground">{it.snippet}</div>}
            </div>
          ))}
          {!loading && !items.length && q.trim() && (
            <div className="p-3 text-sm text-muted-foreground" data-testid="text-no-results">
              No results found for "{q}". Press Enter to search.
            </div>
          )}
          {!loading && !items.length && !q.trim() && (
            <div className="p-3 text-sm text-muted-foreground" data-testid="text-search-prompt">
              No results yet. Press Enter to search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}