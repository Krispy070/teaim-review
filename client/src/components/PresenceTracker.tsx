import { useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { authFetch } from "@/lib/authFetch";

interface PresenceTrackerProps {
  area?: string;
  enabled?: boolean;
  projectId?: string;
}

export default function PresenceTracker({ area, enabled = true, projectId: propProjectId }: PresenceTrackerProps) {
  const { projectId: routeProjectId } = useParams();
  const projectId = propProjectId || routeProjectId;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingRef = useRef<number>(0);
  const failureCountRef = useRef<number>(0);
  const nextIntervalRef = useRef<number>(60000); // Start with 60 seconds

  const sendPresencePing = useCallback(async () => {
    if (!projectId || !enabled) return;
    
    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (area) params.set('area', area);
      
      await authFetch(`/api/presence/ping?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      lastPingRef.current = Date.now();
      
      // Reset failure count and interval on success
      if (failureCountRef.current > 0) {
        failureCountRef.current = 0;
        nextIntervalRef.current = 60000; // Back to normal 60 seconds
      }
    } catch (error) {
      console.warn('Failed to send presence ping:', error);
      
      // Exponential backoff for presence pings
      failureCountRef.current += 1;
      const backoffMultiplier = Math.min(2 ** failureCountRef.current, 8); // Max 8x backoff
      nextIntervalRef.current = Math.min(60000 * backoffMultiplier, 300000); // Max 5 minutes
      
      console.log(`🔄 Presence ping backing off to ${nextIntervalRef.current / 1000}s after ${failureCountRef.current} failures`);
    }
  }, [projectId, enabled, area]);

  // Send ping when component mounts, area changes, or user becomes active
  useEffect(() => {
    if (!enabled || !projectId) return;

    // Send initial ping
    sendPresencePing();

    // Set up dynamic interval that adjusts based on failures and visibility
    const scheduleNextPing = () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      
      // Don't schedule if page is hidden
      if (document.hidden) {
        return;
      }
      
      intervalRef.current = setTimeout(() => {
        sendPresencePing().then(() => {
          // Only schedule next if page is still visible
          if (!document.hidden) {
            scheduleNextPing();
          }
        });
      }, nextIntervalRef.current);
    };

    scheduleNextPing();

    // Send ping on user activity (mouse move, key press, etc.)
    const handleActivity = () => {
      const now = Date.now();
      // Throttle activity pings to once per 30 seconds
      if (now - lastPingRef.current > 30000) {
        sendPresencePing();
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [projectId, area, enabled, sendPresencePing]);

  // Handle visibility changes to resume/pause polling
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible - send ping and reset backoff, then resume scheduling
        failureCountRef.current = 0;
        nextIntervalRef.current = 60000; // Reset to normal interval
        sendPresencePing();
        
        // Resume scheduling if we don't have an active timeout
        if (!intervalRef.current) {
          const scheduleNext = () => {
            if (document.hidden) return;
            intervalRef.current = setTimeout(() => {
              sendPresencePing().then(() => {
                if (!document.hidden) scheduleNext();
              });
            }, nextIntervalRef.current);
          };
          scheduleNext();
        }
      } else {
        // Page became hidden - clear any pending timeout
        if (intervalRef.current) {
          clearTimeout(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, sendPresencePing]);

  // This component doesn't render anything visible
  return null;
}