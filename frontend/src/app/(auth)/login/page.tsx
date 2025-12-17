'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Title,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Text,
  Anchor,
  Divider,
  Alert,
  Skeleton,
  Center,
  Group,
  Checkbox,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconBrandGoogle, IconMail, IconLock } from '@tabler/icons-react';
import { authApi } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useErrorColor, useInfoColor } from '@/lib/hooks/use-theme-colors';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguageStore();
  const { setUser } = useAuthStore();
  const errorColor = useErrorColor();
  const infoColor = useInfoColor();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorProcessedRef = useRef(false);

  // Check for error in URL params (from OAuth callback) - only process once on mount
  useEffect(() => {
    // Only process if we haven't already processed an error
    if (errorProcessedRef.current) return;
    
    const errorParam = searchParams.get('error');
    if (errorParam) {
      errorProcessedRef.current = true;
      const errorMessages: Record<string, Record<string, string>> = {
        google_auth_failed: {
          en: 'Google authentication failed. Please try again.',
          ar: 'فشل المصادقة عبر Google. يرجى المحاولة مرة أخرى.',
        },
        auth_failed: {
          en: 'Authentication failed. Please try again.',
          ar: 'فشل المصادقة. يرجى المحاولة مرة أخرى.',
        },
        no_tokens: {
          en: 'Authentication incomplete. Please try again.',
          ar: 'المصادقة غير مكتملة. يرجى المحاولة مرة أخرى.',
        },
      };
      const currentLanguage = language;
      const errorMsg = errorMessages[errorParam]?.[currentLanguage] || 
        (currentLanguage === 'ar' ? 'حدث خطأ أثناء المصادقة.' : 'An error occurred during authentication.');
      setError(errorMsg);
      // Clear error from URL by replacing with clean URL immediately
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/login');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount to avoid infinite loop

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value: string) => (/^\S+@\S+$/.test(value) ? null : (language === 'ar' ? 'البريد الإلكتروني غير صحيح' : 'Invalid email')),
      password: (value: string) => (value.length < 6 ? (language === 'ar' ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' : 'Password must be at least 6 characters') : null),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authApi.login(values);
      // Map response to User type (handle both old and new API formats)
      const user = {
        ...response.user,
        name: response.user.name || (response.user as any).nameEn || (response.user as any).nameAr || 'User',
      };
      setUser(user);
      router.push('/dashboard');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || 
        (language === 'ar' ? 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.' : 'Login failed. Please try again.');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Redirect to backend Google OAuth endpoint
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/auth/google`;
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="lg">
        <Box>
          <Title order={2} size="1.8rem" fw={700} mb="xs">
            {t('auth.loginTitle', language)}
          </Title>
          <Text c="dimmed" size="sm">
            {t('auth.signInToContinue', language)}
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

        <TextInput
          label={t('common.email' as any, language)}
          placeholder={language === 'ar' ? 'بريدك@الإلكتروني.com' : 'your@email.com'}
          required
          leftSection={<IconMail size={18} />}
          size="lg"
          radius="md"
          autoComplete="email"
          disabled={loading}
          {...form.getInputProps('email')}
        />

        <PasswordInput
          label={t('common.password' as any, language)}
          placeholder={language === 'ar' ? 'أدخل كلمة المرور' : 'Enter your password'}
          required
          leftSection={<IconLock size={18} />}
          size="lg"
          radius="md"
          autoComplete="current-password"
          disabled={loading}
          {...form.getInputProps('password')}
        />

        <Group justify="space-between">
          <Checkbox
            label={t('auth.rememberMe', language)}
            disabled={loading}
          />
          <Text
            size="sm"
            style={{ color: infoColor, cursor: 'pointer' }}
            onClick={() => {
              // TODO: Implement password reset
            }}
          >
            {t('auth.forgotPassword', language)}
          </Text>
        </Group>

        <Button
          type="submit"
          fullWidth
          loading={loading}
          size="lg"
          radius="md"
        >
          {t('common.login' as any, language)}
        </Button>

        <Divider label={language === 'ar' ? 'أو' : 'OR'} labelPosition="center" />

        <Button
          variant="outline"
          fullWidth
          leftSection={<IconBrandGoogle size={16} />}
          onClick={handleGoogleLogin}
          size="lg"
          radius="md"
        >
          {t('auth.loginWithGoogle', language)}
        </Button>

        <Text ta="center" size="sm">
          {t('auth.noAccount', language)}{' '}
          <Anchor href="/signup" size="sm">
            {t('common.signup' as any, language)}
          </Anchor>
        </Text>
      </Stack>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Stack gap="md" p="md">
          <Skeleton height={50} />
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </Stack>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

