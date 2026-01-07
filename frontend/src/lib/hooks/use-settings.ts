import { useState, useEffect, useCallback } from 'react';
import { settingsApi, Settings } from '@/lib/api/settings';
import { useBranchStore } from '@/lib/store/branch-store';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache per branch
const settingsCache: Map<string, { settings: Settings; timestamp: number }> = new Map();

// Function to clear cache (useful when settings are updated)
export function clearSettingsCache(branchId?: string) {
  if (branchId) {
    settingsCache.delete(branchId);
  } else {
    settingsCache.clear();
  }
}

export function useSettings() {
  const { selectedBranchId } = useBranchStore();
  const cacheKey = selectedBranchId || 'tenant-level';
  const cached = settingsCache.get(cacheKey);
  
  const [settings, setSettings] = useState<Settings | null>(cached?.settings || null);
  const [loading, setLoading] = useState(!cached);

  const loadSettings = useCallback(async () => {
    const currentCacheKey = selectedBranchId || 'tenant-level';
    try {
      const data = await settingsApi.getSettings(selectedBranchId || undefined);
      setSettings(data);
      settingsCache.set(currentCacheKey, { settings: data, timestamp: Date.now() });
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Use cached settings if available
      const cached = settingsCache.get(currentCacheKey);
      if (cached) {
        setSettings(cached.settings);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    // Use cache if fresh, otherwise load
    const currentCacheKey = selectedBranchId || 'tenant-level';
    const cached = settingsCache.get(currentCacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setSettings(cached.settings);
      setLoading(false);
    } else {
      loadSettings();
    }

    // Listen for settings update events to refresh
    const handleSettingsUpdate = () => {
      clearSettingsCache(selectedBranchId || undefined);
      loadSettings();
    };
    window.addEventListener('settingsUpdated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('settingsUpdated', handleSettingsUpdate);
    };
  }, [loadSettings, selectedBranchId]);

  return { settings, loading, refresh: loadSettings };
}

