import { useState, useEffect, useMemo } from 'react';
import { useMantineTheme } from '@mantine/core';
import { getThemeColor, getThemeColorShade, DEFAULT_THEME_COLOR } from '@/lib/utils/theme';
import { useThemeStore } from '@/lib/store/theme-store';

/**
 * Hook to get the current primary theme color
 * Uses CSS custom property if available, otherwise falls back to default
 * Reactive to theme changes via store
 */
export function useThemeColor(): string {
  const theme = useMantineTheme();
  const { primaryColor: storeColor, themeVersion } = useThemeStore();
  const [cssColor, setCssColor] = useState<string>(storeColor);

  useEffect(() => {
    // Update from CSS variable when theme changes
    const updateColor = () => {
      if (typeof document !== 'undefined') {
        const color = getComputedStyle(document.documentElement)
          .getPropertyValue('--mantine-primary-color')
          .trim();
        if (color) {
          setCssColor(color);
        }
      }
    };

    // Listen to theme change events
    const handleThemeChange = () => {
      updateColor();
    };

    // Also listen to CSS variable changes via MutationObserver
    const observer = new MutationObserver(() => {
      updateColor();
    });

    if (typeof document !== 'undefined') {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style'],
      });
    }

    window.addEventListener('theme-change', handleThemeChange);
    updateColor(); // Initial update

    return () => {
      window.removeEventListener('theme-change', handleThemeChange);
      observer.disconnect();
    };
  }, [themeVersion]); // Re-run when theme version changes

  // Use CSS color if available, otherwise use store color
  if (typeof document !== 'undefined') {
    const currentCssColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--mantine-primary-color')
      .trim();
    if (currentCssColor) {
      return currentCssColor;
    }
  }

  return storeColor || getThemeColor();
}

/**
 * Hook to get theme color with a darker shade for gradients
 * Reactive to theme changes
 */
export function useThemeColorShade(shade: number = 8): string {
  const { themeVersion } = useThemeStore(); // Subscribe to theme changes
  
  // Re-compute shade when theme changes
  // getThemeColorShade reads from CSS variables, so we need themeVersion to trigger re-render
  return useMemo(() => {
    return getThemeColorShade(shade);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeVersion, shade]); // themeVersion triggers re-render when theme changes, even though not used in computation
}
