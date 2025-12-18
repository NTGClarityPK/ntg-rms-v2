import { useEffect, useState } from 'react';
import { useMantineTheme } from '@mantine/core';
import { restaurantApi } from '@/lib/api/restaurant';
import { db } from '@/lib/indexeddb/database';
import { useAuthStore } from '@/lib/store/auth-store';
import { useThemeStore } from '@/lib/store/theme-store';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { 
  DEFAULT_THEME_COLOR, 
  getLegacyThemeColor, 
  setLegacyThemeColor 
} from '@/lib/utils/theme';

export function useDynamicTheme() {
  const theme = useMantineTheme();
  const { user } = useAuthStore();
  const { primaryColor: storeColor, setPrimaryColor: setStoreColor } = useThemeStore();
  const { setRestaurant } = useRestaurantStore();
  const [primaryColor, setPrimaryColor] = useState<string | undefined>(undefined);

  useEffect(() => {
    const loadTheme = async () => {
      let colorToUse: string | null = null;
      let themeFromDb = false;

      try {
        // Priority 1: If tenant ID exists, try to get tenant theme from DB
        if (user?.tenantId) {
          // Try to load from IndexedDB first
          try {
            const localData = await db.tenants.get(user.tenantId);
            if (localData?.primaryColor) {
              colorToUse = localData.primaryColor;
              themeFromDb = true;
            }
          } catch (err) {
            console.warn('Failed to load theme from IndexedDB:', err);
          }

          // Then sync from server if online (always fetch to get latest logo and other info)
          if (navigator.onLine) {
            try {
              const serverData = await restaurantApi.getInfo();
              if (serverData) {
                // Update theme if available
                if (serverData?.primaryColor) {
                  colorToUse = serverData.primaryColor;
                  themeFromDb = true;
                }
                
                // Update restaurant store with logo and other info
                setRestaurant({
                  id: user.tenantId,
                  name: serverData.name || 'RMS',
                  logoUrl: serverData.logoUrl,
                  primaryColor: serverData.primaryColor,
                });
                
                // Update IndexedDB with server data
                try {
                  const existingTenant = await db.tenants.get(user.tenantId);
                  if (existingTenant) {
                    await db.tenants.update(user.tenantId, {
                      name: serverData.name,
                      logoUrl: serverData.logoUrl,
                      primaryColor: serverData.primaryColor || existingTenant.primaryColor,
                      updatedAt: new Date().toISOString(),
                    });
                  } else {
                    // Create tenant record if it doesn't exist
                    await db.tenants.add({
                      id: user.tenantId,
                      name: serverData.name,
                      subdomain: serverData.subdomain,
                      email: serverData.email,
                      phone: serverData.phone,
                      logoUrl: serverData.logoUrl,
                      primaryColor: serverData.primaryColor || DEFAULT_THEME_COLOR,
                      defaultCurrency: serverData.defaultCurrency,
                      timezone: serverData.timezone,
                      isActive: serverData.isActive,
                      createdAt: serverData.createdAt,
                      updatedAt: serverData.updatedAt,
                    });
                  }
                } catch (err) {
                  console.warn('Failed to update IndexedDB with server data:', err);
                }
              }
            } catch (err) {
              console.warn('Failed to load restaurant info from server:', err);
            }
          }
        }

        // Priority 2: If no tenant theme (or no tenantId), try localStorage
        // Skip localStorage on auth pages (when user is not authenticated)
        if (!colorToUse && user?.tenantId) {
          const legacyColor = getLegacyThemeColor();
          if (legacyColor) {
            colorToUse = legacyColor;
          }
        }

        // Priority 3: Use default theme
        if (!colorToUse) {
          colorToUse = DEFAULT_THEME_COLOR;
        }

        // If theme was fetched from DB, store it in localStorage for future use
        // Only store if user is authenticated (skip on auth pages)
        if (themeFromDb && colorToUse && user?.tenantId) {
          setLegacyThemeColor(colorToUse);
        }

        // Apply the theme immediately
        if (colorToUse) {
          setPrimaryColor(colorToUse);
          setStoreColor(colorToUse); // Update store to trigger re-renders
          applyThemeColor(colorToUse);
          
          // Apply again after a short delay to ensure it overrides any default styles
          setTimeout(() => {
            applyThemeColor(colorToUse!);
          }, 100);
        }
      } catch (err) {
        console.error('Failed to load theme:', err);
        // Fallback: use default theme on auth pages, localStorage on authenticated pages
        const fallbackColor = (user?.tenantId ? getLegacyThemeColor() : null) || DEFAULT_THEME_COLOR;
        setPrimaryColor(fallbackColor);
        setStoreColor(fallbackColor); // Update store to trigger re-renders
        applyThemeColor(fallbackColor);
      }
    };

    // Always load theme, even without user (for public pages)
    loadTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]); // setStoreColor is stable from Zustand, no need to include

  const applyThemeColor = (color: string) => {
    if (typeof document === 'undefined') return;
    
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Helper function to lighten/darken color
    const adjustBrightness = (baseR: number, baseG: number, baseB: number, factor: number): string => {
      const newR = Math.round(Math.min(255, Math.max(0, baseR + (255 - baseR) * factor)));
      const newG = Math.round(Math.min(255, Math.max(0, baseG + (255 - baseG) * factor)));
      const newB = Math.round(Math.min(255, Math.max(0, baseB + (255 - baseB) * factor)));
      return `#${[newR, newG, newB].map(x => x.toString(16).padStart(2, '0')).join('')}`;
    };

    const darken = (baseR: number, baseG: number, baseB: number, factor: number): string => {
      const newR = Math.round(Math.max(0, baseR * (1 - factor)));
      const newG = Math.round(Math.max(0, baseG * (1 - factor)));
      const newB = Math.round(Math.max(0, baseB * (1 - factor)));
      return `#${[newR, newG, newB].map(x => x.toString(16).padStart(2, '0')).join('')}`;
    };

    // Generate color shades (Mantine uses 0-9 scale where 6 is the base)
    // Shades 0-5 are lighter, 6 is base, 7-9 are darker
    const shades: string[] = [];
    shades[0] = adjustBrightness(r, g, b, 0.95); // Very light
    shades[1] = adjustBrightness(r, g, b, 0.85);
    shades[2] = adjustBrightness(r, g, b, 0.75);
    shades[3] = adjustBrightness(r, g, b, 0.60);
    shades[4] = adjustBrightness(r, g, b, 0.40);
    shades[5] = adjustBrightness(r, g, b, 0.20);
    shades[6] = color; // Base color
    shades[7] = darken(r, g, b, 0.15);
    shades[8] = darken(r, g, b, 0.30);
    shades[9] = darken(r, g, b, 0.45); // Very dark

    // Override all Mantine blue color shades to use the dynamic theme color
    // Mantine uses blue as the primary color, so we override all blue shades
    for (let i = 0; i <= 9; i++) {
      document.documentElement.style.setProperty(`--mantine-color-blue-${i}`, shades[i]);
    }
    
    // Set primary color variables
    document.documentElement.style.setProperty('--mantine-color-blue-filled', color);
    document.documentElement.style.setProperty('--mantine-color-blue-outline', color);
    document.documentElement.style.setProperty('--mantine-primary-color', color);
    document.documentElement.style.setProperty('--mantine-primary-color-rgb', `${r}, ${g}, ${b}`);
    
    // Also override the primary color in Mantine's theme system
    // This ensures components using primaryColor prop use the dynamic color
    document.documentElement.style.setProperty('--mantine-color-primary', color);
    document.documentElement.style.setProperty('--mantine-color-primary-6', color);
    
    // Force a repaint to ensure styles are applied
    document.documentElement.style.setProperty('--mantine-theme-applied', '1');
  };

  const updateThemeColor = async (color: string) => {
    // Update store first to trigger immediate re-renders
    setStoreColor(color);
    setPrimaryColor(color);
    applyThemeColor(color);
    // Store in localStorage so auth pages (without tenantId) can use it
    setLegacyThemeColor(color);
    
    // Force re-apply after short delays to ensure all components update
    setTimeout(() => {
      applyThemeColor(color);
      // Trigger a small DOM change to force browser repaint
      document.documentElement.style.setProperty('--mantine-theme-updated', Date.now().toString());
    }, 50);
    
    setTimeout(() => {
      applyThemeColor(color);
    }, 150);
  };

  return {
    primaryColor,
    updateThemeColor,
  };
}

