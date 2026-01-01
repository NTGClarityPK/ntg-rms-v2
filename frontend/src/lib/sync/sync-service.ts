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
   * Initialize sync service (no-op for direct communication)
   */
  async initialize(): Promise<void> {
    // No-op - direct communication only
  }

  /**
   * Handle online event (no-op for direct communication)
   */
  private async handleOnline(): Promise<void> {
    // No-op - direct communication only
  }

  /**
   * Handle offline event (no-op for direct communication)
   */
  private handleOffline(): void {
    // No-op - direct communication only
  }

  /**
   * Start periodic sync (no-op for direct communication)
   */
  private startPeriodicSync(): void {
    // No-op - direct communication only
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
   * Add change to sync queue (no-op for direct communication)
   */
  async queueChange(
    table: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    recordId: string,
    data: any
  ): Promise<void> {
    // No-op - direct communication only, changes are sent immediately via API
  }

  /**
   * Sync pending changes to server (no-op for direct communication)
   */
  async syncPendingChanges(): Promise<void> {
    // No-op - direct communication only, changes are sent immediately via API
  }

  /**
   * Pull latest changes from server (no-op for direct communication)
   */
  async pullChanges(): Promise<void> {
    // No-op - direct communication only, data is fetched directly from API
  }

  /**
   * Get sync status (simplified for direct communication)
   */
  async getSyncStatus(): Promise<SyncStatus> {
    return {
      isOnline: navigator.onLine,
      isSyncing: this.isSyncing,
      lastSynced: undefined,
      pendingChanges: 0,
      failedChanges: 0,
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
   * Refresh cached reports from backend (no-op for direct communication)
   */
  async refreshReports(): Promise<void> {
    // No-op - direct communication only, reports are fetched directly from API
  }
}

export const syncService = new SyncService();

