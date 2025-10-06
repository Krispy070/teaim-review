import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

interface AreaUpdate {
  area: string;
  lastSeen: string;
  hasUpdates: boolean;
  commentCount: number;
}

interface UseAreaUpdatesOptions {
  projectId?: string;
}

export function useAreaUpdates({ projectId }: UseAreaUpdatesOptions) {
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});

  // Query for comment counts to check for updates
  const { data: commentData } = useQuery({
    queryKey: [`/api/area_comments/count?project_id=${projectId}`],
    enabled: !!projectId,
  });

  // Load last seen timestamps from localStorage on mount
  useEffect(() => {
    if (!projectId) return;
    
    try {
      const stored: Record<string, string> = {};
      // Load all area lastSeen values for this project
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`kap.area.lastSeen.${projectId}.`)) {
          const area = key.replace(`kap.area.lastSeen.${projectId}.`, '');
          const value = localStorage.getItem(key);
          if (value) {
            stored[area] = value;
          }
        }
      }
      setLastSeenMap(stored);
    } catch (error) {
      console.warn('Failed to load area last seen data:', error);
    }
  }, [projectId]);

  // Calculate which areas have updates
  const areas = (commentData as any)?.areas || [];
  const areaUpdates: AreaUpdate[] = areas.map((areaData: any) => {
    const area = areaData.area;
    const commentCount = areaData.comment_count || 0;
    const lastSeen = lastSeenMap[area];
    
    // Get last known count for this area
    let lastKnownCount = 0;
    try {
      const countKey = `kap.area.lastCount.${projectId}.${area}`;
      const stored = localStorage.getItem(countKey);
      lastKnownCount = stored ? parseInt(stored, 10) : 0;
    } catch {}
    
    // Show updates if current count is higher than last known count
    const hasUpdates = commentCount > lastKnownCount;
    
    return {
      area,
      lastSeen: lastSeen || '',
      hasUpdates,
      commentCount
    };
  });

  // Function to mark an area as seen
  const markAreaAsSeen = (area: string) => {
    if (!projectId) return;
    
    const now = new Date().toISOString();
    try {
      // Save timestamp for last seen
      localStorage.setItem(`kap.area.lastSeen.${projectId}.${area}`, now);
      setLastSeenMap(prev => ({
        ...prev,
        [area]: now
      }));
      
      // Save current comment count to track changes
      const areaData = areas.find((a: any) => a.area === area);
      if (areaData) {
        const countKey = `kap.area.lastCount.${projectId}.${area}`;
        localStorage.setItem(countKey, String(areaData.comment_count || 0));
      }
    } catch (error) {
      console.warn('Failed to save area last seen data:', error);
    }
  };

  // Get update status for a specific area
  const hasAreaUpdates = (area: string): boolean => {
    const areaUpdate = areaUpdates.find(a => a.area === area);
    return areaUpdate?.hasUpdates || false;
  };

  // Get total number of areas with updates
  const totalUpdatesCount = areaUpdates.filter(a => a.hasUpdates).length;

  return {
    areaUpdates,
    markAreaAsSeen,
    hasAreaUpdates,
    totalUpdatesCount,
    isLoading: !commentData && !!projectId
  };
}