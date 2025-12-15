import { useEffect, useRef, useCallback } from 'react';

export interface UseKitchenPollingOptions {
  /**
   * Callback function to execute on each poll
   * Should return a promise that resolves when polling is complete
   */
  onPoll: () => Promise<void>;
  
  /**
   * Polling interval when page is visible (in milliseconds)
   * Default: 3000 (3 seconds)
   */
  activeInterval?: number;
  
  /**
   * Polling interval when page is hidden (in milliseconds)
   * Default: 10000 (10 seconds)
   */
  idleInterval?: number;
  
  /**
   * Whether polling is enabled
   * Default: true
   */
  enabled?: boolean;
  
  /**
   * Initial delay before first poll (in milliseconds)
   * Default: 1000 (1 second)
   */
  initialDelay?: number;
}

/**
 * Smart polling hook for kitchen display
 * 
 * Features:
 * - Polls more frequently when page is visible (activeInterval)
 * - Polls less frequently when page is hidden (idleInterval)
 * - Automatically pauses when tab is hidden
 * - Handles errors gracefully with exponential backoff
 * - Only polls when online
 * - Automatically cleans up on unmount
 */
export function useKitchenPolling({
  onPoll,
  activeInterval = 3000,
  idleInterval = 10000,
  enabled = true,
  initialDelay = 1000,
}: UseKitchenPollingOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);
  const errorCountRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);
  const onPollRef = useRef(onPoll);

  // Keep onPoll ref updated
  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Execute poll with error handling
  const executePoll = useCallback(async () => {
    // Prevent concurrent polls
    if (isPollingRef.current) {
      return;
    }

    // Only poll when online
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('📴 Offline, skipping poll...');
      return;
    }

    isPollingRef.current = true;

    try {
      await onPollRef.current();
      // Reset error count on success
      errorCountRef.current = 0;
    } catch (error) {
      console.error('❌ Poll error:', error);
      errorCountRef.current += 1;
      
      // Exponential backoff: wait longer after errors
      // After 1 error: wait 2x interval
      // After 2 errors: wait 4x interval
      // After 3+ errors: wait 8x interval (max)
      const backoffMultiplier = Math.min(Math.pow(2, errorCountRef.current), 8);
      const currentInterval = isVisibleRef.current ? activeInterval : idleInterval;
      const backoffDelay = currentInterval * backoffMultiplier;
      
      console.log(`⏳ Backing off: waiting ${backoffDelay}ms before next poll (error count: ${errorCountRef.current})`);
      
      // Schedule next poll with backoff
      timeoutRef.current = setTimeout(() => {
        executePoll();
      }, backoffDelay);
      
      return; // Don't schedule normal interval after error
    } finally {
      isPollingRef.current = false;
    }

    // Schedule next poll with normal interval
    const currentInterval = isVisibleRef.current ? activeInterval : idleInterval;
    timeoutRef.current = setTimeout(() => {
      executePoll();
    }, currentInterval);
  }, [activeInterval, idleInterval]);

  // Handle page visibility changes
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      isVisibleRef.current = isVisible;
      
      console.log(`👁️ Page visibility changed: ${isVisible ? 'visible' : 'hidden'}`);
      
      // Clear existing timers
      clearTimers();
      
      // If enabled and online, restart polling with appropriate interval
      if (enabled && navigator.onLine) {
        const currentInterval = isVisible ? activeInterval : idleInterval;
        timeoutRef.current = setTimeout(() => {
          executePoll();
        }, currentInterval);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, activeInterval, idleInterval, executePoll, clearTimers]);

  // Handle online/offline events
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => {
      console.log('🟢 Online - resuming polling...');
      clearTimers();
      
      if (enabled) {
        const currentInterval = isVisibleRef.current ? activeInterval : idleInterval;
        timeoutRef.current = setTimeout(() => {
          executePoll();
        }, currentInterval);
      }
    };

    const handleOffline = () => {
      console.log('🔴 Offline - pausing polling...');
      clearTimers();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [enabled, activeInterval, idleInterval, executePoll, clearTimers]);

  // Start polling when enabled
  useEffect(() => {
    if (!enabled) {
      clearTimers();
      return;
    }

    // Only start if online
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('📴 Offline, not starting polling');
      return;
    }

    // Initial delay before first poll
    timeoutRef.current = setTimeout(() => {
      executePoll();
    }, initialDelay);

    return () => {
      clearTimers();
    };
  }, [enabled, initialDelay, executePoll, clearTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);
}

