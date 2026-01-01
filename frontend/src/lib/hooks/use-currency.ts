import { useState, useEffect } from 'react';
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
        const restaurantInfo = await restaurantApi.getInfo();
        if (restaurantInfo?.defaultCurrency) {
          setCurrency(restaurantInfo.defaultCurrency);
        } else {
          setCurrency('IQD');
        }
      } catch (error) {
        console.warn('Failed to load currency from server:', error);
        setCurrency('IQD');
      }
    };

    if (user?.tenantId) {
      loadCurrency();
    }
  }, [user?.tenantId]);

  return currency;
}

