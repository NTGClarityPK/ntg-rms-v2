import { create } from 'zustand';
import { getLegacyThemeColor, DEFAULT_THEME_COLOR } from '@/lib/utils/theme';

interface ThemeStore {
  primaryColor: string;
  themeVersion: number; // Increment to force re-renders
  setPrimaryColor: (color: string) => void;
}

// Initialize from localStorage if available to prevent blue flash
const getInitialColor = (): string => {
  if (typeof window === 'undefined') return DEFAULT_THEME_COLOR;
  const stored = getLegacyThemeColor();
  return stored || DEFAULT_THEME_COLOR;
};

export const useThemeStore = create<ThemeStore>((set, get) => ({
  primaryColor: getInitialColor(),
  themeVersion: 0,
  setPrimaryColor: (color: string) => {
    set((state) => ({ 
      primaryColor: color, 
      themeVersion: state.themeVersion + 1 
    }));
    // Dispatch custom event for non-React code
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('theme-change', { detail: { color } }));
    }
  },
}));

