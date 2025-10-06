import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { useEffect, useState } from "react";
import Guard from "@/components/Guard";

type KeyRow = { id:string; name:string; prefix:string; scopes:string[]; createdByEmail?:string; lastUsedAt?:string; expiresAt?:string; revokedAt?:string; createdAt:string };

export default function ProjectApiKeysPage(){
  return <Guard need="member"><ProjectApiKeysPageInner /></Guard>;
}

function ProjectApiKeysPageInner(){
  const pid = getProjectId();
  const [items, setItems] = useState<KeyRow[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string>("ingest:write");
  const [expires, setExpires] = useState("");
  const [token, setToken] = useState<string>("");

  async function load(){
    const r = await fetchWithAuth(`/api/keys/list?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setItems(j.items||[]);
  }
  useEffect(()=>{ if(pid) load(); },[pid]);

  async function create(){
    const s = scopes.split(",").map(s=>s.trim()).filter(Boolean);
    const body:any = { projectId: pid, name, scopes: s };
    if (expires) body.expiresAt = new Date(expires).toISOString();
    const r = await fetchWithAuth(`/api/keys/create`, { method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const j = await r.json();
    if (r.ok) { setToken(j.token); setName(""); setExpires(""); load(); }
    else alert("Create failed: " + (j.error||""));
  }
  async function revoke(id:string){
    await fetchWithAuth(`/api/keys/revoke`, { method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id, projectId: pid }) });
    load();
  }
  async function rotate(id:string){
    const r = await fetchWithAuth(`/api/keys/rotate`, { method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id, projectId: pid }) });
    const j = await r.json();
    if (r.ok) { setToken(j.token); load(); }
    else alert("Rotate failed: " + (j.error||""));
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold" data-testid="heading-api-keys">API Keys</h1>

      {token && (
        <div className="p-3 border rounded-2xl bg-slate-900/40">
          <div className="text-sm font-medium mb-1">New Token (copy & store securely)</div>
          <code className="block text-xs break-all" data-testid="text-token">{token}</code>
          <div className="text-[11px] opacity-70 mt-1">You will not see this token again. Use it as Bearer auth.</div>
          <div className="mt-2">
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>{ navigator.clipboard.writeText(token); }} data-testid="button-copy">Copy</button>
            <button className="text-xs px-2 py-1 border rounded ml-2" onClick={()=>setToken("")} data-testid="button-dismiss">Dismiss</button>
          </div>
        </div>
      )}

      <div className="p-4 border rounded-2xl grid md:grid-cols-2 gap-2">
        <input className="border rounded px-2 py-1" placeholder="Key name (e.g., CLI Ingest)" value={name} onChange={e=>setName(e.target.value)} data-testid="input-name"/>
        <input className="border rounded px-2 py-1" placeholder="Scopes (comma, e.g., ingest:write)" value={scopes} onChange={e=>setScopes(e.target.value)} data-testid="input-scopes"/>
        <label className="text-sm">Expires (optional)</label>
        <input className="border rounded px-2 py-1" type="date" value={expires} onChange={e=>setExpires(e.target.value)} data-testid="input-expires"/>
        <div className="md:col-span-2"><button className="text-xs px-2 py-1 border rounded" onClick={create} data-testid="button-create">Create Key</button></div>
      </div>

      <div className="p-4 border rounded-2xl">
        <div className="text-sm font-medium mb-2">Existing Keys</div>
        <ul className="space-y-2">
          {items.map(k=>(
            <li key={k.id} className="text-sm p-2 border rounded-lg flex items-center justify-between" data-testid={`key-${k.id}`}>
              <div>
                <div className="font-medium">{k.name}</div>
                <div className="text-xs opacity-70">prefix {k.prefix} • scopes: {k.scopes?.join(", ") || "—"} • last used: {k.lastUsedAt? new Date(k.lastUsedAt).toLocaleString() : "—"}</div>
                {k.revokedAt && <div className="text-xs text-red-400">revoked {new Date(k.revokedAt).toLocaleString()}</div>}
              </div>
              <div className="flex items-center gap-2">
                {!k.revokedAt && <button className="text-xs px-2 py-1 border rounded" onClick={()=>rotate(k.id)} data-testid={`button-rotate-${k.id}`}>Rotate</button>}
                {!k.revokedAt && <button className="text-xs px-2 py-1 border rounded" onClick={()=>revoke(k.id)} data-testid={`button-revoke-${k.id}`}>Revoke</button>}
              </div>
            </li>
          ))}
          {!items.length && <li className="opacity-70 text-sm">No keys yet.</li>}
        </ul>
      </div>

      <div className="text-[11px] opacity-60">
        Use your key as: <code>Authorization: Bearer teaim_&lt;prefix&gt;_&lt;secret&gt;</code>. For file ingest:<br/>
        <code>curl -H "Authorization: Bearer teaim_..." -F "file=@/path/file.pdf" -F "orgId=..." -F "projectId={pid}" /api/ingest/doc</code>
      </div>
    </div>
  );
}
