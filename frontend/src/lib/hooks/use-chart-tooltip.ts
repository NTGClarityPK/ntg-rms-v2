import { useMemo } from 'react';
import { useTheme } from '@/lib/hooks/use-theme';
import { useMantineTheme } from '@mantine/core';

/**
 * Hook to get theme-aware tooltip styling for Recharts Tooltip components
 * Returns contentStyle prop that adapts to light/dark theme
 */
export function useChartTooltip() {
  const { isDark } = useTheme();
  const mantineTheme = useMantineTheme();

  const contentStyle = useMemo(() => {
    return {
      backgroundColor: isDark ? mantineTheme.colors.dark[7] : mantineTheme.colors.gray[0],
      border: `1px solid ${isDark ? mantineTheme.colors.dark[4] : mantineTheme.colors.gray[3]}`,
      borderRadius: mantineTheme.radius.md,
      color: isDark ? mantineTheme.colors.dark[0] : mantineTheme.colors.dark[7],
      padding: `${mantineTheme.spacing.xs} ${mantineTheme.spacing.sm}`,
    };
  }, [isDark, mantineTheme]);

  const itemStyle = useMemo(() => {
    return {
      color: isDark ? mantineTheme.colors.dark[0] : mantineTheme.colors.dark[7],
    };
  }, [isDark, mantineTheme]);

  const labelStyle = useMemo(() => {
    return {
      color: isDark ? mantineTheme.colors.dark[0] : mantineTheme.colors.dark[7],
      fontWeight: 600,
    };
  }, [isDark, mantineTheme]);

  return {
    contentStyle,
    itemStyle,
    labelStyle,
  };
}

