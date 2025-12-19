/**
 * Generate theme colors from a primary color
 * Adapted for Mantine v7
 */

const DEFAULT_PRIMARY_COLOR = '#e4f4f5'; // Default color

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

    // Modern neutral grays (replacing brown/beige tones)
    colorLight: isDark ? '#1a1b1e' : '#f8f9fa',      // Background level
    colorMedium: isDark ? '#25262b' : '#e9ecef',    // Surface variant
    colorDark: isDark ? '#373a40' : '#dee2e6',      // Border/hover base
    colorDarkHover: isDark ? '#424449' : '#ced4da', // Hover state
    colorCard: isDark ? '#25262b' : '#ffffff',      // Card/surface (pure white in light)
    colorTextDark: isDark ? '#ffffff' : '#212529',   // Primary text (pure white/black)
    colorTextMedium: isDark ? '#c1c2c5' : '#495057', // Secondary text
    colorTextLight: isDark ? '#909296' : '#6c757d',  // Muted text
    
    // Utility colors for overlays and interactions
    overlayLight: isDark ? '#ffffff' : '#000000',    // For creating overlay effects
    overlayDark: isDark ? '#000000' : '#ffffff',     // Inverse overlay
    pureWhite: '#ffffff',                             // Pure white (works in both themes)
    pureBlack: '#000000',                             // Pure black (works in both themes)

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
