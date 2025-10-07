import { useEffect, useMemo, useState } from "react";
import { getJSON, postJSON } from "@/lib/authFetch";

export default function WatcherPicker({projectId, changeId, initial=[]}:{projectId:string;changeId:string;initial:string[]}){
  const [members,setMembers]=useState<{user_id:string;email?:string;role?:string}[]>([]);
  const [sel,setSel]=useState<string[]>(initial);
  const [q,setQ]=useState("");
  useEffect(()=>{ (async()=>{ try{
    const m = await getJSON(`/api/members/all?project_id=${projectId}`); setMembers(m.items||[]);
  }catch{ setMembers([]);} })(); },[projectId]);

  const hits = useMemo(()=>{
    const qq = q.toLowerCase();
    return (members||[]).filter(m=> (m.email||m.user_id).toLowerCase().includes(qq));
  },[members,q]);

  async function save(list:string[]){
    setSel(list);
    await postJSON(`/api/changes/watchers/set?project_id=${projectId}`, { id: changeId, watchers: list });
  }

  return (
    <div className="border rounded p-2" data-testid="watcher-picker">
      <div className="text-xs font-medium mb-1">Watchers</div>
      <input 
        className="border rounded p-1 text-xs mb-1 w-full" 
        placeholder="search email…" 
        value={q} 
        onChange={e=>setQ(e.target.value)}
        data-testid="input-search-watchers"
      />
      <div className="max-h-[28vh] overflow-auto text-xs">
        {hits.map(m=>{
          const em = m.email || m.user_id; const on = sel.includes(em);
          return (
            <label key={em} className="flex items-center gap-2" data-testid={`watcher-option-${em}`}>
              <input 
                type="checkbox" 
                checked={on} 
                onChange={()=> save(on? sel.filter(x=>x!==em): [...sel, em]) }
                data-testid={`checkbox-watcher-${em}`}
              />
              <span>{em}</span>
            </label>
          );
        })}
        {!hits.length && <div className="text-muted-foreground" data-testid="no-watchers-message">No results.</div>}
      </div>
    </div>
  );
}