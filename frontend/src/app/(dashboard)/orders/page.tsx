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
} from '@mantine/core';
import {
  IconSearch,
  IconDotsVertical,
  IconRefresh,
  IconChefHat,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { ordersApi, Order, OrderStatus, OrderType, PaymentStatus } from '@/lib/api/orders';
import { restaurantApi } from '@/lib/api/restaurant';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getStatusColor, getSuccessColor, getErrorColor } from '@/lib/utils/theme';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCurrency } from '@/lib/hooks/use-currency';
import { db } from '@/lib/indexeddb/database';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { IconEye } from '@tabler/icons-react';
import { supabase } from '@/lib/supabase/client';
import { useDateFormat } from '@/lib/hooks/use-date-format';

dayjs.extend(relativeTime);

type OrderTab = 'all' | 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';

export default function OrdersPage() {
  const { language } = useLanguageStore();
  const currency = useCurrency();
  const primary = useThemeColor();
  const { user } = useAuthStore();
  const { formatDateTime } = useDateFormat();
  const [activeTab, setActiveTab] = useState<OrderTab>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedOrderType, setSelectedOrderType] = useState<string | null>(null);
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsModalOpened, { open: openDetailsModal, close: closeDetailsModal }] = useDisclosure(false);

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

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      // Load orders from backend
      const status = activeTab === 'all' ? undefined : (activeTab as OrderStatus);
      const params = {
        status,
        branchId: selectedBranch || undefined,
        orderType: selectedOrderType as OrderType | undefined,
        paymentStatus: selectedPaymentStatus as PaymentStatus | undefined,
      };
      
      let backendOrders: Order[] = [];
      try {
        backendOrders = await ordersApi.getOrders(params);
      } catch (error: any) {
        console.error('Failed to load orders from backend:', error);
        // Continue to load from IndexedDB even if backend fails
      }

      // Also load orders from IndexedDB (for offline/pending orders)
      if (user?.tenantId) {
        // Fetch ALL orders from backend (without status filter) to get complete list
        // This ensures we can exclude IndexedDB orders that exist in backend with any status
        let allBackendOrders: Order[] = [];
        try {
          const allBackendParams = {
            branchId: selectedBranch || undefined,
            orderType: selectedOrderType as OrderType | undefined,
            paymentStatus: selectedPaymentStatus as PaymentStatus | undefined,
            // No status filter - get all orders
          };
          allBackendOrders = await ordersApi.getOrders(allBackendParams);
        } catch (error: any) {
          console.error('Failed to load all orders from backend for exclusion check:', error);
          // If this fails, we'll just use the filtered backendOrders
          allBackendOrders = backendOrders;
        }

        const indexedDBOrders = await db.orders
          .where('tenantId')
          .equals(user.tenantId)
          .filter((order) => {
            if (status && order.status !== status) return false;
            if (selectedBranch && order.branchId !== selectedBranch) return false;
            if (selectedOrderType && order.orderType !== selectedOrderType) return false;
            if (selectedPaymentStatus && order.paymentStatus !== selectedPaymentStatus) return false;
            return !order.deletedAt;
          })
          .toArray();

        // Check sync queue to see which orders are already synced
        const syncQueueItems = await db.syncQueue
          .where('table')
          .equals('orders')
          .and((item) => item.status === 'SYNCED' || item.status === 'SYNCING')
          .toArray();

        // Get IDs of orders that are synced or syncing
        const syncedOrderIds = new Set(
          syncQueueItems
            .map((item) => {
              // Extract order ID from sync queue item
              // The recordId might be the order ID, or it might be in the data
              if (item.recordId) return item.recordId;
              if (item.data?.id) return item.data.id;
              if (item.data?.orderId) return item.data.orderId;
              return null;
            })
            .filter(Boolean) as string[]
        );

        // Use ALL backend orders (not just filtered ones) to check for existence
        // This ensures we exclude IndexedDB orders that exist in backend with any status
        const allBackendOrderNumbers = new Set(allBackendOrders.map(o => o.orderNumber));
        const allBackendOrderIds = new Set(allBackendOrders.map(o => o.id));

        // Filter IndexedDB orders: only include those that:
        // 1. Are NOT in backend (by ID or order number) - checked against ALL backend orders
        // 2. Are NOT marked as synced in sync queue
        const pendingOrders = indexedDBOrders.filter((order) => {
          // Exclude if already in backend (check against all backend orders, not just filtered ones)
          // This prevents stale IndexedDB orders from showing when their status changed in backend
          if (allBackendOrderIds.has(order.id) || allBackendOrderNumbers.has(order.orderNumber)) {
            return false;
          }
          // Exclude if synced or syncing
          if (syncedOrderIds.has(order.id)) {
            return false;
          }
          // Only include pending orders that haven't been synced
          return true;
        });
        
        // Transform IndexedDB orders to match API format
        const transformedPendingOrders: Order[] = await Promise.all(
          pendingOrders.map(async (order) => {
            // Load related data from IndexedDB
            const branch = order.branchId ? await db.branches.get(order.branchId) : null;
            const table = order.tableId ? await db.restaurantTables.get(order.tableId) : null;
            const customer = order.customerId ? await db.customers.get(order.customerId) : null;
            const items = await db.orderItems.where('orderId').equals(order.id).toArray();

            return {
              ...order,
              branch: branch ? {
                id: branch.id,
                nameEn: branch.nameEn,
                nameAr: branch.nameAr,
                code: branch.code,
              } : undefined,
              table: table ? {
                id: table.id,
                table_number: (table as any).tableNumber || (table as any).table_number || '',
                seating_capacity: table.capacity,
              } : undefined,
              customer: customer ? {
                id: customer.id,
                nameEn: customer.nameEn,
                nameAr: customer.nameAr,
                phone: customer.phone,
                email: customer.email,
              } : undefined,
              items: items.map(item => ({
                ...item,
                foodItem: undefined, // Will be loaded if needed
              })),
            } as Order;
          })
        );

        // Combine and deduplicate by order number (most reliable identifier)
        const orderNumberMap = new Map<string, Order>();
        
        // First, add all backend orders (they take priority)
        backendOrders.forEach(order => {
          orderNumberMap.set(order.orderNumber, order);
        });
        
        // Then, add pending orders only if they don't exist
        transformedPendingOrders.forEach(order => {
          if (!orderNumberMap.has(order.orderNumber)) {
            orderNumberMap.set(order.orderNumber, order);
          }
        });
        
        // Convert map to array and sort by date (newest first)
        const allOrders = Array.from(orderNumberMap.values());
        allOrders.sort((a, b) => 
          new Date(b.orderDate || b.createdAt).getTime() - new Date(a.orderDate || a.createdAt).getTime()
        );

        setOrders(allOrders);
      } else {
        setOrders(backendOrders);
      }
    } catch (error: any) {
      if (!silent) {
        notifications.show({
          title: t('common.error' as any, language),
          message: error?.response?.data?.message || t('orders.loadError', language),
          color: getErrorColor(),
        });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [activeTab, selectedBranch, selectedOrderType, selectedPaymentStatus, language, user?.tenantId]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Reload orders when activeTab changes
  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Set up Supabase Realtime subscription for cross-browser updates
  useEffect(() => {
    if (!user?.tenantId || !supabase) {
      console.warn('Supabase Realtime: Missing tenantId or supabase client');
      return;
    }

    console.log('Setting up Supabase Realtime subscription for orders list...');
    console.log('Tenant ID:', user.tenantId);
    
    const channel = supabase
      .channel(`orders-realtime-list-${user.tenantId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        (payload) => {
          console.log('✅ Order change received in orders page:', {
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
            table: payload.table,
            schema: payload.schema,
          });
          // Reload orders silently in background (INSERT, UPDATE, DELETE)
          // Use the latest loadOrders function which includes current activeTab
          console.log('🔄 Reloading orders due to change...');
          loadOrders(true); // silent = true
        }
      )
      .subscribe((status, err) => {
        console.log('Supabase Realtime subscription status:', status);
        if (err) {
          console.error('❌ Supabase Realtime error:', err);
        }
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to orders table changes');
          console.log('📡 Listening for changes on orders table with tenant_id =', user.tenantId);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Supabase Realtime channel error');
        } else if (status === 'TIMED_OUT') {
          console.error('❌ Supabase Realtime subscription timed out');
        } else if (status === 'CLOSED') {
          console.warn('⚠️ Supabase Realtime channel closed');
        }
      });

    // Fallback: Poll for changes every 5 seconds if Realtime doesn't work
    const pollInterval = setInterval(() => {
      console.log('🔄 Polling for order changes (fallback)...');
      loadOrders(true); // silent = true, no loading state
    }, 5000);

    return () => {
      console.log('Cleaning up Supabase Realtime subscription...');
      clearInterval(pollInterval);
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.tenantId, loadOrders]);

  // Listen for order creation/update events (for same-browser updates)
  useEffect(() => {
    const { onOrderUpdate } = require('@/lib/utils/order-events');
    
    const unsubscribeCreated = onOrderUpdate('order-created', () => {
      loadOrders(true); // silent reload to maintain current tab
    });
    
    const unsubscribeUpdated = onOrderUpdate('order-updated', () => {
      loadOrders(true); // silent reload to maintain current tab
    });
    
    const unsubscribeStatusChanged = onOrderUpdate('order-status-changed', () => {
      loadOrders(true); // silent reload to maintain current tab
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeStatusChanged();
    };
  }, [loadOrders]);

  const filteredOrders = orders.filter((order) => {
    // First apply tab filter (status filter)
    if (activeTab !== 'all' && order.status !== activeTab) {
      return false;
    }
    
    // Then apply search query filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(query) ||
      order.tokenNumber?.toLowerCase().includes(query) ||
      order.customer?.nameEn?.toLowerCase().includes(query) ||
      order.customer?.nameAr?.toLowerCase().includes(query) ||
      order.customer?.phone?.includes(query)
    );
  });

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    openDetailsModal();
  };

  const handleStatusUpdate = () => {
    loadOrders();
    closeDetailsModal();
  };

  const getStatusColorForBadge = (status: OrderStatus): string => {
    return getStatusColor(status);
  };

  const getOrderTypeLabel = (type: OrderType): string => {
    const labels: Record<OrderType, string> = {
      dine_in: t('pos.dineIn', language),
      takeaway: t('pos.takeaway', language),
      delivery: t('pos.delivery', language),
    };
    return labels[type] || type;
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Text size="xl" fw={700}>
            {t('orders.title', language)}
          </Text>
          <Group>
            <Button
              leftSection={<IconChefHat size={16} />}
              variant="light"
              component="a"
              href="/orders/kitchen"
            >
              {t('orders.kitchenDisplay', language)}
            </Button>
            <Button
              leftSection={<IconRefresh size={16} />}
              variant="light"
              onClick={() => loadOrders(false)}
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
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Select
                placeholder={t('orders.filterByBranch', language)}
                data={branches}
                value={selectedBranch}
                onChange={setSelectedBranch}
                clearable
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 2 }}>
              <Select
                placeholder={t('orders.filterByType', language)}
                data={[
                  { value: 'dine_in', label: t('pos.dineIn', language) },
                  { value: 'takeaway', label: t('pos.takeaway', language) },
                  { value: 'delivery', label: t('pos.delivery', language) },
                ]}
                value={selectedOrderType}
                onChange={setSelectedOrderType}
                clearable
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Select
                placeholder={t('orders.filterByPayment', language)}
                data={[
                  { value: 'unpaid', label: t('orders.paymentUnpaid', language) },
                  { value: 'paid', label: t('orders.paymentPaid', language) },
                  { value: 'partial', label: t('orders.paymentPartial', language) },
                ]}
                value={selectedPaymentStatus}
                onChange={setSelectedPaymentStatus}
                clearable
              />
            </Grid.Col>
          </Grid>
        </Paper>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value as OrderTab)}>
          <Tabs.List>
            <Tabs.Tab value="all">{t('orders.allOrders', language)}</Tabs.Tab>
            <Tabs.Tab value="pending">{t('orders.pending', language)}</Tabs.Tab>
            <Tabs.Tab value="preparing">{t('orders.preparing', language)}</Tabs.Tab>
            <Tabs.Tab value="ready">{t('orders.ready', language)}</Tabs.Tab>
            <Tabs.Tab value="served">{t('orders.served', language)}</Tabs.Tab>
            <Tabs.Tab value="completed">{t('orders.completed', language)}</Tabs.Tab>
            <Tabs.Tab value="cancelled">{t('orders.cancelled', language)}</Tabs.Tab>
          </Tabs.List>

          {/* Orders List */}
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
            ) : filteredOrders.length === 0 ? (
              <Center py="xl">
                <Text c="dimmed">{t('orders.noOrders', language)}</Text>
              </Center>
            ) : (
              <Stack gap="sm">
                {filteredOrders.map((order) => (
                  <Card key={order.id} withBorder p="md">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap="xs" style={{ flex: 1 }}>
                        <Group gap="md">
                          <Text fw={600} size="lg">
                            {t('pos.orderNumber', language)}: {order.orderNumber}
                          </Text>
                          {order.tokenNumber && (
                            <Text c="dimmed">
                              {t('pos.tokenNumber', language)}: {order.tokenNumber}
                            </Text>
                          )}
                          <Badge color={getStatusColorForBadge(order.status)}>
                            {t(`orders.status.${order.status}`, language)}
                          </Badge>
                          <Badge variant="light" color={primary}>
                            {getOrderTypeLabel(order.orderType)}
                          </Badge>
                        </Group>
                        <Group gap="md" align="flex-start">
                          {order.branch && (order.branch.nameEn || order.branch.nameAr) && (
                            <Text size="sm" c="dimmed">
                              {language === 'ar' && order.branch.nameAr
                                ? order.branch.nameAr
                                : order.branch.nameEn}
                            </Text>
                          )}
                          {order.table && order.table.table_number && (
                            <Text size="sm" c="dimmed">
                              {t('pos.tableNo', language)}: {order.table.table_number}
                            </Text>
                          )}
                          {order.customer && (order.customer.nameEn || order.customer.nameAr) && (
                            <Text size="sm" c="dimmed">
                              {language === 'ar' && order.customer.nameAr
                                ? order.customer.nameAr
                                : order.customer.nameEn}
                            </Text>
                          )}
                          {order.orderDate && (
                            <Text size="sm" c="dimmed" style={{ lineHeight: '1.5' }}>
                              {formatDateTime(order.orderDate)}
                            </Text>
                          )}
                        </Group>
                        <Group gap="md">
                          <Text size="sm" fw={500}>
                            {t('pos.subtotal', language)}: {(order.subtotal || 0).toFixed(2)} {currency}
                          </Text>
                          {(order.discountAmount || 0) > 0 && (
                            <Text size="sm" c={getSuccessColor()}>
                              {t('pos.discount', language)}: -{(order.discountAmount || 0).toFixed(2)} {currency}
                            </Text>
                          )}
                          <Text size="sm" fw={600}>
                            {t('pos.grandTotal', language)}: {(order.totalAmount || 0).toFixed(2)} {currency}
                          </Text>
                        </Group>
                      </Stack>
                      <Menu>
                        <Menu.Target>
                          <ActionIcon variant="subtle">
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconEye size={16} />}
                            onClick={() => handleViewOrder(order)}
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

      {selectedOrder && (
        <OrderDetailsModal
          opened={detailsModalOpened}
          onClose={closeDetailsModal}
          order={selectedOrder}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </Container>
  );
}
