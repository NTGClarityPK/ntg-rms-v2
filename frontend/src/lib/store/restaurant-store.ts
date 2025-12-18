import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface RestaurantInfo {
  id: string;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
}

interface RestaurantState {
  restaurant: RestaurantInfo | null;
  setRestaurant: (restaurant: RestaurantInfo | null) => void;
}

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set) => ({
      restaurant: null,
      setRestaurant: (restaurant) => set({ restaurant }),
    }),
    {
      name: 'rms-restaurant-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);


