'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Title,
  PasswordInput,
  Button,
  Stack,
  Text,
  Anchor,
  Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconLock, IconCheck } from '@tabler/icons-react';
import { supabase } from '@/lib/supabase/client';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useErrorColor, useInfoColor } from '@/lib/hooks/use-theme-colors';
import { DEFAULT_THEME_COLOR } from '@/lib/utils/theme';
import { useTheme } from '@/lib/hooks/use-theme';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { generateThemeColors } from '@/lib/utils/themeColors';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { language } = useLanguageStore();
  const errorColor = useErrorColor();
  const infoColor = useInfoColor();
  const { isDark } = useTheme();
  const primaryColor = useThemeColor();
  const themeColors = generateThemeColors(primaryColor, isDark);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  // Check if we have a valid session from the reset link
  useEffect(() => {
    const checkSession = async () => {
      if (!supabase) {
        setIsValidSession(false);
        return;
      }

      try {
        // Check if there's a hash in the URL (from email link)
        const hash = window.location.hash;
        if (hash) {
          // Supabase password reset links include access_token and type in the hash
          // We need to extract and set the session from the hash
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const type = hashParams.get('type');
          
          if (type === 'recovery' && accessToken) {
            // Set the session using the tokens from the hash
            const { data: { session }, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            });
            
            if (session && !sessionError) {
              setIsValidSession(true);
              // Clean up the hash from URL
              window.history.replaceState({}, '', window.location.pathname);
              return;
            }
          }
        }
        
        // Fallback: check existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setIsValidSession(true);
          return;
        }
        
        setIsValidSession(false);
      } catch (err) {
        console.error('Error checking session:', err);
        setIsValidSession(false);
      }
    };

    checkSession();
  }, []);

  const form = useForm<{
    password: string;
    confirmPassword: string;
  }>({
    initialValues: {
      password: '',
      confirmPassword: '',
    },
    validate: {
      password: (value: string) => {
        if (value.length < 6) {
          return t('auth.passwordTooShort', language);
        }
        return null;
      },
      confirmPassword: (value: string, values) => {
        if (value !== values.password) {
          return t('auth.passwordsDoNotMatch', language);
        }
        return null;
      },
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      // Update the user's password
      const { error: updateError } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      // Extract error message
      let errorMsg = '';
      if (err.message) {
        errorMsg = err.message;
      } else if (err.error?.message) {
        errorMsg = err.error.message;
      } else {
        errorMsg = t('auth.passwordResetFailed' as any, language);
      }

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking session
  if (isValidSession === null) {
    return (
      <Stack gap="md">
        <Text ta="center" style={{ color: themeColors.colorTextMedium }}>
          {t('common.loading' as any, language)}
        </Text>
      </Stack>
    );
  }

  // Show error if session is invalid
  if (isValidSession === false) {
    return (
      <Stack gap="lg">
        <Box>
          <Title order={2} size="1.8rem" fw={700} mb="xs" style={{ color: themeColors.colorTextDark }}>
            {t('auth.resetPasswordTitle', language)}
          </Title>
          <Text size="sm" style={{ color: themeColors.colorTextMedium }}>
            {t('auth.invalidResetLink', language)}
          </Text>
        </Box>

        <Alert
          icon={<IconAlertCircle size={16} />}
          style={{
            backgroundColor: `${errorColor}15`,
            borderColor: errorColor,
            color: errorColor,
          }}
          variant="light"
          radius="md"
        >
          {t('auth.invalidResetLink', language)}
        </Alert>

        <Button
          fullWidth
          size="lg"
          radius="md"
          onClick={() => router.push('/forgot-password')}
          style={{
            backgroundColor: DEFAULT_THEME_COLOR,
            color: 'white',
          }}
        >
          {t('auth.sendResetLink', language)}
        </Button>

        <Text ta="center" size="sm" style={{ color: themeColors.colorTextMedium }}>
          <Anchor href="/login" size="sm" style={{ color: DEFAULT_THEME_COLOR, fontWeight: 500 }}>
            {t('auth.backToLogin', language)}
          </Anchor>
        </Text>
      </Stack>
    );
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="lg">
        <Box>
          <Title order={2} size="1.8rem" fw={700} mb="xs" style={{ color: themeColors.colorTextDark }}>
            {t('auth.resetPasswordTitle', language)}
          </Title>
          <Text size="sm" style={{ color: themeColors.colorTextMedium }}>
            {t('auth.passwordResetInstructions', language)}
          </Text>
        </Box>

        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            style={{
              backgroundColor: `${errorColor}15`,
              borderColor: errorColor,
              color: errorColor,
            }}
            variant="light"
            radius="md"
          >
            {error}
          </Alert>
        )}

        {success && (
          <Alert
            icon={<IconCheck size={16} />}
            style={{
              backgroundColor: `${infoColor}15`,
              borderColor: infoColor,
              color: infoColor,
            }}
            variant="light"
            radius="md"
          >
            {t('auth.passwordResetSuccess', language)}
          </Alert>
        )}

        {!success && (
          <>
            <PasswordInput
              label={t('auth.newPassword', language)}
              placeholder={language === 'ar' ? 'أدخل كلمة المرور الجديدة' : 'Enter your new password'}
              required
              leftSection={<IconLock size={18} />}
              size="lg"
              radius="md"
              autoComplete="new-password"
              disabled={loading}
              {...form.getInputProps('password')}
            />

            <PasswordInput
              label={t('auth.confirmPassword', language)}
              placeholder={language === 'ar' ? 'أكد كلمة المرور' : 'Confirm your password'}
              required
              leftSection={<IconLock size={18} />}
              size="lg"
              radius="md"
              autoComplete="new-password"
              disabled={loading}
              {...form.getInputProps('confirmPassword')}
            />

            <Button
              type="submit"
              fullWidth
              loading={loading}
              size="lg"
              radius="md"
              style={{
                backgroundColor: DEFAULT_THEME_COLOR,
                color: 'white',
              }}
            >
              {t('auth.resetPassword', language)}
            </Button>
          </>
        )}

        <Text ta="center" size="sm" style={{ color: themeColors.colorTextMedium }}>
          <Anchor href="/login" size="sm" style={{ color: DEFAULT_THEME_COLOR, fontWeight: 500 }}>
            {t('auth.backToLogin', language)}
          </Anchor>
        </Text>
      </Stack>
    </form>
  );
}
