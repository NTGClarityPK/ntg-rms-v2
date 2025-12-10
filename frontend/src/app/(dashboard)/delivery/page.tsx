'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Tabs,
  TextInput,
  Select,
  Button,
  Group,
  Stack,
  Card,
  Text,
  Badge,
  ActionIcon,
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
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getStatusColor, getSuccessColor, getErrorColor, getInfoColor } from '@/lib/utils/theme';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCurrency } from '@/lib/hooks/use-currency';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useDateFormat } from '@/lib/hooks/use-date-format';
import { useSuccessColor } from '@/lib/hooks/use-theme-colors';

dayjs.extend(relativeTime);

type DeliveryTab = 'all' | 'pending' | 'assigned' | 'out_for_delivery' | 'delivered' | 'cancelled';

export default function DeliveryPage() {
  const { language } = useLanguageStore();
  const { formatDateTime } = useDateFormat();
  const currency = useCurrency();
  const errorColor = useThemeColor();
  const successColor = useSuccessColor();
  const infoColor = getInfoColor();
  const [activeTab, setActiveTab] = useState<DeliveryTab>('all');
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const [personnel, setPersonnel] = useState<DeliveryPersonnel[]>([]);
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
          label: language === 'ar' && b.nameAr ? b.nameAr : b.nameEn,
        }))
      );
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  }, [language]);

  const loadPersonnel = useCallback(async () => {
    try {
      const data = await deliveryApi.getAvailableDeliveryPersonnel(selectedBranch || undefined);
      setPersonnel(data);
    } catch (error) {
      console.error('Failed to load delivery personnel:', error);
    }
  }, [selectedBranch]);

  const loadDeliveries = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const status = activeTab === 'all' ? undefined : (activeTab as DeliveryStatus);
      const data = await deliveryApi.getDeliveryOrders({
        status,
        branchId: selectedBranch || undefined,
        deliveryPersonId: selectedDeliveryPerson || undefined,
      });
      setDeliveries(data);
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
  }, [activeTab, selectedBranch, selectedDeliveryPerson, language]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    loadPersonnel();
  }, [loadPersonnel]);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

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
    // Apply tab filter
    if (activeTab !== 'all' && delivery.status !== activeTab) {
      return false;
    }

    // Apply search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      delivery.order?.orderNumber.toLowerCase().includes(query) ||
      delivery.order?.tokenNumber?.toLowerCase().includes(query) ||
      delivery.order?.customer?.nameEn?.toLowerCase().includes(query) ||
      delivery.order?.customer?.nameAr?.toLowerCase().includes(query) ||
      delivery.order?.customer?.phone?.includes(query) ||
      delivery.deliveryPerson?.nameEn?.toLowerCase().includes(query) ||
      delivery.deliveryPerson?.nameAr?.toLowerCase().includes(query)
    );
  });

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Text size="xl" fw={700}>
            {t('delivery.title' as any, language) || 'Delivery Management'}
          </Text>
          <Group>
            <Button
              leftSection={<IconRefresh size={16} />}
              variant="light"
              onClick={() => loadDeliveries(false)}
              loading={loading}
            >
              {t('common.refresh' as any, language)}
            </Button>
          </Group>
        </Group>

        {/* Filters */}
        <Paper p="md" withBorder>
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput
                placeholder={t('common.search' as any, language)}
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Select
                placeholder={t('delivery.filterByBranch' as any, language) || 'Filter by Branch'}
                data={branches}
                value={selectedBranch}
                onChange={setSelectedBranch}
                clearable
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Select
                placeholder={t('delivery.filterByPersonnel' as any, language) || 'Filter by Personnel'}
                data={personnel.map((p) => ({
                  value: p.id,
                  label: language === 'ar' && p.nameAr ? p.nameAr : p.nameEn,
                }))}
                value={selectedDeliveryPerson}
                onChange={setSelectedDeliveryPerson}
                clearable
              />
            </Grid.Col>
          </Grid>
        </Paper>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value as DeliveryTab)}>
          <Tabs.List>
            <Tabs.Tab value="all">{t('delivery.allDeliveries' as any, language) || 'All Deliveries'}</Tabs.Tab>
            <Tabs.Tab value="pending">{t('delivery.pending' as any, language) || 'Pending'}</Tabs.Tab>
            <Tabs.Tab value="assigned">{t('delivery.assigned' as any, language) || 'Assigned'}</Tabs.Tab>
            <Tabs.Tab value="out_for_delivery">{t('delivery.outForDelivery' as any, language) || 'Out for Delivery'}</Tabs.Tab>
            <Tabs.Tab value="delivered">{t('delivery.delivered' as any, language) || 'Delivered'}</Tabs.Tab>
            <Tabs.Tab value="cancelled">{t('delivery.cancelled' as any, language) || 'Cancelled'}</Tabs.Tab>
          </Tabs.List>

          {/* Deliveries List */}
          <Box mt="md">
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
                          <Badge color={getStatusColorForBadge(delivery.status)}>
                            {getStatusLabel(delivery.status)}
                          </Badge>
                        </Group>
                        <Group gap="md" align="flex-start">
                          {delivery.order?.customer && (
                            <Group gap="xs">
                              <IconUser size={16} />
                              <Text size="sm" c="dimmed">
                                {language === 'ar' && delivery.order.customer.nameAr
                                  ? delivery.order.customer.nameAr
                                  : delivery.order.customer.nameEn}
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
                                      // Show address based on selected language
                                      const address = language === 'ar' && delivery.customerAddress.addressAr
                                        ? delivery.customerAddress.addressAr
                                        : (delivery.customerAddress.addressEn || delivery.customerAddress.addressLine1);
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
                                        const address = language === 'ar' && addressData.addressAr
                                          ? addressData.addressAr
                                          : (addressData.addressEn || '');
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
                                {language === 'ar' && delivery.deliveryPerson.nameAr
                                  ? delivery.deliveryPerson.nameAr
                                  : delivery.deliveryPerson.nameEn}
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
                            {t('pos.totalAmount' as any, language)}: {(delivery.order?.totalAmount || 0).toFixed(2)} {currency}
                          </Text>
                          {delivery.deliveryCharge > 0 && (
                            <Text size="sm" c="dimmed">
                              {t('delivery.deliveryCharge' as any, language) || 'Delivery Charge'}:{' '}
                              {delivery.deliveryCharge.toFixed(2)} {currency}
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
          </Box>
        </Tabs>
      </Stack>

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
                  label: `${language === 'ar' && p.nameAr ? p.nameAr : p.nameEn} ${
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
                        {language === 'ar' && selectedDelivery.order.customer.nameAr
                          ? selectedDelivery.order.customer.nameAr
                          : selectedDelivery.order.customer.nameEn}
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
                              // Show address based on selected language
                              const address = language === 'ar' && selectedDelivery.customerAddress.addressAr
                                ? selectedDelivery.customerAddress.addressAr
                                : (selectedDelivery.customerAddress.addressEn || selectedDelivery.customerAddress.addressLine1);
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
                                const address = language === 'ar' && addressData.addressAr
                                  ? addressData.addressAr
                                  : (addressData.addressEn || '');
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
                      {language === 'ar' && selectedDelivery.deliveryPerson.nameAr
                        ? selectedDelivery.deliveryPerson.nameAr
                        : selectedDelivery.deliveryPerson.nameEn}
                    </Text>
                  </Group>
                )}
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t('delivery.status' as any, language) || 'Status'}:
                  </Text>
                  <Badge color={getStatusColorForBadge(selectedDelivery.status)}>
                    {getStatusLabel(selectedDelivery.status)}
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t('pos.totalAmount' as any, language)}:
                  </Text>
                  <Text size="sm" fw={600}>
                    {(selectedDelivery.order?.totalAmount || 0).toFixed(2)} {currency}
                  </Text>
                </Group>
                {selectedDelivery.deliveryCharge > 0 && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {t('delivery.deliveryCharge' as any, language) || 'Delivery Charge'}:
                    </Text>
                    <Text size="sm" fw={500}>
                      {selectedDelivery.deliveryCharge.toFixed(2)} {currency}
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
    </Container>
  );
}
