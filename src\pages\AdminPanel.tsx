import { useEffect, useState } from "react";

type User = { id: string; email: string; role: string; active: boolean };

async function api<T>(path: string, options?: RequestInit) {
  const r = await fetch(`/api${path}`, { headers: { "Content-Type":"application/json" }, ...options });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("worker");
  const [err, setErr] = useState("");

  const refresh = async () => {
    setErr("");
    try {
      const j = await api<{users:User[]}>("/admin/users");
      setUsers(j.users);
    } catch (e:any) { setErr(e.message || String(e)); }
  };

  useEffect(() => { void refresh(); }, []);

  const invite = async () => {
    setErr("");
    try {
      await api("/admin/invite", { method:"POST", body: JSON.stringify({ email, role }) });
      setEmail(""); setRole("worker"); await refresh();
    } catch (e:any) { setErr(e.message || String(e)); }
  };

  const reset = async (id:string) => {
    setErr(""); try { await api("/admin/reset", { method:"POST", body: JSON.stringify({ id }) }); }
    catch (e:any) { setErr(e.message || String(e)); }
  };

  const deactivate = async (id:string) => {
    setErr(""); try { await api("/admin/deactivate", { method:"POST", body: JSON.stringify({ id }) }); await refresh(); }
    catch (e:any) { setErr(e.message || String(e)); }
  };

  return (
    <div style={{paddingTop:8}}>
      <h3>Admin</h3>
      <div style={{display:"flex", gap:8, marginBottom:12}}>
        <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <select value={role} onChange={e=>setRole(e.target.value)}>
          <option value="admin">admin</option>
          <option value="pm">pm</option>
          <option value="csuite">csuite</option>
          <option value="functional">functional</option>
          <option value="data">data</option>
          <option value="worker">worker</option>
        </select>
        <button onClick={invite}>Invite</button>
      </div>
      {err && <div style={{color:"crimson"}}>{err}</div>}

      <div style={{display:"grid", gap:8}}>
        {users.map(u=>(
          <div key={u.id} style={{border:"1px solid #eee", padding:10, borderRadius:8}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div>
                <b>{u.email}</b> — {u.role} — {u.active ? "active" : "inactive"}
              </div>
              <div style={{display:"flex", gap:8}}>
                <button onClick={()=>reset(u.id)}>Reset</button>
                <button onClick={()=>deactivate(u.id)}>Deactivate</button>
              </div>
            </div>
          </div>
        ))}
        {users.length===0 && <div>No users yet.</div>}
      </div>
    </div>
  );
}
