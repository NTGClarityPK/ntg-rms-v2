/**
 * Generate theme colors from a primary color
 * Adapted for Mantine v7
 */

const DEFAULT_PRIMARY_COLOR = '#FF5A5F'; // Default color

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Lighten a color by a percentage
 */
function lighten(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * percent));
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * percent));
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * percent));

  return rgbToHex(r, g, b);
}

/**
 * Darken a color by a percentage
 */
function darken(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.max(0, Math.round(rgb.r * (1 - percent)));
  const g = Math.max(0, Math.round(rgb.g * (1 - percent)));
  const b = Math.max(0, Math.round(rgb.b * (1 - percent)));

  return rgbToHex(r, g, b);
}

/**
 * Generate theme colors from a primary color
 */
export function generateThemeColors(primaryColor: string, isDark: boolean = false) {
  const primary = primaryColor || DEFAULT_PRIMARY_COLOR;

  return {
    primary,
    primaryLight: lighten(primary, 0.2),
    primaryLighter: lighten(primary, 0.4),
    primaryLightest: lighten(primary, 0.6),
    primaryDark: darken(primary, 0.2),
    primaryDarker: darken(primary, 0.4),
    primaryDarkest: darken(primary, 0.6),
    
    // Background colors (theme-aware)
    background: isDark ? '#1a1b1e' : '#ffffff',
    surface: isDark ? '#25262b' : '#f8f9fa',
    surfaceVariant: isDark ? '#2c2e33' : '#e9ecef',
    
    // Text colors (theme-aware)
    text: isDark ? '#c1c2c5' : '#000000',
    textSecondary: isDark ? '#909296' : '#495057',
    textMuted: isDark ? '#5c5f66' : '#868e96',
    
    // Border colors (theme-aware)
    border: isDark ? '#373a40' : '#dee2e6',
    borderLight: isDark ? '#2c2e33' : '#e9ecef',

    //custom colors
    colorLight: isDark ? '#1B1717' : '#F9F7F7',
    colorMedium: isDark ? '#2B2424' : '#EBE7E7',
    colorDark: isDark ? '#3B2F2F' : '#D6CCCC',
    colorDarkHover: isDark ? '#4B3B3B' : '#CCBFBF',
    colorCard: isDark ? '#241F1F' : '#FFFFFF',
    colorTextDark: isDark ? '#E6D9D9' : '#4A4342',
    colorTextMedium: isDark ? '#C6B9B9' : '#6B6059',
    colorTextLight: isDark ? '#A69999' : '#8C7E77',

  };
}

/**
 * Set primary color (validates and returns adjusted color)
 */
export function setPrimaryColor(color: string): string {
  // Validate hex color
  if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
    console.warn(`Invalid color format: ${color}, using default`);
    return DEFAULT_PRIMARY_COLOR;
  }
  return color;
}

export const PRIMARY_COLOR = DEFAULT_PRIMARY_COLOR;
