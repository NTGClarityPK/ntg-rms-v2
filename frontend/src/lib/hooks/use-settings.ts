import { useState, useEffect, useCallback } from 'react';
import { settingsApi, Settings } from '@/lib/api/settings';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cachedSettings: Settings | null = null;
let cacheTimestamp: number = 0;

// Function to clear cache (useful when settings are updated)
export function clearSettingsCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(cachedSettings);
  const [loading, setLoading] = useState(!cachedSettings);

  const loadSettings = useCallback(async () => {
    try {
      const data = await settingsApi.getSettings();
      setSettings(data);
      cachedSettings = data;
      cacheTimestamp = Date.now();
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Use cached settings if available
      if (cachedSettings) {
        setSettings(cachedSettings);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Use cache if fresh, otherwise load
    if (cachedSettings && Date.now() - cacheTimestamp < CACHE_DURATION) {
      setSettings(cachedSettings);
      setLoading(false);
    } else {
      loadSettings();
    }

    // Listen for settings update events to refresh
    const handleSettingsUpdate = () => {
      clearSettingsCache();
      loadSettings();
    };
    window.addEventListener('settingsUpdated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('settingsUpdated', handleSettingsUpdate);
    };
  }, [loadSettings]);

  return { settings, loading, refresh: loadSettings };
}

