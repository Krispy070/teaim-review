import { useEffect, useState } from "react";
import { getJSON } from "@/lib/authFetch";
import { useParams } from "wouter";
import { Bell } from "lucide-react";

export default function NotificationDrawer(){
  const params = useParams();
  const projectId = params.projectId;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(){
    setLoading(true);
    try{
      const d = await getJSON(`/api/notifications/list?project_id=${projectId}`);
      setItems(d.items || []);
    }catch{}
    setLoading(false);
  }

  useEffect(()=>{
    load();
    const h = (e:any)=> setOpen(!!e?.detail?.open);
    window.addEventListener("kap:drawer", h);
    const t = setInterval(load, 15000);
    return ()=>{ window.removeEventListener("kap:drawer", h); clearInterval(t); };
  },[projectId]);

  async function markAll(){
    await fetch(`/api/notifications/mark_all_read?project_id=${projectId}`, { method:"POST", credentials:"include" });
    load();
  }

  return (
    <>
      <button className="brand-btn flex items-center gap-2" onClick={()=>setOpen(o=>!o)} data-testid="notification-bell">
        <Bell size={16} />
        {items.filter(item => !item.is_read).length > 0 && (
          <span className="w-2 h-2 bg-brand-accent rounded-full"></span>
        )}
      </button>
      {open && (
        <div className="fixed right-0 top-0 bottom-0 w-[380px] bg-white dark:bg-neutral-900 border-l shadow-xl z-[95] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Notifications</div>
            <button className="text-xs underline hover:no-underline" onClick={markAll} data-testid="mark-all-read">
              Mark all read
            </button>
          </div>
          {loading && <div className="text-xs text-brand-muted">Loading…</div>}
          <div className="space-y-2">
            {(items||[]).map((e:any,i:number)=>(
              <div key={i} className={`border rounded p-2 hover-lift ${e.is_read?'opacity-70':''}`} data-testid={`notification-${i}`}>
                <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                <div className="text-sm font-medium">{e.title}</div>
                {e.body && <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(e.body,null,2)}</pre>}
                {e.link && <a className="text-xs underline hover:no-underline" href={e.link}>Open</a>}
              </div>
            ))}
            {!items?.length && <div className="text-xs text-muted-foreground">No notifications.</div>}
          </div>
          <button 
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
            data-testid="close-drawer"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}