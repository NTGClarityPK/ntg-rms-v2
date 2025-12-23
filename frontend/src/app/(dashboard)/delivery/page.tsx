'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Chip,
  TextInput,
  Select,
  Button,
  Group,
  Stack,
  Card,
  Text,
  Badge,
  ActionIcon,
  Title,
  Menu,
  Paper,
  Box,
  Grid,
  Center,
  Skeleton,
  Modal,
  NumberInput,
  Textarea,
} from '@mantine/core';
import {
  IconSearch,
  IconDotsVertical,
  IconRefresh,
  IconTruck,
  IconUser,
  IconMapPin,
  IconClock,
  IconCheck,
  IconX,
  IconEdit,
  IconEye,
  IconBan,
  IconRotateClockwise,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import {
  deliveryApi,
  DeliveryOrder,
  DeliveryStatus,
  DeliveryPersonnel,
  AssignDeliveryDto,
} from '@/lib/api/delivery';
import { restaurantApi } from '@/lib/api/restaurant';
import { customersApi, Customer } from '@/lib/api/customers';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getStatusColor, getSuccessColor, getErrorColor, getInfoColor } from '@/lib/utils/theme';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useDateFormat } from '@/lib/hooks/use-date-format';
import { useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';

dayjs.extend(relativeTime);

export default function DeliveryPage() {
  const { language } = useLanguageStore();
  const { formatDateTime } = useDateFormat();
  const currency = useCurrency();
  const errorColor = useThemeColor();
  const successColor = useSuccessColor();
  const infoColor = getInfoColor();
  const pagination = usePagination<DeliveryOrder>({ initialPage: 1, initialLimit: 10 });
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const [personnel, setPersonnel] = useState<DeliveryPersonnel[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null);
  const [assignModalOpened, { open: openAssignModal, close: closeAssignModal }] = useDisclosure(false);
  const [detailsModalOpened, { open: openDetailsModal, close: closeDetailsModal }] = useDisclosure(false);
  const [assigningDelivery, setAssigningDelivery] = useState(false);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>('');
  const [estimatedTime, setEstimatedTime] = useState<Date | null>(null);

  const loadBranches = useCallback(async () => {
    try {
      const data = await restaurantApi.getBranches();
      setBranches(
        data.map((b) => ({
          value: b.id,
          label: b.name,
        }))
      );
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  }, []);

  const loadPersonnel = useCallback(async () => {
    try {
      const data = await deliveryApi.getAvailableDeliveryPersonnel(selectedBranch || undefined);
      setPersonnel(data);
    } catch (error) {
      console.error('Failed to load delivery personnel:', error);
    }
  }, [selectedBranch]);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const response = await customersApi.getCustomers();
      const customerData = Array.isArray(response) ? response : response.data || [];
      setCustomers(customerData);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  const loadDeliveries = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      // If multiple statuses selected or none selected, fetch all and filter client-side
      // If single status selected, pass it to API for server-side filtering
      const status = selectedStatuses.length === 1 
        ? (selectedStatuses[0] as DeliveryStatus)
        : undefined;
      const response = await deliveryApi.getDeliveryOrders({
        status,
        branchId: selectedBranch || undefined,
        deliveryPersonId: selectedDeliveryPerson || undefined,
        ...pagination.paginationParams,
      });
      
      const deliveryData = pagination.extractData(response);
      pagination.extractPagination(response);
      
      setDeliveries(deliveryData);
    } catch (error: any) {
      if (!silent) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('delivery.loadError' as any, language) || 'Failed to load deliveries',
        color: getErrorColor(),
      });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [selectedStatuses, selectedBranch, selectedDeliveryPerson, language, pagination]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    loadPersonnel();
  }, [loadPersonnel]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatuses, selectedBranch, selectedDeliveryPerson, pagination.page, pagination.limit]);

  const handleAssignDelivery = async () => {
    if (!selectedDelivery || !selectedPersonnelId) {
      notifications.show({
        title: t('common.error' as any, language),
        message: t('delivery.selectPersonnel' as any, language) || 'Please select delivery personnel',
        color: getErrorColor(),
      });
      return;
    }

    setAssigningDelivery(true);
    try {
      const assignDto: AssignDeliveryDto = {
        orderId: selectedDelivery.orderId,
        deliveryPersonId: selectedPersonnelId,
        estimatedDeliveryTime: estimatedTime ? estimatedTime.toISOString() : undefined,
      };

      await deliveryApi.assignDelivery(assignDto);
      notifications.show({
        title: t('common.success' as any, language),
        message: t('delivery.assignedSuccess' as any, language) || 'Delivery assigned successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
      closeAssignModal();
      setSelectedPersonnelId('');
      setEstimatedTime(null);
      loadDeliveries();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('delivery.assignError' as any, language) || 'Failed to assign delivery',
        color: getErrorColor(),
      });
    } finally {
      setAssigningDelivery(false);
    }
  };

  const handleUpdateStatus = async (delivery: DeliveryOrder, newStatus: DeliveryStatus) => {
    try {
      await deliveryApi.updateDeliveryStatus(delivery.id, { status: newStatus });
      notifications.show({
        title: t('common.success' as any, language),
        message: t('delivery.statusUpdated' as any, language) || 'Delivery status updated',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
      loadDeliveries();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('delivery.updateError' as any, language) || 'Failed to update status',
        color: getErrorColor(),
      });
    }
  };

  const handleOpenAssignModal = (delivery: DeliveryOrder) => {
    setSelectedDelivery(delivery);
    openAssignModal();
  };

  const getStatusColorForBadge = (status: DeliveryStatus): string => {
    const statusColors: Record<DeliveryStatus, string> = {
      pending: 'gray',
      assigned: infoColor,
      out_for_delivery: 'orange',
      delivered: successColor,
      cancelled: errorColor,
    };
    return statusColors[status] || 'gray';
  };

  const getStatusLabel = (status: DeliveryStatus): string => {
    return t(`delivery.status.${status}` as any, language) || status;
  };

  const filteredDeliveries = deliveries.filter((delivery) => {
    // Apply status filter (multi-select)
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(delivery.status)) {
      return false;
    }

    // Apply customer filter
    if (selectedCustomer) {
      if (selectedCustomer === 'walkIN') {
        // Walk-in customers: have delivery address/notes but no customerId
        const hasAddress = delivery.customerAddress || delivery.notes;
        if (delivery.order?.customerId || delivery.order?.customer || !hasAddress) {
          return false;
        }
      } else if (selectedCustomer === 'others') {
        // Others: no customer and no delivery address (or other edge cases)
        const hasAddress = delivery.customerAddress || delivery.notes;
        if (delivery.order?.customerId || delivery.order?.customer || hasAddress) {
          return false;
        }
      } else {
        // Specific customer: must match customerId
        if (delivery.order?.customerId !== selectedCustomer) {
          return false;
        }
      }
    }

    // Apply search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      delivery.order?.orderNumber.toLowerCase().includes(query) ||
      delivery.order?.tokenNumber?.toLowerCase().includes(query) ||
      delivery.order?.customer?.name?.toLowerCase().includes(query) ||
      delivery.order?.customer?.phone?.includes(query) ||
      delivery.deliveryPerson?.name?.toLowerCase().includes(query)
    );
  });

  return (
    <>
      <div className="page-title-bar">
        <Group justify="space-between" align="center" style={{ width: '100%', height: '100%' }}>
          <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
            {t('delivery.title' as any, language) || 'Delivery Management'}
          </Title>
          <ActionIcon
            variant="light"
            size="lg"
            onClick={() => loadDeliveries(false)}
            loading={loading}
            title={t('common.refresh' as any, language)}
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <Stack gap="md">
          {/* Filters */}
          <Paper p="md" withBorder>
          <Grid>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <TextInput
                placeholder={t('common.search' as any, language)}
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Select
                placeholder={t('delivery.filterByBranch' as any, language) || 'Filter by Branch'}
                data={branches}
                value={selectedBranch}
                onChange={setSelectedBranch}
                clearable
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Select
                placeholder={t('delivery.filterByPersonnel' as any, language) || 'Filter by Personnel'}
                data={personnel.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
                value={selectedDeliveryPerson}
                onChange={setSelectedDeliveryPerson}
                clearable
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Select
                placeholder={
                  loadingCustomers
                    ? (t('common.loading' as any, language) || 'Loading...')
                    : (t('delivery.filterByCustomer' as any, language) || 'Filter by Customer')
                }
                data={[
                  { value: 'walkIN', label: t('pos.walkInCustomer', language) || 'Walk-in Customer' },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
                value={selectedCustomer}
                onChange={setSelectedCustomer}
                clearable
                searchable
                nothingFoundMessage={t('common.noResults' as any, language) || 'No customers found'}
                disabled={loadingCustomers}
              />
            </Grid.Col>
          </Grid>
        </Paper>

        {/* Status Filter Chips */}
        <Paper p="sm" withBorder>
          <Group gap="xs" wrap="wrap" className="filter-chip-group">
            <Chip
              checked={selectedStatuses.length === 0}
              onChange={() => setSelectedStatuses([])}
              variant="filled"
            >
              {t('delivery.allDeliveries' as any, language) || 'All Deliveries'}
            </Chip>
            <Chip.Group multiple value={selectedStatuses} onChange={setSelectedStatuses}>
              <Group gap="xs" wrap="wrap">
                <Chip value="pending" variant="filled">
                  {t('delivery.pending' as any, language) || 'Pending'}
                </Chip>
                <Chip value="assigned" variant="filled">
                  {t('delivery.assigned' as any, language) || 'Assigned'}
                </Chip>
                <Chip value="out_for_delivery" variant="filled">
                  {t('delivery.outForDelivery' as any, language) || 'Out for Delivery'}
                </Chip>
                <Chip value="delivered" variant="filled">
                  {t('delivery.delivered' as any, language) || 'Delivered'}
                </Chip>
                <Chip value="cancelled" variant="filled">
                  {t('delivery.cancelled' as any, language) || 'Cancelled'}
                </Chip>
              </Group>
            </Chip.Group>
          </Group>
        </Paper>

        {/* Deliveries List */}
        <Box>
            {loading ? (
              <Stack gap="md">
                {[1, 2].map((i) => (
                  <Card key={i} withBorder p="md">
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Skeleton height={24} width="30%" />
                        <Skeleton height={20} width="15%" />
                        <Skeleton height={20} width="15%" />
                      </Group>
                      <Skeleton height={16} width="40%" />
                      <Skeleton height={16} width="50%" />
                    </Stack>
                  </Card>
                ))}
              </Stack>
            ) : filteredDeliveries.length === 0 ? (
              <Center py="xl">
                <Text c="dimmed">{t('delivery.noDeliveries' as any, language) || 'No deliveries found'}</Text>
              </Center>
            ) : (
              <Stack gap="sm">
                {filteredDeliveries.map((delivery) => (
                  <Card key={delivery.id} withBorder p="md">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap="xs" style={{ flex: 1 }}>
                        <Group gap="md">
                          <Text fw={600} size="lg">
                            {t('pos.orderNumber', language)}: {delivery.order?.orderNumber}
                          </Text>
                          {delivery.order?.tokenNumber && (
                            <Text c="dimmed">
                              {t('pos.tokenNumber', language)}: {delivery.order.tokenNumber}
                            </Text>
                          )}
                          <Badge variant="light" color={getStatusColorForBadge(delivery.status)}>
                            {getStatusLabel(delivery.status)}
                          </Badge>
                        </Group>
                        <Group gap="md" align="flex-start">
                          {delivery.order?.customer && (
                            <Group gap="xs">
                              <IconUser size={16} />
                              <Text size="sm" c="dimmed">
                                {delivery.order.customer.name}
                                {delivery.order.customer.phone && ` - ${delivery.order.customer.phone}`}
                              </Text>
                            </Group>
                          )}
                          {(delivery.customerAddress || delivery.notes) && (
                            <Group gap="xs">
                              <IconMapPin size={16} />
                              <Text size="sm" c="dimmed">
                                {delivery.customerAddress
                                  ? (() => {
                                      // Show address
                                      const address = delivery.customerAddress.address || delivery.customerAddress.addressLine1;
                                      const city = delivery.customerAddress.city;
                                      const state = delivery.customerAddress.state;
                                      const country = delivery.customerAddress.country;
                                      
                                      const parts = [address];
                                      if (city) parts.push(city);
                                      if (state) parts.push(state);
                                      if (country) parts.push(country);
                                      
                                      return parts.join(', ');
                                    })()
                                  : (() => {
                                      // Parse address notes (can be JSON or legacy format)
                                      if (!delivery.notes) return '';
                                      
                                      try {
                                        // Try to parse as JSON first (new format)
                                        const addressData = JSON.parse(delivery.notes);
                                        const address = addressData.address || '';
                                        const city = addressData.city;
                                        const state = addressData.state;
                                        const country = addressData.country;
                                        
                                        const parts = [address];
                                        if (city) parts.push(city);
                                        if (state) parts.push(state);
                                        if (country) parts.push(country);
                                        
                                        return parts.join(', ');
                                      } catch {
                                        // Legacy format - remove labels and return as-is
                                        return delivery.notes
                                          .replace(/EN:\s*/g, '')
                                          .replace(/AR:\s*/g, '')
                                          .replace(/City:\s*/g, '')
                                          .replace(/State:\s*/g, '')
                                          .replace(/Country:\s*/g, '')
                                          .trim();
                                      }
                                    })()}
                              </Text>
                            </Group>
                          )}
                          {delivery.deliveryPerson && (
                            <Group gap="xs">
                              <IconTruck size={16} />
                              <Text size="sm" c="dimmed">
                                {t('delivery.assignedTo' as any, language) || 'Assigned to'}:{' '}
                                {delivery.deliveryPerson.name}
                              </Text>
                            </Group>
                          )}
                          {delivery.estimatedDeliveryTime && (
                            <Group gap="xs">
                              <IconClock size={16} />
                              <Text size="sm" c="dimmed">
                                {t('delivery.estimatedTime' as any, language) || 'ETA'}:{' '}
                                {formatDateTime(delivery.estimatedDeliveryTime)}
                              </Text>
                            </Group>
                          )}
                        </Group>
                        <Group gap="md">
                          <Text size="sm" fw={500}>
                            {t('pos.totalAmount' as any, language)}: {formatCurrency(delivery.order?.totalAmount || 0, currency)}
                          </Text>
                          {delivery.deliveryCharge > 0 && (
                            <Text size="sm" c="dimmed">
                              {t('delivery.deliveryCharge' as any, language) || 'Delivery Charge'}:{' '}
                              {formatCurrency(delivery.deliveryCharge, currency)}
                            </Text>
                          )}
                        </Group>
                      </Stack>
                      <Menu>
                        <Menu.Target>
                          <ActionIcon variant="subtle">
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {delivery.status === 'pending' && (
                            <Menu.Item
                              leftSection={<IconEdit size={16} />}
                              onClick={() => handleOpenAssignModal(delivery)}
                            >
                              {t('delivery.assign' as any, language) || 'Assign Delivery'}
                            </Menu.Item>
                          )}
                          {delivery.status === 'assigned' && (
                            <Menu.Item
                              leftSection={<IconTruck size={16} />}
                              onClick={() => handleUpdateStatus(delivery, 'out_for_delivery')}
                            >
                              {t('delivery.markOutForDelivery' as any, language) || 'Mark Out for Delivery'}
                            </Menu.Item>
                          )}
                          {delivery.status === 'out_for_delivery' && (
                            <Menu.Item
                              leftSection={<IconCheck size={16} />}
                              onClick={() => handleUpdateStatus(delivery, 'delivered')}
                            >
                              {t('delivery.markDelivered' as any, language) || 'Mark as Delivered'}
                            </Menu.Item>
                          )}
                          {delivery.status === 'cancelled' && (
                            <Menu.Item
                              leftSection={<IconRotateClockwise size={16} />}
                              onClick={() => handleUpdateStatus(delivery, 'pending')}
                              color={getInfoColor()}
                            >
                              {t('delivery.restoreToPending' as any, language) || 'Restore to Pending'}
                            </Menu.Item>
                          )}
                          {delivery.status !== 'cancelled' && delivery.status !== 'delivered' && (
                            <Menu.Item
                              leftSection={<IconBan size={16} />}
                              onClick={() => handleUpdateStatus(delivery, 'cancelled')}
                              color={errorColor}
                            >
                              {t('delivery.cancelDelivery' as any, language) || 'Cancel Delivery'}
                            </Menu.Item>
                          )}
                          <Menu.Item
                            leftSection={<IconEye size={16} />}
                            onClick={() => {
                              setSelectedDelivery(delivery);
                              openDetailsModal();
                            }}
                          >
                            {t('common.view' as any, language)}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}
            
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
          </Box>
        </Stack>
      </div>

      {/* Assign Delivery Modal */}
      <Modal
        opened={assignModalOpened}
        onClose={closeAssignModal}
        title={t('delivery.assignDelivery' as any, language) || 'Assign Delivery'}
        size="md"
      >
        <Stack gap="md">
          {selectedDelivery && (
            <>
              <Text size="sm" c="dimmed">
                {t('pos.orderNumber', language)}: {selectedDelivery.order?.orderNumber}
              </Text>
              <Select
                label={t('delivery.selectPersonnel' as any, language) || 'Select Delivery Personnel'}
                placeholder={t('delivery.selectPersonnel' as any, language) || 'Select Delivery Personnel'}
                data={personnel.map((p) => ({
                  value: p.id,
                  label: `${p.name} ${
                    p.activeDeliveriesCount > 0 ? `(${p.activeDeliveriesCount} active)` : ''
                  }`,
                }))}
                value={selectedPersonnelId}
                onChange={(value) => setSelectedPersonnelId(value || '')}
                required
                searchable
              />
              <Group justify="flex-end" mt="md">
                <Button variant="subtle" onClick={closeAssignModal}>
                  {t('common.cancel' as any, language)}
                </Button>
                <Button onClick={handleAssignDelivery} loading={assigningDelivery}>
                  {t('delivery.assign' as any, language) || 'Assign'}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      {/* Delivery Details Modal */}
      <Modal
        opened={detailsModalOpened}
        onClose={closeDetailsModal}
        title={t('delivery.details' as any, language) || 'Delivery Details'}
        size="lg"
      >
        {selectedDelivery && (
          <Stack gap="md">
            <Paper p="md" withBorder>
              <Text fw={600} size="lg" mb="md">
                {t('delivery.orderInfo' as any, language) || 'Order Information'}
              </Text>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t('pos.orderNumber', language)}:
                  </Text>
                  <Text size="sm" fw={500}>
                    {selectedDelivery.order?.orderNumber}
                  </Text>
                </Group>
                {selectedDelivery.order?.customer && (
                  <>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        {t('customers.customer' as any, language) || 'Customer'}:
                      </Text>
                      <Text size="sm" fw={500}>
                        {selectedDelivery.order.customer.name}
                      </Text>
                    </Group>
                    {selectedDelivery.order.customer.phone && (
                      <Group justify="space-between">
                        <Text size="sm" c="dimmed">
                          {t('common.phone' as any, language)}:
                        </Text>
                        <Text size="sm" fw={500}>
                          {selectedDelivery.order.customer.phone}
                        </Text>
                      </Group>
                    )}
                  </>
                )}
                {(selectedDelivery.customerAddress || selectedDelivery.notes) && (
                  <>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        {t('delivery.address' as any, language) || 'Address'}:
                      </Text>
                      <Text size="sm" fw={500} style={{ textAlign: 'right', maxWidth: '60%' }}>
                        {selectedDelivery.customerAddress
                          ? (() => {
                              // Show address
                              const address = selectedDelivery.customerAddress.address || selectedDelivery.customerAddress.addressLine1;
                              const city = selectedDelivery.customerAddress.city;
                              const state = selectedDelivery.customerAddress.state;
                              const country = selectedDelivery.customerAddress.country;
                              
                              const parts = [address];
                              if (city) parts.push(city);
                              if (state) parts.push(state);
                              if (country) parts.push(country);
                              
                              return parts.join(', ');
                            })()
                          : (() => {
                              // Parse address notes (can be JSON or legacy format)
                              if (!selectedDelivery.notes) return '';
                              
                              try {
                                // Try to parse as JSON first (new format)
                                const addressData = JSON.parse(selectedDelivery.notes);
                                const address = addressData.address || '';
                                const city = addressData.city;
                                const state = addressData.state;
                                const country = addressData.country;
                                
                                const parts = [address];
                                if (city) parts.push(city);
                                if (state) parts.push(state);
                                if (country) parts.push(country);
                                
                                return parts.join(', ');
                              } catch {
                                // Legacy format - remove labels and return as-is
                                return selectedDelivery.notes
                                  .replace(/EN:\s*/g, '')
                                  .replace(/AR:\s*/g, '')
                                  .replace(/City:\s*/g, '')
                                  .replace(/State:\s*/g, '')
                                  .replace(/Country:\s*/g, '')
                                  .trim();
                              }
                            })()}
                      </Text>
                    </Group>
                  </>
                )}
                {selectedDelivery.deliveryPerson && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {t('delivery.assignedTo' as any, language) || 'Assigned to'}:
                    </Text>
                    <Text size="sm" fw={500}>
                      {selectedDelivery.deliveryPerson.name}
                    </Text>
                  </Group>
                )}
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t('delivery.status' as any, language) || 'Status'}:
                  </Text>
                  <Badge variant="light" color={getStatusColorForBadge(selectedDelivery.status)}>
                    {getStatusLabel(selectedDelivery.status)}
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t('pos.totalAmount' as any, language)}:
                  </Text>
                  <Text size="sm" fw={600}>
                    {formatCurrency(selectedDelivery.order?.totalAmount || 0, currency)}
                  </Text>
                </Group>
                {selectedDelivery.deliveryCharge > 0 && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {t('delivery.deliveryCharge' as any, language) || 'Delivery Charge'}:
                    </Text>
                    <Text size="sm" fw={500}>
                      {formatCurrency(selectedDelivery.deliveryCharge, currency)}
                    </Text>
                  </Group>
                )}
              </Stack>
            </Paper>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeDetailsModal}>
                {t('common.cancel' as any, language)}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
