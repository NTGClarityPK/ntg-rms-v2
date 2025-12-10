import { useMemo } from 'react';
import { useThemeColor } from './use-theme-color';
import { useThemeStore } from '@/lib/store/theme-store';
import {
  getThemeColorShade,
  getSuccessColor,
  getErrorColor,
  getWarningColor,
  getInfoColor,
} from '@/lib/utils/theme';

/**
 * Hook to get all theme-based colors
 * Returns colors that adapt to the current theme
 */
export function useThemeColors() {
  const primary = useThemeColor();
  const { themeVersion } = useThemeStore(); // Subscribe to theme changes

  return useMemo(
    () => ({
      primary,
      primaryShade: getThemeColorShade(8),
      success: getSuccessColor(),
      error: getErrorColor(),
      warning: getWarningColor(),
      info: getInfoColor(),
    }),
    [primary] // Re-compute when primary color or theme version changes
  );
}

/**
 * Get notification color props for Mantine notifications
 * Mantine accepts hex colors in the color prop
 */
export function useNotificationColors() {
  const colors = useThemeColors();
  
  return useMemo(
    () => ({
      success: colors.success,
      error: colors.error,
      warning: colors.warning,
      info: colors.info,
      primary: colors.primary,
    }),
    [colors]
  );
}

/**
 * Hook to get success color based on theme
 * Functions read from CSS variables, so themeVersion triggers re-render
 */
export function useSuccessColor(): string {
  const { themeVersion } = useThemeStore(); // Subscribe to theme changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getSuccessColor(), [themeVersion]); // themeVersion triggers re-render
}

/**
 * Hook to get error color based on theme
 * Functions read from CSS variables, so themeVersion triggers re-render
 */
export function useErrorColor(): string {
  const { themeVersion } = useThemeStore(); // Subscribe to theme changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getErrorColor(), [themeVersion]); // themeVersion triggers re-render
}

/**
 * Hook to get warning color based on theme
 * Functions read from CSS variables, so themeVersion triggers re-render
 */
export function useWarningColor(): string {
  const { themeVersion } = useThemeStore(); // Subscribe to theme changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getWarningColor(), [themeVersion]); // themeVersion triggers re-render
}

/**
 * Hook to get info color based on theme
 * Functions read from CSS variables, so themeVersion triggers re-render
 */
export function useInfoColor(): string {
  const { themeVersion } = useThemeStore(); // Subscribe to theme changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getInfoColor(), [themeVersion]); // themeVersion triggers re-render
}

