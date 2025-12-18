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
import { useAuthStore } from '@/lib/store/auth-store';
import { onOrderUpdate, notifyOrderUpdate } from '@/lib/utils/order-events';
import { useKitchenSse, OrderUpdateEvent } from '@/lib/hooks/use-kitchen-sse';
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
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousOrderIdsRef = useRef<Set<string>>(new Set());
  const audioResumedRef = useRef<boolean>(false);
  const loadOrdersRef = useRef<typeof loadOrders>();
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  
  // Keep soundEnabled ref updated
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

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
  }, [soundEnabled]); // Removed loadOrders dependency

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
      // Fetch pending and preparing orders in a single call with items included
      // This reduces API calls from 2 + N (where N = number of orders) to just 1
      const allOrders = await ordersApi.getOrders({
        status: ['pending', 'preparing'],
        includeItems: true,
      });
      
      // Sort by order date (newest first)
      allOrders.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
      
      // Only update if data actually changed (to prevent unnecessary re-renders)
      setOrders((prevOrders) => {
        const prevIds = new Set(prevOrders.map(o => o.id));
        const newIds = new Set(allOrders.map(o => o.id));
        
        // Detect new orders (orders that exist in newIds but not in prevIds)
        const newOrderIds = [...newIds].filter(id => !prevIds.has(id));
        const hasNewOrders = newOrderIds.length > 0 && prevOrders.length > 0;
        
        const idsChanged = prevIds.size !== newIds.size || 
          [...prevIds].some(id => !newIds.has(id)) ||
          prevOrders.some(prev => {
            const updated = allOrders.find(o => o.id === prev.id);
            return updated && (updated.status !== prev.status || updated.updatedAt !== prev.updatedAt);
          });
        
        // Play sound for new orders detected
        if (hasNewOrders && soundEnabled) {
          console.log('🔔 New orders detected:', newOrderIds);
          // Use soundEnabled from closure, playSound will be called via ref if needed
          if (audioContextRef.current && audioResumedRef.current) {
            playSoundInternal(audioContextRef.current);
          }
        }
        
        // Update previous order IDs ref
        previousOrderIdsRef.current = newIds;
        
        if (idsChanged || prevOrders.length === 0) {
          return allOrders;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]); // Removed soundEnabled and playSound to prevent infinite loops - using refs instead

  // Set dayjs locale when language changes
  useEffect(() => {
    dayjs.locale(language === 'ar' ? 'ar' : 'en');
  }, [language]);

  // Store loadOrders in ref for stable reference
  useEffect(() => {
    loadOrdersRef.current = loadOrders;
  }, [loadOrders]);

  // Initial load on mount
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Server-Sent Events (SSE) for real-time kitchen display updates
  // Receives instant updates when orders are created or status changes
  // Falls back to polling if SSE fails
  const { isConnected, isConnecting } = useKitchenSse({
    onOrderUpdate: (event: OrderUpdateEvent) => {
      console.log('📨 Order update received via SSE:', event.type, event.orderId);
      
      // Play sound for new orders
      if (event.type === 'ORDER_CREATED' && soundEnabledRef.current) {
        console.log('🔔 New order detected via SSE - playing sound:', event.orderId);
        if (audioContextRef.current && audioResumedRef.current) {
          playSoundInternal(audioContextRef.current);
        }
      }
      
      // Reload orders to get latest data
      if (loadOrdersRef.current) {
        loadOrdersRef.current(true); // silent = true to avoid loading spinner
      }
    },
    onConnect: () => {
      console.log('✅ SSE connected - receiving real-time order updates');
    },
    onError: (error) => {
      console.error('❌ SSE connection error:', error);
      // Fallback: reload orders manually on error
      if (loadOrdersRef.current) {
        loadOrdersRef.current(true);
      }
    },
    enabled: true,
  });

  // Fallback polling if SSE is not connected AND not connecting (poll every 5 seconds)
  // Wait 3 seconds before starting fallback to give SSE time to connect
  // This ensures updates even if SSE fails, but doesn't interfere with SSE connection attempts
  const sseConnectedRef = useRef(isConnected);
  const sseConnectingRef = useRef(isConnecting);
  
  useEffect(() => {
    sseConnectedRef.current = isConnected;
    sseConnectingRef.current = isConnecting;
  }, [isConnected, isConnecting]);

  useEffect(() => {
    // Don't start polling if SSE is connected or actively connecting
    if (isConnected || isConnecting) {
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;

    // Wait 3 seconds before starting fallback polling
    // This gives SSE time to establish connection on page load
    const fallbackDelay = setTimeout(() => {
      // Double-check SSE is still not connected after delay (use refs for current state)
      if (!sseConnectedRef.current && !sseConnectingRef.current) {
        console.log('⚠️ SSE not connected after delay, using polling fallback');
        pollInterval = setInterval(() => {
          // Only poll if SSE is still not connected (check refs for current state)
          if (!sseConnectedRef.current && !sseConnectingRef.current && loadOrdersRef.current && navigator.onLine) {
            loadOrdersRef.current(true); // silent poll
          }
        }, 5000); // Poll every 5 seconds as fallback
      }
    }, 3000); // Wait 3 seconds before starting fallback

    return () => {
      clearTimeout(fallbackDelay);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isConnected, isConnecting]);

  // Listen for order status changes from other screens
  useEffect(() => {
    const unsubscribeStatusChanged = onOrderUpdate('order-status-changed', () => {
      if (loadOrdersRef.current) {
        loadOrdersRef.current(true); // silent reload
      }
    });

    return () => {
      unsubscribeStatusChanged();
    };
  }, []); // Empty deps - only set up once, use ref for latest function

  const handleMarkAsReady = async (order: Order) => {
    // Optimistic update: remove order immediately (before API call)
    const previousOrders = orders;
    setOrders(prevOrders => prevOrders.filter(o => o.id !== order.id));
    setProcessingOrderIds(prev => new Set(prev).add(order.id));
    
    try {
      await ordersApi.updateOrderStatus(order.id, { status: 'ready' });
      
      notifications.show({
        title: t('common.success' as any, language),
        message: t('orders.markedAsReady', language),
        color: getSuccessColor(),
      });
      
      // Notify same-browser screens about the status change (for immediate UI update)
      notifyOrderUpdate('order-status-changed', order.id);
    } catch (error: any) {
      // Revert optimistic update on error
      setOrders(previousOrders);
      
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('orders.updateError', language),
        color: getErrorColor(),
      });
    } finally {
      setProcessingOrderIds(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const handleStartPreparing = async (order: Order) => {
    // Optimistic update: change status immediately (before API call)
    const previousOrders = orders;
    setOrders(prevOrders => 
      prevOrders.map(o => 
        o.id === order.id 
          ? { ...o, status: 'preparing' as OrderStatus, updatedAt: new Date().toISOString() }
          : o
      )
    );
    setProcessingOrderIds(prev => new Set(prev).add(order.id));
    
    try {
      await ordersApi.updateOrderStatus(order.id, { status: 'preparing' });
      
      notifications.show({
        title: t('common.success' as any, language),
        message: t('orders.startedPreparing', language),
        color: getSuccessColor(),
      });
      
      // Notify same-browser screens about the status change (for immediate UI update)
      notifyOrderUpdate('order-status-changed', order.id);
    } catch (error: any) {
      // Revert optimistic update on error
      setOrders(previousOrders);
      
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('orders.updateError', language),
        color: getErrorColor(),
      });
    } finally {
      setProcessingOrderIds(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
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
      <Container fluid py="md" style={{ minHeight: '100%', width: '100%', paddingLeft: 0, paddingRight: 0, position: 'relative' }}>
        <Stack gap="md" style={{ width: '100%' }}>
          {/* Sound toggle - positioned absolutely */}
          <Box style={{ position: 'absolute', top: 10, right: 10, zIndex: 1001 }}>
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
          </Box>

          {loading ? (
            <Grid gutter="md" style={{ width: '100%', margin: 0 }}>
              {/* Pending Section Skeleton */}
              <Grid.Col span={6}>
                <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)', height: 'calc(100vh - 100px)' }}>
                  <Stack gap="md">
                    <Skeleton height={32} width="40%" />
                    <Grid gutter="md" style={{ margin: 0 }}>
                      {[0, 1, 2].map((colIndex) => (
                        <Grid.Col key={colIndex} span={4}>
                          <Stack gap="md">
                            {[1, 2].map((i) => (
                              <Card key={i} withBorder p="md">
                                <Stack gap="sm">
                                  <Skeleton height={24} width="50%" />
                                  <Skeleton height={60} />
                                  <Skeleton height={36} />
                                </Stack>
                              </Card>
                            ))}
                          </Stack>
                        </Grid.Col>
                      ))}
                    </Grid>
                  </Stack>
                </Paper>
              </Grid.Col>
              {/* Preparing Section Skeleton */}
              <Grid.Col span={6}>
                <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)', height: 'calc(100vh - 100px)' }}>
                  <Stack gap="md">
                    <Skeleton height={32} width="40%" />
                    <Grid gutter="md" style={{ margin: 0 }}>
                      {[0, 1, 2].map((colIndex) => (
                        <Grid.Col key={colIndex} span={4}>
                          <Stack gap="md">
                            {[1, 2].map((i) => (
                              <Card key={i} withBorder p="md">
                                <Stack gap="sm">
                                  <Skeleton height={24} width="50%" />
                                  <Skeleton height={60} />
                                  <Skeleton height={36} />
                                </Stack>
                              </Card>
                            ))}
                          </Stack>
                        </Grid.Col>
                      ))}
                    </Grid>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          ) : (
            <Grid gutter="md" style={{ width: '100%', margin: 0 }}>
              {/* Pending Section with 3 Columns */}
              <Grid.Col span={6}>
                <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
                  <Stack gap="md" style={{ flex: 1, overflow: 'hidden' }}>
                    <Text fw={700} size="lg">
                      {t('orders.pending', language)} ({pendingOrders.length})
                    </Text>
                    <ScrollArea style={{ flex: 1, overflowX: 'hidden' }} type="scroll">
                      <Grid gutter="md" style={{ margin: 0 }}>
                        {[0, 1, 2].map((colIndex) => {
                          const columnOrders = pendingOrders.filter((_, index) => index % 3 === colIndex);
                          return (
                            <Grid.Col key={`pending-${colIndex}`} span={4} style={{ overflow: 'hidden' }}>
                              <Stack gap="md">
                                {columnOrders.length === 0 && colIndex === 0 ? (
                                  <Center py="xl">
                                    <Text c="dimmed">{t('orders.noPendingOrders', language)}</Text>
                                  </Center>
                                ) : (
                                  columnOrders.map((order) => (
                                    <OrderCard
                                      key={order.id}
                                      order={order}
                                      language={language}
                                      primary={primary}
                                      onMarkAsReady={() => handleStartPreparing(order)}
                                      onStartPreparing={() => handleStartPreparing(order)}
                                      processing={processingOrderIds.has(order.id)}
                                      getPriorityColor={getPriorityColor}
                                      getOrderAge={getOrderAge}
                                    />
                                  ))
                                )}
                              </Stack>
                            </Grid.Col>
                          );
                        })}
                      </Grid>
                    </ScrollArea>
                  </Stack>
                </Paper>
              </Grid.Col>

              {/* Preparing Section with 3 Columns */}
              <Grid.Col span={6}>
                <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-white)', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
                  <Stack gap="md" style={{ flex: 1, overflow: 'hidden' }}>
                    <Text fw={700} size="lg">
                      {t('orders.preparing', language)} ({preparingOrders.length})
                    </Text>
                    <ScrollArea style={{ flex: 1, overflowX: 'hidden' }} type="scroll">
                      <Grid gutter="md" style={{ margin: 0 }}>
                        {[0, 1, 2].map((colIndex) => {
                          const columnOrders = preparingOrders.filter((_, index) => index % 3 === colIndex);
                          return (
                            <Grid.Col key={`preparing-${colIndex}`} span={4} style={{ overflow: 'hidden' }}>
                              <Stack gap="md">
                                {columnOrders.length === 0 && colIndex === 0 ? (
                                  <Center py="xl">
                                    <Text c="dimmed">{t('orders.noPreparingOrders', language)}</Text>
                                  </Center>
                                ) : (
                                  columnOrders.map((order) => (
                                    <OrderCard
                                      key={order.id}
                                      order={order}
                                      language={language}
                                      primary={primary}
                                      onMarkAsReady={() => handleMarkAsReady(order)}
                                      onStartPreparing={() => handleStartPreparing(order)}
                                      processing={processingOrderIds.has(order.id)}
                                      getPriorityColor={getPriorityColor}
                                      getOrderAge={getOrderAge}
                                      showReadyButton
                                    />
                                  ))
                                )}
                              </Stack>
                            </Grid.Col>
                          );
                        })}
                      </Grid>
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
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <Stack gap="sm">
        {/* Order Header */}
        <Group gap="xs" align="center">
          {order.tokenNumber && (
            <Badge color={primary} variant="light" size="lg">
              Token: {order.tokenNumber}
            </Badge>
          )}
          <IconClock size={14} />
          <Text size="sm" c="dimmed">{orderAge}</Text>
          {order.orderType && (
            <Badge 
              color={
                order.orderType === 'delivery' ? getInfoColor()  :
                order.orderType === 'takeaway' ? getWarningColor() :
                getSuccessColor()
              } 
              variant="light" 
              size="sm"
            >
              {t(`orders.orderType.${order.orderType}` as any, language)}
            </Badge>
          )}
        </Group>

        {/* Order Items */}
        <Box>
          {order.items && order.items.length > 0 ? (
            <Stack gap={0}>
              {order.items.map((item) => (
                <Paper key={item.id} >
                  <Group justify="space-between" wrap="nowrap" style={{ padding: '2px 2px' }}>
                    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={500} size="md" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {item.quantity}x{' '}
                        {item.foodItem
                          ? (item.foodItem.name || t('pos.item', language))
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
                                addOn.addOn?.name || ''
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

