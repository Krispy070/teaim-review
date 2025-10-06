import { usePresence } from "@/hooks/usePresence";

interface PresenceIndicatorProps {
  area?: string;
  className?: string;
  projectId?: string;
}

export default function PresenceIndicator({ area, className = "", projectId }: PresenceIndicatorProps) {
  const { activeUsers, loading, activeCount } = usePresence({ 
    area, 
    enabled: !!projectId, 
    projectId 
  });

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="presence-loading">
        <div className="text-xs text-muted-foreground">Loading presence...</div>
      </div>
    );
  }

  if (!activeCount) {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="presence-empty">
        <div className="text-xs text-muted-foreground">
          {area ? `No one active in ${area}` : 'No one active'}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="presence-indicator">
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" data-testid="presence-dot" />
        <span className="text-xs text-muted-foreground" data-testid="presence-count">
          {activeCount} active
          {area && ` in ${area}`}
        </span>
      </div>
      
      {activeUsers.length > 0 && (
        <div className="flex -space-x-1" data-testid="presence-avatars">
          {activeUsers.slice(0, 3).map((user, index) => (
            <div
              key={user.user_id}
              className="w-6 h-6 bg-blue-500 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs text-white font-medium"
              data-testid={`presence-avatar-${index}`}
              title={`Active ${Math.round((new Date().getTime() - new Date(user.last_seen).getTime()) / (1000 * 60))}m ago`}
            >
              {user.user_id.slice(0, 2).toUpperCase()}
            </div>
          ))}
          {activeUsers.length > 3 && (
            <div
              className="w-6 h-6 bg-gray-500 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs text-white font-medium"
              data-testid="presence-overflow"
              title={`+${activeUsers.length - 3} more`}
            >
              +{activeUsers.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}