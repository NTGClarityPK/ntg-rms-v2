'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
} from '@mantine/core';
import {
  IconSearch,
  IconDotsVertical,
  IconRefresh,
  IconChefHat,
  IconCheck,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { ordersApi, Order, OrderStatus, OrderType, PaymentStatus } from '@/lib/api/orders';
import { restaurantApi } from '@/lib/api/restaurant';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getStatusColor, getPaymentStatusColor, getSuccessColor, getErrorColor, getBadgeColorForText } from '@/lib/utils/theme';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { db } from '@/lib/indexeddb/database';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { IconEye } from '@tabler/icons-react';
import { supabase } from '@/lib/supabase/client';
import { useDateFormat } from '@/lib/hooks/use-date-format';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';

dayjs.extend(relativeTime);

// Available order statuses for filtering
const ORDER_STATUSES = ['pending', 'preparing', 'ready', 'served', 'completed', 'cancelled'] as const;
type OrderStatusFilter = typeof ORDER_STATUSES[number];

export default function OrdersPage() {
  const { language } = useLanguageStore();
  const currency = useCurrency();
  const primary = useThemeColor();
  const { user } = useAuthStore();
  const { formatDateTime } = useDateFormat();
  const pagination = usePagination<Order>({ initialPage: 1, initialLimit: 10 });
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedOrderType, setSelectedOrderType] = useState<string | null>(null);
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string | null>(null);
  const [showMyOrdersOnly, setShowMyOrdersOnly] = useState(false);
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsModalOpened, { open: openDetailsModal, close: closeDetailsModal }] = useDisclosure(false);
  const [markingAsPaidOrderId, setMarkingAsPaidOrderId] = useState<string | null>(null);

  // Ref to store the latest loadOrders function for use in subscriptions
  // This prevents subscription recreation while ensuring we always use the latest function
  const loadOrdersRef = useRef<(silent?: boolean) => Promise<void>>();
  
  // Refs to prevent duplicate API calls (especially in React StrictMode)
  const loadingOrdersRef = useRef(false);
  const lastOrdersRequestRef = useRef<string>('');
  const ordersRequestSequenceRef = useRef<number>(0);

  const loadBranches = useCallback(async () => {
    try {
      const data = await restaurantApi.getBranches();
      setBranches(
        data.map((b) => ({
          value: b.id,
          label: b.name || '',
        }))
      );
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  }, []);

  const loadOrders = useCallback(async (silent = false) => {
    // Create a unique key for this request to prevent duplicates
    const requestKey = JSON.stringify({
      status: selectedStatuses,
      branchId: selectedBranch,
      orderType: selectedOrderType,
      paymentStatus: selectedPaymentStatus,
      search: searchQuery.trim(),
      waiterEmail: showMyOrdersOnly && user?.email ? user.email : undefined,
      page: pagination.page,
      limit: pagination.limit,
    });
    
    // Prevent duplicate calls with the same parameters
    if (lastOrdersRequestRef.current === requestKey && loadingOrdersRef.current && !silent) {
      return;
    }
    
    // Increment request sequence to track the order of requests
    const currentRequestSequence = ++ordersRequestSequenceRef.current;
    lastOrdersRequestRef.current = requestKey;
    
    // Prevent duplicate calls if already loading (unless it's a silent refresh)
    if (loadingOrdersRef.current && !silent) {
      return;
    }
    
    loadingOrdersRef.current = true;
    
    if (!silent) {
      setLoading(true);
    }
    try {
      // Load orders from backend with all filters including search
      const params = {
        status: selectedStatuses.length > 0 ? (selectedStatuses as OrderStatus[]) : undefined,
        branchId: selectedBranch || undefined,
        orderType: selectedOrderType as OrderType | undefined,
        paymentStatus: selectedPaymentStatus as PaymentStatus | undefined,
        search: searchQuery.trim() || undefined,
        waiterEmail: showMyOrdersOnly && user?.email ? user.email : undefined,
        ...pagination.paginationParams,
      };
      
      let backendOrders: Order[] = [];
      let backendResponse: Order[] | any = null;
      try {
        backendResponse = await ordersApi.getOrders(params);
        
        // Check if this is still the latest request
        if (currentRequestSequence !== ordersRequestSequenceRef.current) {
          console.log('⚠️ Ignoring outdated orders request response');
          return;
        }
        
        backendOrders = pagination.extractData(backendResponse);
        pagination.extractPagination(backendResponse);
      } catch (error: any) {
        console.error('Failed to load orders from backend:', error);
        // Continue to load from IndexedDB even if backend fails
      }

      // Also load orders from IndexedDB (for offline/pending orders)
      if (user?.tenantId) {
        // OPTIMIZATION: Only fetch ALL orders when needed (when not on 'all' tab)
        // When on 'all' tab, we already have all orders, so reuse backendOrders
        // This reduces API calls by 50% when on the 'all' tab
        let allBackendOrders: Order[] = backendOrders;
        
        // Only need to fetch all orders if we're filtering by status
        // This is needed to check if IndexedDB orders exist in backend with different statuses
        if (selectedStatuses.length > 0) {
          try {
            const allBackendParams = {
              branchId: selectedBranch || undefined,
              orderType: selectedOrderType as OrderType | undefined,
              paymentStatus: selectedPaymentStatus as PaymentStatus | undefined,
              search: searchQuery.trim() || undefined,
              waiterEmail: showMyOrdersOnly && user?.email ? user.email : undefined,
              // No status filter - get all orders
              // Don't paginate this query - we need all orders for exclusion check
            };
            const allBackendResponse = await ordersApi.getOrders(allBackendParams);
            
            // Check if this is still the latest request
            if (currentRequestSequence !== ordersRequestSequenceRef.current) {
              console.log('⚠️ Ignoring outdated all-orders request response');
              return;
            }
            
            allBackendOrders = Array.isArray(allBackendResponse) ? allBackendResponse : (allBackendResponse?.data || []);
          } catch (error: any) {
            console.error('Failed to load all orders from backend for exclusion check:', error);
            // If this fails, we'll just use the filtered backendOrders
            allBackendOrders = backendOrders;
          }
        }

        const indexedDBOrders = await db.orders
          .where('tenantId')
          .equals(user.tenantId)
          .filter((order) => {
            if (selectedStatuses.length > 0 && !selectedStatuses.includes(order.status)) return false;
            if (selectedBranch && order.branchId !== selectedBranch) return false;
            if (selectedOrderType && order.orderType !== selectedOrderType) return false;
            if (selectedPaymentStatus && order.paymentStatus !== selectedPaymentStatus) return false;
            if (showMyOrdersOnly && user?.email && (order as any).waiterEmail !== user.email) return false;
            // Apply search filter to IndexedDB orders as well
            if (searchQuery.trim()) {
              const query = searchQuery.toLowerCase().trim();
              const matchesOrderNumber = order.orderNumber?.toLowerCase().includes(query);
              const matchesTokenNumber = order.tokenNumber?.toLowerCase().includes(query);
              if (!matchesOrderNumber && !matchesTokenNumber) {
                // For customer name/phone, we'd need to load customer data, but for simplicity
                // we'll just check orderNumber and tokenNumber for IndexedDB
                return false;
              }
            }
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
                name: (branch as any).name || (branch as any).nameEn || (branch as any).nameAr || '',
                code: branch.code,
              } : undefined,
              table: table ? {
                id: table.id,
                table_number: (table as any).tableNumber || (table as any).table_number || '',
                seating_capacity: table.capacity,
              } : undefined,
              customer: customer ? {
                id: customer.id,
                name: (customer as any).name || (customer as any).nameEn || (customer as any).nameAr || '',
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

        // Apply local pagination for IndexedDB orders (when offline or when combining with backend)
        // If we got a paginated response from backend, we should use that pagination info
        // Otherwise, apply local pagination
        if (!isPaginatedResponse(backendResponse)) {
          const totalItems = allOrders.length;
          const startIndex = (pagination.page - 1) * pagination.limit;
          const endIndex = startIndex + pagination.limit;
          const paginatedOrders = allOrders.slice(startIndex, endIndex);
          
          setOrders(paginatedOrders);
          
          // Update pagination info for local pagination
          pagination.setTotal(totalItems);
          pagination.setTotalPages(Math.ceil(totalItems / pagination.limit));
          pagination.setHasNext(endIndex < totalItems);
          pagination.setHasPrev(pagination.page > 1);
        } else {
          // Backend provided pagination, use the orders as-is
          setOrders(allOrders);
        }
      } else {
        // No IndexedDB - just use backend orders
        if (!isPaginatedResponse(backendResponse)) {
          // Backend didn't return paginated response, apply local pagination
          const totalItems = backendOrders.length;
          const startIndex = (pagination.page - 1) * pagination.limit;
          const endIndex = startIndex + pagination.limit;
          const paginatedOrders = backendOrders.slice(startIndex, endIndex);
          
          setOrders(paginatedOrders);
          
          pagination.setTotal(totalItems);
          pagination.setTotalPages(Math.ceil(totalItems / pagination.limit));
          pagination.setHasNext(endIndex < totalItems);
          pagination.setHasPrev(pagination.page > 1);
        } else {
          setOrders(backendOrders);
        }
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
      loadingOrdersRef.current = false;
    }
  }, [selectedBranch, selectedOrderType, selectedPaymentStatus, selectedStatuses, searchQuery, showMyOrdersOnly, user?.tenantId, user?.email, language, pagination]);

  // Update ref whenever loadOrders changes
  useEffect(() => {
    loadOrdersRef.current = loadOrders;
  }, [loadOrders]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // FIXED: Combined redundant useEffects into one with proper dependencies
  // This prevents loadOrders from being called multiple times when dependencies change
  useEffect(() => {
    // Use a small timeout to debounce rapid changes and prevent duplicate calls
    const timeoutId = setTimeout(() => {
      loadOrders();
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch, selectedOrderType, selectedPaymentStatus, selectedStatuses, searchQuery, showMyOrdersOnly, pagination.page, pagination.limit]);

  // Set up Supabase Realtime subscription for cross-browser updates
  useEffect(() => {
    if (!user?.tenantId || !supabase) {
      console.warn('Supabase Realtime: Missing tenantId or supabase client');
      return;
    }

    console.log('Setting up Supabase Realtime subscription for orders list...');
    console.log('Tenant ID:', user.tenantId);
    
    // Declare variables for subscription status tracking and polling
    let pollInterval: NodeJS.Timeout | null = null;
    let pollTimeout: NodeJS.Timeout | null = null;
    let subscriptionStatus: string | null = null;
    
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
          // Use the latest loadOrders function via ref
          console.log('🔄 Reloading orders due to change...');
          loadOrdersRef.current?.(true); // silent = true
        }
      )
      .subscribe((status, err) => {
        // Track subscription status for fallback polling check
        subscriptionStatus = status;
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

    // FIXED: Conditional polling - only poll if Realtime subscription fails
    // This prevents unnecessary API calls when Realtime is working properly
    // Check subscription status after 10 seconds
    // If still not subscribed, start polling as fallback
    pollTimeout = setTimeout(() => {
      // Only start polling if subscription definitely failed
      // Check the stored status (can be null, 'SUBSCRIBED', 'SUBSCRIBING', or error states)
      if (subscriptionStatus !== 'SUBSCRIBED' && subscriptionStatus !== 'SUBSCRIBING') {
        console.warn('⚠️ Realtime subscription failed, starting fallback polling (30s interval)');
        pollInterval = setInterval(() => {
          console.log('🔄 Polling for order changes (fallback)...');
          loadOrdersRef.current?.(true); // silent = true, no loading state
        }, 30000); // Increased from 5s to 30s to reduce load
      }
    }, 10000); // Wait 10 seconds before checking

    return () => {
      console.log('Cleaning up Supabase Realtime subscription...');
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
    // FIXED: Removed loadOrders from dependencies to prevent subscription recreation
    // We use loadOrdersRef to access the latest loadOrders function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

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

  // No client-side filtering needed - all filtering is done on the backend
  // The orders array already contains filtered results from the backend
  const filteredOrders = orders;

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    openDetailsModal();
  };

  const handleStatusUpdate = () => {
    loadOrders();
    closeDetailsModal();
  };

  const handleMarkAsPaid = async (order: Order) => {
    setMarkingAsPaidOrderId(order.id);
    try {
      await ordersApi.updatePaymentStatus(order.id, {
        paymentStatus: 'paid',
        amountPaid: order.totalAmount,
      });
      notifications.show({
        title: t('common.success' as any, language),
        message: t('orders.paymentStatusUpdated', language),
        color: getSuccessColor(),
      });
      await loadOrders();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('orders.updateError', language),
        color: getErrorColor(),
      });
    } finally {
      setMarkingAsPaidOrderId(null);
    }
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

  const getPaymentStatusLabel = (status: PaymentStatus): string => {
    const labels: Record<PaymentStatus, string> = {
      paid: t('orders.paymentPaid', language),
      unpaid: t('orders.paymentUnpaid', language),
    };
    return labels[status] || status;
  };

  return (
    <>
      <div className="page-title-bar">
        <Group justify="space-between" align="center" style={{ width: '100%', height: '100%' }}>
          <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
            {t('orders.title', language)}
          </Title>
          <Group gap="xs">
            <Button
              leftSection={<IconChefHat size={16} />}
              variant="light"
              component="a"
              href="/orders/kitchen"
              size="sm"
            >
              {t('orders.kitchenDisplay', language)}
            </Button>
            <ActionIcon
              variant="light"
              size="lg"
              onClick={() => loadOrders(false)}
              loading={loading}
              title={t('common.refresh' as any, language)}
            >
              <IconRefresh size={18} />
            </ActionIcon>
          </Group>
        </Group>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <Stack gap="md">
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
                ]}
                value={selectedPaymentStatus}
                onChange={setSelectedPaymentStatus}
                clearable
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
              {t('orders.allOrders', language)}
            </Chip>
            <Chip.Group multiple value={selectedStatuses} onChange={setSelectedStatuses}>
              <Group gap="xs" wrap="wrap">
                <Chip value="pending" variant="filled">
                  {t('orders.pending', language)}
                </Chip>
                <Chip value="preparing" variant="filled">
                  {t('orders.preparing', language)}
                </Chip>
                <Chip value="ready" variant="filled">
                  {t('orders.ready', language)}
                </Chip>
                <Chip value="served" variant="filled">
                  {t('orders.served', language)}
                </Chip>
                <Chip value="completed" variant="filled">
                  {t('orders.completed', language)}
                </Chip>
                <Chip value="cancelled" variant="filled">
                  {t('orders.cancelled', language)}
                </Chip>
              </Group>
            </Chip.Group>
            <Chip
              checked={showMyOrdersOnly}
              onChange={(checked) => setShowMyOrdersOnly(checked)}
              variant="filled"
            >
              {t('orders.myOrders', language)}
            </Chip>
          </Group>
        </Paper>

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
                          <Badge variant="light" color={getStatusColorForBadge(order.status)}>
                            {t(`orders.status.${order.status}`, language)}
                          </Badge>
                          <Badge variant="light" color={getBadgeColorForText(getOrderTypeLabel(order.orderType))}>
                            {getOrderTypeLabel(order.orderType)}
                          </Badge>
                          <Badge variant="light" color={getPaymentStatusColor(order.paymentStatus)}>
                            {getPaymentStatusLabel(order.paymentStatus)}
                          </Badge>
                        </Group>
                        <Group gap="md" align="flex-start">
                          {order.branch && order.branch.name && (
                            <Text size="sm" c="dimmed">
                              {order.branch.name}
                            </Text>
                          )}
                          {order.waiterEmail && (
                            <Text size="sm" c="dimmed">
                              {t('orders.waiterName', language)}: {order.waiterEmail}
                            </Text>
                          )}
                          {((order as any).tables && (order as any).tables.length > 0) || (order.table && order.table.table_number) ? (
                            <Text size="sm" c="dimmed">
                              {t('orders.tableNumber', language)}: {
                                (order as any).tables && (order as any).tables.length > 0
                                  ? (order as any).tables.map((t: any) => t.table_number).join(', ')
                                  : (order.table?.table_number || '')
                              }
                            </Text>
                          ) : null}
                          {order.customer && order.customer.name && (
                            <Text size="sm" c="dimmed">
                              {order.customer.name}
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
                            {t('pos.subtotal', language)}: {formatCurrency(order.subtotal || 0, currency)}
                          </Text>
                          {(order.discountAmount || 0) > 0 && (
                            <Text size="sm" c={getSuccessColor()}>
                              {t('pos.discount', language)}: -{formatCurrency(order.discountAmount || 0, currency)}
                            </Text>
                          )}
                          <Text size="sm" fw={600}>
                            {t('pos.grandTotal', language)}: {formatCurrency(order.totalAmount || 0, currency)}
                          </Text>
                        </Group>
                      </Stack>
                      <Group gap="xs">
                        {order.paymentStatus === 'unpaid' && (
                          <Button
                            size="sm"
                            variant={markingAsPaidOrderId === order.id ? "filled" : "light"}
                            color={getSuccessColor()}
                            leftSection={markingAsPaidOrderId !== order.id ? <IconCheck size={16} /> : undefined}
                            onClick={() => {
                              if (markingAsPaidOrderId !== order.id) {
                                handleMarkAsPaid(order);
                              }
                            }}
                            loading={markingAsPaidOrderId === order.id}
                            disabled={markingAsPaidOrderId === order.id}
                          >
                            {t('orders.markAsPaid', language)}
                          </Button>
                        )}
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
                            {order.paymentStatus === 'unpaid' && (
                              <Menu.Item
                                leftSection={<IconCheck size={16} />}
                                onClick={() => handleMarkAsPaid(order)}
                                disabled={markingAsPaidOrderId === order.id}
                              >
                                {t('orders.markAsPaid', language)}
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
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

      {selectedOrder && (
        <OrderDetailsModal
          opened={detailsModalOpened}
          onClose={closeDetailsModal}
          order={selectedOrder}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </>
  );
}
