import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Role, Permission } from '../api/roles';
import { useThemeStore } from './theme-store';
import { useRestaurantStore } from './restaurant-store';
import { DEFAULT_THEME_COLOR } from '../utils/theme';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string; // Keep for backward compatibility
  roles?: Role[]; // New: multiple roles
  permissions?: Permission[]; // New: aggregated permissions from all roles
  tenantId: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setPermissions: (permissions: Permission[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),
      setPermissions: (permissions) =>
        set((state) => ({
          user: state.user ? { ...state.user, permissions } : null,
        })),
      logout: () => {
        // Clear tenant-specific theme color on logout
        if (typeof window !== 'undefined') {
          localStorage.removeItem('rms_theme_color');
          // Clear restaurant store (contains primaryColor)
          const { setRestaurant } = useRestaurantStore.getState();
          setRestaurant(null);
          // Reset theme store to default
          const { setPrimaryColor } = useThemeStore.getState();
          setPrimaryColor(DEFAULT_THEME_COLOR);
        }
        set({
          user: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'rms-auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

