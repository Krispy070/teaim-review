import { useEffect, useRef, useState, useCallback } from 'react';

interface UseSmartPollingOptions {
  interval: number;
  maxInterval?: number;
  backoffMultiplier?: number;
  maxRetries?: number;
  enabled?: boolean;
  pauseOnError?: boolean;
  pauseOnHidden?: boolean;
}

/**
 * Smart polling hook with exponential backoff and error recovery
 * Optimizes API calls by reducing frequency on failures and pausing when page is hidden
 */
export function useSmartPolling(
  pollingFn: () => Promise<void>,
  options: UseSmartPollingOptions
) {
  const {
    interval,
    maxInterval = interval * 8,
    backoffMultiplier = 2,
    maxRetries = 5,
    enabled = true,
    pauseOnError = true,
    pauseOnHidden = true
  } = options;

  const [currentInterval, setCurrentInterval] = useState(interval);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);

  const resetBackoff = useCallback(() => {
    setCurrentInterval(interval);
    setConsecutiveErrors(0);
    setIsPaused(false);
  }, [interval]);

  const executeWithBackoff = useCallback(async () => {
    if (!enabled || isPaused || isRunningRef.current) return;
    
    isRunningRef.current = true;
    
    try {
      await pollingFn();
      // Success - reset backoff
      if (consecutiveErrors > 0) {
        resetBackoff();
      }
    } catch (error) {
      const newErrorCount = consecutiveErrors + 1;
      setConsecutiveErrors(newErrorCount);
      
      if (newErrorCount >= maxRetries && pauseOnError) {
        setIsPaused(true);
        console.warn(`🔄 Smart polling paused after ${maxRetries} consecutive failures`);
      } else {
        // Exponential backoff, but continue retrying at maxInterval after maxRetries
        const newInterval = Math.min(
          currentInterval * backoffMultiplier,
          maxInterval
        );
        setCurrentInterval(newInterval);
        
        if (newErrorCount >= maxRetries && !pauseOnError) {
          // Saturate at maxInterval and continue retrying
          console.warn(`🔄 Smart polling saturated at ${maxInterval}ms after ${maxRetries} failures, continuing retries`);
        } else {
          console.warn(`🔄 Smart polling backing off to ${newInterval}ms after error:`, error);
        }
      }
    } finally {
      isRunningRef.current = false;
    }
  }, [enabled, isPaused, pollingFn, consecutiveErrors, currentInterval, maxInterval, backoffMultiplier, maxRetries, pauseOnError, resetBackoff]);

  const scheduleNext = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (enabled && !isPaused) {
      timeoutRef.current = setTimeout(() => {
        executeWithBackoff().then(scheduleNext);
      }, currentInterval);
    }
  }, [enabled, isPaused, currentInterval, executeWithBackoff]);

  // Handle visibility change to pause when page is hidden
  useEffect(() => {
    if (!pauseOnHidden) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        // Resume polling when page becomes visible
        if (enabled && !isPaused) {
          executeWithBackoff().then(scheduleNext);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, isPaused, pauseOnHidden, executeWithBackoff, scheduleNext]);

  // Start/stop polling based on enabled state
  useEffect(() => {
    if (enabled && !isPaused) {
      // Initial execution
      executeWithBackoff().then(scheduleNext);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, isPaused, executeWithBackoff, scheduleNext]);

  return {
    currentInterval,
    consecutiveErrors,
    isPaused,
    resetBackoff,
    forceRefresh: executeWithBackoff
  };
}