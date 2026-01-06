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
  Select,
  Modal,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconBrandGoogle, IconMail, IconLock } from '@tabler/icons-react';
import { authApi } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useErrorColor, useInfoColor } from '@/lib/hooks/use-theme-colors';
import { DEFAULT_THEME_COLOR } from '@/lib/utils/theme';
import { useTheme } from '@/lib/hooks/use-theme';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { generateThemeColors } from '@/lib/utils/themeColors';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguageStore();
  const { setUser } = useAuthStore();
  const errorColor = useErrorColor();
  const infoColor = useInfoColor();
  const { isDark } = useTheme();
  const primaryColor = useThemeColor();
  const themeColors = generateThemeColors(primaryColor, isDark);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorProcessedRef = useRef(false);
  const [showBranchSelection, setShowBranchSelection] = useState(false);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const { setSelectedBranchId: setBranchStoreId } = useBranchStore();

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
      
      // Fetch assigned branches
      setLoadingBranches(true);
      try {
        const assignedBranches = await authApi.getAssignedBranches();
        setBranches(assignedBranches);
        
        if (assignedBranches.length === 0) {
          setError(language === 'ar' ? 'لا توجد فروع مخصصة لك' : 'No branches assigned to you');
          setLoading(false);
          setLoadingBranches(false);
          return;
        }
        
        // If only one branch, auto-select it
        if (assignedBranches.length === 1) {
          setBranchStoreId(assignedBranches[0].id);
          router.push('/dashboard');
          return;
        }
        
        // Show branch selection modal
        setShowBranchSelection(true);
        setSelectedBranchId(assignedBranches[0].id); // Default to first branch
      } catch (branchError: any) {
        console.error('Failed to fetch branches:', branchError);
        setError(language === 'ar' ? 'فشل في جلب الفروع' : 'Failed to fetch branches');
      } finally {
        setLoadingBranches(false);
        setLoading(false);
      }
    } catch (err: any) {
      // Extract error message from various possible response structures
      let errorMsg = '';
      const status = err.response?.status;
      
      if (err.response?.data?.error?.message) {
        errorMsg = err.response.data.error.message;
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      } else if (err.message) {
        errorMsg = err.message;
      }

      // Map common authentication error messages to translation keys (case-insensitive matching)
      const errorMsgLower = errorMsg.toLowerCase();
      let translationKey: string | undefined;
      
      // Check for common error patterns and map to translation keys
      if (
        errorMsgLower.includes('invalid login credentials') ||
        errorMsgLower.includes('invalid email or password') ||
        status === 401
      ) {
        translationKey = 'auth.invalidCredentials';
      } else if (errorMsgLower.includes('email not confirmed')) {
        translationKey = 'auth.emailNotConfirmed';
      } else if (errorMsgLower.includes('user account is inactive') || errorMsgLower.includes('account is inactive')) {
        translationKey = 'auth.accountInactive';
      } else if (!errorMsg) {
        translationKey = 'auth.loginFailed';
      }

      // Use translation if we have a key, otherwise use the original error message or fallback
      if (translationKey) {
        errorMsg = t(translationKey as any, language);
      } else if (!errorMsg) {
        errorMsg = t('auth.loginFailed' as any, language);
      }

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Redirect to backend Google OAuth endpoint
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/auth/google`;
  };

  const handleBranchSelection = () => {
    if (selectedBranchId) {
      setBranchStoreId(selectedBranchId);
      setShowBranchSelection(false);
      router.push('/dashboard');
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="lg">
        <Box>
          <Title order={2} size="1.8rem" fw={700} mb="xs" style={{ color: themeColors.colorTextDark }}>
            {t('auth.loginTitle', language)}
          </Title>
          <Text size="sm" style={{ color: themeColors.colorTextMedium }}>
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
          <Anchor
            href="/forgot-password"
            size="sm"
            style={{ color: DEFAULT_THEME_COLOR, fontWeight: 500 }}
          >
            {t('auth.forgotPassword', language)}
          </Anchor>
        </Group>

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
          style={{
            borderColor: DEFAULT_THEME_COLOR,
            color: DEFAULT_THEME_COLOR,
          }}
        >
          {t('auth.loginWithGoogle', language)}
        </Button>

        <Text ta="center" size="sm" style={{ color: themeColors.colorTextMedium }}>
          {t('auth.noAccount', language)}{' '}
          <Anchor href="/signup" size="sm" style={{ color: DEFAULT_THEME_COLOR, fontWeight: 500 }}>
            {t('common.signup' as any, language)}
          </Anchor>
        </Text>
      </Stack>

      <Modal
        opened={showBranchSelection}
        onClose={() => {}}
        title={t('common.selectBranch' as any, language) || (language === 'ar' ? 'اختر الفرع' : 'Select Branch')}
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
        centered
      >
        <Stack gap="md">
          <Text size="sm" style={{ color: themeColors.colorTextMedium }}>
            {language === 'ar' ? 'يرجى اختيار الفرع للاستمرار' : 'Please select a branch to continue'}
          </Text>
          <Select
            label={t('common.selectBranch' as any, language) || (language === 'ar' ? 'الفرع' : 'Branch')}
            placeholder={t('common.selectBranch', language) || 'Select Branch'}
            data={branches.map(b => ({ value: b.id, label: `${b.name} (${b.code})` }))}
            value={selectedBranchId}
            onChange={(value) => setSelectedBranchId(value)}
            required
            searchable
          />
          <Button
            fullWidth
            onClick={handleBranchSelection}
            size="lg"
            radius="md"
            disabled={!selectedBranchId}
            loading={loadingBranches}
            style={{
              backgroundColor: DEFAULT_THEME_COLOR,
              color: 'white',
            }}
          >
            {language === 'ar' ? 'متابعة' : 'Continue'}
          </Button>
        </Stack>
      </Modal>
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

