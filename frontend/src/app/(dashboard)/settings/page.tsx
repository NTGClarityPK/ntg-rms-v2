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
import { IconCheck, IconSettings, IconReceipt, IconCreditCard, IconPrinter, IconFileInvoice, IconPlus, IconEdit, IconTrash, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { settingsApi, Settings, UpdateSettingsDto } from '@/lib/api/settings';
import { useLanguageStore } from '@/lib/store/language-store';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor, getBadgeColorForText } from '@/lib/utils/theme';
import { DATE_FORMATS, INVOICE_FORMATS } from '@/lib/utils/date-formatter';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { useDynamicTheme } from '@/lib/hooks/use-dynamic-theme';
import { taxesApi, Tax, CreateTaxDto } from '@/lib/api/taxes';
import { menuApi } from '@/lib/api/menu';
import { db } from '@/lib/indexeddb/database';

export default function SettingsPage() {
  const language = useLanguageStore((state) => state.language);
  const themeColor = useThemeColor();
  const { isOnline } = useSyncStatus();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('general');

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

  // Tax management state
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [taxesLoading, setTaxesLoading] = useState(false);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [foodItems, setFoodItems] = useState<Array<{ value: string; label: string }>>([]);
  const [taxModalOpened, setTaxModalOpened] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [deletingTax, setDeletingTax] = useState<string | null>(null);

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
      if (isOnline) {
        const settings = await settingsApi.getSettings();
        generalForm.setValues(settings.general);
        invoiceForm.setValues(settings.invoice);
        paymentForm.setValues(settings.paymentMethods);
        printerForm.setValues(settings.printers);
        taxForm.setValues(settings.tax);
      }

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
  }, [isOnline, language]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const loadTaxes = useCallback(async () => {
    try {
      setTaxesLoading(true);
      let data: Tax[];
      if (isOnline) {
        data = await taxesApi.getTaxes();
        // Cache in IndexedDB
        for (const tax of data) {
          await db.taxes.put({
            id: tax.id,
            tenantId: tax.tenantId,
            name: tax.name,
            taxCode: tax.taxCode,
            rate: tax.rate,
            isActive: tax.isActive,
            appliesTo: tax.appliesTo,
            appliesToDelivery: tax.appliesToDelivery,
            appliesToServiceCharge: tax.appliesToServiceCharge,
            categoryIds: tax.categoryIds || [],
            foodItemIds: tax.foodItemIds || [],
            createdAt: tax.createdAt,
            updatedAt: tax.updatedAt,
            syncStatus: 'synced',
          });
        }
      } else {
        const cached = await db.taxes.toArray();
        data = cached.map((tax) => ({
          id: tax.id,
          tenantId: tax.tenantId,
          name: tax.name,
          taxCode: tax.taxCode,
          rate: tax.rate,
          isActive: tax.isActive,
          appliesTo: tax.appliesTo,
          appliesToDelivery: tax.appliesToDelivery,
          appliesToServiceCharge: tax.appliesToServiceCharge,
          categoryIds: tax.categoryIds || [],
          foodItemIds: tax.foodItemIds || [],
          createdAt: tax.createdAt,
          updatedAt: tax.updatedAt,
        }));
      }
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
  }, [isOnline, language]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await menuApi.getCategories();
      setCategories(
        data.map((cat) => ({
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
      const data = await menuApi.getFoodItems();
      setFoodItems(
        data.map((item) => ({
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
                <Select
                  label={t('settings.invoiceNumberFormat' as any, language) || 'Invoice Number Format'}
                  data={INVOICE_FORMATS.map(f => ({ value: f.value, label: `${f.label} (${f.example})` }))}
                  searchable
                  {...invoiceForm.getInputProps('invoiceNumberFormat')}
                />
                <Select
                  label={t('settings.receiptTemplate' as any, language) || 'Receipt Template'}
                  data={[
                    { value: 'thermal', label: t('settings.thermal' as any, language) || 'Thermal (80mm)' },
                    { value: 'a4', label: t('settings.a4' as any, language) || 'A4 Format' },
                  ]}
                  {...invoiceForm.getInputProps('receiptTemplate')}
                />

                <Stack gap="xs" mt="md">
                  <Switch
                    label={t('settings.showLogo' as any, language) || 'Show Logo'}
                    {...invoiceForm.getInputProps('showLogo', { type: 'checkbox' })}
                  />
                  <Switch
                    label={t('settings.showVatNumber' as any, language) || 'Show VAT Number'}
                    {...invoiceForm.getInputProps('showVatNumber', { type: 'checkbox' })}
                  />
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
                                  color="red"
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
                    <Button color="red" onClick={() => deletingTax && handleDeleteTax(deletingTax)}>
                      {t('common.delete' as any, language) || 'Delete'}
                    </Button>
                  </Group>
                </Stack>
              </Modal>
            </Stack>
          </Tabs.Panel>

          
        </Tabs>
      </div>
    </>
  );
}
