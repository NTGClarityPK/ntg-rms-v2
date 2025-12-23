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

  // Always prioritize store color - it's the source of truth and updates immediately
  // The store is updated first in updateThemeColor, so this will always have the latest value
  // CSS variables are updated for Mantine components, but React components should use the store
  return storeColor || DEFAULT_THEME_COLOR;
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
