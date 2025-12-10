'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Container,
  Grid,
  Card,
  Text,
  Badge,
  Button,
  Group,
  Stack,
  Box,
  Paper,
  Skeleton,
  Center,
  ScrollArea,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconClock,
  IconChefHat,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { ordersApi, Order, OrderStatus } from '@/lib/api/orders';
import { notifications } from '@mantine/notifications';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor, getWarningColor, getInfoColor, getStatusColor } from '@/lib/utils/theme';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/store/auth-store';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ar';
import 'dayjs/locale/en';

dayjs.extend(relativeTime);

type KitchenStatus = 'pending' | 'preparing';

export default function KitchenDisplayPage() {
  const { language } = useLanguageStore();
  const primary = useThemeColor();
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const subscriptionRef = useRef<any>(null);
  const previousOrderIdsRef = useRef<Set<string>>(new Set());
  const audioResumedRef = useRef<boolean>(false);

  // Initialize audio for alerts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Create audio context (will be in suspended state initially)
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        console.log('🎵 Audio context created, state:', audioContextRef.current.state);
      } catch (error) {
        console.error('Failed to initialize audio context:', error);
      }
    }
  }, []);

  // Resume audio context on first user interaction
  useEffect(() => {
    if (!audioContextRef.current || audioResumedRef.current) {
      return;
    }

    const resumeAudio = async (event: Event) => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          audioResumedRef.current = true;
          console.log('✅ Audio context resumed on user interaction');
        } catch (error) {
          console.error('Failed to resume audio context:', error);
        }
      }
    };

    // Resume on any user interaction (once)
    const events = ['click', 'touchstart', 'keydown', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, resumeAudio, { once: true, passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resumeAudio);
      });
    };
  }, []);

  // Play sound alert
  const playSound = useCallback(async () => {
    if (!soundEnabled || !audioContextRef.current) {
      return;
    }

    try {
      const audioContext = audioContextRef.current;
      
      // Resume if suspended (this will work if user has interacted with page)
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          audioResumedRef.current = true;
          console.log('✅ Audio context resumed before playing sound');
        } catch (error) {
          console.warn('⚠️ Could not resume audio context (user interaction required):', error);
          return; // Can't play sound without user interaction
        }
      }
      
      // Only play if context is running
      if (audioContext.state === 'running') {
        playSoundInternal(audioContext);
      } else {
        console.warn('⚠️ Audio context not running, state:', audioContext.state);
      }
    } catch (error) {
      console.error('Failed to play sound:', error);
    }
  }, [soundEnabled]);

  const playSoundInternal = (audioContext: AudioContext) => {
    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      console.log('🔔 Sound alert played');
    } catch (error) {
      console.error('Failed to create/play oscillator:', error);
    }
  };

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await ordersApi.getOrders({
        status: 'pending',
      });
      // Also get preparing orders
      const preparingData = await ordersApi.getOrders({
        status: 'preparing',
      });
      const allOrders = [...data, ...preparingData];
      
      // Fetch full order details with items for each order
      const ordersWithItems = await Promise.all(
        allOrders.map(async (order) => {
          try {
            // Fetch full order details which includes items
            const fullOrder = await ordersApi.getOrderById(order.id);
            return fullOrder;
          } catch (error) {
            console.error(`Failed to load full details for order ${order.id}:`, error);
            // Return order without items if fetch fails
            return order;
          }
        })
      );
      
      // Sort by order date (newest first)
      ordersWithItems.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
      
      // Only update if data actually changed (to prevent unnecessary re-renders)
      setOrders((prevOrders) => {
        const prevIds = new Set(prevOrders.map(o => o.id));
        const newIds = new Set(ordersWithItems.map(o => o.id));
        
        // Detect new orders (orders that exist in newIds but not in prevIds)
        const newOrderIds = [...newIds].filter(id => !prevIds.has(id));
        const hasNewOrders = newOrderIds.length > 0 && prevOrders.length > 0;
        
        const idsChanged = prevIds.size !== newIds.size || 
          [...prevIds].some(id => !newIds.has(id)) ||
          prevOrders.some(prev => {
            const updated = ordersWithItems.find(o => o.id === prev.id);
            return updated && (updated.status !== prev.status || updated.updatedAt !== prev.updatedAt);
          });
        
        // Play sound for new orders detected via polling
        if (hasNewOrders && soundEnabled) {
          console.log('🔔 New orders detected via polling:', newOrderIds);
          playSound();
        }
        
        // Update previous order IDs ref
        previousOrderIdsRef.current = newIds;
        
        if (idsChanged || prevOrders.length === 0) {
          return ordersWithItems;
        }
        return prevOrders;
      });
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
  }, [language, soundEnabled, playSound]);

  // Set dayjs locale when language changes
  useEffect(() => {
    dayjs.locale(language === 'ar' ? 'ar' : 'en');
  }, [language]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Set up Supabase Realtime subscription for cross-browser updates
  useEffect(() => {
    if (!user?.tenantId || !supabase) {
      console.warn('Supabase Realtime: Missing tenantId or supabase client');
      return;
    }

    console.log('Setting up Supabase Realtime subscription for kitchen...');
    console.log('Tenant ID:', user.tenantId);
    
    const channel = supabase
      .channel(`orders-realtime-kitchen-${user.tenantId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        (payload) => {
          console.log('✅ Order change received in kitchen:', {
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
            table: payload.table,
            schema: payload.schema,
          });
          // Play sound for new orders
          if (payload.eventType === 'INSERT' && soundEnabled) {
            console.log('🔔 New order detected via Realtime:', payload.new?.id);
            playSound();
          }
          // Reload orders silently in background (INSERT, UPDATE, DELETE)
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

    subscriptionRef.current = channel;

    // Fallback: Poll for changes every 5 seconds if Realtime doesn't work
    const pollInterval = setInterval(() => {
      console.log('🔄 Polling for order changes (fallback)...');
      loadOrders(true); // silent = true, no loading state
    }, 5000);

    return () => {
      console.log('Cleaning up Supabase Realtime subscription...');
      clearInterval(pollInterval);
      if (subscriptionRef.current && supabase) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, soundEnabled, loadOrders, playSound]);

  // Listen for order status changes from other screens
  useEffect(() => {
    const { onOrderUpdate } = require('@/lib/utils/order-events');
    
    const unsubscribeStatusChanged = onOrderUpdate('order-status-changed', () => {
      loadOrders();
    });

    return () => {
      unsubscribeStatusChanged();
    };
  }, [loadOrders]);

  const handleMarkAsReady = async (order: Order) => {
    setProcessingOrderId(order.id);
    try {
      await ordersApi.updateOrderStatus(order.id, { status: 'ready' });
      notifications.show({
        title: t('common.success' as any, language),
        message: t('orders.markedAsReady', language),
        color: getSuccessColor(),
      });
      
      // Notify same-browser screens about the status change (for immediate UI update)
      const { notifyOrderUpdate } = await import('@/lib/utils/order-events');
      notifyOrderUpdate('order-status-changed', order.id);
      
      // Note: Supabase Realtime will handle cross-browser updates automatically
      // We still call loadOrders() for immediate local update, but Supabase will also trigger it
      loadOrders();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('orders.updateError', language),
        color: getErrorColor(),
      });
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleStartPreparing = async (order: Order) => {
    setProcessingOrderId(order.id);
    try {
      await ordersApi.updateOrderStatus(order.id, { status: 'preparing' });
      notifications.show({
        title: t('common.success' as any, language),
        message: t('orders.startedPreparing', language),
        color: getSuccessColor(),
      });
      
      // Notify same-browser screens about the status change (for immediate UI update)
      const { notifyOrderUpdate } = await import('@/lib/utils/order-events');
      notifyOrderUpdate('order-status-changed', order.id);
      
      // Note: Supabase Realtime will handle cross-browser updates automatically
      // We still call loadOrders() for immediate local update, but Supabase will also trigger it
      loadOrders();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('orders.updateError', language),
        color: getErrorColor(),
      });
    } finally {
      setProcessingOrderId(null);
    }
  };

  const getPriorityColor = (order: Order): string => {
    const orderAge = dayjs().diff(dayjs(order.orderDate), 'minute');
    if (orderAge > 30) return getErrorColor();
    if (orderAge > 15) return getWarningColor();
    return getInfoColor();
  };

  const getOrderAge = (order: Order): string => {
    const locale = language === 'ar' ? 'ar' : 'en';
    return dayjs(order.orderDate).locale(locale).fromNow();
  };

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');

  return (
    <Box
      style={{
        position: 'fixed',
        top: 60, // Account for AppShell header height
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--mantine-color-gray-0)',
        overflow: 'auto',
        zIndex: 1000,
        // Ensure notifications are not clipped
        overflowX: 'hidden',
      }}
    >
      <Container size="xl" py="md" style={{ minHeight: '100%' }}>
        <Stack gap="md">
          {/* Header */}
          <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)' }}>
            <Group justify="space-between" align="center">
              <Group>
                <IconChefHat size={32} color={primary} />
                <Text size="xl" fw={700}>
                  {t('orders.kitchenDisplay', language)}
                </Text>
              </Group>
              <Tooltip 
                label={soundEnabled ? t('orders.disableSound', language) : t('orders.enableSound', language)}
                withArrow
                position="bottom"
                styles={{
                  tooltip: {
                    backgroundColor: 'var(--mantine-color-gray-9)',
                    color: 'var(--mantine-color-white)',
                  },
                }}
              >
                <ActionIcon
                  size="lg"
                  variant="light"
                  color={soundEnabled ? primary : 'gray'}
                  onClick={async () => {
                    // Resume audio context on toggle (user interaction)
                    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                      try {
                        await audioContextRef.current.resume();
                        audioResumedRef.current = true;
                        console.log('✅ Audio context resumed via toggle');
                      } catch (error) {
                        console.error('Failed to resume audio context:', error);
                      }
                    }
                    setSoundEnabled(!soundEnabled);
                  }}
                >
                  {soundEnabled ? <IconVolume size={20} /> : <IconVolumeOff size={20} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Paper>

          {loading ? (
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)', height: 'calc(100vh - 200px)' }}>
                  <Stack gap="md">
                    <Skeleton height={32} width="40%" />
                    <Stack gap="md">
                      {[1,2].map((i) => (
                        <Card key={i} withBorder p="md">
                          <Stack gap="sm">
                            <Group justify="space-between">
                              <Skeleton height={24} width="50%" />
                              <Skeleton height={24} width="20%" />
                            </Group>
                            <Skeleton height={16} width="60%" />
                            <Skeleton height={60} />
                            <Skeleton height={36} />
                          </Stack>
                        </Card>
                      ))}
                    </Stack>
                  </Stack>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)', height: 'calc(100vh - 200px)' }}>
                  <Stack gap="md">
                    <Skeleton height={32} width="40%" />
                    <Stack gap="md">
                      {[1, 2].map((i) => (
                        <Card key={i} withBorder p="md">
                          <Stack gap="sm">
                            <Group justify="space-between">
                              <Skeleton height={24} width="50%" />
                              <Skeleton height={24} width="20%" />
                            </Group>
                            <Skeleton height={16} width="60%" />
                            <Skeleton height={60} />
                            <Skeleton height={36} />
                          </Stack>
                        </Card>
                      ))}
                    </Stack>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          ) : (
            <Grid gutter="md">
              {/* Pending Orders Column */}
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)', height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
                  <Stack gap="md" style={{ flex: 1, overflow: 'hidden' }}>
                    <Group justify="space-between">
                      <Text fw={700} size="lg">
                        {t('orders.pending', language)} ({pendingOrders.length})
                      </Text>
                      <Badge color={getWarningColor()} size="lg">
                        {pendingOrders.length}
                      </Badge>
                    </Group>
                    <ScrollArea style={{ flex: 1 }}>
                      <Stack gap="md">
                        {pendingOrders.length === 0 ? (
                          <Center py="xl">
                            <Text c="dimmed">{t('orders.noPendingOrders', language)}</Text>
                          </Center>
                        ) : (
                          pendingOrders.map((order) => (
                            <OrderCard
                              key={order.id}
                              order={order}
                              language={language}
                              primary={primary}
                              onMarkAsReady={() => handleStartPreparing(order)}
                              onStartPreparing={() => handleStartPreparing(order)}
                              processing={processingOrderId === order.id}
                              getPriorityColor={getPriorityColor}
                              getOrderAge={getOrderAge}
                            />
                          ))
                        )}
                      </Stack>
                    </ScrollArea>
                  </Stack>
                </Paper>
              </Grid.Col>

              {/* Preparing Orders Column */}
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)', height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
                  <Stack gap="md" style={{ flex: 1, overflow: 'hidden' }}>
                    <Group justify="space-between">
                      <Text fw={700} size="lg">
                        {t('orders.preparing', language)} ({preparingOrders.length})
                      </Text>
                      <Badge color={getInfoColor()} size="lg">
                        {preparingOrders.length}
                      </Badge>
                    </Group>
                    <ScrollArea style={{ flex: 1 }}>
                      <Stack gap="md">
                        {preparingOrders.length === 0 ? (
                          <Center py="xl">
                            <Text c="dimmed">{t('orders.noPreparingOrders', language)}</Text>
                          </Center>
                        ) : (
                          preparingOrders.map((order) => (
                            <OrderCard
                              key={order.id}
                              order={order}
                              language={language}
                              primary={primary}
                              onMarkAsReady={() => handleMarkAsReady(order)}
                              onStartPreparing={() => handleStartPreparing(order)}
                              processing={processingOrderId === order.id}
                              getPriorityColor={getPriorityColor}
                              getOrderAge={getOrderAge}
                              showReadyButton
                            />
                          ))
                        )}
                      </Stack>
                    </ScrollArea>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

interface OrderCardProps {
  order: Order;
  language: 'en' | 'ar';
  primary: string;
  onMarkAsReady: () => void;
  onStartPreparing: () => void;
  processing: boolean;
  getPriorityColor: (order: Order) => string;
  getOrderAge: (order: Order) => string;
  showReadyButton?: boolean;
}

function OrderCard({
  order,
  language,
  primary,
  onMarkAsReady,
  onStartPreparing,
  processing,
  getPriorityColor,
  getOrderAge,
  showReadyButton = false,
}: OrderCardProps) {
  const priorityColor = getPriorityColor(order);
  const orderAge = getOrderAge(order);

  return (
    <Card
      withBorder
      p="md"
      style={{
        borderLeft: `4px solid ${priorityColor}`,
        backgroundColor: 'var(--mantine-color-white)',
      }}
    >
      <Stack gap="sm">
        {/* Order Header */}
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="xs">
              <Text fw={700} size="lg">
                {t('pos.orderNumber', language)}: {order.orderNumber}
              </Text>
              {order.tokenNumber && (
                <Badge color={primary} variant="light">
                  {t('pos.tokenNumber', language)}: {order.tokenNumber}
                </Badge>
              )}
            </Group>
            <Group gap="xs">
              <IconClock size={14} />
              <Text size="sm" c="dimmed">{orderAge}</Text>
              {order.table && (
                <Text size="sm" c="dimmed">
                  {t('pos.tableNo', language)}: {order.table.table_number}
                </Text>
              )}
            </Group>
          </Stack>
          <Badge color={getStatusColor(order.status)} size="lg">
            {t(`orders.status.${order.status}`, language)}
          </Badge>
        </Group>

        {/* Order Items */}
        <Box>
          <Text fw={600} size="sm" mb="xs">
            {t('pos.cartItems', language)}:
          </Text>
          {order.items && order.items.length > 0 ? (
            <Stack gap="xs">
              {order.items.map((item) => (
                <Paper key={item.id} p="xs" withBorder>
                  <Group justify="space-between">
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Text fw={500} size="sm">
                        {item.quantity}x{' '}
                        {item.foodItem
                          ? (language === 'ar' && item.foodItem.nameAr
                              ? item.foodItem.nameAr
                              : item.foodItem.nameEn || t('pos.item', language))
                          : t('pos.item', language) + ` #${item.foodItemId || item.id}`}
                      </Text>
                      {item.variation && item.variation.variationName && (
                        <Text size="xs" c="dimmed">
                          {item.variation.variationGroup}: {item.variation.variationName}
                        </Text>
                      )}
                      {item.addOns && item.addOns.length > 0 && item.addOns.some(a => a.addOn) && (
                        <Text size="xs" c="dimmed">
                          {t('pos.addOns', language)}:{' '}
                          {item.addOns
                            .filter(addOn => addOn.addOn)
                            .map(
                              (addOn) =>
                                (language === 'ar' && addOn.addOn?.nameAr
                                  ? addOn.addOn.nameAr
                                  : addOn.addOn?.nameEn) || ''
                            )
                            .filter(Boolean)
                            .join(', ') || '-'}
                        </Text>
                      )}
                      {item.specialInstructions && (
                        <Text size="xs" c="dimmed" fs="italic">
                          {t('pos.specialInstructions', language)}: {item.specialInstructions}
                        </Text>
                      )}
                    </Stack>
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed" p="xs">
              {t('orders.loadingItems', language) || 'Loading items...'}
            </Text>
          )}
        </Box>

        {/* Actions */}
        <Group>
          {!showReadyButton ? (
            <Button
              fullWidth
              onClick={onStartPreparing}
              loading={processing}
              leftSection={<IconChefHat size={16} />}
              color={primary}
            >
              {t('orders.startPreparing', language)}
            </Button>
          ) : (
            <Button
              fullWidth
              onClick={onMarkAsReady}
              loading={processing}
              leftSection={<IconCheck size={16} />}
              color={getSuccessColor()}
            >
              {t('orders.markAsReady', language)}
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

