import { useMemo } from 'react';
import { useThemeStore } from '@/lib/store/theme-store';
import { useTheme } from '@/lib/hooks/use-theme';
import { generateThemeColors } from '@/lib/utils/themeColors';

/**
 * Reactive hook to get chart colors based on the current theme
 * Updates immediately when theme color changes
 * 
 * @param seriesCount - Number of series in the chart
 * @returns Array of colors for the chart series
 */
export function useChartColors(seriesCount: number): string[] {
  const { primaryColor, themeVersion } = useThemeStore();
  const { isDark } = useTheme();

  return useMemo(() => {
    if (seriesCount <= 0) return [];
    
    if (seriesCount === 1) {
      // Single series: use primary color
      return [primaryColor];
    }

    // Multiple series: use primary color and its variations
    const themeColors = generateThemeColors(primaryColor, isDark);
    
    // Generate color variations for multiple series
    const colors: string[] = [
      themeColors.primary,              // Base primary
      themeColors.primaryLight,          // Light variation
      themeColors.primaryDark,           // Dark variation
      themeColors.primaryLighter,        // Lighter variation
      themeColors.primaryDarker,         // Darker variation
      themeColors.primaryLightest,       // Lightest variation
      themeColors.primaryDarkest,        // Darkest variation
    ];

    // Return only the number of colors needed
    return colors.slice(0, seriesCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryColor, isDark, seriesCount]);
}
