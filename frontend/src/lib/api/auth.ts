import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { tokenStorage } from './client';
import { useRestaurantStore } from '../store/restaurant-store';
import { useThemeStore } from '../store/theme-store';
import { DEFAULT_THEME_COLOR } from '../utils/theme';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: string;
  defaultCurrency?: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileDto {
  name?: string;
  phone?: string;
  email?: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      API_ENDPOINTS.AUTH.LOGIN,
      credentials
    );
    const { accessToken, refreshToken, user } = response.data;
    tokenStorage.setTokens(accessToken, refreshToken);
    return response.data;
  },

  signup: async (data: SignupData): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      API_ENDPOINTS.AUTH.SIGNUP,
      data
    );
    const { accessToken, refreshToken, user } = response.data;
    tokenStorage.setTokens(accessToken, refreshToken);
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await apiClient.get(API_ENDPOINTS.AUTH.ME);
    return response.data;
  },

  logout: () => {
    tokenStorage.clearTokens();
    // Clear restaurant store on logout to prevent stale data
    if (typeof window !== 'undefined') {
      import('../store/restaurant-store').then(({ useRestaurantStore }) => {
        useRestaurantStore.getState().setRestaurant(null);
      });
      window.location.href = '/login';
    }
  },

  refreshToken: async (refreshToken: string) => {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REFRESH, {
      refreshToken,
    });
    const { accessToken, refreshToken: newRefreshToken } = response.data;
    tokenStorage.setTokens(accessToken, newRefreshToken || refreshToken);
    return response.data;
  },

  getProfile: async (): Promise<UserProfile> => {
    const response = await apiClient.get<UserProfile>(API_ENDPOINTS.AUTH.PROFILE);
    return response.data;
  },

  updateProfile: async (data: UpdateProfileDto): Promise<UserProfile> => {
    const response = await apiClient.put<UserProfile>(API_ENDPOINTS.AUTH.PROFILE, data);
    return response.data;
  },

  getAssignedBranches: async (): Promise<Array<{ id: string; name: string; code: string }>> => {
    const response = await apiClient.get(API_ENDPOINTS.AUTH.ASSIGNED_BRANCHES);
    return response.data;
  },
};

