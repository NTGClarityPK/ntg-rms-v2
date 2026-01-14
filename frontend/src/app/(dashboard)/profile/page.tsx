'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from '@mantine/form';
import {
  Container,
  Title,
  Paper,
  Stack,
  Button,
  Group,
  Text,
  TextInput,
  Skeleton,
  Divider,
} from '@mantine/core';
import { IconCheck, IconUser, IconMail, IconPhone } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { authApi, UserProfile, UpdateProfileDto } from '@/lib/api/auth';
import { useLanguageStore } from '@/lib/store/language-store';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor } from '@/lib/utils/theme';
import { useDateFormat } from '@/lib/hooks/use-date-format';

export default function ProfilePage() {
  const language = useLanguageStore((state) => state.language);
  const themeColor = useThemeColor();
  const { isOnline } = useSyncStatus();
  const dateFormatter = useDateFormat();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const form = useForm<UpdateProfileDto>({
    initialValues: {
      name: '',
      phone: '',
      email: '',
    },
    validate: {
      email: (value) => (value && !/^\S+@\S+$/.test(value) ? t('common.invalidEmail' as any, language) || 'Invalid email' : null),
    },
  });

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      if (isOnline) {
        const data = await authApi.getProfile();
        setProfile(data);
        form.setValues({
          name: data.name || '',
          phone: data.phone || '',
          email: data.email || '',
        });
      }
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('profile.loadError' as any, language) || 'Failed to load profile',
        color: getErrorColor(),
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, language]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSubmit = async (values: typeof form.values) => {
    try {
      setSaving(true);
      // Email cannot be updated - exclude it from the update request
      const { email, ...updateData } = values;
      const updated = await authApi.updateProfile(updateData);
      setProfile(updated);
      notifications.show({
        title: t('common.success' as any, language),
        message: t('profile.updated' as any, language) || 'Profile updated successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('profile.updateError' as any, language) || 'Failed to update profile',
        color: getErrorColor(),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container size="md">
        <Stack gap="md">
          <Skeleton height={40} width="30%" />
          <Skeleton height={400} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="md">
      <Stack gap="md">
        <Title order={1}>{t('profile.title' as any, language) || 'My Profile'}</Title>

        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group>
              <IconUser size={24} color={themeColor} />
              <Title order={3}>{t('profile.personalInformation' as any, language) || 'Personal Information'}</Title>
            </Group>

            <Divider />

            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="md">
                <TextInput
                  label={t('profile.name' as any, language) || 'Name'}
                  placeholder={t('profile.namePlaceholder' as any, language) || 'Enter your name'}
                  leftSection={<IconUser size={16} />}
                  {...form.getInputProps('name')}
                />

                <TextInput
                  label={t('profile.email' as any, language) || 'Email'}
                  placeholder={t('profile.emailPlaceholder' as any, language) || 'Enter your email'}
                  leftSection={<IconMail size={16} />}
                  disabled
                  {...form.getInputProps('email')}
                />

                <TextInput
                  label={t('profile.phone' as any, language) || 'Phone'}
                  placeholder={t('profile.phonePlaceholder' as any, language) || 'Enter your phone number'}
                  leftSection={<IconPhone size={16} />}
                  {...form.getInputProps('phone')}
                />

                {profile && (
                  <Stack gap="xs" mt="md">
                    <Text size="sm" c="dimmed">
                      {t('profile.memberSince' as any, language) || 'Member since'}: {dateFormatter.formatDate(profile.createdAt)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t('profile.lastUpdated' as any, language) || 'Last updated'}: {dateFormatter.formatDate(profile.updatedAt)}
                    </Text>
                  </Stack>
                )}

                <Group justify="flex-end" mt="md">
                  <Button
                    type="submit"
                    loading={saving}
                    leftSection={<IconCheck size={16} />}
                    style={{ backgroundColor: themeColor }}
                  >
                    {t('common.save' as any, language) || 'Save Changes'}
                  </Button>
                </Group>
              </Stack>
            </form>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}

