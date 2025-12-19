import { createTheme, MantineThemeOverride, MantineTheme } from '@mantine/core';
import { generateThemeConfig } from '../theme/themeConfig';

/**
 * Create a comprehensive dynamic Mantine theme
 * Uses centralized theme config for all styling
 */
export function createDynamicTheme(
  primaryColor: string,
  colorScheme: 'light' | 'dark' = 'light'
): MantineThemeOverride {
  const isDark = colorScheme === 'dark';
  const themeConfig = generateThemeConfig(primaryColor, isDark);

  // Convert hex to RGB for Mantine color system
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  const rgb = hexToRgb(primaryColor);
  if (!rgb) {
    return createTheme({
      primaryColor: 'blue',
      defaultRadius: 'md',
    });
  }

  // Generate Mantine color shades array (10 shades)
  const generateColorShades = (r: number, g: number, b: number) => {
    const shades = [];
    for (let i = 0; i < 4; i++) {
      const factor = 0.9 - (i * 0.2);
      shades.push(
        `rgb(${Math.round(255 - (255 - r) * factor)}, ${Math.round(255 - (255 - g) * factor)}, ${Math.round(255 - (255 - b) * factor)})`
      );
    }
    shades.push(primaryColor);
    for (let i = 1; i <= 5; i++) {
      const factor = i * 0.15;
      shades.push(
        `rgb(${Math.round(r * (1 - factor))}, ${Math.round(g * (1 - factor))}, ${Math.round(b * (1 - factor))})`
      );
    }
    return shades;
  };

  const primaryShades = generateColorShades(rgb.r, rgb.g, rgb.b);

  return createTheme({
    fontFamily: themeConfig.typography.fontFamily.primary,
    fontFamilyMonospace: themeConfig.typography.fontFamily.mono,
    
    headings: {
      fontFamily: themeConfig.typography.fontFamily.heading,
      fontWeight: String(themeConfig.typography.fontWeight.semibold),
      sizes: {
        h1: { fontSize: '2.5rem', lineHeight: '1.2', fontWeight: String(themeConfig.typography.fontWeight.semibold) },
        h2: { fontSize: '2rem', lineHeight: '1.3', fontWeight: String(themeConfig.typography.fontWeight.semibold) },
        h3: { fontSize: '1.75rem', lineHeight: '1.4', fontWeight: String(themeConfig.typography.fontWeight.semibold) },
        h4: { fontSize: '1.5rem', lineHeight: '1.4', fontWeight: String(themeConfig.typography.fontWeight.semibold) },
        h5: { fontSize: '1.25rem', lineHeight: '1.5', fontWeight: String(themeConfig.typography.fontWeight.semibold) },
        h6: { fontSize: '1rem', lineHeight: '1.5', fontWeight: String(themeConfig.typography.fontWeight.semibold) },
      },
    },
    
    fontSizes: themeConfig.typography.fontSize,
    
    lineHeights: {
      xs: '1.2',
      sm: '1.4',
      md: '1.6',
      lg: '1.8',
      xl: '2.0',
    },
    
    primaryColor: 'primary',
    defaultRadius: themeConfig.spacing.borderRadius,
    
    colors: {
      primary: primaryShades as any,
    },
    
    // Store full config in theme.other for access in components
    other: {
      ...themeConfig,
      primaryColor: primaryColor,
    },
    
    // Component styling - For components that support theme-based styling
    components: {
      Button: {
        defaultProps: { variant: 'filled' },
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            root: {
              backgroundColor: config.components.button.backgroundColor,
              color: config.components.button.textColor,
              fontFamily: config.typography.fontFamily.primary,
              fontWeight: config.typography.fontWeight.medium,
              '&:hover:not(:disabled)': {
                backgroundColor: config.components.button.hoverColor,
                color: config.components.button.hoverTextColor ?? config.components.button.textColor,
              },
            },
          };
        },
      },
      
      TextInput: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            input: {
              backgroundColor: config.components.input.backgroundColor,
              borderColor: config.components.input.borderColor,
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
              '&:focus': {
                borderColor: config.colors.primary,
              },
            },
            label: {
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
          };
        },
      },
      
      Textarea: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            input: {
              backgroundColor: config.components.input.backgroundColor,
              borderColor: config.components.input.borderColor,
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
            label: {
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
          };
        },
      },
      
      Select: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            input: {
              backgroundColor: config.components.input.backgroundColor,
              borderColor: config.components.input.borderColor,
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
            label: {
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
          };
        },
      },
      
      NumberInput: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            input: {
              backgroundColor: config.components.input.backgroundColor,
              borderColor: config.components.input.borderColor,
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
            label: {
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
          };
        },
      },
      
      DatePickerInput: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            input: {
              backgroundColor: config.components.input.backgroundColor,
              borderColor: config.components.input.borderColor,
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
            label: {
              color: config.components.input.textColor,
              fontFamily: config.typography.fontFamily.primary,
            },
          };
        },
      },
      
      Text: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            root: {
              color: config.colors.text,
              fontFamily: config.typography.fontFamily.primary,
            },
          };
        },
      },
      
      Title: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            root: {
              color: config.typography.pageHeaderColor,
              fontFamily: config.typography.fontFamily.heading,
            },
          };
        },
      },
      
      Card: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            root: {
              backgroundColor: config.components.card.backgroundColor,
              borderColor: config.components.card.borderColor,
              fontFamily: config.typography.fontFamily.primary,
              color: config.colors.text,
            },
          };
        },
      },
      
      Paper: {
        styles: (theme: MantineTheme) => {
          const config = (theme.other as any) as typeof themeConfig;
          return {
            root: {
              backgroundColor: config.components.card.backgroundColor,
              borderColor: config.components.card.borderColor,
              fontFamily: config.typography.fontFamily.primary,
            },
          };
        },
      },
    },
  });
}
