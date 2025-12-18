/**
 * Default theme color constant
 */
export const DEFAULT_THEME_COLOR = '#2196f3';

/**
 * Get the current theme color from CSS custom properties
 * Falls back to default if not set
 */
export function getThemeColor(): string {
  if (typeof document === 'undefined') {
    return DEFAULT_THEME_COLOR;
  }

  // Try to get from CSS custom property
  const cssColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--mantine-primary-color')
    .trim();

  if (cssColor) {
    return cssColor;
  }

  // Fallback to localStorage
  const storedColor = localStorage.getItem('rms_theme_color');
  if (storedColor) {
    return storedColor;
  }

  // Final fallback to default
  return DEFAULT_THEME_COLOR;
}

/**
 * React hook to get the current theme color
 * Updates when theme changes
 */
export function useThemeColor(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_COLOR;
  }

  // This will be called on each render, but getThemeColor is fast
  // For better performance, you could use useState + useEffect + MutationObserver
  return getThemeColor();
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
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
 * Lighten or darken a color by a percentage
 * @param hex - Hex color string
 * @param percent - Percentage to lighten (positive) or darken (negative)
 */
function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const factor = percent / 100;
  const r = Math.round(Math.min(255, Math.max(0, rgb.r + rgb.r * factor)));
  const g = Math.round(Math.min(255, Math.max(0, rgb.g + rgb.g * factor)));
  const b = Math.round(Math.min(255, Math.max(0, rgb.b + rgb.b * factor)));

  return rgbToHex(r, g, b);
}

/**
 * Mix two colors
 * @param color1 - First color (hex)
 * @param color2 - Second color (hex)
 * @param weight - Weight of color2 (0-1)
 */
function mixColors(color1: string, color2: string, weight: number = 0.5): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return color1;

  const w = Math.max(0, Math.min(1, weight));
  const r = Math.round(rgb1.r * (1 - w) + rgb2.r * w);
  const g = Math.round(rgb1.g * (1 - w) + rgb2.g * w);
  const b = Math.round(rgb1.b * (1 - w) + rgb2.b * w);

  return rgbToHex(r, g, b);
}

/**
 * Get theme color with darker shade for gradients
 * @param shade - Shade level (0-9, where 6 is base, 7-9 are darker)
 */
export function getThemeColorShade(shade: number = 8): string {
  const color = getThemeColor();
  
  // If shade is 6, return base color
  if (shade === 6) return color;
  
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  
  // Calculate shade based on Mantine's shade system
  // Shades 0-5: lighter (more white)
  // Shades 7-9: darker (more black)
  if (shade < 6) {
    // Lighten: mix with white
    const factor = (6 - shade) / 6;
    return mixColors(color, '#ffffff', factor * 0.9);
  } else {
    // Darken: mix with black
    const factor = (shade - 6) / 3;
    return mixColors(color, '#000000', factor * 0.4);
  }
}

/**
 * Get success color (lighter/green-tinted version of theme)
 */
export function getSuccessColor(): string {
  const themeColor = getThemeColor();
  // Mix with green to create success color
  return mixColors(themeColor, '#4caf50', 0.3);
}

/**
 * Get error color (red-tinted version)
 */
export function getErrorColor(): string {
  const themeColor = getThemeColor();
  // Mix with red to create error color
  return mixColors(themeColor, '#f44336', 0.4);
}

/**
 * Get warning color (orange/yellow-tinted version)
 */
export function getWarningColor(): string {
  const themeColor = getThemeColor();
  // Mix with orange to create warning color
  return mixColors(themeColor, '#ff9800', 0.3);
}

/**
 * Get info color (theme color itself)
 */
export function getInfoColor(): string {
  return getThemeColor();
}

/**
 * Simple hash function to convert string to number
 * Returns a consistent number between 0 and max-1
 */
function hashString(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % max;
}

/**
 * Generate color variation from base color
 * Creates variations by lightening/darkening and slight hue shifts
 */
function generateColorVariation(baseColor: string, index: number, totalVariations: number): string {
  const rgb = hexToRgb(baseColor);
  if (!rgb) return baseColor;
  
  // Create variation by:
  // 1. Adjusting brightness based on index
  // 2. Slight hue shift for more variety
  const brightnessVariation = (index / totalVariations) * 0.4 - 0.2; // -0.2 to +0.2
  const hueShift = (index / totalVariations) * 30; // 0-30 degrees
  
  // Adjust brightness
  let r = rgb.r;
  let g = rgb.g;
  let b = rgb.b;
  
  if (brightnessVariation > 0) {
    // Lighten
    r = Math.min(255, Math.round(r + (255 - r) * brightnessVariation));
    g = Math.min(255, Math.round(g + (255 - g) * brightnessVariation));
    b = Math.min(255, Math.round(b + (255 - b) * brightnessVariation));
  } else {
    // Darken
    r = Math.max(0, Math.round(r * (1 + brightnessVariation)));
    g = Math.max(0, Math.round(g * (1 + brightnessVariation)));
    b = Math.max(0, Math.round(b * (1 + brightnessVariation)));
  }
  
  // Apply slight hue shift (rotate RGB values)
  const shift = Math.floor(hueShift / 120); // 0, 1, or 2
  if (shift === 1) {
    [r, g, b] = [g, b, r];
  } else if (shift === 2) {
    [r, g, b] = [b, r, g];
  }
  
  return rgbToHex(r, g, b);
}

/**
 * Get badge colors based on text content
 * Uses hash-based color generation from themeConfig badge settings
 */
export function getBadgeColors(text: string, isDark: boolean = false): { background: string; text: string } {
  let backgroundBase: string;
  let textBase: string;
  let variationCount = 10;
  
  if (typeof window !== 'undefined') {
    try {
      // Try to get from CSS custom properties set by DynamicThemeProvider
      const bgBase = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-badge-bg-base')
        .trim();
      const txtBase = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-badge-text-base')
        .trim();
      const varCount = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-badge-variation-count')
        .trim();
      
      if (bgBase && txtBase) {
        backgroundBase = bgBase;
        textBase = txtBase;
        if (varCount) {
          variationCount = parseInt(varCount, 10) || 10;
        }
      } else {
        // Fallback to theme color generation
        const themeColor = getThemeColor();
        // Detect dark mode from document
        const detectedDark = document.documentElement.getAttribute('data-theme') === 'dark' || 
                            document.documentElement.classList.contains('mantine-dark');
        const useDark = isDark || detectedDark;
        backgroundBase = useDark ? mixColors(themeColor, '#000000', 0.3) : mixColors(themeColor, '#ffffff', 0.7);
        textBase = useDark ? mixColors(themeColor, '#ffffff', 0.7) : mixColors(themeColor, '#000000', 0.3);
      }
    } catch {
      // Fallback
      const themeColor = getThemeColor();
      const detectedDark = document.documentElement.getAttribute('data-theme') === 'dark' || 
                          document.documentElement.classList.contains('mantine-dark');
      const useDark = isDark || detectedDark;
      backgroundBase = useDark ? mixColors(themeColor, '#000000', 0.3) : mixColors(themeColor, '#ffffff', 0.7);
      textBase = useDark ? mixColors(themeColor, '#ffffff', 0.7) : mixColors(themeColor, '#000000', 0.3);
    }
  } else {
    // SSR fallback
    const themeColor = DEFAULT_THEME_COLOR;
    backgroundBase = isDark ? mixColors(themeColor, '#000000', 0.3) : mixColors(themeColor, '#ffffff', 0.7);
    textBase = isDark ? mixColors(themeColor, '#ffffff', 0.7) : mixColors(themeColor, '#000000', 0.3);
  }
  
  // Hash the text to get a consistent index
  const index = hashString(text.toLowerCase(), variationCount);
  
  // Generate colors from base colors
  const background = generateColorVariation(backgroundBase, index, variationCount);
  const textColor = generateColorVariation(textBase, index, variationCount);
  
  return { background, text: textColor };
}

/**
 * Get status color based on order status
 * Now uses hash-based badge color generation from badge text
 */
export function getStatusColor(status: string): string {
  // Use the new badge color system - hash the status text to get consistent color
  const isDark = typeof window !== 'undefined' && 
    (document.documentElement.getAttribute('data-theme') === 'dark' ||
     document.documentElement.classList.contains('mantine-dark'));
  const colors = getBadgeColors(status, isDark);
  return colors.background;
}

/**
 * Get badge color for any text label (active, inactive, dine-in, etc.)
 * Use this for badges that display text directly
 */
export function getBadgeColorForText(text: string): string {
  const isDark = typeof window !== 'undefined' && 
    (document.documentElement.getAttribute('data-theme') === 'dark' ||
     document.documentElement.classList.contains('mantine-dark'));
  const colors = getBadgeColors(text, isDark);
  return colors.background;
}

/**
 * Get payment status color
 * Returns dynamic theme-based color values
 */
export function getPaymentStatusColor(status: string): string {
  const statusMap: Record<string, string> = {
    paid: getSuccessColor(), // Success
    unpaid: getWarningColor(), // Warning
    partial: mixColors(getWarningColor(), '#ff9800', 0.5), // Orange-tinted warning variant
  };
  
  return statusMap[status] || mixColors(getThemeColor(), '#9e9e9e', 0.5);
}

/**
 * Store theme color in localStorage (legacy support)
 */
export function setLegacyThemeColor(color: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('rms_theme_color', color);
  }
}

/**
 * Get theme color from localStorage (legacy support)
 */
export function getLegacyThemeColor(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('rms_theme_color');
  }
  return null;
}

