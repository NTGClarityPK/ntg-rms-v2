'use client';

import { ReactNode, useState, useEffect, useMemo } from 'react';
import { MantineProvider } from '@mantine/core';
import { usePublicThemeSettings } from '@/lib/hooks/use-theme-settings';
import { useTheme } from '@/lib/hooks/use-theme';
import { createDynamicTheme } from '@/lib/utils/createDynamicTheme';
import { PRIMARY_COLOR, setPrimaryColor } from '@/lib/utils/themeColors';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const { data: themeSettings } = usePublicThemeSettings();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get primary color from theme settings or use default
  const primaryColor = useMemo(() => {
    const customColor = themeSettings?.primary_color;
    if (customColor) {
      return setPrimaryColor(customColor);
    }
    return PRIMARY_COLOR;
  }, [themeSettings?.primary_color]);

  // Create dynamic theme based on current primary color and color scheme
  const dynamicTheme = useMemo(
    () => createDynamicTheme(primaryColor, resolvedTheme),
    [primaryColor, resolvedTheme]
  );

  // During SSR and initial hydration, use light theme as default
  if (!mounted) {
    return (
      <MantineProvider theme={createDynamicTheme(primaryColor, 'light')} defaultColorScheme="light">
        {children}
      </MantineProvider>
    );
  }

  return (
    <MantineProvider
      theme={dynamicTheme}
      defaultColorScheme={resolvedTheme}
      forceColorScheme={resolvedTheme}
    >
      {children}
    </MantineProvider>
  );
}

