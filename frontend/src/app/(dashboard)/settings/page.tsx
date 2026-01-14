'use client';

import { useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
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
  Loader,
} from '@mantine/core';
import { IconCheck, IconSettings, IconReceipt, IconCreditCard, IconPrinter, IconFileInvoice, IconPlus, IconEdit, IconTrash, IconX, IconPalette, IconBuilding, IconMapPin, IconUpload, IconAlertCircle, IconToolsKitchen2, IconLanguage } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { settingsApi, Settings, UpdateSettingsDto } from '@/lib/api/settings';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor, getBadgeColorForText } from '@/lib/utils/theme';
import { DATE_FORMATS, INVOICE_FORMATS } from '@/lib/utils/date-formatter';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
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
import { translationsApi, SupportedLanguage } from '@/lib/api/translations';

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
  const { selectedBranchId } = useBranchStore();
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
  const [submittingTax, setSubmittingTax] = useState(false);
  const [pendingTax, setPendingTax] = useState<Tax | null>(null);
  const [updatingTaxId, setUpdatingTaxId] = useState<string | null>(null);
  const [deletingTaxId, setDeletingTaxId] = useState<string | null>(null);
  const primary = useThemeColor();

  // Language management state
  const [languages, setLanguages] = useState<SupportedLanguage[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<SupportedLanguage[]>([]);
  const [languagesLoading, setLanguagesLoading] = useState(false);
  const [languageModalOpened, setLanguageModalOpened] = useState(false);
  const [addingLanguageCode, setAddingLanguageCode] = useState<string | null>(null);
  const [submittingLanguage, setSubmittingLanguage] = useState(false);
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
      const settings = await settingsApi.getSettings(selectedBranchId || undefined);
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
  }, [language, selectedBranchId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const loadRestaurantInfo = useCallback(async () => {
    try {
      // Load settings to get totalTables (branch-specific)
      try {
        if (navigator.onLine) {
          const settings = await settingsApi.getSettings(selectedBranchId || undefined);
          setTotalTables(settings.general?.totalTables || 5);
        } else {
          setTotalTables(5);
        }
      } catch (err) {
        console.warn('Failed to load settings, using default:', err);
        setTotalTables(5);
      }

      const serverData = await restaurantApi.getInfo(language);
      
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
      
      // Email cannot be updated - exclude it from the update request
      delete updateData.email;
      
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
      
      // Update settings with totalTables (branch-specific)
      try {
        await settingsApi.updateSettings({
          general: {
            totalTables: totalTables || 5,
          },
        }, selectedBranchId || undefined);
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
      const data = await taxesApi.getTaxes(selectedBranchId || undefined);
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
  }, [language, selectedBranchId]);

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

  const loadLanguages = useCallback(async () => {
    if (user?.role !== 'tenant_owner') return; // Only load for tenant owner
    try {
      setLanguagesLoading(true);
      // Load tenant-enabled languages
      const enabledData = await translationsApi.getTenantLanguages();
      setLanguages(enabledData);
      
      // Load available languages that can be added
      const availableData = await translationsApi.getAvailableLanguagesForTenant();
      
      // Get enabled language codes to check what's already enabled
      const enabledCodes = enabledData.map(l => l.code.toLowerCase());
      
      // Always show ku, ar, fr if they're not enabled (even if API doesn't return them)
      const predefinedLanguageData = [
        { code: 'ku', name: 'Kurdish', nativeName: 'کوردی', rtl: true },
        { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
        { code: 'fr', name: 'French', nativeName: 'Français', rtl: false },
      ];
      
      // Filter to only show languages that are not yet enabled
      const predefinedLanguages = predefinedLanguageData
        .filter(lang => !enabledCodes.includes(lang.code.toLowerCase()))
        .map(lang => {
          // Try to find the language in API response for additional data, otherwise use predefined
          const apiLang = availableData.find(l => l.code.toLowerCase() === lang.code.toLowerCase());
          return apiLang || {
            code: lang.code,
            name: lang.name,
            nativeName: lang.nativeName,
            isActive: true,
            isDefault: false,
            rtl: lang.rtl,
          };
        });
      
      setAvailableLanguages(predefinedLanguages);
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || 'Failed to load languages',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    } finally {
      setLanguagesLoading(false);
    }
  }, [language, user?.role]);

  // Helper function to get translated language name
  const getTranslatedLanguageName = (langCode: string): string => {
    const languageNameMap: Record<string, string> = {
      en: 'common.english',
      ku: 'common.kurdish',
      ar: 'common.arabic',
      fr: 'common.french',
    };
    const translationKey = languageNameMap[langCode.toLowerCase()];
    if (translationKey) {
      return t(translationKey as any, language) || langCode.toUpperCase();
    }
    return langCode.toUpperCase();
  };

  // Load languages when languages tab is active (admin only)
  useEffect(() => {
    if (activeTab === 'languages' && user?.role === 'tenant_owner') {
      loadLanguages();
    }
  }, [activeTab, loadLanguages, user?.role]);

  const handleAddLanguage = async (langCode: string) => {
    setAddingLanguageCode(langCode);
    setSubmittingLanguage(true);
    try {
      const result = await translationsApi.enableLanguageForTenant(langCode);
      notifications.show({
        title: t('common.success' as any, language),
        message: result.message || t('settings.languageEnabledMessage' as any, language) || 'Your request has been accepted. Translations are being processed in the background and may take a while to complete.',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
        autoClose: 5000,
      });
      setLanguageModalOpened(false);
      await loadLanguages();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || error?.message || 'Failed to enable language',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    } finally {
      setAddingLanguageCode(null);
      setSubmittingLanguage(false);
    }
  };

  const handleRequestCustomLanguage = () => {
    // Open email client with customer service email
    const subject = encodeURIComponent('Request for Custom Language Support');
    const body = encodeURIComponent(
      'Hello,\n\nI would like to request support for a custom language in my restaurant management system.\n\nPlease contact me to discuss this request.\n\nThank you!'
    );
    window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`;
  };

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
    if (submittingTax) return;
    setTaxModalOpened(false);
    setEditingTax(null);
    taxFormModal.reset();
  };

  const handleSubmitTax = async (values: typeof taxFormModal.values) => {
    flushSync(() => {
      setSubmittingTax(true);
    });

    try {
      if (editingTax) {
        const currentEditingTaxId = editingTax.id;
        flushSync(() => {
          setUpdatingTaxId(currentEditingTaxId);
        });
        setTaxModalOpened(false);
        setEditingTax(null);

        await taxesApi.updateTax(currentEditingTaxId, values);
        await loadTaxes();
        setUpdatingTaxId(null);
        
        notifications.show({
          title: t('common.success' as any, language),
          message: t('taxes.updated' as any, language) || 'Tax updated successfully',
          color: getSuccessColor(),
          icon: <IconCheck size={16} />,
        });
      } else {
        const tempTax: Tax = {
          id: 'pending',
          name: values.name,
          taxCode: values.taxCode || '',
          rate: values.rate,
          isActive: values.isActive ?? true,
          appliesTo: values.appliesTo || 'order',
          appliesToDelivery: values.appliesToDelivery ?? false,
          appliesToServiceCharge: values.appliesToServiceCharge ?? false,
          categoryIds: values.categoryIds || [],
          foodItemIds: values.foodItemIds || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tenantId: '',
        };

        setPendingTax(tempTax);
        setTaxModalOpened(false);
        setEditingTax(null);
        taxFormModal.reset();

        await taxesApi.createTax(values, selectedBranchId || undefined);
        await loadTaxes();
        setPendingTax(null);
        
        notifications.show({
          title: t('common.success' as any, language),
          message: t('taxes.created' as any, language) || 'Tax created successfully',
          color: getSuccessColor(),
          icon: <IconCheck size={16} />,
        });
      }
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.saveError' as any, language) || 'Failed to save tax',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
      // Reopen modal on error
      if (editingTax) {
        setTaxModalOpened(true);
        setEditingTax(editingTax);
        taxFormModal.setValues(values);
      } else {
        setTaxModalOpened(true);
        taxFormModal.setValues(values);
      }
      // Clear loading states on error
      setPendingTax(null);
      setUpdatingTaxId(null);
    } finally {
      setSubmittingTax(false);
    }
  };

  const handleDeleteTax = async (id: string) => {
    setDeletingTaxId(id);
    try {
      await taxesApi.deleteTax(id);
      notifications.show({
        title: t('common.success' as any, language),
        message: t('taxes.deleted' as any, language) || 'Tax deleted successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
      setDeletingTax(null);
      await loadTaxes();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.deleteError' as any, language) || 'Failed to delete tax',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    } finally {
      setDeletingTaxId(null);
    }
  };

  const handleSaveGeneral = async () => {
    try {
      setSaving(true);
      await settingsApi.updateSettings({ general: generalForm.values }, selectedBranchId || undefined);
      
      // Clear settings cache and notify other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('settingsUpdated'));
      }
      
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
      await settingsApi.updateSettings({ invoice: invoiceForm.values }, selectedBranchId || undefined);
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
      await settingsApi.updateSettings({ paymentMethods: paymentMethodsToSave }, selectedBranchId || undefined);
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
      await settingsApi.updateSettings({ tax: { enableTaxSystem: taxForm.values.enableTaxSystem } }, selectedBranchId || undefined);
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
            {user?.role === 'tenant_owner' && (
              <Tabs.Tab value="languages" leftSection={<IconLanguage size={16} />}>
                {t('settings.languages' as any, language) || 'Languages'}
              </Tabs.Tab>
            )}
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
                  ) : taxes.length === 0 && !pendingTax ? (
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
                        {pendingTax && (
                          <Table.Tr>
                            <Table.Td>
                              <Group gap="xs">
                                <Loader size="sm" />
                                <Skeleton height={20} width={150} />
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={20} width={100} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={20} width={60} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={20} width={100} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={24} width={80} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={32} width={80} />
                            </Table.Td>
                          </Table.Tr>
                        )}
                        {taxes.map((tax) => {
                          const isUpdating = updatingTaxId === tax.id;
                          
                          if (isUpdating) {
                            return (
                              <Table.Tr key={tax.id}>
                                <Table.Td>
                                  <Group gap="xs">
                                    <Loader size="sm" />
                                    <Skeleton height={20} width={150} />
                                  </Group>
                                </Table.Td>
                                <Table.Td>
                                  <Skeleton height={20} width={100} />
                                </Table.Td>
                                <Table.Td>
                                  <Skeleton height={20} width={60} />
                                </Table.Td>
                                <Table.Td>
                                  <Skeleton height={20} width={100} />
                                </Table.Td>
                                <Table.Td>
                                  <Skeleton height={24} width={80} />
                                </Table.Td>
                                <Table.Td>
                                  <Skeleton height={32} width={80} />
                                </Table.Td>
                              </Table.Tr>
                            );
                          }
                          
                          return (
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
                                    disabled={updatingTaxId === tax.id || deletingTaxId === tax.id}
                                >
                                  <IconEdit size={16} />
                                </ActionIcon>
                                <ActionIcon
                                  variant="light"
                                  color={primary}
                                  onClick={() => setDeletingTax(tax.id)}
                                    disabled={updatingTaxId === tax.id || deletingTaxId === tax.id}
                                    loading={deletingTaxId === tax.id}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                          );
                        })}
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
                closeOnClickOutside={!submittingTax}
                closeOnEscape={!submittingTax}
              >
                <form onSubmit={taxFormModal.onSubmit(handleSubmitTax)}>
                  <Stack gap="md">
                    <TextInput
                      label={t('taxes.name' as any, language) || 'Name'}
                      required
                      {...taxFormModal.getInputProps('name')}
                      disabled={submittingTax}
                    />
                    <TextInput
                      label={t('taxes.code' as any, language) || 'Tax Code'}
                      {...taxFormModal.getInputProps('taxCode')}
                      disabled={submittingTax}
                    />
                    <NumberInput
                      label={t('taxes.rate' as any, language) || 'Rate (%)'}
                      required
                      min={0}
                      max={100}
                      decimalScale={2}
                      {...taxFormModal.getInputProps('rate')}
                      disabled={submittingTax}
                    />
                    <Select
                      label={t('taxes.appliesTo' as any, language) || 'Applies To'}
                      data={[
                        { value: 'order', label: t('taxes.orderWise' as any, language) || 'Order' },
                        { value: 'category', label: t('taxes.categoryWise' as any, language) || 'Category' },
                        { value: 'item', label: t('taxes.itemWise' as any, language) || 'Item' },
                      ]}
                      {...taxFormModal.getInputProps('appliesTo')}
                      disabled={submittingTax}
                    />
                    {taxFormModal.values.appliesTo === 'category' && (
                      <MultiSelect
                        label={t('taxes.categories' as any, language) || 'Categories'}
                        data={categories}
                        {...taxFormModal.getInputProps('categoryIds')}
                        disabled={submittingTax}
                      />
                    )}
                    {taxFormModal.values.appliesTo === 'item' && (
                      <MultiSelect
                        label={t('taxes.foodItems' as any, language) || 'Food Items'}
                        data={foodItems}
                        {...taxFormModal.getInputProps('foodItemIds')}
                        disabled={submittingTax}
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
                      disabled={submittingTax}
                    />
                    <Group justify="flex-end" mt="md">
                      <Button variant="subtle" onClick={handleCloseTaxModal} disabled={submittingTax}>
                        {t('common.cancel' as any, language) || 'Cancel'}
                      </Button>
                      <Button type="submit" style={{ backgroundColor: themeColor }} loading={submittingTax} disabled={submittingTax}>
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
                    <Button color={primary} onClick={() => deletingTax && handleDeleteTax(deletingTax)} loading={deletingTaxId === deletingTax} disabled={deletingTaxId === deletingTax}>
                      {t('common.delete' as any, language) || 'Delete'}
                    </Button>
                  </Group>
                </Stack>
              </Modal>
            </Stack>
          </Tabs.Panel>

          {user?.role === 'tenant_owner' && (
            <Tabs.Panel value="languages" pt="md" px="md" pb="md">
              <Stack gap="md">
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Title order={4}>{t('settings.manageLanguages' as any, language) || 'Manage Languages'}</Title>
                      {availableLanguages.length > 0 && (
                        <Button
                          leftSection={<IconPlus size={16} />}
                          onClick={() => setLanguageModalOpened(true)}
                          style={{ backgroundColor: themeColor }}
                        >
                          {t('settings.addLanguage' as any, language) || 'Add Language'}
                        </Button>
                      )}
                    </Group>

                    {languagesLoading ? (
                      <Skeleton height={200} />
                    ) : languages.length === 0 ? (
                      <Text c="dimmed" ta="center" py="xl">
                        {t('settings.noLanguages' as any, language) || 'No languages configured'}
                      </Text>
                    ) : (
                      <Table>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t('settings.code' as any, language) || 'Code'}</Table.Th>
                            <Table.Th>{t('settings.name' as any, language) || 'Name'}</Table.Th>
                            <Table.Th>{t('settings.nativeName' as any, language) || 'Native Name'}</Table.Th>
                            <Table.Th>{t('settings.rtl' as any, language) || 'RTL'}</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {languages.map((lang) => (
                            <Table.Tr key={lang.code}>
                              <Table.Td>
                                <Badge variant="light" color="blue">
                                  {lang.code.toUpperCase()}
                                </Badge>
                              </Table.Td>
                              <Table.Td>{getTranslatedLanguageName(lang.code)}</Table.Td>
                              <Table.Td>{lang.nativeName}</Table.Td>
                              <Table.Td>
                                <Badge variant="light" color={lang.rtl ? 'orange' : 'gray'}>
                                  {lang.rtl ? (t('settings.rtlLabel' as any, language) || 'RTL') : (t('settings.ltrLabel' as any, language) || 'LTR')}
                                </Badge>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </Stack>
                </Paper>

                {/* Add Language Modal */}
                <Modal
                  opened={languageModalOpened}
                  onClose={() => !submittingLanguage && setLanguageModalOpened(false)}
                  title={t('settings.addLanguage' as any, language) || 'Add Language'}
                  size="md"
                  closeOnClickOutside={!submittingLanguage}
                  closeOnEscape={!submittingLanguage}
                >
                  <Stack gap="lg">
                    <Text size="sm" c="dimmed" ta="center">
                      {t('settings.selectLanguageToAdd' as any, language) || 'Select Language To Add'}
                    </Text>
                    
                    {availableLanguages.length > 0 ? (
                      <Grid gutter="md">
                        {availableLanguages.map((lang) => (
                          <Grid.Col key={lang.code} span={{ base: 12, sm: 6 }}>
                            <Paper
                              p="md"
                              withBorder
                              style={{
                                cursor: submittingLanguage || addingLanguageCode === lang.code ? 'not-allowed' : 'pointer',
                                opacity: submittingLanguage && addingLanguageCode !== lang.code ? 0.6 : 1,
                                transition: 'all 0.2s',
                                borderColor: addingLanguageCode === lang.code ? themeColor : undefined,
                                borderWidth: addingLanguageCode === lang.code ? 2 : 1,
                              }}
                              onClick={() => !submittingLanguage && handleAddLanguage(lang.code)}
                            >
                              <Stack gap="xs" align="center">
                                {addingLanguageCode === lang.code ? (
                                  <Loader size="sm" />
                                ) : (
                                  <Badge size="lg" variant="light" color="blue" style={{ fontSize: '12px' }}>
                                    {lang.code.toUpperCase()}
                                  </Badge>
                                )}
                                <Text fw={600} size="lg" ta="center" style={{ direction: lang.rtl ? 'rtl' : 'ltr' }}>
                                  {lang.nativeName}
                                </Text>
                                <Text size="sm" c="dimmed" ta="center">
                                  {getTranslatedLanguageName(lang.code)}
                                </Text>
                              </Stack>
                            </Paper>
                          </Grid.Col>
                        ))}
                      </Grid>
                    ) : (
                      <Text c="dimmed" ta="center" py="xl">
                        {t('settings.noAvailableLanguages' as any, language) || 'No additional languages available to add.'}
                      </Text>
                    )}
                    
                    <Divider label={t('settings.or' as any, language) || 'OR'} labelPosition="center" />
                    
                    <Paper
                      p="md"
                      withBorder
                      style={{
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={handleRequestCustomLanguage}
                    >
                      <Group gap="md">
                        <IconLanguage size={24} color={themeColor} />
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Text fw={500} size="sm">
                            {t('settings.requestCustomLanguage' as any, language) || 'Request Custom Language Support'}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {t('settings.customLanguageDescription' as any, language) || 'Need a language not listed? Contact customer service to request support for additional languages.'}
                          </Text>
                        </Stack>
                      </Group>
                    </Paper>

                    <Group justify="flex-end" mt="md">
                      <Button variant="subtle" onClick={() => setLanguageModalOpened(false)} disabled={submittingLanguage}>
                        {t('common.close' as any, language) || 'Close'}
                      </Button>
                    </Group>
                  </Stack>
                </Modal>
              </Stack>
            </Tabs.Panel>
          )}

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
                        label={t('restaurant.restaurantName', language) || 'Restaurant Name'}
                        required
                        {...restaurantForm.getInputProps('name')}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <TextInput
                        label={t('restaurant.email', language)}
                        type="email"
                        required
                        disabled
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
                    {/* <Grid.Col span={{ base: 12, md: 6 }}>
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
                    </Grid.Col> */}
                    {/* <Grid.Col span={12}>
                      <Switch
                        label={t('restaurant.active', language)}
                        {...restaurantForm.getInputProps('isActive', { type: 'checkbox' })}
                      />
                    </Grid.Col> */}
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
