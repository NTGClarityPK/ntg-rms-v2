import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../constants/api';

// Token storage keys
const ACCESS_TOKEN_KEY = 'rms_access_token';
const REFRESH_TOKEN_KEY = 'rms_refresh_token';

// Token management
export const tokenStorage = {
  getAccessToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  setAccessToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },
  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setRefreshToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },
  clearTokens: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
  setTokens: (accessToken: string, refreshToken: string): void => {
    tokenStorage.setAccessToken(accessToken);
    tokenStorage.setRefreshToken(refreshToken);
  },
};

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - Add JWT token to requests
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (!token && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // Log warning in development if token is missing
      console.warn('API request made without access token:', config.url);
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      const accessToken = tokenStorage.getAccessToken();
      const currentRefreshToken = tokenStorage.getRefreshToken();
      
      // Decode token to check expiry
      let tokenExpiryInfo = null;
      if (accessToken) {
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]));
          const now = Math.floor(Date.now() / 1000);
          const exp = payload.exp;
          tokenExpiryInfo = {
            expiresAt: new Date(exp * 1000).toISOString(),
            expiresInSeconds: exp - now,
            isExpired: exp < now,
          };
        } catch (e) {
          tokenExpiryInfo = { error: 'Could not decode token' };
        }
      }
      
      // Log 401 error details for debugging
      console.warn('401 Unauthorized error:', {
        url: originalRequest.url,
        method: originalRequest.method,
        timestamp: new Date().toISOString(),
        hasRefreshToken: !!currentRefreshToken,
        hasAccessToken: !!accessToken,
        tokenExpiryInfo,
        isRefreshing,
        willAttemptRefresh: !originalRequest.url?.includes('/auth/refresh'),
      });
      
      // Don't retry refresh endpoint itself - it means refresh token is invalid/expired
      if (originalRequest.url?.includes('/auth/refresh')) {
        tokenStorage.clearTokens();
        if (typeof window !== 'undefined') {
          import('../store/auth-store').then(({ useAuthStore }) => {
            useAuthStore.getState().logout();
          });
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers && token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      
      console.log('Starting token refresh attempt...');

      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) {
        console.error('No refresh token available');
        tokenStorage.clearTokens();
        // Clear auth store
        if (typeof window !== 'undefined') {
          // Dynamically import to avoid circular dependency
          import('../store/auth-store').then(({ useAuthStore }) => {
            useAuthStore.getState().logout();
          });
        }
        processQueue(error, null);
        // Redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      try {
        // Create a separate axios instance for refresh to avoid interceptors
        const refreshClient = axios.create({
          baseURL: API_BASE_URL,
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        });

        console.log('Calling refresh endpoint...');
        const refreshResponse = await refreshClient.post(
          '/auth/refresh',
          { refreshToken }
        );
        
        console.log('Refresh endpoint response received:', {
          status: refreshResponse.status,
          hasData: !!refreshResponse.data,
        });
        
        // Handle both direct response and nested data structure
        const responseData = refreshResponse.data?.data || refreshResponse.data;
        const { accessToken, refreshToken: newRefreshToken } = responseData;

        if (!accessToken) {
          console.error('Token refresh response:', refreshResponse.data);
          throw new Error('No access token received from refresh endpoint');
        }

        console.log('Token refresh successful, updating tokens and retrying original request');
        tokenStorage.setTokens(accessToken, newRefreshToken || refreshToken);
        processQueue(null, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        // Only sign out if it's actually an authentication error (401, 403), not a network error
        const isAuthError = refreshError?.response?.status === 401 || 
                           refreshError?.response?.status === 403;
        
        // Log the error for debugging (always log, not just in dev)
        console.error('Token refresh failed:', {
          status: refreshError?.response?.status,
          statusText: refreshError?.response?.statusText,
          message: refreshError?.message,
          data: refreshError?.response?.data,
          originalRequestUrl: originalRequest.url,
          isAuthError,
          timestamp: new Date().toISOString(),
        });

        if (isAuthError) {
          tokenStorage.clearTokens();
          // Clear auth store
          if (typeof window !== 'undefined') {
            // Dynamically import to avoid circular dependency
            import('../store/auth-store').then(({ useAuthStore }) => {
              useAuthStore.getState().logout();
            });
          }
          processQueue(refreshError as AxiosError, null);
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        } else {
          // For network errors, don't sign out - just reject the original request
          processQueue(refreshError as AxiosError, null);
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

