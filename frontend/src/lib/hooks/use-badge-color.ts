import { useMemo } from 'react';
import { getBadgeColorForText } from '@/lib/utils/theme';

/**
 * Hook to get badge color for a text label
 * Uses hash-based color generation from themeConfig
 */
export function useBadgeColor(text: string): string {
  return useMemo(() => {
    return getBadgeColorForText(text);
  }, [text]);
}

