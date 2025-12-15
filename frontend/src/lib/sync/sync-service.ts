import { db, SyncQueue } from '../indexeddb/database';
import apiClient from '../api/client';
import { API_ENDPOINTS } from '../constants/api';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSynced?: string;
  pendingChanges: number;
  failedChanges: number;
}

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;

  /**
   * Initialize sync service
   */
  async initialize(): Promise<void> {
    // Check online status
    this.updateOnlineStatus();

    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }

    // Pull data from server on initialization
    if (navigator.onLine) {
      await this.pullChanges();
    }

    // Start periodic sync (every 2 minutes when online)
    this.startPeriodicSync();
  }

  /**
   * Update online status
   */
  private updateOnlineStatus(): void {
    if (typeof navigator !== 'undefined') {
      const isOnline = navigator.onLine;
      // Store online status in IndexedDB or state
    }
  }

  /**
   * Handle online event
   */
  private async handleOnline(): Promise<void> {
    console.log('🟢 Online - Starting sync...');
    this.updateOnlineStatus();
    // Pull data first, then push pending changes
    await this.pullChanges();
    await this.syncPendingChanges();
    // Refresh reports when coming online
    await this.refreshReports();
  }

  /**
   * Handle offline event
   */
  private handleOffline(): void {
    console.log('🔴 Offline - Queueing changes locally...');
    this.updateOnlineStatus();
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Initial sync after 5 seconds
    setTimeout(() => {
      if (navigator.onLine && !this.isSyncing) {
        console.log('🔄 Initial sync check...');
        this.syncPendingChanges();
        this.refreshReports();
      }
    }, 5000);

    // Then sync every 2 minutes (reduced frequency to save database credits)
    this.syncInterval = setInterval(async () => {
      if (navigator.onLine && !this.isSyncing) {
        console.log('🔄 Periodic sync check...');
        await this.syncPendingChanges();
        // Refresh reports every sync cycle
        await this.refreshReports();
      }
    }, 120000); // Every 2 minutes (120 seconds)
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Add change to sync queue
   */
  async queueChange(
    table: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    recordId: string,
    data: any
  ): Promise<void> {
    await db.syncQueue.add({
      table,
      action,
      recordId,
      data,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      retryCount: 0,
    });
  }

  /**
   * Clean up old SYNCED items from sync queue (older than 7 days)
   */
  private async cleanupOldSyncedItems(): Promise<void> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString();

      const oldSyncedItems = await db.syncQueue
        .where('status')
        .equals('SYNCED')
        .filter((item) => {
          if (!item.timestamp) return false;
          return item.timestamp < cutoffDate;
        })
        .toArray();

      if (oldSyncedItems.length > 0) {
        console.log(`🧹 Cleaning up ${oldSyncedItems.length} old SYNCED items...`);
        for (const item of oldSyncedItems) {
          await db.syncQueue.delete(item.id!);
        }
        console.log(`✅ Cleaned up ${oldSyncedItems.length} old SYNCED items`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to cleanup old synced items:', error);
      // Don't throw, this is a cleanup operation
    }
  }

  /**
   * Sync pending changes to server
   */
  async syncPendingChanges(): Promise<void> {
    if (this.isSyncing || !navigator.onLine) {
      if (this.isSyncing) {
        console.log('⏸️ Sync already in progress, skipping...');
      }
      if (!navigator.onLine) {
        console.log('📴 Offline, skipping sync...');
      }
      return;
    }

    this.isSyncing = true;

    try {
      // Clean up old SYNCED items periodically (every 10th sync or so)
      if (Math.random() < 0.1) {
        await this.cleanupOldSyncedItems();
      }

      const pendingChanges = await db.syncQueue
        .where('status')
        .anyOf(['PENDING', 'FAILED'])
        .toArray();

      if (pendingChanges.length === 0) {
        console.log('✅ No pending changes to sync');
        this.isSyncing = false;
        return;
      }

      console.log(`📤 Syncing ${pendingChanges.length} pending changes...`);

      // Mark items as SYNCING before sending
      for (const change of pendingChanges) {
        await db.syncQueue.update(change.id!, {
          status: 'SYNCING',
        });
      }

      // Group changes by table
      const changesByTable = pendingChanges.reduce((acc, change) => {
        if (!acc[change.table]) {
          acc[change.table] = [];
        }
        acc[change.table].push({
          table: change.table,
          action: change.action,
          recordId: change.recordId,
          data: change.data,
        });
        return acc;
      }, {} as Record<string, any[]>);

      const changesToSend = Object.values(changesByTable).flat();
      console.log('📦 Sending changes:', {
        total: changesToSend.length,
        byTable: Object.keys(changesByTable).map(table => ({
          table,
          count: changesByTable[table].length,
        })),
      });

      // Push changes to server
      const response = await apiClient.post(API_ENDPOINTS.SYNC.PUSH, {
        changes: changesToSend,
      });

      console.log('📥 Sync response received:', response.data);

      const { results, errors } = response.data || {};

      // Mark successful changes as synced
      const successfulRecordIds = new Set(
        (results || [])
          .filter((r: any) => r.status === 'SUCCESS')
          .map((r: any) => r.recordId)
      );

      for (const change of pendingChanges) {
        if (successfulRecordIds.has(change.recordId)) {
        await db.syncQueue.update(change.id!, {
          status: 'SYNCED',
        });
          console.log(`✅ Synced: ${change.table} - ${change.recordId}`);
        } else {
          // Check if this change has an error
          const error = errors?.find((e: any) => e.recordId === change.recordId);
          if (error) {
            await db.syncQueue.update(change.id!, {
              status: 'FAILED',
              retryCount: (change.retryCount || 0) + 1,
              error: error.error,
            });
            console.error(`❌ Failed to sync: ${change.table} - ${change.recordId}`, error.error);
          } else {
            // If no error found but not in success list, mark as failed
            await db.syncQueue.update(change.id!, {
              status: 'FAILED',
              retryCount: (change.retryCount || 0) + 1,
              error: 'Unknown sync error - not in results or errors',
            });
            console.error(`❌ Unknown error for: ${change.table} - ${change.recordId}`);
          }
        }
      }

      console.log('✅ Sync completed', {
        synced: results?.length || 0,
        failed: errors?.length || 0,
        total: pendingChanges.length,
      });
    } catch (error) {
      console.error('❌ Sync failed with exception:', error);
      
      // Mark all SYNCING items as failed
      const syncingChanges = await db.syncQueue
        .where('status')
        .equals('SYNCING')
        .toArray();

      for (const change of syncingChanges) {
        await db.syncQueue.update(change.id!, {
          status: 'FAILED',
          retryCount: (change.retryCount || 0) + 1,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
        });
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pull latest changes from server and store in IndexedDB
   */
  async pullChanges(): Promise<void> {
    if (!navigator.onLine) {
      console.log('📴 Offline, skipping pull sync...');
      return;
    }

    try {
      console.log('📥 Pulling data from server...');
      const response = await apiClient.get(API_ENDPOINTS.SYNC.PULL);
      const { data, success, timestamp } = response.data;

      if (!success || !data) {
        console.warn('⚠️ Pull sync returned no data');
        return;
      }

      console.log('📦 Received data:', {
        branches: data.branches?.length || 0,
        categories: data.categories?.length || 0,
        foodItems: data.foodItems?.length || 0,
        addOnGroups: data.addOnGroups?.length || 0,
        addOns: data.addOns?.length || 0,
        counters: data.counters?.length || 0,
        tables: data.tables?.length || 0,
        foodItemDiscounts: data.foodItemDiscounts?.length || 0,
        ingredients: data.ingredients?.length || 0,
        recipes: data.recipes?.length || 0,
      });

      // Store branches
      if (data.branches && data.branches.length > 0) {
        await db.branches.bulkPut(data.branches);
        console.log(`✅ Synced ${data.branches.length} branches`);
      }

      // Store categories
      if (data.categories && data.categories.length > 0) {
        await db.categories.bulkPut(data.categories);
        console.log(`✅ Synced ${data.categories.length} categories`);
      }

      // Store food items
      if (data.foodItems && data.foodItems.length > 0) {
        await db.foodItems.bulkPut(data.foodItems);
        console.log(`✅ Synced ${data.foodItems.length} food items`);
      }

      // Store add-on groups
      if (data.addOnGroups && data.addOnGroups.length > 0) {
        await db.addOnGroups.bulkPut(data.addOnGroups);
        console.log(`✅ Synced ${data.addOnGroups.length} add-on groups`);
      }

      // Store add-ons
      if (data.addOns && data.addOns.length > 0) {
        await db.addOns.bulkPut(data.addOns);
        console.log(`✅ Synced ${data.addOns.length} add-ons`);
      }

      // Store counters (if counters table exists in IndexedDB)
      // Note: Counters are not currently stored in IndexedDB, skip for now
      if (data.counters && data.counters.length > 0) {
        console.log(`ℹ️  Skipped ${data.counters.length} counters (not stored in IndexedDB)`);
      }

      // Store tables
      if (data.tables && data.tables.length > 0) {
        await db.restaurantTables.bulkPut(data.tables);
        console.log(`✅ Synced ${data.tables.length} tables`);
      }

      // Store food item discounts
      if (data.foodItemDiscounts && data.foodItemDiscounts.length > 0) {
        await db.foodItemDiscounts.bulkPut(data.foodItemDiscounts);
        console.log(`✅ Synced ${data.foodItemDiscounts.length} food item discounts`);
      }

      // Store ingredients
      if (data.ingredients && data.ingredients.length > 0) {
        await db.ingredients.bulkPut(data.ingredients);
        console.log(`✅ Synced ${data.ingredients.length} ingredients`);
      }

      // Store recipes
      if (data.recipes && data.recipes.length > 0) {
        await db.recipes.bulkPut(data.recipes);
        console.log(`✅ Synced ${data.recipes.length} recipes`);
      }

      console.log('✅ Pull sync completed successfully');
    } catch (error) {
      console.error('❌ Failed to pull changes:', error);
      // Don't throw - allow app to continue with cached data
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const pendingCount = await db.syncQueue
      .where('status')
      .equals('PENDING')
      .count();
    const failedCount = await db.syncQueue
      .where('status')
      .equals('FAILED')
      .count();

    // Get last synced time from most recent synced item
    const syncedItems = await db.syncQueue
      .where('status')
      .equals('SYNCED')
      .sortBy('timestamp');
    
    const lastSynced = syncedItems.length > 0 ? syncedItems[syncedItems.length - 1] : undefined;

    return {
      isOnline: navigator.onLine,
      isSyncing: this.isSyncing,
      lastSynced: lastSynced?.timestamp,
      pendingChanges: pendingCount,
      failedChanges: failedCount,
    };
  }

  /**
   * Resolve sync conflicts
   */
  async resolveConflicts(resolutions: Array<{
    queueId: number;
    resolution: 'server' | 'local' | 'merge';
  }>): Promise<void> {
    // Implementation will be added when conflict resolution is needed
    console.log('Resolving conflicts...', resolutions);
  }

  /**
   * Manually trigger sync (for testing or manual sync button)
   */
  async triggerSync(): Promise<void> {
    console.log('🔄 Manual sync triggered');
    await this.syncPendingChanges();
    await this.refreshReports();
  }

  /**
   * Refresh cached reports from backend
   * This is called periodically to ensure reports are up-to-date
   * Only refreshes when on dashboard page to avoid unnecessary API calls
   */
  async refreshReports(): Promise<void> {
    if (!navigator.onLine) {
      console.log('📴 Offline, skipping report refresh...');
      return;
    }

    // Only refresh reports when on dashboard page
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (currentPath !== '/dashboard' && currentPath !== '/') {
        console.log('📊 Skipping report refresh (not on dashboard page)');
        return;
      }
    }

    try {
      console.log('📊 Refreshing cached reports...');
      
      // Import reports API dynamically to avoid circular dependencies
      const { reportsApi } = await import('../api/reports');
      const { db } = await import('../indexeddb/database');

      // List of report types to refresh
      const reportTypes = [
        { type: 'sales', loadFn: () => reportsApi.getSalesReport({}) },
        { type: 'orders', loadFn: () => reportsApi.getOrdersReport({}) },
        { type: 'customers', loadFn: () => reportsApi.getCustomersReport({}) },
        { type: 'inventory', loadFn: () => reportsApi.getInventoryReport({}) },
        { type: 'financial', loadFn: () => reportsApi.getFinancialReport({}) },
        { type: 'tax', loadFn: () => reportsApi.getTaxReport({}) },
        { type: 'top-items', loadFn: () => reportsApi.getTopItemsReport({}) },
      ];

      // Refresh each report type
      for (const reportType of reportTypes) {
        try {
          const data = await reportType.loadFn();
          
          // Get existing cached filters or use empty object
          const cached = await db.reports.get(reportType.type);
          const filters = cached ? JSON.parse(cached.filters || '{}') : {};

          // Update cache with fresh data
          await db.reports.put({
            id: reportType.type,
            type: reportType.type,
            data: JSON.stringify(data),
            filters: JSON.stringify(filters),
            updatedAt: new Date().toISOString(),
          });

          console.log(`✅ Refreshed ${reportType.type} report`);
        } catch (error) {
          console.warn(`⚠️ Failed to refresh ${reportType.type} report:`, error);
          // Continue with other reports even if one fails
        }
      }

      console.log('✅ Report refresh completed');
    } catch (error) {
      console.error('❌ Failed to refresh reports:', error);
      // Don't throw - allow app to continue with cached data
    }
  }
}

export const syncService = new SyncService();

