import { useMemo } from 'react';
import { useMantineTheme } from '@mantine/core';
import { generateThemeColors, PRIMARY_COLOR, setPrimaryColor } from '../utils/themeColors';
import { useThemeSettings, usePublicThemeSettings } from './use-theme-settings';
import { useTheme } from './use-theme';

/**
 * Hook that provides dynamic theme colors based on the current theme mode
 * Now supports admin-customizable primary colors
 */
export function useDynamicTheme() {
  const mantineTheme = useMantineTheme();
  const { isDark } = useTheme();
  const { data: adminThemeSettings } = useThemeSettings();
  const { data: publicThemeSettings } = usePublicThemeSettings();
  
  // Use public theme settings first (works for all users), then admin settings, then fall back to default
  const primaryColor = useMemo(() => {
    const customColor = publicThemeSettings?.primary_color || adminThemeSettings?.primary_color;
    if (customColor) {
      // Use the custom color directly, with validation
      const adjustedColor = setPrimaryColor(customColor);
      return adjustedColor;
    }
    return PRIMARY_COLOR;
  }, [adminThemeSettings?.primary_color, publicThemeSettings?.primary_color]);
  
  // Generate theme colors based on current mode and primary color
  const themeColors = useMemo(() => {
    return generateThemeColors(primaryColor, isDark);
  }, [primaryColor, isDark]);
  
  // Get primary tones for icons and progress bars based on current theme
  const primaryTones = useMemo(() => {
    return [
      themeColors.primaryLight,
      themeColors.primaryDark,
      themeColors.primaryLighter,
      themeColors.primaryDarker,
      themeColors.primaryLightest,
      themeColors.primaryDarkest,
      themeColors.primary,
      themeColors.primaryLight,
    ];
  }, [themeColors]);
  
  // Get a specific primary tone by index (for consistent icon coloring)
  const getPrimaryToneByIndex = (index: number): string => {
    return primaryTones[index % primaryTones.length];
  };
  
  // Get a random primary tone
  const getRandomPrimaryTone = (): string => {
    return primaryTones[Math.floor(Math.random() * primaryTones.length)];
  };
  
  return {
    // Theme colors
    primary: themeColors.primary,
    primaryLight: themeColors.primaryLight,
    primaryLighter: themeColors.primaryLighter,
    primaryLightest: themeColors.primaryLightest,
    primaryDark: themeColors.primaryDark,
    primaryDarker: themeColors.primaryDarker,
    primaryDarkest: themeColors.primaryDarkest,
    
    // Background colors
    background: themeColors.background,
    surface: themeColors.surface,
    surfaceVariant: themeColors.surfaceVariant,
    
    // Text colors
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    textMuted: themeColors.textMuted,
    
    // Border colors
    border: themeColors.border,
    borderLight: themeColors.borderLight,
    
    // Primary tones
    primaryTones,
    getPrimaryToneByIndex,
    getRandomPrimaryTone,
    
    // Legacy aliases for backward compatibility
    earthyColors: primaryTones,
    getEarthyColorByIndex: getPrimaryToneByIndex,
    getRandomEarthyColor: getRandomPrimaryTone,
    
    // Theme state
    isDark,
    resolvedTheme: isDark ? 'dark' : 'light',
    
    // Theme settings (prioritize public settings for global persistence)
    themeSettings: publicThemeSettings || adminThemeSettings,
  };
}

