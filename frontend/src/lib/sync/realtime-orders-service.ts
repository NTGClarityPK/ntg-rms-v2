import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type OrderChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: any;
  old?: any;
}) => void;

/**
 * Get Supabase client (only on client side)
 * Uses direct import but guards with client-side check
 */
let supabaseClient: any = null;

async function getSupabaseClientAsync(): Promise<any> {
  if (typeof window === 'undefined') {
    return null;
  }
  
  // Return cached client if available
  if (supabaseClient) {
    return supabaseClient;
  }
  
  // Use direct import - Next.js will handle this correctly
  try {
    // Dynamic import that Next.js can properly handle
    const supabaseModule = await import('../supabase/client');
    supabaseClient = supabaseModule.supabase;
    
    if (supabaseClient) {
      console.log('✅ Supabase client loaded:', 'SUCCESS');
      console.log('📡 Supabase client details:', {
        url: supabaseClient.supabaseUrl,
        hasRealtime: !!supabaseClient.realtime,
      });
    } else {
      console.warn('⚠️ Supabase client is null after import');
    }
    
    return supabaseClient;
  } catch (error) {
    console.error('❌ Failed to load Supabase client:', error);
    return null;
  }
}

/**
 * Centralized Realtime Orders Service
 * Manages Supabase Realtime subscriptions for orders table
 * This ensures real-time updates when orders are placed, updated, or deleted
 */
class RealtimeOrdersService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private subscriptions: Map<string, Set<OrderChangeCallback>> = new Map();

  /**
   * Subscribe to order changes for a specific tenant
   * @param tenantId - The tenant ID to subscribe to
   * @param callback - Callback function to be called when orders change
   * @param supabaseClient - Optional Supabase client (if not provided, will be loaded asynchronously)
   * @returns Unsubscribe function
   */
  subscribeToOrders(
    tenantId: string,
    callback: OrderChangeCallback,
    supabaseClient?: any
  ): () => void {
    console.log('🔍 subscribeToOrders called:', { tenantId, isClient: typeof window !== 'undefined' });
    
    // Only work on client side
    if (typeof window === 'undefined') {
      console.warn('⚠️ subscribeToOrders: SSR context, returning no-op');
      return () => {}; // Return no-op unsubscribe for SSR
    }

    if (!tenantId) {
      console.error('❌ RealtimeOrdersService: Missing tenantId');
      return () => {}; // Return no-op unsubscribe
    }

    // Initialize subscription set for this tenant if it doesn't exist
    if (!this.subscriptions.has(tenantId)) {
      this.subscriptions.set(tenantId, new Set());
      // Setup channel asynchronously (don't await - let it happen in background)
      // Pass the supabase client if provided, otherwise it will be loaded asynchronously
      this.setupChannel(tenantId, supabaseClient).catch((error) => {
        console.error(`❌ Failed to setup channel for tenant ${tenantId}:`, error);
      });
    }

    // Add callback to subscription set
    const callbacks = this.subscriptions.get(tenantId)!;
    callbacks.add(callback);

    console.log(`✅ Added order change listener for tenant ${tenantId}. Total listeners: ${callbacks.size}`);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(tenantId);
      if (callbacks) {
        callbacks.delete(callback);
        console.log(`🗑️ Removed order change listener for tenant ${tenantId}. Remaining listeners: ${callbacks.size}`);

        // If no more callbacks, cleanup channel
        if (callbacks.size === 0) {
          this.cleanupChannel(tenantId).catch((error) => {
            console.error(`❌ Failed to cleanup channel for tenant ${tenantId}:`, error);
          });
        }
      }
    };
  }

  /**
   * Set up Supabase Realtime channel for a tenant
   */
  private async setupChannel(tenantId: string, providedSupabaseClient?: any): Promise<void> {
    // Only work on client side
    if (typeof window === 'undefined') {
      console.log('⚠️ setupChannel: SSR context, skipping');
      return;
    }

    if (this.channels.has(tenantId)) {
      console.log(`ℹ️ Channel already exists for tenant ${tenantId}`);
      return;
    }

    // Use provided client or load asynchronously
    let supabase = providedSupabaseClient;
    
    if (!supabase) {
      console.log(`📡 Loading Supabase client asynchronously for tenant ${tenantId}...`);
      supabase = await getSupabaseClientAsync();
    } else {
      console.log(`✅ Using provided Supabase client for tenant ${tenantId}`);
    }
    
    if (!supabase) {
      console.error(`❌ Cannot setup channel: Supabase client not available for tenant ${tenantId}`);
      console.error('This might mean Supabase environment variables are not configured correctly.');
      return;
    }

    console.log(`✅ Supabase client ready for tenant ${tenantId}`);

    const channelName = `orders-realtime-${tenantId}-${Date.now()}`;
    console.log(`📡 Setting up Realtime channel: ${channelName} for tenant ${tenantId}`);
    console.log(`📋 Subscription config:`, {
      schema: 'public',
      table: 'orders',
      filter: `tenant_id=eq.${tenantId}`,
      events: 'INSERT, UPDATE, DELETE',
    });

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          const timestamp = new Date().toISOString();
          console.log(`🎉 [${timestamp}] ===== ORDER CHANGE RECEIVED VIA REALTIME =====`);
          console.log(`✅ Event Type:`, payload.eventType);
          console.log(`✅ Order ID:`, (payload.new as any)?.id || (payload.old as any)?.id);
          console.log(`✅ Tenant ID:`, tenantId);
          console.log(`✅ Full Payload:`, JSON.stringify(payload, null, 2));
          console.log(`✅ New Record:`, payload.new);
          console.log(`✅ Old Record:`, payload.old);

          // Notify all callbacks for this tenant
          const callbacks = this.subscriptions.get(tenantId);
          if (callbacks) {
            callbacks.forEach((callback) => {
              try {
                callback({
                  eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
                  new: payload.new,
                  old: payload.old,
                });
              } catch (error) {
                console.error('Error in order change callback:', error);
              }
            });
          }
        }
      )
      .subscribe((status: string, err?: Error) => {
        const timestamp = new Date().toISOString();
        console.log(`📡 [${timestamp}] Realtime subscription status update for tenant ${tenantId}:`, {
          status,
          error: err ? err.message : null,
          channelName,
        });
        
        if (err) {
          console.error(`❌ [${timestamp}] Realtime subscription error for tenant ${tenantId}:`, err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name,
          });
        }

        if (status === 'SUBSCRIBED') {
          console.log(`✅ [${timestamp}] Successfully subscribed to orders table changes for tenant ${tenantId}`);
          console.log(`📡 Listening for changes on orders table with tenant_id = ${tenantId}`);
          console.log(`🔍 Channel details:`, {
            channelName,
            tenantId,
            filter: `tenant_id=eq.${tenantId}`,
            table: 'orders',
            schema: 'public',
          });
          
          // Verify subscription is active
          console.log(`🔍 Verifying subscription setup...`);
          const channelState = (channel as any);
          console.log(`📋 Channel state:`, {
            state: channelState.state,
            topic: channelState.topic,
            bindingsCount: channelState.bindings?.length || 0,
          });
          
          if (channelState.bindings && channelState.bindings.length > 0) {
            console.log(`✅ Channel bindings found:`, channelState.bindings.map((b: any) => ({
              event: b.event,
              filter: b.filter,
              table: b.table,
              schema: b.schema,
            })));
          } else {
            console.error(`❌ CRITICAL: No bindings found on channel! Subscription may not be active.`);
          }
          
          // Test the subscription by checking channel state after a delay
          setTimeout(() => {
            console.log(`🧪 Testing subscription after 2 seconds...`);
            const testChannel = this.channels.get(tenantId);
            if (testChannel) {
              const testChannelState = (testChannel as any);
              console.log(`✅ Channel still exists:`, {
                state: testChannelState.state,
                topic: testChannelState.topic,
                bindings: testChannelState.bindings?.length || 0,
              });
              
              if (testChannelState.bindings && testChannelState.bindings.length > 0) {
                console.log(`✅ Bindings still active:`, testChannelState.bindings.map((b: any) => ({
                  event: b.event,
                  filter: b.filter,
                })));
              } else {
                console.error(`❌ CRITICAL: Bindings lost after 2 seconds!`);
              }
            } else {
              console.error(`❌ CRITICAL: Channel not found in map after 2 seconds!`);
            }
          }, 2000);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ [${timestamp}] Realtime channel error for tenant ${tenantId}`);
        } else if (status === 'TIMED_OUT') {
          console.error(`❌ [${timestamp}] Realtime subscription timed out for tenant ${tenantId}`);
        } else if (status === 'CLOSED') {
          console.warn(`⚠️ [${timestamp}] Realtime channel closed for tenant ${tenantId}`);
          // Remove channel from map if closed
          this.channels.delete(tenantId);
        } else {
          console.log(`ℹ️ [${timestamp}] Realtime subscription status: ${status} for tenant ${tenantId}`);
        }
      });

    this.channels.set(tenantId, channel);
  }

  /**
   * Clean up channel for a tenant
   */
  private async cleanupChannel(tenantId: string): Promise<void> {
    // Only work on client side
    if (typeof window === 'undefined') {
      return;
    }

    const channel = this.channels.get(tenantId);
    if (channel) {
      const supabase = await getSupabaseClientAsync();
      if (supabase) {
        console.log(`🧹 Cleaning up Realtime channel for tenant ${tenantId}`);
        supabase.removeChannel(channel);
      }
      this.channels.delete(tenantId);
      this.subscriptions.delete(tenantId);
    }
  }

  /**
   * Cleanup all channels (useful for app shutdown)
   */
  async cleanup(): Promise<void> {
    // Only work on client side
    if (typeof window === 'undefined') {
      return;
    }

    console.log('🧹 Cleaning up all Realtime channels...');
    const supabase = await getSupabaseClientAsync();
    this.channels.forEach((channel, tenantId) => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    });
    this.channels.clear();
    this.subscriptions.clear();
  }
}

// Lazy initialization - only create instance on client side
let serviceInstance: RealtimeOrdersService | null = null;

// Create a proxy that lazily initializes the service on first access (client-side only)
export const realtimeOrdersService = new Proxy({} as RealtimeOrdersService, {
  get(target, prop) {
    // Only initialize on client side
    if (typeof window === 'undefined') {
      console.log('⚠️ Realtime service accessed during SSR, returning no-op');
      return () => {};
    }
    
    // Lazy initialize the service instance
    if (!serviceInstance) {
      console.log('🔧 Initializing RealtimeOrdersService instance...');
      serviceInstance = new RealtimeOrdersService();
    }
    
    const value = (serviceInstance as any)[prop];
    if (typeof value === 'function') {
      return value.bind(serviceInstance);
    }
    return value;
  }
});

