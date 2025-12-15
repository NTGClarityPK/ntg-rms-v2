import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { API_BASE_URL } from '@/lib/constants/api';
import { tokenStorage } from '@/lib/api/client';

export interface OrderUpdateEvent {
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_DELETED';
  tenantId: string;
  orderId: string;
  order?: any;
}

export interface UseKitchenSseOptions {
  /**
   * Callback function called when an order update is received
   */
  onOrderUpdate: (event: OrderUpdateEvent) => void;
  
  /**
   * Callback function called when SSE connection is established
   */
  onConnect?: () => void;
  
  /**
   * Callback function called when SSE connection is closed or error occurs
   */
  onError?: (error: Event) => void;
  
  /**
   * Whether SSE is enabled
   * Default: true
   */
  enabled?: boolean;
}

/**
 * Hook for Server-Sent Events (SSE) connection to kitchen display order updates
 * 
 * Features:
 * - Real-time order updates via SSE
 * - Automatic reconnection on disconnect
 * - Fallback to polling if SSE fails
 * - Handles authentication via JWT token
 */
export function useKitchenSse({
  onOrderUpdate,
  onConnect,
  onError,
  enabled = true,
}: UseKitchenSseOptions) {
  const { user } = useAuthStore();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);
  const [isConnected, setIsConnected] = useState(false);
  const onOrderUpdateRef = useRef(onOrderUpdate);
  const onConnectRef = useRef(onConnect);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onOrderUpdateRef.current = onOrderUpdate;
    onConnectRef.current = onConnect;
    onErrorRef.current = onError;
  }, [onOrderUpdate, onConnect, onError]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('🔌 Closing SSE connection...');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
    isConnectingRef.current = false;
  }, []);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!enabled || !user?.tenantId || isConnectingRef.current) {
      return;
    }

    // Don't connect if already connected
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    isConnectingRef.current = true;
    reconnectAttemptsRef.current = 0;

    try {
      // Get JWT token from tokenStorage
      const token = tokenStorage.getAccessToken();
      if (!token) {
        console.error('❌ No auth token found, cannot connect to SSE');
        isConnectingRef.current = false;
        return;
      }

      // Create SSE connection with auth token in query parameter
      // Note: SSE doesn't support custom headers, so we use query param
      const sseUrl = `${API_BASE_URL}/orders/kitchen/stream?token=${encodeURIComponent(token)}`;
      
      console.log('📡 Connecting to SSE stream...');
      const eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        console.log('✅ SSE connection opened');
        setIsConnected(true);
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;
        if (onConnectRef.current) {
          onConnectRef.current();
        }
      };

      eventSource.onmessage = (event) => {
        try {
          // Skip comment messages (heartbeat, connection messages)
          if (event.data.startsWith(':')) {
            console.log('💓 SSE heartbeat/comment:', event.data);
            return;
          }
          
          const data: OrderUpdateEvent = JSON.parse(event.data);
          console.log('📨 Received order update via SSE:', data.type, data.orderId, data);
          
          // Handle connection test message
          if (data.type === 'CONNECTION_TEST') {
            console.log('✅ SSE connection test successful:', data);
            return;
          }
          
          // Handle actual order updates
          onOrderUpdateRef.current(data);
        } catch (error) {
          console.error('❌ Failed to parse SSE message:', error, 'Raw data:', event.data);
        }
      };

      eventSource.onerror = (error) => {
        const readyState = eventSource.readyState;
        console.log(`⚠️ SSE connection state changed. ReadyState: ${readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
        
        // Only treat as error if connection is actually closed
        if (readyState === EventSource.CLOSED) {
          console.error('❌ SSE connection closed');
          setIsConnected(false);
          isConnectingRef.current = false;

          // Close the connection
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }

          // Attempt to reconnect with exponential backoff
          const maxReconnectAttempts = 5;
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // Max 30 seconds
            console.log(`⏳ Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          } else {
            console.error('❌ Max reconnect attempts reached, giving up');
            if (onErrorRef.current) {
              onErrorRef.current(error);
            }
          }
        } else if (readyState === EventSource.CONNECTING) {
          // Connection is reconnecting, this is normal
          console.log('🔄 SSE reconnecting...');
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('❌ Failed to create SSE connection:', error);
      isConnectingRef.current = false;
      if (onErrorRef.current) {
        onErrorRef.current(error as Event);
      }
    }
  }, [enabled, user?.tenantId]);

  // Initialize connection
  useEffect(() => {
    if (enabled && user?.tenantId) {
      connect();
    } else {
      cleanup();
    }

    return () => {
      cleanup();
    };
  }, [enabled, user?.tenantId, connect, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    reconnect: connect,
    disconnect: cleanup,
  };
}

