'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from '@mantine/form';
import {
  Container,
  Paper,
  Title,
  TextInput,
  Button,
  Stack,
  Group,
  FileButton,
  Image,
  Text,
  Select,
  Switch,
  Alert,
  Skeleton,
  Tabs,
  Grid,
  Box,
} from '@mantine/core';
import { IconUpload, IconCheck, IconAlertCircle, IconPalette, IconBuilding, IconToolsKitchen2 } from '@tabler/icons-react';
import { restaurantApi, UpdateRestaurantInfoDto } from '@/lib/api/restaurant';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLanguageStore } from '@/lib/store/language-store';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useThemeStore } from '@/lib/store/theme-store';
import { useDynamicTheme } from '@/lib/hooks/use-dynamic-theme';
import { t } from '@/lib/utils/translations';
import { useNotificationColors } from '@/lib/hooks/use-theme-colors';
import { useErrorColor } from '@/lib/hooks/use-theme-colors';
import { notifications } from '@mantine/notifications';
import { DEFAULT_THEME_COLOR, getLegacyThemeColor } from '@/lib/utils/theme';
import { ColorInput } from '@mantine/core';

// Common timezones list with GMT offsets
const TIMEZONE_DATA = [
  { value: 'Asia/Baghdad', label: 'Asia/Baghdad', country: 'Iraq' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai', country: 'UAE' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh', country: 'Saudi Arabia' },
  { value: 'Asia/Kuwait', label: 'Asia/Kuwait', country: 'Kuwait' },
  { value: 'Asia/Qatar', label: 'Asia/Qatar', country: 'Qatar' },
  { value: 'Asia/Tehran', label: 'Asia/Tehran', country: 'Iran' },
  { value: 'Asia/Beirut', label: 'Asia/Beirut', country: 'Lebanon' },
  { value: 'Asia/Amman', label: 'Asia/Amman', country: 'Jordan' },
  { value: 'Asia/Damascus', label: 'Asia/Damascus', country: 'Syria' },
  { value: 'Asia/Jerusalem', label: 'Asia/Jerusalem', country: 'Israel' },
  { value: 'Europe/London', label: 'Europe/London', country: 'UK' },
  { value: 'Europe/Paris', label: 'Europe/Paris', country: 'France' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin', country: 'Germany' },
  { value: 'Europe/Rome', label: 'Europe/Rome', country: 'Italy' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid', country: 'Spain' },
  { value: 'America/New_York', label: 'America/New_York', country: 'US Eastern' },
  { value: 'America/Chicago', label: 'America/Chicago', country: 'US Central' },
  { value: 'America/Denver', label: 'America/Denver', country: 'US Mountain' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles', country: 'US Pacific' },
  { value: 'America/Toronto', label: 'America/Toronto', country: 'Canada' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo', country: 'Japan' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai', country: 'China' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong', country: 'Hong Kong' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore', country: 'Singapore' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata', country: 'India' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney', country: 'Australia' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne', country: 'Australia' },
];

// Function to get GMT offset for a timezone
const getGMTOffset = (timezone: string): number => {
  try {
    const now = new Date();
    // Format the same moment in UTC and target timezone
    const utcFormatter = new Intl.DateTimeFormat('en', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const tzFormatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const utcParts = utcFormatter.formatToParts(now);
    const tzParts = tzFormatter.formatToParts(now);
    
    const utcHour = parseInt(utcParts.find(p => p.type === 'hour')?.value || '0', 10);
    const utcMinute = parseInt(utcParts.find(p => p.type === 'minute')?.value || '0', 10);
    const tzHour = parseInt(tzParts.find(p => p.type === 'hour')?.value || '0', 10);
    const tzMinute = parseInt(tzParts.find(p => p.type === 'minute')?.value || '0', 10);
    
    // Calculate offset in hours
    const utcMinutes = utcHour * 60 + utcMinute;
    const tzMinutes = tzHour * 60 + tzMinute;
    let offsetMinutes = tzMinutes - utcMinutes;
    
    // Handle day boundary (if difference is > 12 hours, assume it crossed midnight)
    if (Math.abs(offsetMinutes) > 12 * 60) {
      if (offsetMinutes > 0) {
        offsetMinutes -= 24 * 60;
      } else {
        offsetMinutes += 24 * 60;
      }
    }
    
    return offsetMinutes / 60;
  } catch {
    return 0;
  }
};

// Function to format GMT offset as string
const formatGMTOffset = (offset: number): string => {
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset));
  const minutes = Math.round((Math.abs(offset) - hours) * 60);
  return `GMT${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
};

export default function RestaurantPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { restaurant, setRestaurant } = useRestaurantStore();
  const { primaryColor: themeColor } = useThemeStore();
  const { updateThemeColor } = useDynamicTheme();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Get current theme color from store, restaurant, or localStorage, or default
  const getCurrentThemeColor = () => {
    return themeColor || restaurant?.primaryColor || getLegacyThemeColor() || DEFAULT_THEME_COLOR;
  };

  const currentThemeColor = getCurrentThemeColor();

  const form = useForm<UpdateRestaurantInfoDto>({
    initialValues: {
      name: '',
      email: '',
      phone: '',
      logoUrl: '',
      primaryColor: currentThemeColor,
      timezone: 'Asia/Baghdad',
      fiscalYearStart: '',
      vatNumber: '',
      isActive: true,
    },
    validate: {
      email: (value) => (value && !/^\S+@\S+$/.test(value) ? 'Invalid email' : null),
      primaryColor: (value) => (value && !/^#[0-9A-Fa-f]{6}$/.test(value) ? 'Invalid color code' : null),
    },
  });

  // Generate timezones with GMT offsets and translations, sorted by offset
  const getTimezones = useCallback(() => {
    return TIMEZONE_DATA.map(tz => {
      const offset = getGMTOffset(tz.value);
      const offsetStr = formatGMTOffset(offset);
      const tzLabel = t(`restaurant.timezones.${tz.label}` as any, language) || tz.label;
      const countryLabel = tz.country ? (t(`restaurant.timezones.${tz.country}` as any, language) || tz.country) : '';
      return {
        value: tz.value,
        label: `${tzLabel} (${offsetStr})${countryLabel ? ` - ${countryLabel}` : ''}`,
        offset,
      };
    }).sort((a, b) => a.offset - b.offset); // Sort by offset (west to east, lowest to highest)
  }, [language]);

  const loadRestaurantInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to load from IndexedDB first
      const localData = await db.tenants.get(user?.tenantId || '');
      
      if (localData) {
        const formValues = {
          name: (localData as any).name || (localData as any).nameEn || (localData as any).nameAr || '',
          email: localData.email,
          phone: localData.phone || '',
          logoUrl: localData.logoUrl || '',
          primaryColor: localData.primaryColor || getCurrentThemeColor(),
          timezone: localData.timezone || 'Asia/Baghdad',
          fiscalYearStart: (localData as any).fiscalYearStart || '',
          vatNumber: (localData as any).vatNumber || '',
          isActive: localData.isActive ?? true,
        };
        form.setValues(formValues);
        if (localData.logoUrl) {
          setLogoPreview(localData.logoUrl);
        }
        // Update restaurant store for Header
        if (localData) {
          setRestaurant({
            id: localData.id,
            name: (localData as any).name || (localData as any).nameEn || (localData as any).nameAr || 'RMS',
            logoUrl: localData.logoUrl,
            primaryColor: localData.primaryColor,
          });
        }
      }

      // Then sync from server if online
      // But only if there are no pending local changes
      if (navigator.onLine) {
        try {
          // Check if there are pending sync changes for tenants
          const pendingTenantChanges = await db.syncQueue
            .where('table')
            .equals('tenants')
            .and((item) => item.status === 'PENDING' || item.status === 'SYNCING' || item.status === 'FAILED')
            .toArray();

          // If there are pending changes, don't overwrite local data with server data
          if (pendingTenantChanges.length > 0) {
            console.log('⚠️ Pending tenant changes detected, keeping local data');
            // Still try to sync pending changes
            await syncService.syncPendingChanges();
            return;
          }

          const serverData = await restaurantApi.getInfo();
          
          // Only update if server data is newer than local data
          const shouldUpdate = !localData || 
            !localData.updatedAt || 
            new Date(serverData.updatedAt) > new Date(localData.updatedAt);

          if (shouldUpdate) {
            const formValues = {
              name: serverData.name || '',
              email: serverData.email,
              phone: serverData.phone || '',
              logoUrl: serverData.logoUrl || '',
              primaryColor: serverData.primaryColor || getCurrentThemeColor(),
              timezone: serverData.timezone || 'Asia/Baghdad',
              fiscalYearStart: serverData.fiscalYearStart || '',
              vatNumber: serverData.vatNumber || '',
              isActive: serverData.isActive ?? true,
            };
            form.setValues(formValues);
            if (serverData.logoUrl) {
              setLogoPreview(serverData.logoUrl);
            }
            
            // Update restaurant store for Header
            setRestaurant({
              id: serverData.id,
              name: serverData.name || 'RMS',
              logoUrl: serverData.logoUrl,
              primaryColor: serverData.primaryColor,
            });

            // Update IndexedDB with server data
            await db.tenants.put({
              id: serverData.id,
              name: serverData.name,
              subdomain: serverData.subdomain,
              email: serverData.email,
              phone: serverData.phone,
              logoUrl: serverData.logoUrl,
              primaryColor: serverData.primaryColor,
              defaultCurrency: serverData.defaultCurrency,
              timezone: serverData.timezone,
              isActive: serverData.isActive,
              createdAt: serverData.createdAt,
              updatedAt: serverData.updatedAt,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced' as const,
            } as any);
          }
        } catch (err: any) {
          console.warn('Failed to load from server, using local data:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load restaurant information');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]); // form is stable from useForm, don't include in dependencies to avoid infinite loops

  useEffect(() => {
    loadRestaurantInfo();
  }, [loadRestaurantInfo]);

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;

    setLogoFile(file);
    
    // Show preview immediately
    let previewUrl: string | null = null;
    const reader = new FileReader();
    reader.onloadend = () => {
      previewUrl = reader.result as string;
      setLogoPreview(previewUrl);
    };
    reader.readAsDataURL(file);

    // Upload to Supabase Storage via backend
    if (navigator.onLine) {
      try {
        const updated = await restaurantApi.uploadLogo(file);
        // Update form with the URL from Supabase Storage
        form.setFieldValue('logoUrl', updated.logoUrl || '');
        setLogoPreview(updated.logoUrl || previewUrl);
        
        // Update restaurant store immediately
        setRestaurant({
          id: user?.tenantId || '',
          name: form.values.name || 'RMS',
          logoUrl: updated.logoUrl,
          primaryColor: form.values.primaryColor,
        });

        notifications.show({
          title: t('common.success' as any, language),
          message: t('restaurant.logo', language) + ' ' + t('menu.uploadSuccess', language),
          color: notificationColors.success,
          icon: <IconCheck size={16} />,
        });
      } catch (err: any) {
        console.error('Failed to upload logo:', err);
        notifications.show({
          title: t('common.error' as any, language),
          message: err.message || 'Failed to upload logo',
          color: notificationColors.error,
          icon: <IconAlertCircle size={16} />,
        });
      }
    }
  };

  const handleSubmit = async (values: typeof form.values) => {
    try {
      setSaving(true);
      setError(null);

      // Prepare update data
      const updateData: UpdateRestaurantInfoDto = { ...values };
      
      // Logo should already be uploaded to Supabase Storage and URL stored in form
      // Only include logoUrl if it's a URL (not base64)
      if (updateData.logoUrl && updateData.logoUrl.startsWith('data:')) {
        // If it's still base64, remove it (should have been uploaded)
        delete updateData.logoUrl;
      }

      // Remove empty strings for optional fields - backend expects undefined/null or valid values
      // Don't send empty strings as they fail validation
      if (updateData.fiscalYearStart === '' || !updateData.fiscalYearStart) {
        delete updateData.fiscalYearStart;
      }
      if (updateData.vatNumber === '' || !updateData.vatNumber) {
        delete updateData.vatNumber;
      }
      if (updateData.phone === '' || !updateData.phone) {
        delete updateData.phone;
      }

      // Save to IndexedDB first (offline-first)
      const tenantId = user?.tenantId || '';
      const existingTenant = await db.tenants.get(tenantId);
      
      const tenantData = {
        id: tenantId,
        name: updateData.name || (existingTenant as any)?.name || (existingTenant as any)?.nameEn || (existingTenant as any)?.nameAr || '',
        subdomain: existingTenant?.subdomain || '',
        email: updateData.email || existingTenant?.email || '',
        phone: updateData.phone || existingTenant?.phone,
        logoUrl: updateData.logoUrl || existingTenant?.logoUrl,
        primaryColor: updateData.primaryColor || existingTenant?.primaryColor,
        defaultCurrency: existingTenant?.defaultCurrency || 'IQD',
        timezone: updateData.timezone || existingTenant?.timezone || 'Asia/Baghdad',
        isActive: updateData.isActive ?? existingTenant?.isActive ?? true,
        createdAt: existingTenant?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSynced: existingTenant?.lastSynced,
        syncStatus: 'pending' as const,
      };

      await db.tenants.put(tenantData as any);

      // Queue sync to backend
      await syncService.queueChange('tenants', 'UPDATE', tenantId, updateData);

      // Update restaurant store for Header immediately
      const updatedLogoUrl = updateData.logoUrl || existingTenant?.logoUrl;
      setRestaurant({
        id: tenantId,
        name: updateData.name || (existingTenant as any)?.name || (existingTenant as any)?.nameEn || (existingTenant as any)?.nameAr || 'RMS',
        logoUrl: updatedLogoUrl,
        primaryColor: updateData.primaryColor || existingTenant?.primaryColor,
      });
      
      // Update theme if primaryColor changed
      if (updateData.primaryColor) {
        updateThemeColor(updateData.primaryColor);
      }

      // Try to sync immediately if online
      if (navigator.onLine) {
        try {
          const updated = await restaurantApi.updateInfo(updateData);
          // Update sync status
          await db.tenants.update(tenantId, {
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });
          notifications.show({
            title: 'Success',
            message: 'Restaurant information updated successfully',
            color: notificationColors.success,
            icon: <IconCheck size={16} />,
          });
        } catch (err: any) {
          console.error('Failed to sync to server:', err);
          notifications.show({
            title: 'Saved Locally',
            message: 'Changes saved locally and will sync when online',
            color: notificationColors.info,
          });
        }
      } else {
        notifications.show({
          title: 'Saved Locally',
          message: 'Changes saved locally and will sync when online',
          color: notificationColors.info,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save restaurant information');
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to save restaurant information',
        color: notificationColors.error,
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Skeleton height={36} width={250} mb="xl" />
        <Tabs defaultValue="basic">
          <Tabs.List mb="xl">
            <Skeleton height={36} width={150} style={{ display: 'inline-block', marginRight: 8 }} />
            <Skeleton height={36} width={150} style={{ display: 'inline-block', marginRight: 8 }} />
            <Skeleton height={36} width={150} style={{ display: 'inline-block' }} />
          </Tabs.List>
          <Tabs.Panel value="basic">
            <Stack gap="md">
              <Skeleton height={40} width="100%" />
              <Skeleton height={40} width="100%" />
              <Skeleton height={40} width="100%" />
              <Skeleton height={100} width="100%" />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl">
        {t('navigation.restaurant', language)} - {t('restaurant.businessInformation', language)}
      </Title>

      {error && (
        <Alert 
          icon={<IconAlertCircle size={16} />} 
          style={{
            backgroundColor: `${errorColor}15`,
            borderColor: errorColor,
            color: errorColor,
          }}
          mb="md"
        >
          {error}
        </Alert>
      )}

      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Tabs defaultValue="business">
          <Tabs.List>
            <Tabs.Tab value="business" leftSection={<IconBuilding size={16} />}>
              {t('restaurant.businessInformation', language)}
            </Tabs.Tab>
            <Tabs.Tab value="branding" leftSection={<IconPalette size={16} />}>
              {t('restaurant.brandingTheme', language)}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="business" pt="md">
            <Stack gap="lg">
          <Paper withBorder p="md">
            <Title order={3} mb="md">
              {t('restaurant.basicDetails', language)}
            </Title>
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="Restaurant Name"
                  required
                  {...form.getInputProps('name')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.email', language)}
                  type="email"
                  required
                  {...form.getInputProps('email')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.phone', language)}
                  {...form.getInputProps('phone')}
                />
              </Grid.Col>
            </Grid>
          </Paper>

          <Paper withBorder p="md">
            <Title order={3} mb="md">
              {t('restaurant.businessSettings', language)}
            </Title>
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label={t('restaurant.timezone', language)}
                  data={getTimezones().map(tz => ({
                    value: tz.value,
                    label: tz.label
                  }))}
                  searchable
                  {...form.getInputProps('timezone')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.fiscalYearStart', language)}
                  type="date"
                  {...form.getInputProps('fiscalYearStart')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.vatNumber', language)}
                  {...form.getInputProps('vatNumber')}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <Switch
                  label={t('restaurant.active', language)}
                  {...form.getInputProps('isActive', { type: 'checkbox' })}
                />
              </Grid.Col>
            </Grid>
          </Paper>

            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="branding" pt="md">
            <Stack gap="lg">
              <Paper withBorder p="md">
                <Title order={3} mb="md">
                  {t('restaurant.logo', language)}
                </Title>
                <Stack gap="md">
                  <Box
                    style={{
                      width: '150px',
                      height: '150px',
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'var(--mantine-color-gray-0)',
                      overflow: 'hidden',
                    }}
                  >
                    {logoPreview ? (
                      <Image
                        src={logoPreview}
                        alt={language === 'ar' ? 'معاينة الشعار' : 'Logo preview'}
                        width="100%"
                        height="100%"
                        fit="contain"
                        style={{ objectFit: 'contain' }}
                      />
                    ) : (
                      <IconToolsKitchen2 size={64} stroke={1.5} color="var(--mantine-color-gray-5)" />
                    )}
                  </Box>
                  <FileButton
                    onChange={handleLogoUpload}
                    accept="image/png,image/jpeg,image/jpg"
                  >
                    {(props) => (
                      <Button leftSection={<IconUpload size={16} />} {...props} style={{ width: 'fit-content' }}>
                        {t('restaurant.uploadLogo', language)}
                      </Button>
                    )}
                  </FileButton>
                  <Text c="dimmed" size="sm">
                    {t('restaurant.logoDescription', language)}
                  </Text>
                </Stack>
              </Paper>

              <Paper withBorder p="md">
                <Title order={3} mb="md">
                  {t('restaurant.themeColor', language)}
                </Title>
                <Stack gap="md">
                  <Text c="dimmed" size="sm">
                    {t('restaurant.themeDescription', language)}
                  </Text>
                  <Grid>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <ColorInput
                        label={t('restaurant.primaryColor', language)}
                        description={t('restaurant.chooseBrandColor', language)}
                        format="hex"
                        swatches={[
                          DEFAULT_THEME_COLOR, // Blue
                          '#4caf50', // Green
                          '#ff9800', // Orange
                          '#f44336', // Red
                          '#9c27b0', // Purple
                          '#00bcd4', // Cyan
                          '#ffeb3b', // Yellow
                          '#795548', // Brown
                        ]}
                        {...form.getInputProps('primaryColor')}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <Paper
                        p="md"
                        withBorder
                        style={{
                          backgroundColor: form.values.primaryColor,
                          color: 'white',
                          textAlign: 'center',
                        }}
                      >
                        <Text fw={500} size="lg">
                          {t('restaurant.preview', language)}
                        </Text>
                        <Text size="sm" opacity={0.9}>
                          {t('restaurant.previewDescription', language)}
                        </Text>
                      </Paper>
                    </Grid.Col>
                  </Grid>
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Group justify="flex-end" mt="xl">
          <Button type="submit" loading={saving}>
            {t('common.saveChanges' as any, language)}
          </Button>
        </Group>
      </form>
    </Container>
  );
}
