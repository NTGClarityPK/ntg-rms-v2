import { useState, useEffect } from 'react';
import { db } from '@/lib/indexeddb/database';
import { useAuthStore } from '@/lib/store/auth-store';
import { restaurantApi } from '@/lib/api/restaurant';

/**
 * Hook to get the currency from tenant/restaurant data
 * Falls back to 'IQD' if not found
 */
export function useCurrency(): string {
  const { user } = useAuthStore();
  const [currency, setCurrency] = useState<string>('IQD');

  useEffect(() => {
    const loadCurrency = async () => {
      try {
        // Try to get from IndexedDB first (offline-first)
        if (user?.tenantId) {
          const tenant = await db.tenants.get(user.tenantId);
          if (tenant?.defaultCurrency) {
            setCurrency(tenant.defaultCurrency);
            return;
          }
        }

        // If not in IndexedDB, try to fetch from server
        if (navigator.onLine) {
          try {
            const restaurantInfo = await restaurantApi.getInfo();
            if (restaurantInfo?.defaultCurrency) {
              setCurrency(restaurantInfo.defaultCurrency);
              // Cache in IndexedDB
              if (user?.tenantId) {
                await db.tenants.update(user.tenantId, {
                  defaultCurrency: restaurantInfo.defaultCurrency,
                });
              }
            }
          } catch (error) {
            console.warn('Failed to load currency from server:', error);
            // Fall back to IQD if server fetch fails
            setCurrency('IQD');
          }
        } else {
          // Offline and not in IndexedDB, use default
          setCurrency('IQD');
        }
      } catch (error) {
        console.error('Failed to load currency:', error);
        setCurrency('IQD');
      }
    };

    loadCurrency();
  }, [user?.tenantId]);

  return currency;
}

