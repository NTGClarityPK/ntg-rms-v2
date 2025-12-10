import { create } from 'zustand';

interface ThemeStore {
  primaryColor: string;
  themeVersion: number; // Increment to force re-renders
  setPrimaryColor: (color: string) => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  primaryColor: '#2196f3',
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

