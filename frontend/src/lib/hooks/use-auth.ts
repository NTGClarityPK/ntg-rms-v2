import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth-store';
import { authApi } from '../api/auth';

export function useAuth() {
  const { user, isAuthenticated, setUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated on mount
    if (!isAuthenticated) {
      const token = localStorage.getItem('rms_access_token');
      if (token) {
        // Try to get current user
        authApi
          .getCurrentUser()
          .then((userData) => {
            setUser(userData);
          })
          .catch(() => {
            // Token invalid, redirect to login
            router.push('/login');
          });
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, setUser, router]);

  return {
    user,
    isAuthenticated,
    setUser,
  };
}

