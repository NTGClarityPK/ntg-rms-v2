'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Title,
  TextInput,
  Button,
  Stack,
  Text,
  Anchor,
  Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconMail, IconCheck } from '@tabler/icons-react';
import { supabase } from '@/lib/supabase/client';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useErrorColor, useInfoColor } from '@/lib/hooks/use-theme-colors';
import { DEFAULT_THEME_COLOR } from '@/lib/utils/theme';
import { useTheme } from '@/lib/hooks/use-theme';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { generateThemeColors } from '@/lib/utils/themeColors';

export default function ForgotPasswordPage() {
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

  const form = useForm({
    initialValues: {
      email: '',
    },
    validate: {
      email: (value: string) => (/^\S+@\S+$/.test(value) ? null : (language === 'ar' ? 'البريد الإلكتروني غير صحيح' : 'Invalid email')),
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

      // Get the redirect URL - should point to the reset password page
      const redirectUrl = `${window.location.origin}/reset-password`;
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        values.email,
        {
          redirectTo: redirectUrl,
        }
      );

      if (resetError) {
        throw resetError;
      }

      setSuccess(true);
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

      // Map common error messages
      const errorMsgLower = errorMsg.toLowerCase();
      if (errorMsgLower.includes('user not found') || errorMsgLower.includes('email not found')) {
        // Don't reveal if email exists or not for security
        setSuccess(true); // Show success message even if email doesn't exist
        return;
      }

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="lg">
        <Box>
          <Title order={2} size="1.8rem" fw={700} mb="xs" style={{ color: themeColors.colorTextDark }}>
            {t('auth.forgotPasswordTitle', language)}
          </Title>
          <Text size="sm" style={{ color: themeColors.colorTextMedium }}>
            {t('auth.forgotPasswordDescription', language)}
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
            <Text fw={600} mb="xs">
              {t('auth.checkYourEmail', language)}
            </Text>
            <Text size="sm">
              {t('auth.resetLinkSentMessage', language)}
            </Text>
          </Alert>
        )}

        {!success && (
          <>
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
              {t('auth.sendResetLink', language)}
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
