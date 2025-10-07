import { useEffect, useState, useRef } from "react";
import { fetchWithAuth } from "@/lib/supabase";
import { useProject } from "@/contexts/ProjectContext";

type Item = { id: string; type: string; payload: any; isRead: boolean; createdAt: string };

export default function NotificationBell() {
  const [count, setCount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const { selectedProject } = useProject();
  const projectId = selectedProject?.id;
  const autoMarkTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function refreshCount() {
    if (!projectId) return;
    try {
      const r = await fetchWithAuth(`/api/notifications/count?projectId=${encodeURIComponent(projectId)}`);
      if (r.ok) {
        const j = await r.json();
        setCount(j.count || 0);
      }
    } catch (err) {
      console.error("Failed to refresh notification count:", err);
    }
  }

  async function loadList() {
    if (!projectId) return;
    try {
      const r = await fetchWithAuth(`/api/notifications/list?projectId=${encodeURIComponent(projectId)}`);
      if (r.ok) {
        const j = await r.json();
        setItems(j.items || []);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  }

  async function markAllRead() {
    if (!projectId) return;
    await fetchWithAuth(`/api/notifications/mark-all-read`, {
      method: "POST",
      body: JSON.stringify({ projectId })
    });
    refreshCount();
    loadList();
  }

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 15000);
    return () => clearInterval(t);
  }, [projectId]);

  useEffect(() => {
    if (open && items.length > 0) {
      if (autoMarkTimerRef.current) clearTimeout(autoMarkTimerRef.current);
      autoMarkTimerRef.current = setTimeout(() => {
        markAllRead();
      }, 1000);
    }
    return () => {
      if (autoMarkTimerRef.current) clearTimeout(autoMarkTimerRef.current);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    
    const handleScroll = () => {
      setOpen(false);
    };

    const scrollContainer = document.querySelector(".app-shell-content");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll);
    }
    window.addEventListener("scroll", handleScroll);

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [open]);

  return (
    <div className="relative">
      <button 
        className="relative px-3 py-2 rounded-lg border hover:bg-accent transition-colors" 
        onClick={async () => {
          setOpen(o => !o);
          if (!open) await loadList();
        }}
        data-testid="button-notifications"
      >
        🔔
        {count > 0 && (
          <span 
            className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white"
            data-testid="text-notification-count"
          >
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-96 max-h-[60vh] overflow-auto border rounded-2xl bg-background shadow-xl p-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Notifications</div>
            <button 
              className="text-xs px-2 py-1 border rounded-lg hover:bg-accent transition-colors" 
              onClick={markAllRead}
              data-testid="button-mark-all-read"
            >
              Mark all read
            </button>
          </div>
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id} className="p-2 rounded-lg border" data-testid={`notification-item-${n.id}`}>
                <div className="text-xs opacity-60">{new Date(n.createdAt).toLocaleString()} • {n.type}</div>
                <div className="text-sm">
                  {n.type === "doc_ingested" ? (
                    <>New document: <strong>{n.payload?.name}</strong></>
                  ) : (
                    <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(n.payload)}</pre>
                  )}
                </div>
              </li>
            ))}
            {items.length === 0 && <li className="text-sm opacity-70">No notifications.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
