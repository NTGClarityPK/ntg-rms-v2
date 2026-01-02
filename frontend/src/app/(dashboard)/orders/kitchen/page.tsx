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
  TextInput,
  Chip,
} from '@mantine/core';
import {
  IconClock,
  IconChefHat,
  IconVolume,
  IconVolumeOff,
  IconRefresh,
  IconSearch,
  IconArrowLeft,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { ordersApi, Order, OrderStatus } from '@/lib/api/orders';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { notifications } from '@mantine/notifications';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor, getWarningColor, getInfoColor, getStatusColor, getBadgeColorForText } from '@/lib/utils/theme';
import { useTheme } from '@/lib/hooks/use-theme';
import { generateThemeColors } from '@/lib/utils/themeColors';
import { useAuthStore } from '@/lib/store/auth-store';
import { onOrderUpdate, notifyOrderUpdate } from '@/lib/utils/order-events';
import { useKitchenSse, OrderUpdateEvent } from '@/lib/hooks/use-kitchen-sse';
import { menuApi } from '@/lib/api/menu';
import Link from 'next/link';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ar';
import 'dayjs/locale/en';

dayjs.extend(relativeTime);

type KitchenStatus = 'preparing' | 'ready';

export default function KitchenDisplayPage() {
  const { language } = useLanguageStore();
  const primary = useThemeColor();
  const { user } = useAuthStore();
  const { isDark } = useTheme();
  const themeColors = generateThemeColors(primary, isDark);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMyOrdersOnly, setShowMyOrdersOnly] = useState(false);
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set()); // Format: "orderId-itemId" or "orderId"
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousOrderIdsRef = useRef<Set<string>>(new Set());
  const audioResumedRef = useRef<boolean>(false);
  const loadOrdersRef = useRef<typeof loadOrders>();
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const [variationGroupsMap, setVariationGroupsMap] = useState<Map<string, string>>(new Map());

  // Helper function to resolve variation group name from UUID
  const resolveVariationGroupName = (variationGroup: string | undefined): string => {
    if (!variationGroup) return '';
    // Check if it's a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variationGroup);
    if (isUUID) {
      return variationGroupsMap.get(variationGroup) || variationGroup;
    }
    return variationGroup;
  };

  // Load variation groups to resolve UUIDs to names
  useEffect(() => {
    const loadVariationGroups = async () => {
      try {
        const groupsResponse = await menuApi.getVariationGroups();
        const groups = Array.isArray(groupsResponse) ? groupsResponse : (groupsResponse?.data || []);
        const map = new Map<string, string>();
        groups.forEach((group: any) => {
          map.set(group.id, group.name);
        });
        setVariationGroupsMap(map);
      } catch (error) {
        console.error('Failed to load variation groups:', error);
      }
    };
    loadVariationGroups();
  }, []);
  
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
      // Fetch preparing and ready orders in a single call with items included
      // This reduces API calls from 2 + N (where N = number of orders) to just 1
      const allOrdersResponse = await ordersApi.getOrders({
        status: ['preparing', 'ready'],
        includeItems: true,
      });
      
      // Handle both paginated and non-paginated responses
      const allOrders: Order[] = isPaginatedResponse(allOrdersResponse) 
        ? allOrdersResponse.data 
        : allOrdersResponse;
      
      // Sort by order date (oldest first)
      allOrders.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());
      
      // Merge new data with existing optimistic updates to prevent flickering
      setOrders((prevOrders) => {
        const prevIds = new Set(prevOrders.map(o => o.id));
        const newIds = new Set(allOrders.map(o => o.id));
        
        // Detect new orders (orders that exist in newIds but not in prevIds)
        const newOrderIds = [...newIds].filter(id => !prevIds.has(id));
        const hasNewOrders = newOrderIds.length > 0 && prevOrders.length > 0;
        
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
        
        // Merge server data with optimistic updates
        // This preserves items that are in transition (e.g., just moved from preparing to ready)
        const mergedOrders = allOrders.map(serverOrder => {
          const prevOrder = prevOrders.find(p => p.id === serverOrder.id);
          
          // If we have a previous order, merge item statuses to preserve optimistic updates
          if (prevOrder && prevOrder.items && serverOrder.items) {
            // Create a map of server items by ID
            const serverItemsMap = new Map(serverOrder.items.map(item => [item.id, item]));
            
            // Merge items: use server data but preserve any items that are in transition
            const mergedItems = prevOrder.items.map(prevItem => {
              const serverItem = serverItemsMap.get(prevItem.id);
              
              // If item exists in server response, use server data
              if (serverItem) {
                // However, if the prev item has a more recent status change (optimistic update),
                // prefer the prev item's status if it's different and recent
                const orderUpdated = prevOrder.updatedAt;
                if (orderUpdated && prevItem.status !== serverItem.status) {
                  const timeSinceUpdate = Date.now() - new Date(orderUpdated).getTime();
                  // If optimistic update was within last 3 seconds, prefer it
                  if (timeSinceUpdate < 3000) {
                    return { ...serverItem, status: prevItem.status };
                  }
                }
                return serverItem;
              }
              
              // If item doesn't exist in server response but exists in prev (transitioning),
              // keep it temporarily to prevent flickering
              // Only keep it if it's been updated recently (within last 3 seconds)
              const orderUpdated = prevOrder.updatedAt;
              if (orderUpdated) {
                const timeSinceUpdate = Date.now() - new Date(orderUpdated).getTime();
                if (timeSinceUpdate < 3000) {
                  return prevItem;
                }
              }
              
              return null;
            }).filter(Boolean) as typeof prevOrder.items;
            
            // Also add any new items from server that weren't in prev
            if (serverOrder.items) {
              serverOrder.items.forEach(serverItem => {
                if (!prevOrder.items?.find(p => p.id === serverItem.id)) {
                  mergedItems.push(serverItem);
                }
              });
            }
            
            return {
              ...serverOrder,
              items: mergedItems,
            };
          }
          
          return serverOrder;
        });
        
        // Check if we need to update
        const hasChanges = prevOrders.length === 0 || 
          prevOrders.length !== mergedOrders.length ||
          prevOrders.some(prev => {
            const merged = mergedOrders.find(o => o.id === prev.id);
            if (!merged) return true;
            // Check if order status changed
            if (merged.status !== prev.status) return true;
            // Check if any item statuses changed
            if (prev.items && merged.items) {
              const prevItemStatuses = prev.items.map(i => i.status).join(',');
              const mergedItemStatuses = merged.items.map(i => i.status).join(',');
              if (prevItemStatuses !== mergedItemStatuses) return true;
            }
            return false;
          });
        
        return hasChanges ? mergedOrders : prevOrders;
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
          if (!sseConnectedRef.current && !sseConnectingRef.current && loadOrdersRef.current) {
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

  const handleItemClick = async (order: Order, itemId: string, currentSection: 'preparing' | 'ready') => {
    const item = order.items?.find(i => i.id === itemId);
    if (!item) return;

    const currentStatus = item.status || 'preparing';
    
    // If clicking in preparing section, move to ready
    if (currentSection === 'preparing' && currentStatus === 'preparing') {
      await updateItemStatus(order, itemId, 'ready');
    } 
    // If clicking in ready section, mark as served
    else if (currentSection === 'ready' && currentStatus === 'ready') {
      await updateItemStatus(order, itemId, 'served');
    }
  };

  const updateItemStatus = async (order: Order, itemId: string, newStatus: 'preparing' | 'ready' | 'served') => {

    const previousOrders = orders;
    
    // Optimistic update: update item status immediately
    setOrders(prevOrders => 
      prevOrders.map(o => {
        if (o.id !== order.id) return o;
        return {
          ...o,
          items: o.items?.map(i => 
            i.id === itemId 
              ? { ...i, status: newStatus }
              : i
          ),
          updatedAt: new Date().toISOString(),
        };
      })
    );
    
    const processingKey = `${order.id}-${itemId}`;
    setProcessingOrderIds(prev => new Set(prev).add(processingKey));
    
    try {
      await ordersApi.updateOrderItemStatus(order.id, itemId, { status: newStatus });
      
      // Notify same-browser screens about the status change
      notifyOrderUpdate('order-status-changed', order.id);
      
      // Don't reload immediately - the optimistic update is already in place
      // Only reload if we need to check order status changes (which happens via SSE or polling)
      // This prevents flickering when items move between sections
    } catch (error: any) {
      // Revert optimistic update on error
      setOrders(previousOrders);
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.response?.data?.message || t('orders.updateError', language),
        color: getErrorColor(),
      });
      // Network errors are already handled above and change is queued
    } finally {
      setProcessingOrderIds(prev => {
        const next = new Set(prev);
        next.delete(processingKey);
        return next;
      });
    }
  };

  const handleBulkAction = async (order: Order, action: 'ready' | 'served') => {
    if (!order.items || order.items.length === 0) return;

    if (action === 'ready') {
      // Move all preparing items to ready
      const itemsToAdvance = order.items.filter(item => {
        if (item.buffetId || item.buffet) return false;
        return (item.status || 'preparing') === 'preparing';
      });

      if (itemsToAdvance.length === 0) return;

      const previousOrders = orders;
      
      // Optimistic update: update all items immediately
      const updateTimestamp = new Date().toISOString();
      setOrders(prevOrders => 
        prevOrders.map(o => {
          if (o.id !== order.id) return o;
          return {
            ...o,
            items: o.items?.map(i => {
              const shouldUpdate = itemsToAdvance.some(item => item.id === i.id);
              return shouldUpdate 
                ? { ...i, status: 'ready' as const, updatedAt: updateTimestamp }
                : i;
            }),
            updatedAt: updateTimestamp,
          };
        })
      );

      // Mark all items as processing
      const processingKeys = itemsToAdvance.map(item => `${order.id}-${item.id}`);
      setProcessingOrderIds(prev => {
        const next = new Set(prev);
        processingKeys.forEach(key => next.add(key));
        return next;
      });

      try {
        await Promise.all(
          itemsToAdvance.map(item => 
            ordersApi.updateOrderItemStatus(order.id, item.id, { status: 'ready' })
          )
        );

        // Notify same-browser screens about the status change
        notifyOrderUpdate('order-status-changed', order.id);

        // Don't reload immediately - the optimistic update is already in place
        // This prevents flickering when items move between sections
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
          processingKeys.forEach(key => next.delete(key));
          return next;
        });
      }
    } else if (action === 'served') {
      // Mark all ready items as served
      const readyItems = order.items.filter(item => {
        if (item.buffetId || item.buffet) return false;
        return (item.status || 'preparing') === 'ready';
      });

      if (readyItems.length === 0) return;

      const previousOrders = orders;
      
      // Optimistic update: update all items immediately
      const updateTimestamp = new Date().toISOString();
      setOrders(prevOrders => 
        prevOrders.map(o => {
          if (o.id !== order.id) return o;
          return {
            ...o,
            items: o.items?.map(i => {
              const shouldUpdate = readyItems.some(item => item.id === i.id);
              return shouldUpdate 
                ? { ...i, status: 'served' as const, updatedAt: updateTimestamp }
                : i;
            }),
            updatedAt: updateTimestamp,
          };
        })
      );

      // Mark all items as processing
      const processingKeys = readyItems.map(item => `${order.id}-${item.id}`);
      setProcessingOrderIds(prev => {
        const next = new Set(prev);
        processingKeys.forEach(key => next.add(key));
        return next;
      });

      try {
        await Promise.all(
          readyItems.map(item => 
            ordersApi.updateOrderItemStatus(order.id, item.id, { status: 'served' })
          )
        );

        // Notify same-browser screens about the status change
        notifyOrderUpdate('order-status-changed', order.id);

        // Don't reload immediately - the optimistic update is already in place
        // This prevents flickering when items move between sections
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
          processingKeys.forEach(key => next.delete(key));
          return next;
        });
      }
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

  // Filter orders based on search query (token number or food items) and "My Orders" filter
  const filterOrders = useCallback((ordersList: Order[]): Order[] => {
    let filtered = ordersList;

    // Apply "My Orders" filter first
    if (showMyOrdersOnly && user?.email) {
      filtered = filtered.filter((order) => order.waiterEmail === user.email);
    }

    // Then apply search query filter
    if (!searchQuery.trim()) {
      return filtered;
    }

    const query = searchQuery.toLowerCase().trim();
    
    return filtered.filter((order) => {
      // Search by token number
      if (order.tokenNumber && order.tokenNumber.toLowerCase().includes(query)) {
        return true;
      }

      // Search by food item names
      if (order.items && order.items.length > 0) {
        const matchesFoodItem = order.items.some((item) => {
          const foodItemName = item.foodItem?.name?.toLowerCase() || '';
          return foodItemName.includes(query);
        });
        if (matchesFoodItem) {
          return true;
        }
      }

      return false;
    });
  }, [searchQuery, showMyOrdersOnly, user?.email]);

  const filteredOrders = filterOrders(orders);
  // Filter out orders that only contain buffets (no food items or combo meals)
  const ordersWithoutBuffetsOnly = filteredOrders.filter((order) => {
    if (!order.items || order.items.length === 0) return false; // Don't show orders with no items
    // Check if order has any non-buffet items (food items or combo meals)
    const hasNonBuffetItems = order.items.some(
      (item) => !item.buffetId && !item.buffet && (item.foodItemId || item.foodItem || item.comboMealId || item.comboMeal)
    );
    return hasNonBuffetItems; // Only keep orders that have at least one non-buffet item
  });

  // Filter orders by item status, not order status
  // An order appears in preparing if it has preparing items, and in ready if it has ready items
  const preparingOrders = ordersWithoutBuffetsOnly.filter((order) => {
    const items = order.items?.filter((item) => !item.buffetId && !item.buffet) || [];
    return items.some((item) => {
      const status = item.status || 'preparing';
      return status === 'preparing';
    });
  });

  const readyOrders = ordersWithoutBuffetsOnly.filter((order) => {
    const items = order.items?.filter((item) => !item.buffetId && !item.buffet) || [];
    if (items.length === 0) return false;
    
    // Check if order has preparing items
    const hasPreparingItems = items.some((item) => {
      const status = item.status || 'preparing';
      return status === 'preparing';
    });
    
    // Check if order has ready items
    const hasReadyItems = items.some((item) => {
      const status = item.status || 'preparing';
      return status === 'ready';
    });
    
    // Check if order has served items
    const hasServedItems = items.some((item) => {
      const status = item.status || 'preparing';
      return status === 'served';
    });
    
    // Check if ALL items are served (no preparing, no ready)
    const allItemsServed = !hasPreparingItems && !hasReadyItems && hasServedItems;
    
    // Show order in ready section if:
    // 1. It has ready items (always show), OR
    // 2. It has served items AND still has preparing items (requirement: show strikethrough when some items still preparing)
    // Hide order only if ALL items are served AND no preparing items (requirement: disappear when all ready and click bulk served)
    // Note: Individual item clicks will keep items visible as long as there are preparing or ready items
    return hasReadyItems || (hasServedItems && hasPreparingItems);
  });

  return (
    <Box
      style={{
        position: 'fixed',
        top: 60, // Account for AppShell header height
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: themeColors.colorLight,
        overflow: 'auto',
        zIndex: 1000,
        // Ensure notifications are not clipped
        overflowX: 'hidden',
      }}
    >
      <Container fluid py="md" style={{ minHeight: '100%', width: '100%', paddingLeft: 0, paddingRight: 0, position: 'relative' }}>
        <Stack gap="md" style={{ width: '100%' }}>
          {/* Controls - positioned absolutely */}
          <Box style={{ position: 'absolute', top: 10, right: 10, zIndex: 1001 }}>
            <Group gap="xs">
              {/* Back to Orders button */}
              <Tooltip 
                label={t('orders.backToOrders' as any, language) || 'Back to Orders'}
                withArrow
                position="bottom"
                styles={{
                  tooltip: {
                    backgroundColor: isDark ? themeColors.colorDark : themeColors.colorTextDark,
                    color: isDark ? themeColors.colorTextDark : themeColors.colorCard,
                  },
                }}
              >
                <ActionIcon
                  size="lg"
                  variant="light"
                  color={primary}
                  component={Link}
                  href="/orders"
                >
                  <IconArrowLeft size={20} />
                </ActionIcon>
              </Tooltip>
              
              {/* Refresh button */}
              <Tooltip 
                label={t('common.refresh', language) || 'Refresh'}
                withArrow
                position="bottom"
                styles={{
                  tooltip: {
                    backgroundColor: isDark ? themeColors.colorDark : themeColors.colorTextDark,
                    color: isDark ? themeColors.colorTextDark : themeColors.colorCard,
                  },
                }}
              >
                <ActionIcon
                  size="lg"
                  variant="light"
                  color={primary}
                  onClick={() => loadOrders()}
                  loading={loading}
                >
                  <IconRefresh size={20} />
                </ActionIcon>
              </Tooltip>
              
              {/* Sound toggle */}
              <Tooltip 
                label={soundEnabled ? t('orders.disableSound', language) : t('orders.enableSound', language)}
                withArrow
                position="bottom"
                styles={{
                  tooltip: {
                    backgroundColor: isDark ? themeColors.colorDark : themeColors.colorTextDark,
                    color: isDark ? themeColors.colorTextDark : themeColors.colorCard,
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
          </Box>

          {/* Search input and My Orders filter */}
          <Box style={{ padding: '0 16px', marginTop: 10 }}>
            <Group gap="md" align="center">
              <TextInput
                placeholder={t('orders.searchByTokenOrItems', language)}
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                style={{ maxWidth: 400 }}
              />
              <Chip
                checked={showMyOrdersOnly}
                onChange={(checked) => setShowMyOrdersOnly(checked)}
                variant="filled"
              >
                {t('orders.myOrders', language)}
              </Chip>
            </Group>
          </Box>

          {loading ? (
            <Grid gutter="md" style={{ width: '100%', margin: 0, marginTop: 50 }}>
              {/* Preparing Section Skeleton */}
              <Grid.Col span={6}>
                <Paper p="md" withBorder style={{ backgroundColor: themeColors.colorCard, height: 'calc(100vh - 100px)' }}>
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
              {/* Ready Section Skeleton */}
              <Grid.Col span={6}>
                <Paper p="md" withBorder style={{ backgroundColor: themeColors.colorCard, height: 'calc(100vh - 100px)' }}>
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
            <Grid gutter="md" style={{ width: '100%', margin: 0, marginTop: 50 }}>
              {/* Preparing Section with 3 Columns */}
              <Grid.Col span={6}>
                <Paper p="md" withBorder style={{ backgroundColor: themeColors.colorCard, height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
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
                                       onItemClick={handleItemClick}
                                       onBulkAction={handleBulkAction}
                                       processingOrderIds={processingOrderIds}
                                       getPriorityColor={getPriorityColor}
                                       getOrderAge={getOrderAge}
                                       showStatus="preparing"
                                       resolveVariationGroupName={resolveVariationGroupName}
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

              {/* Ready To Serve Section with 3 Columns */}
              <Grid.Col span={6}>
                <Paper p="md" withBorder style={{ backgroundColor: themeColors.colorCard, height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
                  <Stack gap="md" style={{ flex: 1, overflow: 'hidden' }}>
                    <Text fw={700} size="lg">
                      {(t('orders.readyToServe' as any, language) || 'Ready To Serve')} ({readyOrders.length})
                    </Text>
                    <ScrollArea style={{ flex: 1, overflowX: 'hidden' }} type="scroll">
                      <Grid gutter="md" style={{ margin: 0 }}>
                        {[0, 1, 2].map((colIndex) => {
                          const columnOrders = readyOrders.filter((_, index) => index % 3 === colIndex);
                          return (
                            <Grid.Col key={`ready-${colIndex}`} span={4} style={{ overflow: 'hidden' }}>
                              <Stack gap="md">
                                 {columnOrders.length === 0 && colIndex === 0 ? (
                                   <Center py="xl">
                                     <Text c="dimmed">{t('orders.noReadyOrders' as any, language) || 'No ready orders'}</Text>
                                   </Center>
                                 ) : (
                                   columnOrders.map((order) => (
                                     <OrderCard
                                       key={order.id}
                                       order={order}
                                       language={language}
                                       primary={primary}
                                       onItemClick={handleItemClick}
                                       onBulkAction={handleBulkAction}
                                       processingOrderIds={processingOrderIds}
                                       getPriorityColor={getPriorityColor}
                                       getOrderAge={getOrderAge}
                                       showStatus="ready"
                                       resolveVariationGroupName={resolveVariationGroupName}
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
  onItemClick: (order: Order, itemId: string, currentSection: 'preparing' | 'ready') => void;
  onBulkAction: (order: Order, action: 'ready' | 'served') => void;
  processingOrderIds: Set<string>;
  getPriorityColor: (order: Order) => string;
  getOrderAge: (order: Order) => string;
  showStatus: 'preparing' | 'ready'; // Which status column this card is in
  resolveVariationGroupName: (variationGroup: string | undefined) => string;
}

function OrderCard({
  order,
  language,
  primary,
  onItemClick,
  onBulkAction,
  processingOrderIds,
  getPriorityColor,
  getOrderAge,
  showStatus,
  resolveVariationGroupName,
}: OrderCardProps) {
  const { isDark } = useTheme();
  const themeColors = generateThemeColors(primary, isDark);
  const priorityColor = getPriorityColor(order);
  const orderAge = getOrderAge(order);

  return (
    <Card
      withBorder
      p="md"
      style={{
        borderLeft: `4px solid ${priorityColor}`,
        backgroundColor: themeColors.colorCard,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <Stack gap="sm">
        {/* Order Header */}
        <Stack gap="xs">
          <Group gap="xs" align="center">
            {order.tokenNumber && (
              <Badge color={getBadgeColorForText(`${t('orders.token', language)}: ${order.tokenNumber}`)} variant="light" size="lg">
                {t('orders.token', language)}: {order.tokenNumber}
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
          {/* Waiter and Table Info */}
          <Group gap="md" align="center">
            {order.waiterEmail && (
              <Text size="sm" fw={500}>
                {t('orders.waiterName', language)}: <Text span c="dimmed" fw={400}>{order.waiterEmail}</Text>
              </Text>
            )}
            {((order as any).tables && (order as any).tables.length > 0) || (order.table && order.table.table_number) ? (
              <Text size="sm" fw={500}>
                {t('orders.tableNumber', language)}: <Text span c="dimmed" fw={400}>{
                  (order as any).tables && (order as any).tables.length > 0
                    ? (order as any).tables.map((t: any) => t.table_number).join(', ')
                    : (order.table?.table_number || '')
                }</Text>
              </Text>
            ) : null}
          </Group>
        </Stack>

         {/* Order Items */}
         <Box>
           {order.items && order.items.length > 0 ? (
             <Stack gap={4}>
                {order.items
                  .filter((item) => {
                    // Filter out buffets
                    if (item.buffetId || item.buffet) return false;
                    const itemStatus = item.status || 'preparing';
                    // In ready section, show both ready and served items (served will have line-through)
                    // In preparing section, show only preparing items
                    if (showStatus === 'ready') {
                      return itemStatus === 'ready' || itemStatus === 'served';
                    }
                    return itemStatus === showStatus;
                  })
                  .map((item) => {
                    const itemStatus = item.status || 'preparing';
                    const isProcessing = processingOrderIds.has(`${order.id}-${item.id}`);
                    const isServed = itemStatus === 'served';
                    // In ready section, can click if item is ready (not served)
                    // In preparing section, can click if item is preparing
                    const canClick = showStatus === 'preparing' 
                      ? itemStatus === 'preparing' 
                      : (itemStatus === 'ready');
                   
                   // For combo meals, show constituent food items
                   if (item.comboMealId && item.comboMeal) {
                     return (
                        <Box
                          key={item.id}
                          p="xs"
                          style={{
                            cursor: canClick ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                            opacity: isServed ? '0.5' : (isProcessing ? '0.6' : '1'),
                          }}
                          onClick={() => canClick && !isProcessing && onItemClick(order, item.id, showStatus)}
                          onMouseEnter={(e) => {
                            if (canClick && !isProcessing && !isServed) {
                              e.currentTarget.style.opacity = '0.8';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = isServed ? '0.5' : (isProcessing ? '0.6' : '1');
                          }}
                        >
                          <Stack gap={2}>
                            <Text 
                              fw={500} 
                              size="md" 
                              c={isServed ? 'dimmed' : primary} 
                              style={{ 
                                wordBreak: 'break-word', 
                                overflowWrap: 'break-word', 
                                textDecoration: isServed ? 'line-through' : 'none',
                                textDecorationThickness: isServed ? '3px' : 'auto',
                                textDecorationColor: isServed ? '#999' : 'inherit',
                                display: 'inline-block',
                              }}
                            >
                              {item.quantity}x {item.comboMeal.name || t('pos.comboMeal', language)}
                            </Text>
                           {item.comboMeal.foodItems && item.comboMeal.foodItems.length > 0 && (
                                                         <Stack gap={2} style={{ paddingLeft: 12, borderLeft: `2px solid ${isDark ? themeColors.primaryDark : themeColors.primaryLight}` }}>
                               {item.comboMeal.foodItems.map((foodItem, idx) => (
                                 <Text key={idx} size="sm" c="dimmed" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                   • {foodItem.name || t('pos.item', language)}
                                 </Text>
                               ))}
                             </Stack>
                           )}
                           {item.specialInstructions && (
                             <Text size="xs" c="dimmed" fs="italic">
                               {t('pos.specialInstructions', language)}: {item.specialInstructions}
                             </Text>
                           )}
                         </Stack>
                       </Box>
                     );
                   }
                   
                   // Regular food items
                   return (
                     <Box
                       key={item.id}
                       p="xs"
                       style={{
                         cursor: canClick ? 'pointer' : 'default',
                         transition: 'all 0.2s ease',
                         opacity: isServed ? '0.5' : (isProcessing ? '0.6' : '1'),
                       }}
                       onClick={() => canClick && !isProcessing && onItemClick(order, item.id, showStatus)}
                       onMouseEnter={(e) => {
                         if (canClick && !isProcessing && !isServed) {
                           e.currentTarget.style.opacity = '0.8';
                         }
                       }}
                       onMouseLeave={(e) => {
                         e.currentTarget.style.opacity = isServed ? '0.5' : (isProcessing ? '0.6' : '1');
                       }}
                     >
                       <Stack gap={2}>
                         <Text 
                           fw={500} 
                           size="md" 
                           c={isServed ? 'dimmed' : undefined}
                           style={{ 
                             wordBreak: 'break-word', 
                             overflowWrap: 'break-word', 
                             textDecoration: isServed ? 'line-through' : 'none',
                             textDecorationThickness: isServed ? '3px' : 'auto',
                             textDecorationColor: isServed ? '#999' : 'inherit',
                             display: 'inline-block',
                           }}
                         >
                           {item.quantity}x{' '}
                           {item.foodItem
                             ? (item.foodItem.name || t('pos.item', language))
                             : t('pos.item', language) + ` #${item.foodItemId || item.id}`}
                         </Text>
                         {item.variation && item.variation.variationName && (
                           <Text size="xs" c="dimmed">
                             {resolveVariationGroupName(item.variation.variationGroup)}: {item.variation.variationName}
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
                     </Box>
                   );
                 })}
             </Stack>
           ) : (
             <Text size="sm" c="dimmed" p="xs">
               {t('orders.loadingItems', language) || 'Loading items...'}
             </Text>
           )}
         </Box>

        {/* Bulk Action Button - only show if there are items in this column's status */}
        {order.items && order.items.length > 0 && (() => {
           const items = order.items.filter((item) => {
             if (item.buffetId || item.buffet) return false;
             const itemStatus = item.status || 'preparing';
             // In ready section, only show ready items (not served) for the button
             // In preparing section, show preparing items
             if (showStatus === 'ready') {
               return itemStatus === 'ready';
             }
             return itemStatus === showStatus;
           });
          
          if (items.length === 0) return null; // No items in this status
          
          const isProcessing = items.some(item => processingOrderIds.has(`${order.id}-${item.id}`));
          
          return (
            <Button
              fullWidth
              onClick={() => onBulkAction(order, showStatus === 'preparing' ? 'ready' : 'served')}
              loading={isProcessing}
              color={showStatus === 'preparing' ? getSuccessColor() : primary}
              size="md"
              radius="md"
              style={{ marginTop: '8px' }}
            >
              {showStatus === 'preparing'
                ? (t('orders.ready', language) || 'Ready')
                : (t('orders.served', language) || 'Served')}
            </Button>
          );
        })()}

      </Stack>
    </Card>
  );
}

