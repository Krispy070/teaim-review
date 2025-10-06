import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
// @ts-ignore - Mixed JS/TS import issue
import { useOrg } from '../App';

// Global state for nav updates
let globalNavState = {
  unseenCount: 0,
  lastSeen: Date.now(),
  listeners: new Set<(count: number) => void>()
};

export function useNavUpdates() {
  const org = useOrg();
  const projectId = org?.projectId;
  const [unseenCount, setUnseenCount] = useState(globalNavState.unseenCount);

  // Poll for audit activity every 15 seconds
  const { data: auditData } = useQuery({
    queryKey: [`/api/audit/list?project_id=${projectId}&limit=50`],
    enabled: !!projectId,
    refetchInterval: 15000, // 15 second polling
    refetchIntervalInBackground: true,
    staleTime: 5000
  });

  // Calculate unseen count based on audit activity
  useEffect(() => {
    const items = (auditData as any)?.items;
    if (!items) return;
    
    const recentItems = items.filter((item: any) => {
      const itemTime = new Date(item.created_at).getTime();
      return itemTime > globalNavState.lastSeen;
    });
    
    const newCount = Math.min(recentItems.length, 99); // Cap at 99
    if (newCount !== globalNavState.unseenCount) {
      globalNavState.unseenCount = newCount;
      // Notify all listeners
      globalNavState.listeners.forEach(listener => listener(newCount));
    }
  }, [auditData]);

  // Register listener for global state changes
  useEffect(() => {
    const listener = (count: number) => setUnseenCount(count);
    globalNavState.listeners.add(listener);
    return () => {
      globalNavState.listeners.delete(listener);
    };
  }, []);

  const markAllAsSeen = useCallback(() => {
    globalNavState.lastSeen = Date.now();
    globalNavState.unseenCount = 0;
    // Store in localStorage for persistence
    localStorage.setItem(`nav_updates_seen_${projectId}`, globalNavState.lastSeen.toString());
    // Notify all listeners
    globalNavState.listeners.forEach(listener => listener(0));
  }, [projectId]);

  // Load last seen time from localStorage on mount
  useEffect(() => {
    if (projectId) {
      const stored = localStorage.getItem(`nav_updates_seen_${projectId}`);
      if (stored) {
        globalNavState.lastSeen = parseInt(stored, 10);
      }
    }
  }, [projectId]);

  return {
    unseenCount,
    markAllAsSeen,
    hasUpdates: unseenCount > 0
  };
}