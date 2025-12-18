'use client';

import { useEffect, Suspense, useState, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Container, 
  Paper, 
  Title, 
  Text, 
  Skeleton, 
  Center,
  Stack,
  Progress,
  Box,
} from '@mantine/core';
import { IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { tokenStorage } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth-store';
import { authApi } from '@/lib/api/auth';
import { useMantineTheme } from '@mantine/core';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { useSuccessColor, useErrorColor } from '@/lib/hooks/use-theme-colors';
import { useThemeStore } from '@/lib/store/theme-store';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();
  const theme = useMantineTheme();
  const { language } = useLanguageStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(t('auth.initializing', language));

  // Update message when language changes based on current status and progress
  useEffect(() => {
    if (status === 'loading') {
      if (progress === 0) {
        setMessage(t('auth.initializing', language));
      } else if (progress === 30) {
        setMessage(t('auth.storingTokens', language));
      } else if (progress === 60) {
        setMessage(t('auth.fetchingProfile', language));
      } else if (progress === 80) {
        setMessage(t('auth.settingUpSession', language));
      } else if (progress === 100) {
        setMessage(t('auth.authSuccessfulRedirecting', language));
      }
    } else if (status === 'success') {
      setMessage(t('auth.authSuccessfulRedirecting', language));
    } else if (status === 'error') {
      // Error messages are set in the callback, but we can update if needed
      // The specific error message is already set correctly
    }
  }, [language, status, progress]);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const token = searchParams.get('token');
        const refreshToken = searchParams.get('refreshToken');
        const error = searchParams.get('error');

        if (error) {
          setStatus('error');
          setMessage(t('auth.authFailedRedirecting', language));
          setTimeout(() => {
            router.push(`/login?error=${error}`);
          }, 2000);
          return;
        }

        if (!token || !refreshToken) {
          setStatus('error');
          setMessage(t('auth.noTokensRedirecting', language));
          setTimeout(() => {
            router.push('/login?error=no_tokens');
          }, 2000);
          return;
        }

        // Step 1: Store tokens
        setProgress(30);
        setMessage(t('auth.storingTokens', language));
        tokenStorage.setTokens(token, refreshToken);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Step 2: Get user profile
        setProgress(60);
        setMessage(t('auth.fetchingProfile', language));
        const user = await authApi.getCurrentUser();
        await new Promise(resolve => setTimeout(resolve, 300));

        // Step 3: Set user in store
        setProgress(80);
        setMessage(t('auth.settingUpSession', language));
        if (user) {
          setUser({
            id: user.id,
            email: user.email,
            name: user.name || user.nameEn || user.name_en || user.nameAr || user.name_ar || 'User',
            role: user.role,
            tenantId: user.tenantId || user.tenant_id,
          });
        } else {
          throw new Error('No user data returned');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        // Step 4: Success
        setProgress(100);
        setStatus('success');
        setMessage(t('auth.authSuccessfulRedirecting', language));
        
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } catch (err: any) {
        console.error('Failed to complete authentication:', err);
        setStatus('error');
        setMessage(t('auth.failedToCompleteAuth', language));
        setTimeout(() => {
          router.push('/login?error=auth_failed');
        }, 2000);
      }
    };

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router, setUser]); // language is used inside but we don't want to re-run the callback

  const primary = useThemeColor();
  const primaryShade = useThemeColorShade(8);
  const successColor = useSuccessColor();
  const errorColor = useErrorColor();
  const successShade = useThemeColorShade(8);
  const errorShade = useThemeColorShade(8);
  
  // Force re-render when theme changes by subscribing to theme store
  const { themeVersion } = useThemeStore();
  
  // Ensure we have valid colors (fallback to default if undefined)
  // Use useMemo to ensure these update reactively when theme changes
  const primaryColor = useMemo(() => primary || '#2196f3', [primary]);
  const primaryShadeColor = useMemo(() => primaryShade || primaryColor, [primaryShade, primaryColor]);
  
  // Ref for Progress component to directly set color
  const progressRef = useRef<HTMLDivElement>(null);
  
  // Update Progress color when theme changes or progress updates
  useEffect(() => {
    const updateProgressColor = () => {
      if (progressRef.current) {
        // Try multiple selectors to find the progress section
        const selectors = [
          '[data-progress-section]',
          '.mantine-Progress-section',
          '[class*="Progress-section"]',
          'div[style*="background"]',
        ];
        
        selectors.forEach((selector) => {
          const element = progressRef.current?.querySelector(selector) as HTMLElement;
          if (element) {
            element.style.backgroundColor = primaryColor;
            element.style.setProperty('background-color', primaryColor, 'important');
          }
        });
        
        // Also set CSS variable on the root element
        if (progressRef.current) {
          progressRef.current.style.setProperty('--progress-section-color', primaryColor);
          progressRef.current.style.setProperty('--mantine-color-blue-6', primaryColor);
        }
      }
    };
    
    // Update immediately
    updateProgressColor();
    
    // Also update after a short delay to catch any delayed renders
    const timeout = setTimeout(updateProgressColor, 50);
    
    return () => clearTimeout(timeout);
  }, [primaryColor, progress]);

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <Container size={420} style={{ width: '100%' }}>
        <Paper 
          withBorder 
          shadow="xl" 
          p={40} 
          radius="xl"
          style={{
            backdropFilter: 'blur(20px)',
          }}
        >
        <Stack gap="xl" align="center">
          {status === 'loading' && (
            <>
              <Box
                key={`loader-${themeVersion}-${primaryColor}`}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryShadeColor} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 8px 32px ${primaryColor}40`,
                }}
              >
                <Skeleton height={40} width={40} radius="xl" />
              </Box>
              <Box style={{ width: '100%' }}>
                <Title order={3} ta="center" mb="md">
                  {t('auth.completingAuthentication', language)}
                </Title>
                <Text ta="center" c="dimmed" size="sm" mb="lg">
                  {message}
                </Text>
                <Box 
                  ref={progressRef}
                  style={{ 
                    width: '100%',
                    '--progress-section-color': primaryColor,
                    '--mantine-primary-color': primaryColor,
                  } as React.CSSProperties}
                >
                  <Progress 
                    value={progress} 
                    animated 
                    size="lg" 
                    radius="xl"
                  />
                </Box>
                <Text ta="center" size="xs" c="dimmed" mt="xs">
                  {t('auth.percentComplete', language).replace('{progress}', progress.toString())}
                </Text>
              </Box>
            </>
          )}

          {status === 'success' && (
            <>
              <Box
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${successColor} 0%, ${successShade} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 8px 32px ${successColor}40`,
                }}
              >
                <IconCheck size={40} stroke={3} color="white" />
              </Box>
              <Box style={{ width: '100%' }}>
                <Title order={3} ta="center" mb="md" style={{ color: successColor }}>
                  {t('auth.success', language)}
                </Title>
                <Text ta="center" c="dimmed" size="sm">
                  {message}
                </Text>
              </Box>
            </>
          )}

          {status === 'error' && (
            <>
              <Box
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${errorColor} 0%, ${errorShade} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 8px 32px ${errorColor}40`,
                }}
              >
                <IconAlertCircle size={40} stroke={3} color="white" />
              </Box>
              <Box style={{ width: '100%' }}>
                <Title order={3} ta="center" mb="md" style={{ color: errorColor }}>
                  {t('auth.authenticationFailed', language)}
                </Title>
                <Text ta="center" c="dimmed" size="sm">
                  {message}
                </Text>
              </Box>
            </>
          )}
        </Stack>
      </Paper>
      </Container>
    </Box>
  );
}

function SuspenseFallback() {
  const primary = useThemeColor();
  const primaryColor = primary || '#2196f3';
  
  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <Container size={420} style={{ width: '100%' }}>
        <Paper withBorder shadow="xl" p={40} radius="xl">
          <Stack gap="md" align="center">
            <Skeleton height={80} width={80} radius="xl" />
            <Skeleton height={24} width="60%" />
            <Skeleton height={16} width="80%" />
            <Skeleton height={8} width="100%" radius="xl" />
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
