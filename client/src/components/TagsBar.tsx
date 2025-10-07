import { useEffect, useState } from "react";

export function TagsFilterBar({ projectId, onChange }:{ projectId:string; onChange:(tags:string[])=>void }){
  const [avail,setAvail] = useState<{id:string;name:string}[]>([]);
  const [sel,setSel] = useState<string[]>([]);
  useEffect(()=>{ (async ()=>{
    const r = await fetch(`/api/artifacts/tags?project_id=${projectId}`, { credentials:"include" });
    if (r.ok) setAvail((await r.json()).items||[]);
  })(); },[projectId]);
  function toggle(name:string){
    const s = sel.includes(name) ? sel.filter(x=>x!==name) : [...sel, name];
    setSel(s); onChange(s);
  }
  return (
    <div className="flex flex-wrap gap-2" data-testid="tags-filter-bar">
      {avail.map(t=>(
        <button key={t.id} onClick={()=>toggle(t.name)}
          className={`px-2 py-1 rounded border text-xs ${sel.includes(t.name)?'bg-black text-white dark:bg-white dark:text-black':'bg-white text-black dark:bg-black dark:text-white'}`}
          data-testid={`tag-filter-${t.name}`}>
          #{t.name}
        </button>
      ))}
    </div>
  );
}

export function ArtifactTagChips({ artifactId, projectId, canEdit }:{ artifactId:string; projectId:string; canEdit:boolean }){
  const [tags,setTags] = useState<{id:string;name:string}[]>([]);
  const [adding,setAdding] = useState(false);
  const [val,setVal] = useState("");

  async function load(){
    const r = await fetch(`/api/artifacts/${artifactId}/tags?project_id=${projectId}`, { credentials:"include" });
    if (r.ok) setTags((await r.json()).tags||[]);
  }
  useEffect(()=>{ load(); },[artifactId, projectId]);

  async function add(){ if(!val.trim()) return; 
    await fetch(`/api/artifacts/${artifactId}/tags/add?project_id=${projectId}`, {
      method:"POST", credentials:"include", headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:val.trim()})
    }); setVal(""); setAdding(false); load();
  }
  async function remove(name:string){
    await fetch(`/api/artifacts/${artifactId}/tags/remove?project_id=${projectId}`, {
      method:"POST", credentials:"include", headers:{'Content-Type':'application/json'}, body: JSON.stringify({name})
    }); load();
  }

  return (
    <div className="flex flex-wrap gap-1" data-testid={`artifact-tags-${artifactId}`}>
      {tags.map(t=>(
        <span key={t.id} className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[11px] flex items-center gap-1"
              data-testid={`tag-chip-${t.name}`}>
          #{t.name}{canEdit && <button onClick={()=>remove(t.name)} className="ml-1 text-xs hover:text-red-500" data-testid={`remove-tag-${t.name}`}>×</button>}
        </span>
      ))}
      {canEdit && !adding && <button className="text-xs underline hover:text-blue-500" onClick={()=>setAdding(true)} data-testid="add-tag-button">+ tag</button>}
      {canEdit && adding && (
        <span className="flex items-center gap-1" data-testid="add-tag-form">
          <input className="border rounded px-1 py-0.5 text-xs bg-white dark:bg-black text-black dark:text-white" 
                 value={val} onChange={e=>setVal(e.target.value)} placeholder="tag name" 
                 data-testid="tag-input"/>
          <button className="text-xs px-1 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600" onClick={add} data-testid="add-tag-confirm">Add</button>
          <button className="text-xs px-1 py-0.5 border rounded hover:bg-gray-100 dark:hover:bg-gray-700" onClick={()=>{setVal("");setAdding(false);}} data-testid="add-tag-cancel">Cancel</button>
        </span>
      )}
    </div>
  );
}