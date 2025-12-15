/**
 * Centralized Theme Configuration
 * 
 * This is the SINGLE SOURCE OF TRUTH for all theme settings.
 * Change any value here to control the entire application's appearance.
 */

import { generateThemeColors } from '../utils/themeColors';

export interface ThemeConfig {
  // Color Settings
  colors: {
    primary: string;
    primaryLight: string;
    primaryLighter: string;
    primaryLightest: string;
    primaryDark: string;
    primaryDarker: string;
    primaryDarkest: string;
    background: string;
    surface: string;
    surfaceVariant: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    borderLight: string;
  };
  
  // Component-Specific Colors (override defaults if needed)
  components: {
    navbar: {
      backgroundColor: string;
      borderColor: string;
      textColor: string;
      hoverBackground: string;
      hoverTextColor: string;
      activeBackground: string;
      activeTextColor: string;
    };
    header: {
      backgroundColor: string;
      borderColor: string;
      textColor: string;
    };
    page: {
      backgroundColor: string;
    };
    card: {
      backgroundColor: string;
      borderColor: string;
    };
    button: {
      backgroundColor: string;
      textColor: string;
      hoverColor: string;
    };
    table: {
      backgroundColor: string;
      headerBackground: string;
      headerHoverBackground: string;
      borderColor: string;
      textColor: string;
      hoverBackground: string;
      hoverTextColor: string;
    };
    input: {
      backgroundColor: string;
      borderColor: string;
      textColor: string;
    };
    tabs: {
      backgroundColor: string;
      borderColor: string;
      textColor: string;
      selectedTabFontColor: string;
      selectedTabBackgroundColor: string;
      hoverTabFontColor: string;
      hoverTabBackgroundColor: string;
    };
  };
  
  // Typography Settings
  typography: {
    fontFamily: {
      primary: string;
      heading: string;
      mono: string;
    };
    fontSize: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
    };
    fontWeight: {
      regular: number;
      medium: number;
      semibold: number;
      bold: number;
    };
    // Header text colors
    pageHeaderColor: string; // Page headers (Title components)
    navbarSectionHeaderColor: string; // Navbar section headers (Navigation, Management, etc.)
    pageSectionHeaderColor: string; // Page section headers (uppercase Text components)
  };
  
  // Spacing & Layout
  spacing: {
    borderRadius: string;
  };
}

/**
 * Generate theme configuration from primary color and theme mode
 */
export function generateThemeConfig(
  primaryColor: string,
  isDark: boolean = false
): ThemeConfig {
  const themeColors = generateThemeColors(primaryColor, isDark);
  
  // Debug: Log primary color values
  if (typeof window !== 'undefined') {
    console.log('🎨 Theme Config Debug:', {
      primaryColorInput: primaryColor,
      primaryColorOutput: themeColors.primary,
      navbarHoverBackground: themeColors.primary,
    });
  }
  
  return {
    colors: themeColors,
    
    // Component-specific overrides - modify these to customize individual components
    components: {
      navbar: {
        backgroundColor: themeColors.colorMedium, // Change this to customize navbar
        borderColor: 'transparent',
        textColor: themeColors.colorTextMedium,
        hoverBackground: themeColors.colorDarkHover, // Navbar menu hover background
        hoverTextColor: themeColors.colorTextDark, // Navbar menu hover text
        activeBackground: themeColors.colorDark, // Navbar menu selected/active background
        activeTextColor: themeColors.colorTextDark, // Navbar menu selected/active text color - customize this
        },
      header: {
        backgroundColor: themeColors.colorMedium, // Change this to customize header
        borderColor: 'transparent',
        textColor: themeColors.colorTextLight,
      },
      page: {
        backgroundColor: themeColors.colorLight, // Page background color - customize this
      },
      card: {
        backgroundColor: themeColors.colorCard,
        borderColor: themeColors.border,
      },
      button: {
        backgroundColor: themeColors.primary,
        textColor: themeColors.colorCard,
        hoverColor: themeColors.colorDarkHover,
      },
      table: {
        backgroundColor: themeColors.colorMedium,
        headerBackground: themeColors.colorDark,
        headerHoverBackground: themeColors.colorDarkHover, // Table header hover
        borderColor: themeColors.border,
        textColor: themeColors.colorTextDark,
        hoverBackground: themeColors.colorDarkHover,
        hoverTextColor: themeColors.colorTextDark, // Table row hover text color - customize this
      },
      input: {
        backgroundColor: themeColors.colorCard,
        borderColor: themeColors.border,
        textColor: themeColors.colorTextMedium,
      },
      tabs: {
        backgroundColor: themeColors.colorMedium,
        borderColor: themeColors.border,
        textColor: themeColors.colorTextMedium,
        selectedTabFontColor: themeColors.colorTextDark, // Selected tab font color - customize this
        selectedTabBackgroundColor: themeColors.colorDark, // Selected tab background
        hoverTabFontColor: themeColors.colorTextDark, // Tab hover font color
        hoverTabBackgroundColor: themeColors.colorDark, // Tab hover background
      },
    },
    
    typography: {
      fontFamily: {
        primary: 'var(--font-geist-sans), Arial, Helvetica, sans-serif',
        heading: 'var(--font-geist-sans), Arial, Helvetica, sans-serif',
        mono: 'var(--font-geist-mono), Monaco, Courier New, monospace',
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        md: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
      },
      fontWeight: {
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      // Header text colors
      pageHeaderColor: themeColors.colorTextDark, // Page headers (Title)
      navbarSectionHeaderColor: themeColors.colorTextDark, // Navbar section headers
      pageSectionHeaderColor: themeColors.primary, // Page section headers
    },
    
    spacing: {
      borderRadius: 'md',
    },
  };
}

