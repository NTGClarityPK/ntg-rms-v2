'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from '@mantine/form';
import {
  Title,
  Button,
  Stack,
  Modal,
  TextInput,
  Select,
  Table,
  Group,
  ActionIcon,
  Badge,
  Text,
  Paper,
  Skeleton,
  Alert,
  Grid,
  Tabs,
  Card,
  Divider,
  Loader,
} from '@mantine/core';
import {
  IconEdit,
  IconAlertCircle,
  IconSearch,
  IconUser,
  IconShoppingBag,
  IconTrophy,
  IconMapPin,
  IconInfoCircle,
  IconFileSpreadsheet,
  IconDownload,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { customersApi, Customer, CreateCustomerDto, UpdateCustomerDto } from '@/lib/api/customers';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { DateInput } from '@mantine/dates';
import '@mantine/dates/styles.css';
import { getInfoColor, getBadgeColorForText } from '@/lib/utils/theme';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { Fragment } from 'react';
import { LOYALTY_TIERS } from '@/shared/constants/customers.constants';
import { handleApiError } from '@/shared/utils/error-handler';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';
import { BulkImportModal } from '@/components/common/BulkImportModal';

interface CustomersPageProps {
  addTrigger?: number;
}

export function CustomersPage({ addTrigger }: CustomersPageProps) {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const infoColor = getInfoColor();
  const currency = useCurrency();
  const pagination = usePagination<Customer>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  const [opened, setOpened] = useState(false);
  const [profileOpened, setProfileOpened] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState<Customer | null>(null);
  const [updatingCustomerId, setUpdatingCustomerId] = useState<string | null>(null);
  const [bulkImportOpened, setBulkImportOpened] = useState(false);

  const form = useForm({
    initialValues: {
      name: '',
      phone: '',
      email: '',
      dateOfBirth: null as Date | null,
      preferredLanguage: 'en',
      notes: '',
      address: {
        label: 'home',
        address: '',
        city: '',
        state: '',
        country: 'Iraq',
      },
    },
    validate: {
      name: (value) => (!value ? (t('customers.name', language) || 'Name') + ' is required' : null),
      phone: (value) => (!value ? (t('common.phone' as any, language) || 'Phone') + ' is required' : null),
    },
  });

  const loadCustomers = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const filters: any = {};
      if (searchQuery) filters.search = searchQuery;
      if (selectedBranchId) filters.branchId = selectedBranchId;

      const serverCustomersResponse = await customersApi.getCustomers(filters, pagination.paginationParams);
      // Handle both paginated and non-paginated responses
      const serverCustomers: Customer[] = pagination.extractData(serverCustomersResponse);
      pagination.extractPagination(serverCustomersResponse);
      
      setCustomers(serverCustomers);
    } catch (err: any) {
      const errorMsg = handleApiError(err, {
        defaultMessage: 'Failed to load customers',
        language,
        showNotification: false, // Don't show notification for load errors
      });
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId, searchQuery, pagination, language, selectedBranchId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Trigger add modal from parent
  useEffect(() => {
    if (addTrigger && addTrigger > 0) {
      handleOpenModal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTrigger]);

  const handleOpenModal = async (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      
      // Fetch full customer data with addresses
      let customerWithAddresses = customer;
      if (customer.addresses === undefined) {
        try {
          customerWithAddresses = await customersApi.getCustomerById(customer.id);
        } catch (error) {
          console.error('Failed to fetch customer addresses:', error);
          // Use the customer data we have - don't show error for optional data
        }
      }
      
      // Get the default address or first address
      const defaultAddress = customerWithAddresses.addresses?.find(addr => addr.isDefault) || 
                            customerWithAddresses.addresses?.[0];
      
      form.setValues({
        name: customerWithAddresses.name || '',
        phone: customerWithAddresses.phone,
        email: customerWithAddresses.email || '',
        dateOfBirth: customerWithAddresses.dateOfBirth ? new Date(customerWithAddresses.dateOfBirth) : null,
        preferredLanguage: customerWithAddresses.preferredLanguage || 'en',
        notes: customerWithAddresses.notes || '',
        address: defaultAddress ? {
          label: defaultAddress.addressLabel || 'home',
          address: defaultAddress.address || '',
          city: defaultAddress.city || '',
          state: defaultAddress.state || '',
          country: defaultAddress.country || 'Iraq',
        } : {
          label: 'home',
          address: '',
          city: '',
          state: '',
          country: 'Iraq',
        },
      });
    } else {
      setEditingCustomer(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setOpened(false);
    setEditingCustomer(null);
    form.reset();
  };

  const handleViewProfile = async (customer: Customer) => {
    try {
      if (navigator.onLine) {
        const fullCustomer = await customersApi.getCustomerById(customer.id);
        // Ensure averageOrderValue is calculated correctly
        if (fullCustomer.totalOrders > 0 && fullCustomer.averageOrderValue === 0) {
          fullCustomer.averageOrderValue = fullCustomer.totalSpent / fullCustomer.totalOrders;
        }
        setSelectedCustomer(fullCustomer);
      } else {
        // Calculate averageOrderValue if missing or incorrect
        const customerWithAvg = {
          ...customer,
          averageOrderValue: customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0,
        };
        setSelectedCustomer(customerWithAvg);
      }
      setProfileOpened(true);
    } catch (err: any) {
      handleApiError(err, {
        defaultMessage: 'Failed to load customer profile',
        language,
        errorColor: notificationColors.error,
      });
    }
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    flushSync(() => {
      setSubmitting(true);
    setIsSubmitting(true);
    });

    try {
      setError(null);

      if (editingCustomer) {
        // Update
        const updateDto: UpdateCustomerDto = {
          name: values.name,
          phone: values.phone,
          email: values.email || undefined,
          dateOfBirth: values.dateOfBirth ? values.dateOfBirth.toISOString().split('T')[0] : undefined,
          preferredLanguage: values.preferredLanguage,
          notes: values.notes || undefined,
        };

        setUpdatingCustomerId(editingCustomer.id);
        setOpened(false);
        setEditingCustomer(null);

        const updated = await customersApi.updateCustomer(editingCustomer.id, updateDto);
        setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('customers.updateSuccess', language),
          color: notificationColors.success,
        });
      } else {
        // Create
        const createDto: CreateCustomerDto = {
          name: values.name,
          phone: values.phone,
          email: values.email || undefined,
          dateOfBirth: values.dateOfBirth ? values.dateOfBirth.toISOString().split('T')[0] : undefined,
          preferredLanguage: values.preferredLanguage,
          notes: values.notes || undefined,
          address: values.address.address
            ? {
                label: values.address.label,
                address: values.address.address,
                city: values.address.city || undefined,
                state: values.address.state || undefined,
                country: values.address.country,
              }
            : undefined,
        };

        const tempCustomer: Customer = {
          id: 'pending',
          name: values.name,
          phone: values.phone,
          email: values.email || '',
          dateOfBirth: values.dateOfBirth ? values.dateOfBirth.toISOString().split('T')[0] : undefined,
          preferredLanguage: values.preferredLanguage,
          notes: values.notes || '',
          totalOrders: 0,
          totalSpent: 0,
          averageOrderValue: 0,
          loyaltyTier: 'regular',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tenantId: user.tenantId,
        };

        setPendingCustomer(tempCustomer);
        setOpened(false);
        setEditingCustomer(null);
        form.reset();

        const created = await customersApi.createCustomer(createDto, selectedBranchId || undefined);
        setCustomers((prev) => [created, ...prev]);

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('customers.createSuccess', language),
          color: notificationColors.success,
        });
      }

      loadCustomers();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || err.message || 'Failed to save customer';
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: notificationColors.error,
        icon: <IconAlertCircle size={16} />,
      });
      // Reopen modal on error
      if (editingCustomer) {
        setOpened(true);
        setEditingCustomer(editingCustomer);
      } else {
        setOpened(true);
      }
    } finally {
      setSubmitting(false);
      setIsSubmitting(false);
      setPendingCustomer(null);
      setUpdatingCustomerId(null);
    }
  };

  // Use customers directly since server-side pagination handles filtering
  const filteredCustomers = customers;

  const getLoyaltyTierInfo = (tier: string) => {
    // Normalize tier to lowercase for lookup
    const normalizedTier = tier.toLowerCase();
    const tierInfo = LOYALTY_TIERS[normalizedTier as keyof typeof LOYALTY_TIERS] || LOYALTY_TIERS.regular;
    
    // Try to get translation
    const translated = t(`customers.loyaltyTier.${normalizedTier}` as any, language);
    
    // Check if translation was successful (not the key itself)
    const label = translated && 
                  translated !== `customers.loyaltyTier.${normalizedTier}` &&
                  !translated.startsWith('customers.loyaltyTier.')
      ? translated 
      : tierInfo.label;
    
    return {
      ...tierInfo,
      label,
    };
  };

  if (loading && customers.length === 0) {
    return (
      <Stack gap="md">
        <Skeleton height={36} width={250} />
        <Stack gap="md">
          <Skeleton height={40} width="100%" />
          <Skeleton height={300} width="100%" />
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md">
        <Group gap="md">
          <TextInput
            placeholder={t('customers.searchPlaceholder', language)}
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={async () => {
              try {
                setExportLoading(true);
                const blob = await customersApi.exportCustomers(selectedBranchId || undefined, language);
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `customers-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                notifications.show({
                  title: t('common.success' as any, language) || 'Success',
                  message: t('bulkImport.exportSuccess', language) || 'Data exported successfully',
                  color: notificationColors.success,
                });
              } catch (error: any) {
                handleApiError(error, {
                  defaultMessage: 'Failed to export customers',
                  language,
                  errorColor: notificationColors.error,
                });
              } finally {
                setExportLoading(false);
              }
            }}
            loading={exportLoading}
            variant="light"
          >
            {t('bulkImport.export', language) || 'Export'}
          </Button>
          <Button
            leftSection={<IconFileSpreadsheet size={16} />}
            onClick={() => setBulkImportOpened(true)}
            variant="light"
          >
            {t('bulkImport.bulkImport', language) || 'Bulk Import'}
          </Button>
        </Group>
      </Paper>

      <Paper withBorder>
        <Fragment>
          <Table.ScrollContainer minWidth={800}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('customers.name', language)}</Table.Th>
                  <Table.Th>{t('common.phone' as any, language)}</Table.Th>
                  <Table.Th>{t('customers.totalOrders', language)}</Table.Th>
                  <Table.Th>{t('customers.totalSpent', language)}</Table.Th>
                  <Table.Th>{t('customers.loyaltyTierLabel', language)}</Table.Th>
                  <Table.Th>{t('customers.lastOrder', language)}</Table.Th>
                  <Table.Th>{t('common.actions' as any, language)}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pendingCustomer && (
                  <Table.Tr>
                    <Table.Td>
                      <Group gap="xs">
                        <Loader size="sm" />
                        <Skeleton height={20} width={150} />
                      </Group>
                      <Skeleton height={12} width={200} mt={4} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={20} width={120} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={24} width={40} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={20} width={80} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={24} width={100} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={20} width={100} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={32} width={80} />
                    </Table.Td>
                  </Table.Tr>
                )}
                {filteredCustomers.length === 0 && !pendingCustomer ? (
                  <Table.Tr>
                    <Table.Td colSpan={7} ta="center" py="xl">
                      <Text c="dimmed">{t('customers.noCustomers', language)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filteredCustomers.map((customer) => {
                    const tierInfo = getLoyaltyTierInfo(customer.loyaltyTier);
                    const isUpdating = updatingCustomerId === customer.id;
                    
                    if (isUpdating) {
                      return (
                        <Table.Tr key={customer.id}>
                          <Table.Td>
                            <Group gap="xs">
                              <Loader size="sm" />
                              <Skeleton height={20} width={150} />
                            </Group>
                            <Skeleton height={12} width={200} mt={4} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={20} width={120} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={24} width={40} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={20} width={80} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={24} width={100} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={20} width={100} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={32} width={80} />
                          </Table.Td>
                        </Table.Tr>
                      );
                    }
                    
                    return (
                      <Table.Tr key={customer.id}>
                        <Table.Td>
                          <Text fw={500}>
                            {customer.name || ''}
                          </Text>
                          {customer.email && (
                            <Text size="xs" c="dimmed">
                              {customer.email}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>{customer.phone}</Table.Td>
                        <Table.Td>
                        <Badge color={getBadgeColorForText(String(customer.totalOrders))} variant="light">
                          {customer.totalOrders}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={500}>
                          {formatCurrency(customer.totalSpent, currency)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={getBadgeColorForText(tierInfo.label)} variant="light" leftSection={<IconTrophy size={12} />}>
                          {tierInfo.label}
                          {tierInfo.discount > 0 && ` (${tierInfo.discount}%)`}
                        </Badge>
                      </Table.Td>
 
                        <Table.Td>
                          {customer.lastOrderDate
                            ? new Date(customer.lastOrderDate).toLocaleDateString(language === 'ar' ? 'ar' : 'en')
                            : '-'}
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <ActionIcon
                              variant="subtle"
                              color={primaryColor}
                              onClick={() => handleViewProfile(customer)}
                              disabled={updatingCustomerId === customer.id}
                            >
                              <IconUser size={16} />
                            </ActionIcon>
                            <ActionIcon 
                              variant="subtle" 
                              color={primaryColor} 
                              onClick={() => handleOpenModal(customer)}
                              disabled={updatingCustomerId === customer.id}
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          
          {/* Pagination Controls */}
          {pagination.total > 0 && (
            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              limit={pagination.limit}
              total={pagination.total}
              onPageChange={(page) => {
                pagination.setPage(page);
              }}
              onLimitChange={(newLimit) => {
                pagination.setLimit(newLimit);
                pagination.setPage(1);
              }}
            />
          )}
        </Fragment>
      </Paper>

      {/* Create/Edit Modal */}
      <Modal
        opened={opened}
        onClose={handleCloseModal}
        title={editingCustomer ? t('customers.editCustomer', language) : t('customers.addCustomer', language)}
        size="lg"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('customers.name', language) || 'Name'} required {...form.getInputProps('name')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('common.phone' as any, language)} required {...form.getInputProps('phone')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('common.email' as any, language)} type="email" {...form.getInputProps('email')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <DateInput
                  label={t('customers.dateOfBirth', language)}
                  valueFormat="YYYY-MM-DD"
                  {...form.getInputProps('dateOfBirth')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label={t('customers.preferredLanguage', language)}
                  data={[
                    { value: 'en', label: t('common.english' as any, language) || 'English' },
                    { value: 'ar', label: t('common.arabic' as any, language) || 'Arabic' },
                  ]}
                  {...form.getInputProps('preferredLanguage')}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput label={t('customers.notes', language)} {...form.getInputProps('notes')} />
              </Grid.Col>
              <Grid.Col span={12}>
                <Divider label={t('customers.deliveryAddress', language)} labelPosition="left" my="md" />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput
                  label={t('customers.address', language) || 'Address'}
                  {...form.getInputProps('address.address')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('customers.city', language)} {...form.getInputProps('address.city')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('customers.country', language)} {...form.getInputProps('address.country')} />
              </Grid.Col>
            </Grid>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={handleCloseModal} disabled={submitting}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" loading={submitting} disabled={submitting}>
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Customer Profile Modal */}
      <Modal
        opened={profileOpened}
        onClose={() => setProfileOpened(false)}
        title={t('customers.customerProfile', language)}
        size="xl"
      >
        {selectedCustomer && (
          <Tabs defaultValue="overview">
            <Tabs.List>
              <Tabs.Tab value="overview" leftSection={<IconUser size={16} />}>
                {t('customers.overview', language)}
              </Tabs.Tab>
              <Tabs.Tab value="orders" leftSection={<IconShoppingBag size={16} />}>
                {t('customers.orderHistory', language)} ({selectedCustomer.orderHistory?.length || 0})
              </Tabs.Tab>
              <Tabs.Tab value="addresses" leftSection={<IconMapPin size={16} />}>
                {t('customers.addresses', language)}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="overview" pt="md">
              <Stack gap="md">
                <Grid>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card withBorder p="md">
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('customers.name', language)}
                      </Text>
                      <Text fw={500}>
                        {selectedCustomer.name || ''}
                      </Text>
                    </Card>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card withBorder p="md">
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('common.phone' as any, language)}
                      </Text>
                      <Text fw={500}>{selectedCustomer.phone}</Text>
                    </Card>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card withBorder p="md">
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('customers.loyaltyTierLabel', language)}
                      </Text>
                      {(() => {
                        const tierInfo = getLoyaltyTierInfo(selectedCustomer.loyaltyTier);
                        return (
                          <Badge color={getBadgeColorForText(tierInfo.label)} variant="light" size="lg" leftSection={<IconTrophy size={14} />}>
                            {tierInfo.label}
                            {tierInfo.discount > 0 && ` (${tierInfo.discount}% ${t('customers.discount', language)})`}
                          </Badge>
                        );
                      })()}
                    </Card>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card withBorder p="md">
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('customers.totalOrders', language)}
                      </Text>
                      <Text fw={500} size="xl" c={primaryColor}>
                        {selectedCustomer.totalOrders || 0}
                      </Text>
                    </Card>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card withBorder p="md">
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('customers.totalSpent', language)}
                      </Text>
                      <Text fw={500} size="xl" c={successColor}>
                        {formatCurrency(selectedCustomer.totalSpent || 0, currency)}
                      </Text>
                    </Card>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card withBorder p="md">
                      <Text size="sm" c="dimmed" mb="xs">
                        {t('customers.averageOrderValue', language)}
                      </Text>
                      <Text fw={500} size="xl">
                        {(() => {
                          const totalOrders = selectedCustomer.totalOrders || 0;
                          const totalSpent = selectedCustomer.totalSpent || 0;
                          const avgValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
                          return formatCurrency(avgValue, currency);
                        })()}
                      </Text>
                    </Card>
                  </Grid.Col>
                </Grid>

                {/* Loyalty Tier Information */}
                <Card withBorder p="md" mt="md">
                  <Group mb="md">
                    <IconInfoCircle size={20} />
                    <Text fw={600} size="lg">
                      {t('customers.loyaltyTierInfo', language) || 'Loyalty Tier Information'}
                    </Text>
                  </Group>
                  
                  {/* Current Tier Progress */}
                  {(() => {
                    const currentOrders = selectedCustomer.totalOrders || 0;
                    const currentTier = selectedCustomer.loyaltyTier;
                    const tierInfo = getLoyaltyTierInfo(currentTier);
                    
                    // Calculate next tier requirements
                    let nextTier: { name: string; orders: number; discount: number } | null = null;
                    if (currentTier === 'regular') {
                      nextTier = { name: 'Silver', orders: 3, discount: 5 };
                    } else if (currentTier === 'silver') {
                      nextTier = { name: 'Gold', orders: 51, discount: 10 };
                    } else if (currentTier === 'gold') {
                      nextTier = { name: 'Platinum', orders: 100, discount: 15 };
                    }
                    
                    return (
                      <Stack gap="md">
                        {nextTier && (
                          <Alert color={primaryColor} variant="light">
                            <Text size="sm" fw={500} mb={4}>
                              {t('customers.nextTier', language) || 'Next Tier'}: {nextTier.name} ({nextTier.discount}% {t('customers.discount', language)})
                            </Text>
                            <Text size="sm" c="dimmed">
                              {t('customers.ordersNeeded', language) || 'Orders needed'}: {Math.max(0, nextTier.orders - currentOrders)} {t('customers.moreOrders', language) || 'more orders'}
                            </Text>
                          </Alert>
                        )}
                        
                        {/* Tier Table */}
                        <Table>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>{t('customers.loyaltyTierLabel', language)}</Table.Th>
                              <Table.Th>{t('customers.ordersRequired', language) || 'Orders Required'}</Table.Th>
                              <Table.Th>{t('customers.discount', language)}</Table.Th>
                              <Table.Th>{t('customers.status', language)}</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            <Table.Tr style={{ backgroundColor: currentTier === 'regular' ? 'var(--mantine-color-blue-0)' : undefined }}>
                              <Table.Td>
                                <Group gap="xs">
                                  <IconTrophy size={16} color={primaryColor} />
                                  <Text fw={currentTier === 'regular' ? 600 : 400}>
                                    {t('customers.loyaltyTier.regular' as any, language) || 'Regular'}
                                  </Text>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Text>0-2</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text>0%</Text>
                              </Table.Td>
                              <Table.Td>
                                {currentTier === 'regular' && (
                                  <Badge color={getBadgeColorForText(t('customers.current', language) || 'Current')} variant="light" size="sm">
                                    {t('customers.current', language) || 'Current'}
                                  </Badge>
                                )}
                              </Table.Td>
                            </Table.Tr>
                            <Table.Tr style={{ backgroundColor: currentTier === 'silver' ? 'var(--mantine-color-blue-0)' : undefined }}>
                              <Table.Td>
                                <Group gap="xs">
                                  <IconTrophy size={16} color={primaryColor} />
                                  <Text fw={currentTier === 'silver' ? 600 : 400}>
                                    {t('customers.loyaltyTier.silver' as any, language) || 'Silver'}
                                  </Text>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Text>3-50</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text>5%</Text>
                              </Table.Td>
                              <Table.Td>
                                {currentTier === 'silver' && (
                                  <Badge color={getBadgeColorForText(t('customers.current', language) || 'Current')} variant="light" size="sm">
                                    {t('customers.current', language) || 'Current'}
                                  </Badge>
                                )}
                              </Table.Td>
                            </Table.Tr>
                            <Table.Tr style={{ backgroundColor: currentTier === 'gold' ? 'var(--mantine-color-blue-0)' : undefined }}>
                              <Table.Td>
                                <Group gap="xs">
                                  <IconTrophy size={16} color={primaryColor} />
                                  <Text fw={currentTier === 'gold' ? 600 : 400}>
                                    {t('customers.loyaltyTier.gold' as any, language) || 'Gold'}
                                  </Text>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Text>51-99</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text>10%</Text>
                              </Table.Td>
                              <Table.Td>
                                {currentTier === 'gold' && (
                                  <Badge color={getBadgeColorForText(t('customers.current', language) || 'Current')} variant="light" size="sm">
                                    {t('customers.current', language) || 'Current'}
                                  </Badge>
                                )}
                              </Table.Td>
                            </Table.Tr>
                            <Table.Tr style={{ backgroundColor: currentTier === 'platinum' ? 'var(--mantine-color-blue-0)' : undefined }}>
                              <Table.Td>
                                <Group gap="xs">
                                  <IconTrophy size={16} color={primaryColor} />
                                  <Text fw={currentTier === 'platinum' ? 600 : 400}>
                                    {t('customers.loyaltyTier.platinum' as any, language) || 'Platinum'}
                                  </Text>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Text>100+</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text>15%</Text>
                              </Table.Td>
                              <Table.Td>
                                {currentTier === 'platinum' && (
                                  <Badge color={getBadgeColorForText(t('customers.current', language) || 'Current')} variant="light" size="sm">
                                    {t('customers.current', language) || 'Current'}
                                  </Badge>
                                )}
                              </Table.Td>
                            </Table.Tr>
                          </Table.Tbody>
                        </Table>
                      </Stack>
                    );
                  })()}
                </Card>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="orders" pt="md">
              {selectedCustomer.orderHistory && selectedCustomer.orderHistory.length > 0 ? (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('customers.orderNumber', language)}</Table.Th>
                      <Table.Th>{t('customers.orderType', language)}</Table.Th>
                      <Table.Th>{t('customers.status', language)}</Table.Th>
                      <Table.Th>{t('customers.amount', language)}</Table.Th>
                      <Table.Th>{t('customers.date', language)}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {selectedCustomer.orderHistory.map((order) => (
                      <Table.Tr key={order.id}>
                        <Table.Td>{order.orderNumber}</Table.Td>
                        <Table.Td>
                          <Badge color={getBadgeColorForText(t(`orders.orderType.${order.orderType}` as any, language) || order.orderType)} variant="light">
                            {t(`orders.orderType.${order.orderType}` as any, language) || order.orderType}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            color={getBadgeColorForText(t(`orders.status.${order.status}` as any, language) || order.status)}
                            variant="light"
                          >
                            {t(`orders.status.${order.status}` as any, language) || order.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={500}>
                            {formatCurrency(order.totalAmount, currency)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {new Date(order.orderDate).toLocaleDateString(language === 'ar' ? 'ar' : 'en', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text c="dimmed" ta="center" py="xl">
                  {t('customers.noOrders', language)}
                </Text>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="addresses" pt="md">
              {selectedCustomer.addresses && selectedCustomer.addresses.length > 0 ? (
                <Stack gap="md">
                  {selectedCustomer.addresses.map((address) => (
                    <Card key={address.id} withBorder p="md">
                      <Group justify="space-between" mb="xs">
                        <Text fw={500}>
                          {address.addressLabel ? t(`customers.addressLabel.${address.addressLabel}` as any, language) || address.addressLabel : t('customers.address', language)}
                          {address.isDefault && (
                            <Badge color={getBadgeColorForText(t('customers.default', language))} variant="light" ml="xs" size="xs">
                              {t('customers.default', language)}
                            </Badge>
                          )}
                        </Text>
                      </Group>
                      <Text size="sm">
                        {address.address}
                      </Text>
                      {(address.city || address.state || address.country) && (
                        <Text size="xs" c="dimmed" mt="xs">
                          {[address.city, address.state, address.country].filter(Boolean).join(', ')}
                        </Text>
                      )}
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed" ta="center" py="xl">
                  {t('customers.noAddresses', language)}
                </Text>
              )}
            </Tabs.Panel>
          </Tabs>
        )}
        </Modal>

        <BulkImportModal
          opened={bulkImportOpened}
          onClose={() => setBulkImportOpened(false)}
          onSuccess={() => {
            loadCustomers();
          }}
          entityType="customer"
          entityName={t('customers.customers', language) || 'Customers'}
          downloadSample={async () => {
            return await customersApi.downloadBulkImportSample(language);
          }}
          uploadFile={async (file: File) => {
            return await customersApi.bulkImportCustomers(file, selectedBranchId || undefined);
          }}
        />
      </Stack>
    );
  }

