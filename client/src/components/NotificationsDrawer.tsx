import { useEffect, useState } from "react";

interface NotificationItem {
  kind: string;
  created_at: string;
  title: string;
  detail: string;
}

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    
    const loadNotifications = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/notify/list`, { credentials: "include" });
        const data = await response.json();
        setItems(data.items || []);
      } catch (error) {
        console.warn('Failed to load notifications:', error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [open]);

  if (!open) return null;

  const handleMarkAllRead = async () => {
    try {
      await fetch(`/api/notify/mark_read_all`, {
        method: "POST",
        credentials: "include"
      });
      onClose();
    } catch (error) {
      console.warn('Failed to mark all as read:', error);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[210]" onClick={onClose} data-testid="notifications-overlay">
      <div 
        className="absolute right-0 top-0 bottom-0 w-[360px] bg-white dark:bg-neutral-900 border-l border-border shadow-xl" 
        onClick={(e) => e.stopPropagation()}
        data-testid="notifications-drawer"
      >
        <div className="p-4 border-b border-border flex items-center justify-between" data-testid="notifications-header">
          <div className="text-sm font-medium">Notifications</div>
          <button 
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={handleMarkAllRead}
            data-testid="button-mark-all-read"
          >
            Mark all read
          </button>
        </div>
        
        <div className="overflow-auto h-full pb-20" data-testid="notifications-list">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground" data-testid="notifications-loading">
              Loading notifications...
            </div>
          ) : items.length > 0 ? (
            <div className="p-2 space-y-2">
              {items.map((notification, index) => (
                <div 
                  key={index} 
                  className="border border-border rounded-lg p-3 text-sm hover:bg-muted/50 transition-colors"
                  data-testid={`notification-item-${index}`}
                >
                  <div className="text-xs text-muted-foreground mb-1" data-testid={`notification-meta-${index}`}>
                    {new Date(notification.created_at).toLocaleString()} • {notification.kind}
                  </div>
                  <div className="font-medium text-foreground mb-1" data-testid={`notification-title-${index}`}>
                    {notification.title}
                  </div>
                  {notification.detail && (
                    <div className="text-muted-foreground text-xs" data-testid={`notification-detail-${index}`}>
                      {notification.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground" data-testid="notifications-empty">
              <div className="text-sm">No recent notifications</div>
              <div className="text-xs mt-1">Check back later for updates</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}