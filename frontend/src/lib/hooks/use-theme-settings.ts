import { useState, useEffect } from 'react';
import { restaurantApi } from '@/lib/api/restaurant';
import { useRestaurantStore } from '@/lib/store/restaurant-store';

export interface ThemeSettings {
  primary_color?: string;
}

/**
 * Hook to fetch theme settings from the backend
 * Uses the restaurant API to get primary color
 */
export function useThemeSettings() {
  const { restaurant } = useRestaurantStore();
  const tenantId = restaurant?.id;
  const [data, setData] = useState<ThemeSettings | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setData(undefined);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchThemeSettings = async () => {
      try {
        setIsLoading(true);
        const restaurantData = await restaurantApi.getInfo();
        if (isMounted) {
          setData({
            primary_color: restaurantData.primaryColor,
          });
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch theme settings:', err);
          setError(err as Error);
          setData(undefined);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchThemeSettings();

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  return { data, isLoading, error };
}

/**
 * Hook to fetch public theme settings (works without authentication)
 */
export function usePublicThemeSettings() {
  const { restaurant } = useRestaurantStore();
  const tenantId = restaurant?.id;
  const [data, setData] = useState<ThemeSettings | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setData(undefined);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchThemeSettings = async () => {
      try {
        setIsLoading(true);
        const restaurantData = await restaurantApi.getInfo();
        if (isMounted) {
          setData({
            primary_color: restaurantData.primaryColor,
          });
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch public theme settings:', err);
          setError(err as Error);
          setData(undefined);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchThemeSettings();

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  return { data, isLoading, error };
}

