'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Title,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Text,
  Anchor,
  Alert,
  Stepper,
  Group,
  Select,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconMail, IconLock, IconUser, IconPhone, IconCheck } from '@tabler/icons-react';
import { authApi } from '@/lib/api/auth';
import { menuApi } from '@/lib/api/menu';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useErrorColor, useInfoColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';

export default function SignupPage() {
  const router = useRouter();
  const { language } = useLanguageStore();
  const { setUser } = useAuthStore();
  const errorColor = useErrorColor();
  const infoColor = useInfoColor();
  const successColor = useSuccessColor();
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      confirmPassword: '',
      name: '',
      phone: '',
      defaultCurrency: 'IQD',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : (language === 'ar' ? 'البريد الإلكتروني غير صحيح' : 'Invalid email')),
      password: (value) => (value.length < 6 ? (language === 'ar' ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' : 'Password must be at least 6 characters') : null),
      confirmPassword: (value, values) =>
        value !== values.password ? (language === 'ar' ? 'كلمات المرور غير متطابقة' : 'Passwords do not match') : null,
      name: (value) => (value.length < 2 ? (language === 'ar' ? 'يجب أن يكون الاسم حرفين على الأقل' : 'Name must be at least 2 characters') : null),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const nextStep = () => {
    if (active === 0) {
      // Validate step 1: Basic Information
      const step1Valid = form.validateField('email').hasError === false &&
        form.validateField('name').hasError === false;
      if (step1Valid) {
        setActive((current) => (current < 2 ? current + 1 : current));
      }
    } else if (active === 1) {
      // Validate step 2: Password
      const step2Valid = form.validateField('password').hasError === false &&
        form.validateField('confirmPassword').hasError === false;
      if (step2Valid) {
        setActive((current) => (current < 2 ? current + 1 : current));
      }
    }
  };

  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    setError(null);

    try {
      const { confirmPassword, ...signupData } = values;
      const response = await authApi.signup(signupData);
      // Map response to User type (handle both old and new API formats)
      const user = {
        ...response.user,
        name: response.user.name || (response.user as any).nameEn || (response.user as any).nameAr || 'User',
      };
      setUser(user);

      // Create a sample add-on group and add-on to help users understand the feature
      try {
        const sampleGroupName = language === 'ar' ? 'إضافات إضافية (مثال)' : 'Extra Toppings (Sample)';
        const sampleAddOnName = language === 'ar' ? 'جبن إضافي' : 'Extra Cheese';
        
        const sampleGroup = await menuApi.createAddOnGroup({
          name: sampleGroupName,
          selectionType: 'multiple',
          isRequired: false,
          minSelections: 0,
          maxSelections: undefined,
          category: 'Add',
        });

        await menuApi.createAddOn(sampleGroup.id, {
          name: sampleAddOnName,
          price: 0,
          isActive: true,
        });
      } catch (sampleErr) {
        // Don't fail signup if sample creation fails, just log it
        console.warn('Failed to create sample add-on:', sampleErr);
      }

      router.push('/dashboard');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || 
        (language === 'ar' ? 'فشل إنشاء الحساب. يرجى المحاولة مرة أخرى.' : 'Signup failed. Please try again.');
      setError(errorMsg);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="lg">
        <Box>
          <Title order={2} size="1.8rem" fw={700} mb="xs">
          {t('auth.signupTitle', language)}
        </Title>
          <Text c="dimmed" size="sm">
            {t('auth.createAccountToStart', language)}
          </Text>
        </Box>

        <Stepper active={active} onStepClick={setActive} size="sm">
          <Stepper.Step
            label={t('auth.basicInfo', language)}
            description={t('auth.personalDetails', language)}
            icon={<IconUser size={18} />}
          >
            <Stack gap="md" mt="xl">
            <TextInput
              label={t('common.email' as any, language)}
                placeholder="your@email.com"
              required
                leftSection={<IconMail size={18} />}
                size="lg"
                radius="md"
                autoComplete="email"
                disabled={loading}
              {...form.getInputProps('email')}
            />

            <TextInput
                label="Name"
                placeholder={language === 'ar' ? 'جون دو' : 'John Doe'}
              required
                leftSection={<IconUser size={18} />}
                size="lg"
                radius="md"
                disabled={loading}
              {...form.getInputProps('name')}
            />

            <TextInput
              label={t('common.phone' as any, language)}
              placeholder="+9647501234567"
                leftSection={<IconPhone size={18} />}
                size="lg"
                radius="md"
                disabled={loading}
              {...form.getInputProps('phone')}
            />

            <Select
              label={t('auth.currency', language)}
              description={t('auth.currencyDescription', language)}
              required
              data={[
                { value: 'IQD', label: language === 'ar' ? 'IQD - الدينار العراقي' : 'IQD - Iraqi Dinar' },
                { value: 'USD', label: language === 'ar' ? 'USD - الدولار الأمريكي' : 'USD - US Dollar' },
                { value: 'EUR', label: language === 'ar' ? 'EUR - اليورو' : 'EUR - Euro' },
                { value: 'GBP', label: language === 'ar' ? 'GBP - الجنيه الإسترليني' : 'GBP - British Pound' },
                { value: 'SAR', label: language === 'ar' ? 'SAR - الريال السعودي' : 'SAR - Saudi Riyal' },
                { value: 'AED', label: language === 'ar' ? 'AED - الدرهم الإماراتي' : 'AED - UAE Dirham' },
              ]}
              size="lg"
              radius="md"
              disabled={loading}
              {...form.getInputProps('defaultCurrency')}
            />
            </Stack>
          </Stepper.Step>

          <Stepper.Step
            label={t('auth.password', language)}
            description={t('auth.secureAccount', language)}
            icon={<IconLock size={18} />}
          >
            <Stack gap="md" mt="xl">
            <PasswordInput
              label={t('common.password' as any, language)}
                placeholder={language === 'ar' ? 'أدخل كلمة المرور' : 'Enter your password'}
              required
                leftSection={<IconLock size={18} />}
                size="lg"
                radius="md"
                autoComplete="new-password"
                disabled={loading}
              {...form.getInputProps('password')}
            />

            <PasswordInput
                label={language === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                placeholder={language === 'ar' ? 'أكد كلمة المرور' : 'Confirm your password'}
              required
                leftSection={<IconLock size={18} />}
                size="lg"
                radius="md"
                autoComplete="new-password"
                disabled={loading}
              {...form.getInputProps('confirmPassword')}
            />

              <Alert 
                style={{
                  backgroundColor: `${infoColor}15`,
                  borderColor: infoColor,
                  color: infoColor,
                }}
                variant="light" 
                radius="md"
              >
                <Text size="sm">
                  {language === 'ar' 
                    ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل. اختر كلمة مرور قوية لحماية حسابك.'
                    : 'Password must be at least 6 characters long. Choose a strong password to keep your account secure.'}
                </Text>
              </Alert>
            </Stack>
          </Stepper.Step>

          <Stepper.Step
            label={t('auth.review', language)}
            description={t('auth.reviewInfo', language)}
            icon={<IconCheck size={18} />}
          >
            <Stack gap="md" mt="xl">
              <Box>
                <Text size="sm" c="dimmed" mb="xs">{t('common.email' as any, language)}</Text>
                <Text fw={500}>{form.values.email}</Text>
              </Box>

              <Box>
                <Text size="sm" c="dimmed" mb="xs">Name</Text>
                <Text fw={500}>{form.values.name}</Text>
              </Box>

              {form.values.phone && (
                <Box>
                  <Text size="sm" c="dimmed" mb="xs">{t('common.phone' as any, language)}</Text>
                  <Text fw={500}>{form.values.phone}</Text>
                </Box>
              )}

              <Box>
                <Text size="sm" c="dimmed" mb="xs">{t('auth.currency', language)}</Text>
                <Text fw={500}>
                  {form.values.defaultCurrency === 'IQD' && (language === 'ar' ? 'IQD - الدينار العراقي' : 'IQD - Iraqi Dinar')}
                  {form.values.defaultCurrency === 'USD' && (language === 'ar' ? 'USD - الدولار الأمريكي' : 'USD - US Dollar')}
                  {form.values.defaultCurrency === 'EUR' && (language === 'ar' ? 'EUR - اليورو' : 'EUR - Euro')}
                  {form.values.defaultCurrency === 'GBP' && (language === 'ar' ? 'GBP - الجنيه الإسترليني' : 'GBP - British Pound')}
                  {form.values.defaultCurrency === 'SAR' && (language === 'ar' ? 'SAR - الريال السعودي' : 'SAR - Saudi Riyal')}
                  {form.values.defaultCurrency === 'AED' && (language === 'ar' ? 'AED - الدرهم الإماراتي' : 'AED - UAE Dirham')}
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
            </Stack>
          </Stepper.Step>

          <Stepper.Completed>
            <Stack gap="md" mt="xl">
              <Alert 
                style={{
                  backgroundColor: `${successColor}15`,
                  borderColor: successColor,
                  color: successColor,
                }}
                variant="light" 
                radius="md"
              >
                <Text size="sm" fw={500}>
                  {language === 'ar' 
                    ? 'تم إنشاء الحساب بنجاح! جاري إعادة التوجيه...'
                    : 'Account created successfully! Redirecting...'}
                </Text>
              </Alert>
            </Stack>
          </Stepper.Completed>
        </Stepper>

        <Group justify="space-between" mt="xl">
          {active > 0 && (
            <Button variant="default" onClick={prevStep} disabled={loading}>
              {t('common.previousStep' as any, language)}
            </Button>
          )}
          {active === 0 && (
            <div /> // Spacer
          )}
          {active < 2 ? (
            <Button onClick={nextStep} disabled={loading}>
              {t('common.nextStep' as any, language)}
            </Button>
          ) : (
            <Button
              type="submit"
              loading={loading}
              size="lg"
              radius="md"
              leftSection={<IconCheck size={16} />}
            >
              {t('common.signup' as any, language)}
            </Button>
          )}
        </Group>

        <Text ta="center" size="sm">
          {t('auth.hasAccount', language)}{' '}
          <Anchor href="/login" size="sm">
            {t('common.login' as any, language)}
          </Anchor>
        </Text>
      </Stack>
    </form>
  );
}
