'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from '@mantine/form';
import {
  Title,
  Paper,
  Stack,
  Button,
  Group,
  Text,
  Tabs,
  TextInput,
  Select,
  Switch,
  NumberInput,
  Textarea,
  Skeleton,
  Grid,
  ColorInput,
  Table,
  ActionIcon,
  Modal,
  MultiSelect,
  Badge,
  Divider,
} from '@mantine/core';
import { IconCheck, IconSettings, IconReceipt, IconCreditCard, IconPrinter, IconFileInvoice, IconPlus, IconEdit, IconTrash, IconX, IconPalette, IconBuilding, IconMapPin, IconUpload, IconAlertCircle, IconToolsKitchen2 } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { settingsApi, Settings, UpdateSettingsDto } from '@/lib/api/settings';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor, getBadgeColorForText } from '@/lib/utils/theme';
import { DATE_FORMATS, INVOICE_FORMATS } from '@/lib/utils/date-formatter';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { useDynamicTheme } from '@/lib/hooks/use-dynamic-theme';
import { taxesApi, Tax, CreateTaxDto } from '@/lib/api/taxes';
import { menuApi } from '@/lib/api/menu';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { restaurantApi, UpdateRestaurantInfoDto } from '@/lib/api/restaurant';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useThemeStore } from '@/lib/store/theme-store';
import { useNotificationColors } from '@/lib/hooks/use-theme-colors';
import { useErrorColor } from '@/lib/hooks/use-theme-colors';
import { DEFAULT_THEME_COLOR, getLegacyThemeColor } from '@/lib/utils/theme';
import { FileButton, Image, Box, Alert } from '@mantine/core';
import { BranchesTab } from '@/features/restaurant';

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

export default function SettingsPage() {
  const language = useLanguageStore((state) => state.language);
  const themeColor = useThemeColor();
  const { user } = useAuthStore();
  const { restaurant, setRestaurant } = useRestaurantStore();
  const { primaryColor: themeColorFromStore } = useThemeStore();
  const { updateThemeColor } = useDynamicTheme();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('general');
  const [restaurantError, setRestaurantError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [totalTables, setTotalTables] = useState<number>(5);

  // Get current theme color from store, restaurant, or localStorage, or default
  const getCurrentThemeColor = () => {
    return themeColorFromStore || restaurant?.primaryColor || getLegacyThemeColor() || DEFAULT_THEME_COLOR;
  };

  const currentThemeColor = getCurrentThemeColor();

  const generalForm = useForm<Settings['general']>({
    initialValues: {
      defaultLanguage: 'en',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24',
      firstDayOfWeek: 'sunday',
      defaultOrderType: 'dine_in',
      autoPrintInvoices: false,
      autoPrintKitchenTickets: false,
      enableTableManagement: true,
      enableDeliveryManagement: true,
      minimumDeliveryOrderAmount: 0,
      emailNotifications: true,
      smsNotifications: false,
      soundAlerts: true,
      totalTables: 0,
    },
  });

  const invoiceForm = useForm<Settings['invoice']>({
    initialValues: {
      headerText: '',
      footerText: '',
      termsAndConditions: '',
      showLogo: true,
      showVatNumber: true,
      showQrCode: true,
      invoiceNumberFormat: 'ORD-{YYYYMMDD}-{####}',
      receiptTemplate: 'thermal',
      customTemplate: undefined,
    },
  });

  const paymentForm = useForm<Settings['paymentMethods']>({
    initialValues: {
      enableCash: true,
      enableCard: true,
      enableZainCash: false,
      enableAsiaHawala: false,
      enableBankTransfer: false,
      paymentGatewayConfig: {},
    },
  });

  const printerForm = useForm<Settings['printers']>({
    initialValues: {
      printers: [],
      autoPrint: false,
      numberOfCopies: 1,
      paperSize: '80mm',
    },
  });

  const taxForm = useForm<Settings['tax']>({
    initialValues: {
      enableTaxSystem: false,
    },
  });

  const restaurantForm = useForm<UpdateRestaurantInfoDto>({
    initialValues: {
      name: '',
      email: '',
      phone: '',
      logoUrl: '',
      primaryColor: getCurrentThemeColor(),
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

  // Tax management state
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [taxesLoading, setTaxesLoading] = useState(false);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [foodItems, setFoodItems] = useState<Array<{ value: string; label: string }>>([]);
  const [taxModalOpened, setTaxModalOpened] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [deletingTax, setDeletingTax] = useState<string | null>(null);
  const primary = useThemeColor();
  const taxFormModal = useForm<CreateTaxDto>({
    initialValues: {
      name: '',
      taxCode: '',
      rate: 0,
      isActive: true,
      appliesTo: 'order',
      appliesToDelivery: false,
      appliesToServiceCharge: false,
      categoryIds: [],
      foodItemIds: [],
    },
    validate: {
      name: (value) => (!value ? t('common.required' as any, language) || 'Required' : null),
      rate: (value) => (value < 0 || value > 100 ? t('taxes.invalidRate' as any, language) || 'Rate must be between 0 and 100' : null),
    },
  });


  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const settings = await settingsApi.getSettings();
      generalForm.setValues(settings.general);
      invoiceForm.setValues(settings.invoice);
      paymentForm.setValues(settings.paymentMethods);
      printerForm.setValues(settings.printers);
      taxForm.setValues(settings.tax);
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('settings.loadError' as any, language) || 'Failed to load settings',
        color: getErrorColor(),
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const loadRestaurantInfo = useCallback(async () => {
    try {
      // Load settings to get totalTables
      try {
        if (navigator.onLine) {
          const settings = await settingsApi.getSettings();
          setTotalTables(settings.general?.totalTables || 5);
        } else {
          // Try to get from IndexedDB or use default
          setTotalTables(5);
        }
      } catch (err) {
        console.warn('Failed to load settings, using default:', err);
        setTotalTables(5);
      }

      const serverData = await restaurantApi.getInfo();
      
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
      restaurantForm.setValues(formValues);
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
    } catch (err: any) {
      setRestaurantError(err.message || 'Failed to load restaurant information');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language]);

  useEffect(() => {
    if (activeTab === 'business' || activeTab === 'branding' || activeTab === 'branches') {
      loadRestaurantInfo();
    }
  }, [loadRestaurantInfo, activeTab]);

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
        restaurantForm.setFieldValue('logoUrl', updated.logoUrl || '');
        setLogoPreview(updated.logoUrl || previewUrl);
        
        // Update restaurant store immediately
        setRestaurant({
          id: user?.tenantId || '',
          name: restaurantForm.values.name || 'RMS',
          logoUrl: updated.logoUrl,
          primaryColor: restaurantForm.values.primaryColor,
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

  const handleRestaurantSubmit = async (values: typeof restaurantForm.values) => {
    try {
      setSaving(true);
      setRestaurantError(null);

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

      const tenantId = user?.tenantId || '';
      
      // Update settings with totalTables
      try {
        await settingsApi.updateSettings({
          general: {
            totalTables: totalTables || 5,
          },
        });
      } catch (err: any) {
        console.error('Failed to update settings:', err);
      }

      const updated = await restaurantApi.updateInfo(updateData);
      
      // Update restaurant store for Header
      setRestaurant({
        id: tenantId,
        name: updateData.name || 'RMS',
        logoUrl: updateData.logoUrl,
        primaryColor: updateData.primaryColor,
      });
      
      // Update theme if primaryColor changed
      if (updateData.primaryColor) {
        updateThemeColor(updateData.primaryColor);
      }
      
      notifications.show({
        title: 'Success',
        message: 'Restaurant information updated successfully',
        color: notificationColors.success,
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      setRestaurantError(err.message || 'Failed to save restaurant information');
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

  const loadTaxes = useCallback(async () => {
    try {
      setTaxesLoading(true);
      const data = await taxesApi.getTaxes();
      setTaxes(data);
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.loadError' as any, language) || 'Failed to load taxes',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    } finally {
      setTaxesLoading(false);
    }
  }, [language]);

  const loadCategories = useCallback(async () => {
    try {
      const dataResponse = await menuApi.getCategories();
      // Handle both paginated and non-paginated responses
      const data: any[] = isPaginatedResponse(dataResponse) ? dataResponse.data : dataResponse;
      setCategories(
        data.map((cat: any) => ({
          value: cat.id,
          label: cat.name || '',
        }))
      );
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, []);

  const loadFoodItems = useCallback(async () => {
    try {
      const dataResponse = await menuApi.getFoodItems();
      // Handle both paginated and non-paginated responses
      const data: any[] = isPaginatedResponse(dataResponse) ? dataResponse.data : dataResponse;
      setFoodItems(
        data.map((item: any) => ({
          value: item.id,
          label: item.name,
        }))
      );
    } catch (error) {
      console.error('Failed to load food items:', error);
    }
  }, []);

  // Load taxes, categories, and food items when tax tab is active
  useEffect(() => {
    if (activeTab === 'tax') {
      loadTaxes();
      loadCategories();
      loadFoodItems();
    }
  }, [activeTab, loadTaxes, loadCategories, loadFoodItems]);

  const handleOpenTaxModal = (tax?: Tax) => {
    if (tax) {
      setEditingTax(tax);
      taxFormModal.setValues({
        name: tax.name,
        taxCode: tax.taxCode || '',
        rate: tax.rate,
        isActive: tax.isActive,
        appliesTo: tax.appliesTo,
        appliesToDelivery: tax.appliesToDelivery,
        appliesToServiceCharge: tax.appliesToServiceCharge,
        categoryIds: tax.categoryIds || [],
        foodItemIds: tax.foodItemIds || [],
      });
    } else {
      setEditingTax(null);
      taxFormModal.reset();
    }
    setTaxModalOpened(true);
  };

  const handleCloseTaxModal = () => {
    setTaxModalOpened(false);
    setEditingTax(null);
    taxFormModal.reset();
  };

  const handleSubmitTax = async (values: typeof taxFormModal.values) => {
    try {
      if (editingTax) {
        await taxesApi.updateTax(editingTax.id, values);
        notifications.show({
          title: t('common.success' as any, language),
          message: t('taxes.updated' as any, language) || 'Tax updated successfully',
          color: getSuccessColor(),
          icon: <IconCheck size={16} />,
        });
      } else {
        await taxesApi.createTax(values);
        notifications.show({
          title: t('common.success' as any, language),
          message: t('taxes.created' as any, language) || 'Tax created successfully',
          color: getSuccessColor(),
          icon: <IconCheck size={16} />,
        });
      }
      handleCloseTaxModal();
      loadTaxes();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.saveError' as any, language) || 'Failed to save tax',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    }
  };

  const handleDeleteTax = async (id: string) => {
    try {
      await taxesApi.deleteTax(id);
      notifications.show({
        title: t('common.success' as any, language),
        message: t('taxes.deleted' as any, language) || 'Tax deleted successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
      setDeletingTax(null);
      loadTaxes();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.deleteError' as any, language) || 'Failed to delete tax',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    }
  };

  const handleSaveGeneral = async () => {
    try {
      setSaving(true);
      await settingsApi.updateSettings({ general: generalForm.values });
      notifications.show({
        title: t('common.success' as any, language),
        message: t('settings.saveSuccess' as any, language) || 'Settings saved successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('settings.saveError' as any, language) || 'Failed to save settings',
        color: getErrorColor(),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInvoice = async () => {
    try {
      setSaving(true);
      await settingsApi.updateSettings({ invoice: invoiceForm.values });
      notifications.show({
        title: t('common.success' as any, language),
        message: t('settings.saveSuccess' as any, language) || 'Settings saved successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('settings.saveError' as any, language) || 'Failed to save settings',
        color: getErrorColor(),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayment = async () => {
    try {
      setSaving(true);
      // Explicitly include all payment method fields, even if false
      const paymentMethodsToSave = {
        enableCash: paymentForm.values.enableCash ?? false,
        enableCard: paymentForm.values.enableCard ?? false,
        enableZainCash: paymentForm.values.enableZainCash ?? false,
        enableAsiaHawala: paymentForm.values.enableAsiaHawala ?? false,
        enableBankTransfer: paymentForm.values.enableBankTransfer ?? false,
        paymentGatewayConfig: paymentForm.values.paymentGatewayConfig || {},
      };
      await settingsApi.updateSettings({ paymentMethods: paymentMethodsToSave });
      notifications.show({
        title: t('common.success' as any, language),
        message: t('settings.saveSuccess' as any, language) || 'Settings saved successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
      // Refresh settings to ensure cache is updated
      await loadSettings();
      // Clear settings cache in useSettings hook to force refresh
      if (typeof window !== 'undefined') {
        // Trigger a custom event to notify other components to refresh settings
        window.dispatchEvent(new CustomEvent('settingsUpdated'));
      }
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('settings.saveError' as any, language) || 'Failed to save settings',
        color: getErrorColor(),
      });
    } finally {
      setSaving(false);
    }
  };



  const handleSaveTax = async () => {
    try {
      setSaving(true);
      await settingsApi.updateSettings({ tax: { enableTaxSystem: taxForm.values.enableTaxSystem } });
      notifications.show({
        title: t('common.success' as any, language),
        message: t('settings.saveSuccess' as any, language) || 'Settings saved successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
      // Refresh settings to ensure cache is updated
      await loadSettings();
      // Clear settings cache in useSettings hook to force refresh
      if (typeof window !== 'undefined') {
        // Trigger a custom event to notify other components to refresh settings
        window.dispatchEvent(new CustomEvent('settingsUpdated'));
      }
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('settings.saveError' as any, language) || 'Failed to save settings',
        color: getErrorColor(),
      });
    } finally {
      setSaving(false);
    }
  };



  if (loading) {
    return (
      <>
        <div className="page-title-bar">
          <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
            {t('settings.title' as any, language) || 'Settings'}
          </Title>
        </div>
        <div className="page-sub-title-bar"></div>
        <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
          <Stack gap="md">
            <Skeleton height={40} width="30%" />
            <Skeleton height={400} />
          </Stack>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-title-bar">
        <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
          {t('settings.title' as any, language) || 'Settings'}
        </Title>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="general" leftSection={<IconSettings size={16} />}>
              {t('settings.general' as any, language) || 'General'}
            </Tabs.Tab>
            <Tabs.Tab value="invoice" leftSection={<IconReceipt size={16} />}>
              {t('settings.invoice' as any, language) || 'Invoice'}
            </Tabs.Tab>
            <Tabs.Tab value="payment" leftSection={<IconCreditCard size={16} />}>
              {t('settings.paymentMethods' as any, language) || 'Payment Methods'}
            </Tabs.Tab>

            <Tabs.Tab value="tax" leftSection={<IconFileInvoice size={16} />}>
              {t('settings.tax' as any, language) || 'Tax'}
            </Tabs.Tab>
            <Tabs.Tab value="business" leftSection={<IconBuilding size={16} />}>
              {t('restaurant.businessInformation', language)}
            </Tabs.Tab>
            <Tabs.Tab value="branding" leftSection={<IconPalette size={16} />}>
              {t('restaurant.brandingTheme', language)}
            </Tabs.Tab>
            <Tabs.Tab value="branches" leftSection={<IconMapPin size={16} />}>
              {t('restaurant.branches', language)}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="general" pt="md" px="md" pb="md">
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Title order={3}>{t('settings.general' as any, language) || 'General Settings'}</Title>
                
                <Grid>
                  {/* <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select
                      label={t('settings.defaultLanguage' as any, language) || 'Default Language'}
                      data={[
                        { value: 'en', label: 'English' },
                        { value: 'ar', label: 'Arabic' },
                      ]}
                      {...generalForm.getInputProps('defaultLanguage')}
                    />
                  </Grid.Col> */}
                  {/* <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select
                      label={t('settings.dateFormat' as any, language) || 'Date Format'}
                      data={DATE_FORMATS.map(f => ({ value: f.value, label: `${f.label} (${f.example})` }))}
                      {...generalForm.getInputProps('dateFormat')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select
                      label={t('settings.timeFormat' as any, language) || 'Time Format'}
                      data={[
                        { value: '12', label: '12 Hour' },
                        { value: '24', label: '24 Hour' },
                      ]}
                      {...generalForm.getInputProps('timeFormat')}
                    />
                  </Grid.Col> */}
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select
                      label={t('settings.defaultOrderType' as any, language) || 'Default Order Type'}
                      data={[
                        { value: 'dine_in', label: t('orders.dineIn' as any, language) || 'Dine In' },
                        { value: 'takeaway', label: t('orders.takeaway' as any, language) || 'Takeaway' },
                        { value: 'delivery', label: t('orders.delivery' as any, language) || 'Delivery' },
                      ]}
                      {...generalForm.getInputProps('defaultOrderType')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <NumberInput
                      label={t('settings.minimumDeliveryOrderAmount' as any, language) || 'Minimum Delivery Order Amount'}
                      {...generalForm.getInputProps('minimumDeliveryOrderAmount')}
                    />
                  </Grid.Col>
                </Grid>

                <Stack gap="xs" mt="md">
                  <Switch
                    label={t('settings.autoPrintInvoices' as any, language) || 'Auto-print Invoices'}
                    {...generalForm.getInputProps('autoPrintInvoices', { type: 'checkbox' })}
                  />
                  {/* <Switch
                    label={t('settings.autoPrintKitchenTickets' as any, language) || 'Auto-print Kitchen Tickets'}
                    {...generalForm.getInputProps('autoPrintKitchenTickets', { type: 'checkbox' })}
                  /> */}
                  <Switch
                    label={t('settings.enableTableManagement' as any, language) || 'Enable Table Management'}
                    {...generalForm.getInputProps('enableTableManagement', { type: 'checkbox' })}
                  />
                  {generalForm.values.enableTableManagement && (
                    <NumberInput
                      label={t('settings.totalTables' as any, language) || 'Total Number of Tables'}
                      description={t('settings.totalTablesDescription' as any, language) || 'Set the total number of tables in your restaurant. Leave as 0 for unlimited tables.'}
                      min={0}
                      {...generalForm.getInputProps('totalTables')}
                    />
                  )}
                  <Switch
                    label={t('settings.enableDeliveryManagement' as any, language) || 'Enable Delivery Management'}
                    {...generalForm.getInputProps('enableDeliveryManagement', { type: 'checkbox' })}
                  />
                  {/* <Switch
                    label={t('settings.emailNotifications' as any, language) || 'Email Notifications'}
                    {...generalForm.getInputProps('emailNotifications', { type: 'checkbox' })}
                  /> */}
                  {/* <Switch
                    label={t('settings.smsNotifications' as any, language) || 'SMS Notifications'}
                    {...generalForm.getInputProps('smsNotifications', { type: 'checkbox' })}
                  /> */}
                  {/* <Switch
                    label={t('settings.soundAlerts' as any, language) || 'Sound Alerts'}
                    {...generalForm.getInputProps('soundAlerts', { type: 'checkbox' })}
                  /> */}
                </Stack>

                <Group justify="flex-end" mt="md">
                  <Button onClick={handleSaveGeneral} loading={saving} leftSection={<IconCheck size={16} />} style={{ backgroundColor: themeColor }}>
                    {t('common.save' as any, language) || 'Save'}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="invoice" pt="md" px="md" pb="md">
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Title order={3}>{t('settings.invoice' as any, language) || 'Invoice Settings'}</Title>
                
                <Textarea
                  label={t('settings.headerText' as any, language) || 'Header Text'}
                  {...invoiceForm.getInputProps('headerText')}
                />
                <Textarea
                  label={t('settings.footerText' as any, language) || 'Footer Text'}
                  {...invoiceForm.getInputProps('footerText')}
                />
                <Textarea
                  label={t('settings.termsAndConditions' as any, language) || 'Terms & Conditions'}
                  minRows={3}
                  {...invoiceForm.getInputProps('termsAndConditions')}
                />

                <Stack gap="xs" mt="md">
                  <Switch
                    label={t('settings.showLogo' as any, language) || 'Show Logo'}
                    {...invoiceForm.getInputProps('showLogo', { type: 'checkbox' })}
                  />
                  {/* <Switch
                    label={t('settings.showVatNumber' as any, language) || 'Show VAT Number'}
                    {...invoiceForm.getInputProps('showVatNumber', { type: 'checkbox' })}
                  /> */}
                  {/* <Switch
                    label={t('settings.showQrCode' as any, language) || 'Show QR Code'}
                    {...invoiceForm.getInputProps('showQrCode', { type: 'checkbox' })}
                  /> */}
                </Stack>

                <Group justify="flex-end" mt="md">
                  <Button onClick={handleSaveInvoice} loading={saving} leftSection={<IconCheck size={16} />} style={{ backgroundColor: themeColor }}>
                    {t('common.save' as any, language) || 'Save'}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="payment" pt="md" px="md" pb="md">
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Title order={3}>{t('settings.paymentMethods' as any, language) || 'Payment Methods'}</Title>
                
                <Stack gap="xs">
                  <Switch
                    label={t('settings.enableCash' as any, language) || 'Enable Cash'}
                    {...paymentForm.getInputProps('enableCash', { type: 'checkbox' })}
                  />
                  <Switch
                    label={t('settings.enableCard' as any, language) || 'Enable Card'}
                    {...paymentForm.getInputProps('enableCard', { type: 'checkbox' })}
                  />
                  {/* <Switch
                    label={t('settings.enableZainCash' as any, language) || 'Enable ZainCash'}
                    {...paymentForm.getInputProps('enableZainCash', { type: 'checkbox' })}
                  />
                  <Switch
                    label={t('settings.enableAsiaHawala' as any, language) || 'Enable Asia Hawala'}
                    {...paymentForm.getInputProps('enableAsiaHawala', { type: 'checkbox' })}
                  />
                  <Switch
                    label={t('settings.enableBankTransfer' as any, language) || 'Enable Bank Transfer'}
                    {...paymentForm.getInputProps('enableBankTransfer', { type: 'checkbox' })}
                  /> */}
                </Stack>

                <Group justify="flex-end" mt="md">
                  <Button onClick={handleSavePayment} loading={saving} leftSection={<IconCheck size={16} />} style={{ backgroundColor: themeColor }}>
                    {t('common.save' as any, language) || 'Save'}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Tabs.Panel>

      

          <Tabs.Panel value="tax" pt="md" px="md" pb="md">
            <Stack gap="md">
              {/* Enable Tax System Toggle */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Title order={3}>{t('settings.tax' as any, language) || 'Tax Settings'}</Title>
                  <Switch
                    label={t('settings.enableTaxSystem' as any, language) || 'Enable Tax System'}
                    description={t('settings.enableTaxSystemDesc' as any, language) || 'Enable or disable the tax calculation system for orders'}
                    {...taxForm.getInputProps('enableTaxSystem', { type: 'checkbox' })}
                  />
                  <Group justify="flex-end">
                    <Button onClick={handleSaveTax} loading={saving} leftSection={<IconCheck size={16} />} style={{ backgroundColor: themeColor }}>
                      {t('common.save' as any, language) || 'Save'}
                    </Button>
                  </Group>
                </Stack>
              </Paper>

              {/* Manage Taxes Section */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Title order={4}>{t('settings.manageTaxes' as any, language) || 'Manage Taxes'}</Title>
                    <Button
                      leftSection={<IconPlus size={16} />}
                      onClick={() => handleOpenTaxModal()}
                      style={{ backgroundColor: themeColor }}
                    >
                      {t('taxes.addTax' as any, language) || 'Add Tax'}
                    </Button>
                  </Group>

                  {taxesLoading ? (
                    <Skeleton height={200} />
                  ) : taxes.length === 0 ? (
                    <Text c="dimmed" ta="center" py="xl">
                      {t('taxes.noTaxes' as any, language) || 'No taxes configured'}
                    </Text>
                  ) : (
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t('taxes.name' as any, language) || 'Name'}</Table.Th>
                          <Table.Th>{t('taxes.code' as any, language) || 'Code'}</Table.Th>
                          <Table.Th>{t('taxes.rate' as any, language) || 'Rate'}</Table.Th>
                          <Table.Th>{t('taxes.appliesTo' as any, language) || 'Applies To'}</Table.Th>
                          <Table.Th>{t('common.status' as any, language) || 'Status'}</Table.Th>
                          <Table.Th>{t('common.actions' as any, language) || 'Actions'}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {taxes.map((tax) => (
                          <Table.Tr key={tax.id}>
                            <Table.Td>{tax.name}</Table.Td>
                            <Table.Td>{tax.taxCode || '-'}</Table.Td>
                            <Table.Td>{tax.rate}%</Table.Td>
                            <Table.Td>
                              {tax.appliesTo === 'order'
                                ? t('taxes.orderWise' as any, language) || 'Order'
                                : tax.appliesTo === 'category'
                                ? t('taxes.categoryWise' as any, language) || 'Category'
                                : t('taxes.itemWise' as any, language) || 'Item'}
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color={getBadgeColorForText(tax.isActive
                                ? (t('common.active' as any, language) || 'Active')
                                : (t('common.inactive' as any, language) || 'Inactive'))}>
                                {tax.isActive
                                  ? t('common.active' as any, language) || 'Active'
                                  : t('common.inactive' as any, language) || 'Inactive'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <ActionIcon
                                  variant="light"
                                  color={themeColor}
                                  onClick={() => handleOpenTaxModal(tax)}
                                >
                                  <IconEdit size={16} />
                                </ActionIcon>
                                <ActionIcon
                                  variant="light"
                                  color={primary}
                                  onClick={() => setDeletingTax(tax.id)}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Stack>
              </Paper>

              {/* Tax Modal */}
              <Modal
                opened={taxModalOpened}
                onClose={handleCloseTaxModal}
                title={editingTax ? t('taxes.editTax' as any, language) || 'Edit Tax' : t('taxes.addTax' as any, language) || 'Add Tax'}
                size="lg"
              >
                <form onSubmit={taxFormModal.onSubmit(handleSubmitTax)}>
                  <Stack gap="md">
                    <TextInput
                      label={t('taxes.name' as any, language) || 'Name'}
                      required
                      {...taxFormModal.getInputProps('name')}
                    />
                    <TextInput
                      label={t('taxes.code' as any, language) || 'Tax Code'}
                      {...taxFormModal.getInputProps('taxCode')}
                    />
                    <NumberInput
                      label={t('taxes.rate' as any, language) || 'Rate (%)'}
                      required
                      min={0}
                      max={100}
                      decimalScale={2}
                      {...taxFormModal.getInputProps('rate')}
                    />
                    <Select
                      label={t('taxes.appliesTo' as any, language) || 'Applies To'}
                      data={[
                        { value: 'order', label: t('taxes.orderWise' as any, language) || 'Order' },
                        { value: 'category', label: t('taxes.categoryWise' as any, language) || 'Category' },
                        { value: 'item', label: t('taxes.itemWise' as any, language) || 'Item' },
                      ]}
                      {...taxFormModal.getInputProps('appliesTo')}
                    />
                    {taxFormModal.values.appliesTo === 'category' && (
                      <MultiSelect
                        label={t('taxes.categories' as any, language) || 'Categories'}
                        data={categories}
                        {...taxFormModal.getInputProps('categoryIds')}
                      />
                    )}
                    {taxFormModal.values.appliesTo === 'item' && (
                      <MultiSelect
                        label={t('taxes.foodItems' as any, language) || 'Food Items'}
                        data={foodItems}
                        {...taxFormModal.getInputProps('foodItemIds')}
                      />
                    )}
                    {/* <Switch
                      label={t('taxes.applyToDelivery' as any, language) || 'Apply to Delivery Charges'}
                      {...taxFormModal.getInputProps('appliesToDelivery', { type: 'checkbox' })}
                    /> */}
                    {/* <Switch
                      label={t('taxes.applyToServiceCharge' as any, language) || 'Apply to Service Charges'}
                      {...taxFormModal.getInputProps('appliesToServiceCharge', { type: 'checkbox' })}
                    /> */}
                    <Switch
                      label={t('common.active' as any, language) || 'Active'}
                      {...taxFormModal.getInputProps('isActive', { type: 'checkbox' })}
                    />
                    <Group justify="flex-end" mt="md">
                      <Button variant="subtle" onClick={handleCloseTaxModal}>
                        {t('common.cancel' as any, language) || 'Cancel'}
                      </Button>
                      <Button type="submit" style={{ backgroundColor: themeColor }}>
                        {t('common.save' as any, language) || 'Save'}
                      </Button>
                    </Group>
                  </Stack>
                </form>
              </Modal>

              {/* Delete Confirmation Modal */}
              <Modal
                opened={!!deletingTax}
                onClose={() => setDeletingTax(null)}
                title={t('taxes.deleteTax' as any, language) || 'Delete Tax'}
              >
                <Stack gap="md">
                  <Text>{t('taxes.deleteConfirm' as any, language) || 'Are you sure you want to delete this tax?'}</Text>
                  <Group justify="flex-end">
                    <Button variant="subtle" onClick={() => setDeletingTax(null)}>
                      {t('common.cancel' as any, language) || 'Cancel'}
                    </Button>
                    <Button color={primary} onClick={() => deletingTax && handleDeleteTax(deletingTax)}>
                      {t('common.delete' as any, language) || 'Delete'}
                    </Button>
                  </Group>
                </Stack>
              </Modal>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="business" pt="md" px="md" pb="md">
            <form onSubmit={restaurantForm.onSubmit(handleRestaurantSubmit)}>
              {restaurantError && (
                <Alert 
                  icon={<IconAlertCircle size={16} />} 
                  style={{
                    backgroundColor: `${errorColor}15`,
                    borderColor: errorColor,
                    color: errorColor,
                  }}
                  mb="md"
                >
                  {restaurantError}
                </Alert>
              )}
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
                        {...restaurantForm.getInputProps('name')}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <TextInput
                        label={t('restaurant.email', language)}
                        type="email"
                        required
                        {...restaurantForm.getInputProps('email')}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <TextInput
                        label={t('restaurant.phone', language)}
                        {...restaurantForm.getInputProps('phone')}
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
                        {...restaurantForm.getInputProps('timezone')}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <TextInput
                        label={t('restaurant.fiscalYearStart', language)}
                        type="date"
                        {...restaurantForm.getInputProps('fiscalYearStart')}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <TextInput
                        label={t('restaurant.vatNumber', language)}
                        {...restaurantForm.getInputProps('vatNumber')}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <NumberInput
                        label={t('restaurant.totalTables', language) || 'Total Number of Tables'}
                        value={totalTables}
                        onChange={(value) => setTotalTables(typeof value === 'number' ? value : 5)}
                        min={0}
                        defaultValue={5}
                      />
                    </Grid.Col>
                    <Grid.Col span={12}>
                      <Switch
                        label={t('restaurant.active', language)}
                        {...restaurantForm.getInputProps('isActive', { type: 'checkbox' })}
                      />
                    </Grid.Col>
                  </Grid>
                </Paper>

                <Group 
                  justify="flex-end" 
                  mt="xl" 
                  style={language === 'ar' 
                    ? { paddingLeft: 'var(--mantine-spacing-md)' }
                    : { paddingRight: 'var(--mantine-spacing-md)' }
                  }
                >
                  <Button type="submit" loading={saving}>
                    {t('common.saveChanges' as any, language)}
                  </Button>
                </Group>
              </Stack>
            </form>
          </Tabs.Panel>

          <Tabs.Panel value="branding" pt="md" px="md" pb="md">
            <form onSubmit={restaurantForm.onSubmit(handleRestaurantSubmit)}>
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
                        <IconToolsKitchen2 size={64} stroke={1.5} color={themeColor} />
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
                          {...restaurantForm.getInputProps('primaryColor')}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 6 }}>
                        <Paper
                          p="md"
                          withBorder
                          style={{
                            backgroundColor: restaurantForm.values.primaryColor,
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

                <Group 
                  justify="flex-end" 
                  mt="xl" 
                  style={language === 'ar' 
                    ? { paddingLeft: 'var(--mantine-spacing-md)' }
                    : { paddingRight: 'var(--mantine-spacing-md)' }
                  }
                >
                  <Button type="submit" loading={saving}>
                    {t('common.saveChanges' as any, language)}
                  </Button>
                </Group>
              </Stack>
            </form>
          </Tabs.Panel>

          <Tabs.Panel value="branches" pt="md" px="md" pb="md">
            <BranchesTab />
          </Tabs.Panel>
          
        </Tabs>
      </div>
    </>
  );
}
