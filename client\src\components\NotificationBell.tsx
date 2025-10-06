import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { useSmartPolling } from "@/hooks/useSmartPolling";

export default function NotificationBell(){
  const { projectId } = useParams();
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<any[]>([]);
  const [unread,setUnread]=useState(0);

  const load = useCallback(async () => {
    if (!projectId) return;
    const d = await getJSON(`/api/notifications/list?project_id=${projectId}`);
    const it = d.items || [];
    setItems(it);
    setUnread(Math.min(99, it.filter((x:any)=>!x.is_read).length));
  }, [projectId]);

  // Smart polling with backoff - starts at 15s, backs off to max 2 minutes on errors
  useSmartPolling(load, {
    interval: 15000,
    maxInterval: 120000,
    enabled: !!projectId,
    pauseOnHidden: true,
    pauseOnError: false // Continue retrying at maxInterval during outages
  });

  async function markAll(){
    await fetch(`/api/notifications/mark_all_read${projectId?`?project_id=${projectId}`:""}`, { method:"POST", credentials:"include" });
    load();
  }

  return (
    <div className="relative">
      <button className="relative px-2 py-1 border rounded" onClick={()=>setOpen(o=>!o)} data-testid="button-notifications">
        🔔
        {unread>0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] px-1 rounded-full" data-testid={`badge-unread-${unread}`}>{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[420px] overflow-auto border rounded bg-white dark:bg-neutral-900 shadow z-[90]" data-testid="notifications-panel">
          <div className="p-2 flex items-center justify-between">
            <div className="text-sm font-medium">Notifications</div>
            <button className="text-xs underline" onClick={markAll} data-testid="button-mark-all-read">Mark all read</button>
          </div>
          {(items||[]).map((e:any,i:number)=>(
            <div key={i} className={`p-2 border-b last:border-0 text-sm ${e.is_read?'opacity-70':''}`} data-testid={`notification-item-${i}`}>
              <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
              <div className="font-medium">{e.title}</div>
              {e.body && <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(e.body, null, 2)}</pre>}
              {e.link && <a className="text-xs underline" href={e.link} data-testid={`link-notification-${i}`}>Open</a>}
            </div>
          ))}
          {!items?.length && <div className="p-3 text-sm text-muted-foreground" data-testid="no-notifications">No notifications.</div>}
        </div>
      )}
    </div>
  );
}