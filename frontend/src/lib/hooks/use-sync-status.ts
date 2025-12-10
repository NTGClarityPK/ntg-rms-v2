import { useState, useEffect } from 'react';
import { syncService, SyncStatus } from '../sync/sync-service';

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    pendingChanges: 0,
    failedChanges: 0,
  });

  useEffect(() => {
    const updateStatus = async () => {
      const syncStatus = await syncService.getSyncStatus();
      setStatus(syncStatus);
    };

    // Update status immediately
    updateStatus();

    // Update status every 5 seconds
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  return status;
}

