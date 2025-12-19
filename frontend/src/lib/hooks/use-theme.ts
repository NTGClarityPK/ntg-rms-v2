import { useState, useEffect } from 'react';

/**
 * Hook to manage theme mode (light/dark)
 * Automatically detects browser theme preference
 */
export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Function to get browser theme preference
    const getBrowserTheme = (): 'light' | 'dark' => {
      if (typeof window === 'undefined') return 'light';
      
      // Check if user has a saved preference
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      if (savedTheme) {
        return savedTheme;
      }
      
      // If no saved preference, detect browser theme
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      
      return 'light';
    };

    // Set initial theme
    const initialTheme = getBrowserTheme();
    setThemeState(initialTheme);

    // Listen for browser theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleThemeChange = (e: MediaQueryListEvent | MediaQueryList) => {
        // Only update if user hasn't manually set a preference
        const savedTheme = localStorage.getItem('theme');
        if (!savedTheme) {
          setThemeState(e.matches ? 'dark' : 'light');
        }
      };

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleThemeChange);
      } 
      // Fallback for older browsers
      else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleThemeChange);
      }

      // Initial check
      handleThemeChange(mediaQuery);

      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleThemeChange);
        } else if (mediaQuery.removeListener) {
          mediaQuery.removeListener(handleThemeChange);
        }
      };
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme); // Save manual preference
  };

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme); // Save manual preference
  };

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === 'dark',
    resolvedTheme: theme,
    mounted,
  };
}

