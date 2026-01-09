'use client';

import { AppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { useLanguageStore } from '@/lib/store/language-store';
import { authApi } from '@/lib/api/auth';
import { rolesApi } from '@/lib/api/roles';
import { tokenStorage } from '@/lib/api/client';
import { ErrorBoundary } from '@/shared/error-boundary';
import { errorLogger, ErrorSeverity } from '@/shared/error-logging';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const { isAuthenticated, user, setUser, setPermissions } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const { language } = useLanguageStore();
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Navbar collapsed state (persisted to localStorage)
  const [navbarCollapsed, setNavbarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('navbar-collapsed');
      return saved === 'true';
    }
    return false; // Default to expanded
  });

  useEffect(() => {
    // Save collapsed state to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('navbar-collapsed', String(navbarCollapsed));
      // Set data attribute on body for CSS targeting
      document.body.setAttribute('data-navbar-collapsed', String(navbarCollapsed));
    }
  }, [navbarCollapsed]);

  useEffect(() => {

    // Initialize authentication state on mount
    const initializeAuth = async () => {
      try {
        const accessToken = tokenStorage.getAccessToken();
        const refreshToken = tokenStorage.getRefreshToken();

        // If no tokens at all, clear auth state and redirect
        if (!accessToken && !refreshToken) {
          // Check current auth state from store
          const currentAuthState = useAuthStore.getState();
          if (currentAuthState.isAuthenticated) {
            currentAuthState.logout();
          }
          setIsInitializing(false);
          router.push('/login');
          return;
        }

        // If we have tokens, verify they're valid by calling /auth/me
        // The axios interceptor will handle token refresh automatically if needed
        try {
          // Get current language from store
          const currentLanguage = useLanguageStore.getState().language;
          const userData = await authApi.getCurrentUser(currentLanguage);
          // If we get here, token is valid (or was refreshed by interceptor)
          setUser(userData);
          
          // Load user permissions
          if (userData?.id) {
            try {
              const permissions = await rolesApi.getUserPermissions(userData.id);
              console.log('Loaded user permissions:', permissions);
              setPermissions(permissions);
              
              // If no permissions and user is tenant_owner or manager, log warning
              if (permissions.length === 0 && (userData.role === 'tenant_owner' || userData.role === 'manager')) {
                console.warn('User has no permissions assigned. Please run migration 014_assign_roles_to_existing_users.sql to assign roles.');
              }
            } catch (permError: any) {
              console.error('Failed to load user permissions:', permError);
              // If user is tenant_owner or manager, they should have permissions
              if (userData.role === 'tenant_owner' || userData.role === 'manager') {
                console.warn('Owner/Manager user has no permissions. This may require running the migration to assign roles.');
              }
              // Continue without permissions - user will have limited access
            }
          }
        } catch (error: any) {
          // If error is 401 and interceptor couldn't refresh, clear everything
          // The interceptor should have already redirected, but just in case:
          if (error?.response?.status === 401 || !refreshToken) {
            tokenStorage.clearTokens();
            useAuthStore.getState().logout();
            setIsInitializing(false);
            // Only redirect if interceptor didn't already redirect
            if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
              router.push('/login');
            }
            return;
          }
          // Other errors, just log and continue
          console.error('Auth initialization error:', error);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        tokenStorage.clearTokens();
        useAuthStore.getState().logout();
        setIsInitializing(false);
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          router.push('/login');
        }
      } finally {
        setIsInitializing(false);
      }
    };

    initializeAuth();

    // Cleanup on unmount
    return () => {
      // No cleanup needed for direct communication
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - router and setUser are stable, isAuthenticated/user are checked inside the function

  // Refresh user data when language changes to get translated username
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const refreshUser = async () => {
        try {
          const currentLanguage = useLanguageStore.getState().language;
          const userData = await authApi.getCurrentUser(currentLanguage);
          setUser(userData);
        } catch (error) {
          console.error('Failed to refresh user on language change:', error);
        }
      };
      refreshUser();
    }
  }, [language, isAuthenticated, user?.id, setUser]);

  // Show loading state while initializing
  if (isInitializing) {
    return null;
  }

  // Check authentication and branch selection after initialization
  if (!isAuthenticated) {
    return null;
  }

  // If authenticated but no branch selected, redirect to login to select branch
  if (isAuthenticated && !selectedBranchId) {
    router.push('/login');
    return null;
  }

  // Calculate navbar width based on collapsed state
  const navbarWidth = navbarCollapsed ? 100 : 270;

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: navbarWidth,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding="md"
    >
      <Header mobileOpened={mobileOpened} toggleMobile={toggleMobile} />
      <AppShell.Navbar p={navbarCollapsed ? "xs" : "md"}>
        <Sidebar 
          onMobileClose={() => mobileOpened && toggleMobile()} 
          collapsed={navbarCollapsed}
          onCollapseChange={setNavbarCollapsed}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        <ErrorBoundary
          onError={(error, errorInfo) => {
            errorLogger.logError(error, ErrorSeverity.HIGH, {
              component: 'DashboardLayout',
              errorInfo: errorInfo.componentStack,
            });
          }}
        >
          {children}
        </ErrorBoundary>
      </AppShell.Main>
    </AppShell>
  );
}

