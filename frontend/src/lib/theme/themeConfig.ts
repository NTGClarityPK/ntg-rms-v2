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
        backgroundColor: themeColors.colorDark,
        textColor: themeColors.colorTextMedium,
        hoverColor: themeColors.colorDarkHover,
        hoverTextColor: themeColors.colorCard,
        disabledOpacity: 0.6,
      },
      actionIcon: {
        // Inherits from button if not specified
        backgroundColor: themeColors.primary,
        textColor: themeColors.colorCard,
        hoverColor: themeColors.colorDarkHover,
        hoverTextColor: themeColors.colorTextDark,
        disabledOpacity: 0.6,
      },
      headerButton: {
        // Inherits from button if not specified
        backgroundColor: themeColors.colorDark,
        textColor: themeColors.colorTextDark,
        hoverColor: themeColors.colorDarkHover,
        hoverTextColor: themeColors.colorTextDark,
        disabledOpacity: 0.6,
      },
      navButton: {
        // Inherits from button if not specified (for expand/collapse, etc.)
        backgroundColor: themeColors.primary,
        textColor: themeColors.colorCard,
        hoverColor: themeColors.colorDarkHover,
        hoverTextColor: themeColors.colorTextDark,
        disabledOpacity: 0.6,
      },
      table: {
        backgroundColor: themeColors.colorCard,
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
      tabs: { //controls tabs and also the filter buttons in select date range in Reports page
        backgroundColor: themeColors.colorMedium,
        borderColor: themeColors.border,
        textColor: themeColors.colorTextMedium,
        selectedTabFontColor: themeColors.colorCard, // Selected tab font color - customize this
        selectedTabBackgroundColor: themeColors.primary, // Selected tab background
        hoverTabFontColor: themeColors.colorTextDark, // Tab hover font color
        hoverTabBackgroundColor: themeColors.colorDark, // Tab hover background
      },
      titleBar: {
        backgroundColor: themeColors.colorLight, // Title bar background color - customize this
      },
      subTitleBar: {
        backgroundColor: themeColors.colorMedium, // Sub title bar background color - customize this
      },
      filterChip: {
        backgroundColor: themeColors.colorMedium, // Unselected chip background
        textColor: themeColors.colorTextDark, // Unselected chip text
        selectedBackgroundColor: themeColors.primary, // Selected chip background
        selectedTextColor: themeColors.colorCard, // Selected chip text
        hoverBackgroundColor: themeColors.colorDarkHover, // Hover chip background
        hoverTextColor: themeColors.colorCard, // Hover chip text
      },
      switch: {
        trackColor: themeColors.colorMedium, // Unchecked track background
        checkedTrackColor: themeColors.primary, // Checked track background
        disabledTrackColor: themeColors.colorMedium, // Disabled track background
        thumbColor: themeColors.colorCard, // Thumb color when unchecked
        checkedThumbColor: themeColors.colorCard, // Thumb color when checked
        disabledThumbColor: themeColors.textMuted, // Disabled thumb color
        labelColor: themeColors.colorTextDark, // Label text color
        disabledLabelColor: themeColors.textMuted, // Disabled label color
      },
      radio: {
        uncheckedColor: themeColors.border, // Unchecked radio border
        checkedColor: themeColors.primary, // Checked radio color
        disabledColor: themeColors.borderLight, // Disabled radio color
        labelColor: themeColors.colorTextDark, // Label text color
        disabledLabelColor: themeColors.textMuted, // Disabled label color
        dotColor: themeColors.colorCard, // Inner dot color when checked
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

