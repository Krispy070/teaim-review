import { useState, useCallback, useEffect } from "react";
import { useParams } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { useSmartPolling } from "./useSmartPolling";

interface PresenceUser {
  user_id: string;
  last_seen: string;
  area?: string;
}

interface UsePresenceOptions {
  area?: string;
  enabled?: boolean;
  refreshInterval?: number;
  projectId?: string;
}

export function usePresence(options: UsePresenceOptions = {}) {
  const { area, enabled = true, refreshInterval = 30000, projectId: propProjectId } = options;
  // Always call useParams to maintain hook order consistency
  const { projectId: routeProjectId } = useParams();
  // Prefer prop projectId over route projectId
  const projectId = propProjectId || routeProjectId;
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPresence = useCallback(async () => {
    console.log('🔍 loadPresence called with:', { projectId, enabled, area });
    if (!projectId || !enabled) {
      setLoading(false); // Don't stay loading when disabled or no projectId
      return;
    }
    
    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (area) params.set('area', area);
      
      const data = await getJSON(`/api/presence/list?${params}`);
      setUsers(data.users || []);
      setError(null);
    } catch (err) {
      console.warn('Failed to load presence data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load presence');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled, area]);

  // Smart polling with exponential backoff for presence data
  const { consecutiveErrors, isPaused } = useSmartPolling(loadPresence, {
    interval: refreshInterval,
    maxInterval: Math.max(refreshInterval * 4, 120000), // Max 2 minutes or 4x interval
    enabled: enabled && !!projectId,
    pauseOnHidden: true,
    pauseOnError: false // Don't hard pause, continue with backoff
  });

  // Update error state based on polling status (in useEffect to avoid render loops)
  useEffect(() => {
    if (consecutiveErrors > 0 && !error) {
      setError(`Connection issues (${consecutiveErrors} failed attempts)`);
    } else if (consecutiveErrors === 0 && error) {
      setError(null);
    }
  }, [consecutiveErrors, error]);

  // Ensure loading becomes false when polling is disabled
  useEffect(() => {
    if (!enabled || !projectId) {
      setLoading(false);
    }
  }, [enabled, projectId]);

  const activeUsers = users.filter(user => {
    const lastSeen = new Date(user.last_seen);
    const now = new Date();
    const minutesAgo = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    return minutesAgo <= 5; // Consider active if seen within 5 minutes
  });

  return {
    users,
    activeUsers,
    loading,
    error,
    refresh: loadPresence,
    activeCount: activeUsers.length
  };
}