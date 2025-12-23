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
      hoverTextColor?: string;
      disabledOpacity?: number;
    };
    actionIcon: {
      backgroundColor?: string;
      textColor?: string;
      hoverColor?: string;
      hoverTextColor?: string;
      disabledOpacity?: number;
    };
    headerButton: {
      backgroundColor?: string;
      textColor?: string;
      hoverColor?: string;
      hoverTextColor?: string;
      disabledOpacity?: number;
    };
    navButton: {
      backgroundColor?: string;
      textColor?: string;
      hoverColor?: string;
      hoverTextColor?: string;
      disabledOpacity?: number;
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
    titleBar: {
      backgroundColor: string;
    };
    subTitleBar: {
      backgroundColor: string;
    };
    filterChip: {
      backgroundColor: string;
      textColor: string;
      selectedBackgroundColor: string;
      selectedTextColor: string;
      hoverBackgroundColor: string;
      hoverTextColor: string;
    };
    switch: {
      trackColor: string;
      checkedTrackColor: string;
      disabledTrackColor?: string;
      thumbColor: string;
      checkedThumbColor?: string;
      disabledThumbColor?: string;
      labelColor?: string;
      disabledLabelColor?: string;
    };
    radio: {
      uncheckedColor: string;
      checkedColor: string;
      disabledColor?: string;
      labelColor?: string;
      disabledLabelColor?: string;
      dotColor?: string;
    };
    badge: {
      lightTheme: {
        backgroundBase: string; // Base color for generating background variations (primaryLight)
        textBase: string; // Base color for generating text variations (primaryDark)
      };
      darkTheme: {
        backgroundBase: string; // Base color for generating background variations (primaryDark)
        textBase: string; // Base color for generating text variations (primaryLight)
      };
      variationCount?: number; // Number of color variations to generate (default: 10)
    };
    avatar: {
      backgroundColor: string; // Background color of the avatar circle
      textColor: string; // Color of the initials text
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
    // Title font sizes (based on order prop)
    titleSize: {
      h1: string; // Page titles (order={1})
      h2: string; // Section titles (order={2})
      h3: string; // Subsection titles (order={3})
      h4: string; // Minor section titles (order={4})
    };
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
    
    // Component-specific overrides - Modern UI/UX principles applied
    components: {
      navbar: {
        backgroundColor: themeColors.colorCard, // Pure white/dark surface
        borderColor: 'transparent',
        textColor: themeColors.colorTextDark,
        hoverBackground: themeColors.colorMedium, // Subtle surface variant
        hoverTextColor: themeColors.primary, // Primary color on hover
        // Theme-aware active state: darker background in dark mode, lighter in light mode
        activeBackground: isDark 
          ? themeColors.primaryDark // Darker shade for dark mode (better contrast)
          : themeColors.primaryLightest, // Light shade for light mode
        activeTextColor: isDark
          ? themeColors.pureWhite // White text/icon in dark mode for maximum contrast
          : themeColors.primary, // Primary color for light mode
      },
      header: {
        backgroundColor: themeColors.colorCard, // Same as navbar for consistency
        borderColor: 'transparent',
        textColor: themeColors.colorTextDark,
      },
      page: {
        backgroundColor: themeColors.colorLight, // Subtle background
      },
      card: {
        backgroundColor: themeColors.colorCard,
        borderColor: themeColors.borderLight,
      },
      button: {
        backgroundColor: themeColors.primary,
        textColor: isDark ? themeColors.pureBlack : themeColors.pureWhite, // High contrast
        hoverColor: themeColors.primaryDark,
        hoverTextColor: isDark ? themeColors.pureBlack : themeColors.pureWhite,
        disabledOpacity: 0.38, // WCAG compliant
      },
      actionIcon: {
        backgroundColor: 'transparent',
        textColor: themeColors.colorTextMedium,
        hoverColor: themeColors.primaryLightest, // Subtle primary tint
        hoverTextColor: themeColors.primary,
        disabledOpacity: 0.38,
      },
      headerButton: {
        backgroundColor: themeColors.colorLight,
        textColor: themeColors.colorTextDark,
        hoverColor: themeColors.colorMedium, // Subtle background
        hoverTextColor: themeColors.colorTextDark,
        disabledOpacity: 0.38,
      },
      navButton: {
        backgroundColor: 'transparent',
        textColor: themeColors.colorTextMedium,
        hoverColor: themeColors.colorMedium,
        hoverTextColor: themeColors.primary,
        disabledOpacity: 0.38,
      },
      table: {
        backgroundColor: themeColors.colorCard,
        headerBackground: themeColors.colorLight, // Subtle header
        headerHoverBackground: themeColors.colorMedium,
        borderColor: themeColors.borderLight,
        textColor: themeColors.colorTextDark,
        hoverBackground: themeColors.colorLight, // Very subtle row hover
        hoverTextColor: themeColors.colorTextDark,
      },
      input: {
        backgroundColor: themeColors.colorCard,
        borderColor: themeColors.border,
        textColor: themeColors.colorTextDark,
      },
      tabs: {
        backgroundColor: 'transparent',
        borderColor: themeColors.borderLight,
        textColor: themeColors.colorTextMedium,
        selectedTabFontColor: themeColors.primary,
        selectedTabBackgroundColor: 'transparent',
        hoverTabFontColor: themeColors.colorTextDark,
        hoverTabBackgroundColor: themeColors.colorLight,
      },
      titleBar: {
        backgroundColor: themeColors.colorLight,
      },
      subTitleBar: {
        backgroundColor: themeColors.colorCard, // Slightly different
      },
      filterChip: {
        backgroundColor: 'transparent',
        textColor: themeColors.colorTextDark,
        selectedBackgroundColor: themeColors.primary,
        selectedTextColor: isDark ? themeColors.pureBlack : themeColors.pureWhite,
        hoverBackgroundColor: themeColors.colorMedium,
        hoverTextColor: themeColors.colorTextDark,
      },
      switch: {
        trackColor: themeColors.colorDark, // Unchecked
        checkedTrackColor: themeColors.primary,
        disabledTrackColor: themeColors.borderLight,
        thumbColor: themeColors.pureWhite, // White thumb
        checkedThumbColor: themeColors.pureWhite,
        disabledThumbColor: themeColors.textMuted,
        labelColor: themeColors.colorTextDark,
        disabledLabelColor: themeColors.textMuted,
      },
      radio: {
        uncheckedColor: themeColors.border,
        checkedColor: themeColors.primary,
        disabledColor: themeColors.borderLight,
        labelColor: themeColors.colorTextDark,
        disabledLabelColor: themeColors.textMuted,
        dotColor: themeColors.pureWhite, // White dot for contrast
      },
      badge: {
        lightTheme: {
          backgroundBase: themeColors.primaryLight, // Base for background variations
          textBase: themeColors.primaryDark, // Base for text variations
        },
        darkTheme: {
          backgroundBase: themeColors.primaryDark, // Base for background variations
          textBase: themeColors.primaryLight, // Base for text variations
        },
        variationCount: 10, // Number of color variations to generate
      },
      avatar: {
        backgroundColor: themeColors.primary,
        textColor: isDark ? themeColors.pureBlack : themeColors.pureWhite,
      },
    },
    
    typography: {
      fontFamily: {
        primary: 'var(--font-primary), Arial, Helvetica, sans-serif',
        heading: 'var(--font-heading), Arial, Helvetica, sans-serif',
        mono: 'var(--font-mono), Monaco, Courier New, monospace',
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
      pageHeaderColor: themeColors.primary, // Page headers (Title)
      navbarSectionHeaderColor: themeColors.colorTextDark, // Navbar section headers
      pageSectionHeaderColor: themeColors.colorTextLight, // Page section headers
      // Title font sizes (based on order prop)
      titleSize: {
        h1: '2rem', // Page titles (order={1}) - 32px
        h2: '1.5rem', // Section titles (order={2}) - 24px
        h3: '1.25rem', // Subsection titles (order={3}) - 20px
        h4: '1.125rem', // Minor section titles (order={4}) - 18px
      },
    },
    
    spacing: {
      borderRadius: 'md',
    },
  };
}

