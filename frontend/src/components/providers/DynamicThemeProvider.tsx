'use client';

import { useEffect } from 'react';
import { useMantineTheme } from '@mantine/core';
import { useDynamicTheme } from '@/lib/hooks/useDynamicTheme';
import type { ThemeConfig } from '@/lib/theme/themeConfig';

/**
 * Provider that applies theme styles to all components
 * 
 * Strategy:
 * 1. CSS Variables for components that can use them
 * 2. CSS Injection with !important for components using CSS classes (Navbar, Header)
 * 3. Direct DOM manipulation for components with inline style overrides (mantine-datatable)
 */
export function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useMantineTheme();
  const dynamicTheme = useDynamicTheme();
  
  // Get theme config from Mantine theme
  const themeConfig = (theme.other as any) as ThemeConfig | undefined;

  useEffect(() => {
    if (typeof document === 'undefined' || !themeConfig) return;

    const config = themeConfig;

    // 1. Set CSS Variables for maximum compatibility
    const root = document.documentElement;
    
    // Primary colors
    root.style.setProperty('--theme-primary', config.colors.primary);
    root.style.setProperty('--theme-primary-light', config.colors.primaryLight);
    root.style.setProperty('--theme-primary-dark', config.colors.primaryDark);
    
    // Background colors
    root.style.setProperty('--theme-background', config.colors.background);
    root.style.setProperty('--theme-surface', config.colors.surface);
    root.style.setProperty('--theme-surface-variant', config.colors.surfaceVariant);
    
    // Text colors
    root.style.setProperty('--theme-text', config.colors.text);
    root.style.setProperty('--theme-text-secondary', config.colors.textSecondary);
    root.style.setProperty('--theme-text-muted', config.colors.textMuted);
    
    // Border colors
    root.style.setProperty('--theme-border', config.colors.border);
    root.style.setProperty('--theme-border-light', config.colors.borderLight);
    
    // Component-specific CSS variables
    root.style.setProperty('--theme-navbar-bg', config.components.navbar.backgroundColor);
    root.style.setProperty('--theme-header-bg', config.components.header.backgroundColor);
    root.style.setProperty('--theme-card-bg', config.components.card.backgroundColor);
    root.style.setProperty('--theme-table-bg', config.components.table.backgroundColor);
    root.style.setProperty('--theme-table-header-bg', config.components.table.headerBackground);

    // 2. Apply body styles
    document.body.style.backgroundColor = config.components.page.backgroundColor;
    document.body.style.color = config.colors.text;
    document.body.style.fontFamily = config.typography.fontFamily.primary;
  }, [themeConfig]);

  // 3. CSS Injection for components using CSS classes (Navbar, Header, etc.)
  useEffect(() => {
    if (typeof document === 'undefined' || !themeConfig) return;

    const config = themeConfig;
    
    let styleElement = document.getElementById('mantine-theme-override');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'mantine-theme-override';
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = `
      /* Navbar (Sidebar) */
      .mantine-AppShell-navbar {
        background-color: ${config.components.navbar.backgroundColor} !important;
        border-right-color: ${config.components.navbar.borderColor} !important;
        color: ${config.components.navbar.textColor} !important;
        font-family: ${config.typography.fontFamily.primary} !important;
      }
      
      /* Header */
      .mantine-AppShell-header {
        background-color: ${config.components.header.backgroundColor} !important;
        border-bottom-color: ${config.components.header.borderColor} !important;
        color: ${config.components.header.textColor} !important;
      }
      
      /* Main Content / Page Background */
      .mantine-AppShell-main {
        background-color: ${config.components.page.backgroundColor} !important;
      }
      
      /* NavLink */
      .mantine-NavLink-root {
        color: ${config.components.navbar.textColor} !important;
        font-family: ${config.typography.fontFamily.primary} !important;
      }
      
      .mantine-NavLink-root:hover {
        background-color: ${config.components.navbar.hoverBackground} !important;
        color: ${config.components.navbar.hoverTextColor} !important;
      }
      
      .mantine-NavLink-root[data-active] {
        background-color: ${config.components.navbar.activeBackground} !important;
        color: ${config.components.navbar.activeTextColor} !important;
      }
      
      /* Input Components */
      .mantine-TextInput-input,
      .mantine-Textarea-input,
      .mantine-Select-input,
      .mantine-NumberInput-input {
        background-color: ${config.components.input.backgroundColor} !important;
        border-color: ${config.components.input.borderColor} !important;
        color: ${config.components.input.textColor} !important;
        font-family: ${config.typography.fontFamily.primary} !important;
      }
      
      .mantine-TextInput-label,
      .mantine-Textarea-label,
      .mantine-Select-label,
      .mantine-NumberInput-label,
      .mantine-DatePickerInput-label,
      .mantine-DatePickerInput-label[data-range],
      label[class*="mantine-DatePickerInput-label"] {
        color: ${config.components.input.textColor} !important;
        font-family: ${config.typography.fontFamily.primary} !important;
      }
      
      /* DatePickerInput Component */
      .mantine-DatePickerInput-input,
      input[class*="mantine-DatePickerInput-input"] {
        background-color: ${config.components.input.backgroundColor} !important;
        border-color: ${config.components.input.borderColor} !important;
        color: ${config.components.input.textColor} !important;
        font-family: ${config.typography.fontFamily.primary} !important;
      }
      
      /* Ensure all DatePicker labels are styled */
      .mantine-DatePickerInput-root label,
      .mantine-DatePickerInput-wrapper label {
        color: ${config.components.input.textColor} !important;
        font-family: ${config.typography.fontFamily.primary} !important;
      }
      
      /* Global Text Color */
      .mantine-Text-root {
        color: ${config.colors.text} !important;
        font-family: ${config.typography.fontFamily.primary} !important;
      }
      
      /* Page Headers (Title components) */
      .mantine-Title-root,
      h1.mantine-Title-root,
      h2.mantine-Title-root,
      h3.mantine-Title-root,
      h4.mantine-Title-root,
      h5.mantine-Title-root,
      h6.mantine-Title-root {
        color: ${config.typography.pageHeaderColor} !important;
        font-family: ${config.typography.fontFamily.heading} !important;
      }
      
      /* Navbar Section Headers (uppercase Text in sidebar) - Target by size and uppercase */
      .mantine-AppShell-navbar .mantine-Text-root[size="xs"] {
        color: ${config.typography.navbarSectionHeaderColor} !important;
      }
      
      /* Button styles are handled by component-level styling in createDynamicTheme.ts */
      
      /* Table Header Hover */
      .mantine-Table-thead .mantine-Table-th:hover {
        background-color: ${config.components.table.headerHoverBackground} !important;
      }
      
      /* Order Type Selector Buttons - Style like tabs */
      .order-type-selector .mantine-Button-root[data-variant="outline"] {
        background-color: ${config.components.tabs.backgroundColor} !important;
        color: ${config.components.tabs.textColor} !important;
        border: none !important;
      }
      
      .order-type-selector .mantine-Button-root[data-variant="filled"] {
        background-color: ${config.components.tabs.selectedTabBackgroundColor} !important;
        color: ${config.components.tabs.selectedTabFontColor} !important;
        border: none !important;
      }
      
      .order-type-selector .mantine-Button-root:hover:not(:disabled) {
        background-color: ${config.components.tabs.hoverTabBackgroundColor} !important;
        color: ${config.components.tabs.hoverTabFontColor} !important;
      }
      
      /* Menu Type Selector SegmentedControl - Style like tabs */
      .menu-type-selector .mantine-SegmentedControl-control {
        background-color: ${config.components.tabs.backgroundColor} !important;
        color: ${config.components.tabs.textColor} !important;
        border: none !important;
      }
      
      .menu-type-selector .mantine-SegmentedControl-control[data-active] {
        background-color: ${config.components.tabs.selectedTabBackgroundColor} !important;
        color: ${config.components.tabs.selectedTabFontColor} !important;
      }
      
      .menu-type-selector .mantine-SegmentedControl-control:hover:not([data-active]) {
        background-color: ${config.components.tabs.hoverTabBackgroundColor} !important;
        color: ${config.components.tabs.hoverTabFontColor} !important;
      }
      
      .menu-type-selector .mantine-SegmentedControl-label {
        color: inherit !important;
      }
      
      /* Mantine Tabs - Style using themeConfig tabs */
      .mantine-Tabs-root {
        background-color: ${config.components.tabs.backgroundColor} !important;
        border-color: ${config.components.tabs.borderColor} !important;
      }
      
      .mantine-Tabs-list {
        border-bottom-color: ${config.components.tabs.borderColor} !important;
      }
      
      .mantine-Tabs-tab {
        color: ${config.components.tabs.textColor} !important;
        font-family: ${config.typography.fontFamily.primary} !important;
      }
      
      .mantine-Tabs-tab:hover:not([data-disabled]) {
        background-color: ${config.components.tabs.hoverTabBackgroundColor} !important;
        color: ${config.components.tabs.hoverTabFontColor} !important;
      }
      
      .mantine-Tabs-tab[data-active] {
        background-color: ${config.components.tabs.selectedTabBackgroundColor} !important;
        color: ${config.components.tabs.selectedTabFontColor} !important;
        border-bottom-color: ${config.components.tabs.selectedTabFontColor} !important;
      }
      
      /* Ensure nested elements also get the correct color */
      .mantine-Tabs-tab[data-active] * {
        color: ${config.components.tabs.selectedTabFontColor} !important;
      }
    `;
  }, [themeConfig]);

  // 4. Direct DOM manipulation for headers (Title and section headers)
  useEffect(() => {
    if (typeof document === 'undefined' || !themeConfig) return;

    const config = themeConfig;
    
    const applyHeaderStyles = () => {
      // Page Headers (Title components) - all orders
      document.querySelectorAll('.mantine-Title-root, h1.mantine-Title-root, h2.mantine-Title-root, h3.mantine-Title-root, h4.mantine-Title-root').forEach((title) => {
        const el = title as HTMLElement;
        el.style.color = config.typography.pageHeaderColor;
        el.style.fontFamily = config.typography.fontFamily.heading;
      });
      
      // Navbar Section Headers (Text with size="xs" in sidebar)
      document.querySelectorAll('.mantine-AppShell-navbar .mantine-Text-root[size="xs"]').forEach((text) => {
        const el = text as HTMLElement;
        // Check if it's uppercase (section header) by checking computed style or text content
        const computedStyle = window.getComputedStyle(el);
        const isUppercase = computedStyle.textTransform === 'uppercase' || 
                           el.textContent === el.textContent?.toUpperCase() ||
                           el.getAttribute('style')?.includes('text-transform: uppercase');
        if (isUppercase || el.style.fontWeight === '700' || computedStyle.fontWeight === '700') {
          el.style.color = config.typography.navbarSectionHeaderColor;
        }
      });
      
      // Page Section Headers (Text with size="xs" and uppercase on pages, not in navbar)
      document.querySelectorAll('.mantine-Text-root[size="xs"]').forEach((text) => {
        const el = text as HTMLElement;
        // Skip if it's in navbar
        if (el.closest('.mantine-AppShell-navbar')) return;
        
        const computedStyle = window.getComputedStyle(el);
        const isUppercase = computedStyle.textTransform === 'uppercase' || 
                           el.textContent === el.textContent?.toUpperCase();
        const isBold = computedStyle.fontWeight === '700' || el.style.fontWeight === '700';
        
        // If it's uppercase and bold, it's likely a section header
        if (isUppercase && isBold) {
          el.style.color = config.typography.pageSectionHeaderColor;
        }
      });
    };

    applyHeaderStyles();
    
    const observer = new MutationObserver(() => {
      setTimeout(applyHeaderStyles, 10);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'size'],
    });

    const interval = setInterval(applyHeaderStyles, 300);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [themeConfig]);

  // 5. Direct DOM manipulation for inputs (ensures styling applies)
  useEffect(() => {
    if (typeof document === 'undefined' || !themeConfig) return;

    const config = themeConfig;
    
    const applyInputStyles = () => {
      // TextInput
      document.querySelectorAll('.mantine-TextInput-input').forEach((input) => {
        const el = input as HTMLElement;
        el.style.backgroundColor = config.components.input.backgroundColor;
        el.style.borderColor = config.components.input.borderColor;
        el.style.color = config.components.input.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
      });
      
      // Textarea
      document.querySelectorAll('.mantine-Textarea-input').forEach((textarea) => {
        const el = textarea as HTMLElement;
        el.style.backgroundColor = config.components.input.backgroundColor;
        el.style.borderColor = config.components.input.borderColor;
        el.style.color = config.components.input.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
      });
      
      // Select
      document.querySelectorAll('.mantine-Select-input').forEach((select) => {
        const el = select as HTMLElement;
        el.style.backgroundColor = config.components.input.backgroundColor;
        el.style.borderColor = config.components.input.borderColor;
        el.style.color = config.components.input.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
      });
      
      // NumberInput
      document.querySelectorAll('.mantine-NumberInput-input').forEach((input) => {
        const el = input as HTMLElement;
        el.style.backgroundColor = config.components.input.backgroundColor;
        el.style.borderColor = config.components.input.borderColor;
        el.style.color = config.components.input.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
      });
      
      // DatePickerInput
      document.querySelectorAll('.mantine-DatePickerInput-input').forEach((input) => {
        const el = input as HTMLElement;
        el.style.backgroundColor = config.components.input.backgroundColor;
        el.style.borderColor = config.components.input.borderColor;
        el.style.color = config.components.input.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
      });
      
      // DatePickerInput labels (including range labels)
      document.querySelectorAll('.mantine-DatePickerInput-label, label[class*="mantine-DatePickerInput-label"], .mantine-DatePickerInput-root label, .mantine-DatePickerInput-wrapper label').forEach((label) => {
        const el = label as HTMLElement;
        el.style.color = config.components.input.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
      });
    };

    applyInputStyles();
    
    const observer = new MutationObserver(() => {
      setTimeout(applyInputStyles, 10);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    const interval = setInterval(applyInputStyles, 300);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [themeConfig]);

  // 6. Direct DOM manipulation for Mantine Table (overrides inline styles)
  useEffect(() => {
    if (typeof document === 'undefined' || !themeConfig) return;

    const config = themeConfig;
    
    const applyTableStyles = () => {
      // Table element
      document.querySelectorAll('.mantine-Table-table').forEach((table) => {
        const el = table as HTMLElement;
        el.style.backgroundColor = config.components.table.backgroundColor;
        el.style.borderColor = config.components.table.borderColor;
        el.style.color = config.components.table.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
      });
      
      // Table header
      document.querySelectorAll('.mantine-Table-thead').forEach((thead) => {
        (thead as HTMLElement).style.backgroundColor = config.components.table.headerBackground;
      });
      
      // Table header cells
      document.querySelectorAll('.mantine-Table-th').forEach((th) => {
        const el = th as HTMLElement;
        el.style.borderBottomColor = config.components.table.borderColor;
        el.style.color = config.components.table.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
        // Add hover effect
        el.onmouseenter = () => {
          el.style.backgroundColor = config.components.table.headerHoverBackground;
        };
        el.onmouseleave = () => {
          el.style.backgroundColor = config.components.table.headerBackground;
        };
      });
      
      // Table data cells
      document.querySelectorAll('.mantine-Table-td').forEach((td) => {
        const el = td as HTMLElement;
        el.style.borderBottomColor = config.colors.borderLight;
        el.style.color = config.components.table.textColor;
        el.style.fontFamily = config.typography.fontFamily.primary;
      });
      
      // Table hover styles for rows
      let hoverStyle = document.getElementById('table-hover-styles');
      if (!hoverStyle) {
        hoverStyle = document.createElement('style');
        hoverStyle.id = 'table-hover-styles';
        document.head.appendChild(hoverStyle);
      }
      hoverStyle.textContent = `
        .mantine-Table-tr:hover {
          background-color: ${config.components.table.hoverBackground} !important;
        }
        .mantine-Table-tr:hover .mantine-Table-td {
          color: ${config.components.table.hoverTextColor} !important;
        }
      `;
    };

    applyTableStyles();
    
    // Reapply on DOM changes
    const observer = new MutationObserver(() => {
      setTimeout(applyTableStyles, 10);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    const interval = setInterval(applyTableStyles, 300);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [themeConfig]);


  return <>{children}</>;
}

