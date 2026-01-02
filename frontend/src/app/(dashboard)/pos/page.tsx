'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { Grid, Box, Select, Group, Text, Stack, Skeleton, Title, Paper, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLanguageStore } from '@/lib/store/language-store';
import { FoodItemsGrid, POSCart } from '@/features/pos';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { t } from '@/lib/utils/translations';
import { ordersApi } from '@/lib/api/orders';
import { useSettings } from '@/lib/hooks/use-settings';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { menuApi } from '@/lib/api/menu';
import { restaurantApi } from '@/lib/api/restaurant';

function POSPageContent() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const { settings } = useSettings();
  const { isOnline } = useSyncStatus();
  const searchParams = useSearchParams();
  const editOrderId = searchParams?.get('editOrder');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize order type from settings
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null); // Deprecated: use selectedTableIds
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [numberOfPersons, setNumberOfPersons] = useState<number>(1);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [currentItemType, setCurrentItemType] = useState<'food-items' | 'buffets' | 'combo-meals'>('food-items');

  // Update order type when settings change (only on initial load, not when editing)
  useEffect(() => {
    if (settings?.general?.defaultOrderType && !editOrderId) {
      setOrderType(settings.general.defaultOrderType as 'dine_in' | 'takeaway' | 'delivery');
    } else if (!settings?.general?.defaultOrderType && !editOrderId) {
      // If no default is set, use 'dine_in'
      setOrderType('dine_in');
    }
  }, [settings?.general?.defaultOrderType, editOrderId]);

  // Load order for editing if editOrderId is present
  useEffect(() => {
    const loadOrderForEditing = async () => {
      if (!editOrderId || !user?.tenantId) return;

      try {
        setEditingOrderId(editOrderId);
        
        const order = await ordersApi.getOrderById(editOrderId);

        // Set order details
        if (order.branchId) {
          setSelectedBranchId(order.branchId);
        }
        if (order.tableId) {
          setSelectedTableId(order.tableId);
        }
        // Support multiple tables
        if ((order as any).tableIds && (order as any).tableIds.length > 0) {
          setSelectedTableIds((order as any).tableIds);
        } else if (order.tableId) {
          setSelectedTableIds([order.tableId]);
        }
        if (order.customerId) {
          setSelectedCustomerId(order.customerId);
        }
        if (order.orderType) {
          setOrderType(order.orderType);
        }
        if (order.numberOfPersons) {
          setNumberOfPersons(order.numberOfPersons);
        }

        // Convert order items to cart items
        if (order.items && order.items.length > 0) {
          const cartItemsFromOrder = await Promise.all(
            order.items.map(async (item) => {
              // Use food item from API response, or load from API
              let foodItem: any = item.foodItem;
              if (!foodItem && item.foodItemId) {
                try {
                  foodItem = await menuApi.getFoodItemById(item.foodItemId);
                } catch (error) {
                  console.error('Failed to fetch food item:', error);
                }
              }

              // Extract add-ons with names from API response
              const addOns = item.addOns?.map((addOn: any) => ({
                addOnId: addOn.addOnId || addOn.id,
                quantity: addOn.quantity || 1,
                addOnName: addOn.addOn?.name,
              })) || [];

              // Get variation info from API response
              const variation = item.variation;
              
              // Handle buffets and combo meals
              const isBuffet = !!(item.buffetId || item.buffet);
              const isComboMeal = !!(item.comboMealId || item.comboMeal);
              
              return {
                foodItemId: isBuffet || isComboMeal ? undefined : item.foodItemId,
                buffetId: isBuffet ? (item.buffetId || item.buffet?.id) : undefined,
                comboMealId: isComboMeal ? (item.comboMealId || item.comboMeal?.id) : undefined,
                foodItemName: isBuffet 
                  ? (item.buffet?.name || 'Buffet')
                  : isComboMeal
                  ? (item.comboMeal?.name || 'Combo Meal')
                  : (foodItem?.name || item.foodItem?.name || 'Unknown Item'),
                foodItemImageUrl: isBuffet
                  ? item.buffet?.imageUrl
                  : isComboMeal
                  ? item.comboMeal?.imageUrl
                  : (foodItem?.imageUrl || item.foodItem?.imageUrl),
                variationId: item.variationId,
                variationGroup: variation?.variationGroup || item.variation?.variationGroup,
                variationName: variation?.variationName || item.variation?.variationName,
                variationPriceAdjustment: variation?.priceAdjustment || item.variation?.priceAdjustment || 0,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
                addOns: addOns.length > 0 ? addOns : undefined,
                foodItem: foodItem, // Keep for compatibility
                buffet: item.buffet,
                comboMeal: item.comboMeal,
              };
            })
          );
          setCartItems(cartItemsFromOrder);
        }
      } catch (error) {
        console.error('Failed to load order for editing:', error);
      }
    };

    loadOrderForEditing();
  }, [editOrderId, user?.tenantId]);

  // Load branches on mount
  useEffect(() => {
    const loadData = async () => {
      setLoadingBranches(true);
      try {
        const allBranches = await restaurantApi.getBranches();
        const activeBranches = allBranches.filter((branch: any) => branch.isActive && !branch.deletedAt);
        setBranches(activeBranches);

        // Set first branch as selected if available
        if (activeBranches.length > 0 && !selectedBranchId) {
          setSelectedBranchId(activeBranches[0].id);
        }
      } catch (error) {
        console.error('Failed to load branches:', error);
        setBranches([]);
      } finally {
        setLoadingBranches(false);
      }
    };
    if (user?.tenantId) {
      loadData();
    } else {
      setLoadingBranches(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  // Cart is now managed in memory only - no persistence needed

  // Helper function to check if two cart items are identical
  const areItemsIdentical = (item1: any, item2: any): boolean => {
    // Check foodItemId
    if (item1.foodItemId !== item2.foodItemId) {
      return false;
    }

    // Check variationId (both null/undefined or same value)
    const variation1 = item1.variationId || null;
    const variation2 = item2.variationId || null;
    if (variation1 !== variation2) {
      return false;
    }

    // Check add-ons
    const addOns1 = item1.addOns || [];
    const addOns2 = item2.addOns || [];

    // If both have no add-ons, they match
    if (addOns1.length === 0 && addOns2.length === 0) {
      return true;
    }

    // If one has add-ons and the other doesn't, they don't match
    if (addOns1.length !== addOns2.length) {
      return false;
    }

    // Sort add-ons by addOnId for comparison
    const sorted1 = [...addOns1].sort((a, b) => (a.addOnId || '').localeCompare(b.addOnId || ''));
    const sorted2 = [...addOns2].sort((a, b) => (a.addOnId || '').localeCompare(b.addOnId || ''));

    // Compare each add-on (same addOnId and quantity)
    for (let i = 0; i < sorted1.length; i++) {
      const addOn1 = sorted1[i];
      const addOn2 = sorted2[i];
      
      if (addOn1.addOnId !== addOn2.addOnId) {
        return false;
      }
      
      // Compare quantities (default to 1 if not specified)
      const qty1 = addOn1.quantity || 1;
      const qty2 = addOn2.quantity || 1;
      if (qty1 !== qty2) {
        return false;
      }
    }

    return true;
  };

  const handleAddToCart = useCallback((item: any) => {
    setCartItems((prev) => {
      // Determine item type
      const itemType = item.type || (item.id && !item.foodItemId ? 'unknown' : 'food-item');
      const isBuffet = itemType === 'buffet' || ('pricePerPerson' in item && !('stockType' in item));
      const isComboMeal = itemType === 'combo-meal' || ('foodItemIds' in item && !isBuffet && !('stockType' in item));
      
      // Normalize the item to ensure it has unitPrice and subtotal
      const normalizedItem = {
        ...item,
        // Use price if provided, otherwise use unitPrice, otherwise use basePrice, otherwise 0
        unitPrice: item.unitPrice ?? item.price ?? item.basePrice ?? 0,
        // Calculate subtotal: unitPrice * quantity
        subtotal: (item.unitPrice ?? item.price ?? item.basePrice ?? 0) * (item.quantity || 1),
        // Ensure quantity is set
        quantity: item.quantity || 1,
        // Map IDs based on item type
        foodItemId: isBuffet || isComboMeal ? undefined : (item.foodItemId || item.id || ''),
        buffetId: isBuffet ? (item.id || item.buffetId) : undefined,
        comboMealId: isComboMeal ? (item.id || item.comboMealId) : undefined,
        // Map foodItemName from name if needed
        foodItemName: item.foodItemName || item.name || '',
        // Map foodItemImageUrl from imageUrl if needed
        foodItemImageUrl: item.foodItemImageUrl || item.imageUrl,
        // Store item type
        type: itemType,
      };
      
      // Find if an identical item already exists
      const existingIndex = prev.findIndex((existingItem) => areItemsIdentical(existingItem, normalizedItem));
      
      if (existingIndex !== -1) {
        // Item already exists, increment quantity
        const updatedItems = [...prev];
        const existingItem = updatedItems[existingIndex];
        const newQuantity = existingItem.quantity + normalizedItem.quantity;
        updatedItems[existingIndex] = {
          ...existingItem,
          quantity: newQuantity,
          subtotal: existingItem.unitPrice * newQuantity,
        };
        return updatedItems;
      } else {
        // New item, add to cart (remove price property if it exists, keep only unitPrice)
        const { price, ...itemWithoutPrice } = normalizedItem;
        return [...prev, itemWithoutPrice];
      }
    });
  }, []);

  const handleRemoveFromCart = useCallback((index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateCartItem = useCallback((index: number, updatedItem: any) => {
    setCartItems((prev) => {
      const newItems = [...prev];
      newItems[index] = updatedItem;
      return newItems;
    });
  }, []);

  const handleClearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const handleItemTypeChange = useCallback((itemType: 'food-items' | 'buffets' | 'combo-meals') => {
    setCurrentItemType((previousItemType) => {
      // Clear cart when switching to/from buffet tab
      if (previousItemType === 'buffets' || itemType === 'buffets') {
        handleClearCart();
      }
      return itemType;
    });

    // When switching to buffet, set order type to dine_in
    if (itemType === 'buffets') {
      setOrderType('dine_in');
    }
  }, [handleClearCart]);

  // Ensure a branch is always selected
  useEffect(() => {
    if (branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  if (!user?.tenantId) {
    return null;
  }

  // Show offline indicator if offline
  const showOfflineIndicator = !isOnline;

  // Only show "no branches" message after loading is complete
  if (!loadingBranches && branches.length === 0) {
    return (
      <Box p="md">
        {showOfflineIndicator && (
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" mb="md">
            {t('pos.offlineMode' as any, language) || 'You are currently offline. POS will work with cached menu data.'}
          </Alert>
        )}
        <Text>{t('pos.selectBranch', language) || 'Please select a branch'}</Text>
        <Text size="sm" c="dimmed" mt="xs">
          {!isOnline 
            ? 'No branches available offline. Please go online to sync branches, or create a branch first.'
            : 'No branches available. Please create a branch first.'}
        </Text>
      </Box>
    );
  }

  // If no branch selected but branches exist, auto-select first one
  if (!selectedBranchId && branches.length > 0) {
    return (
      <Box p="md">
        <Skeleton height={400} />
      </Box>
    );
  }

  return (
    <>
      <div className="page-title-bar">
        <Group justify="space-between" align="center" style={{ width: '100%' }}>
          <Title order={1} style={{ margin: 0, textAlign: 'left', paddingTop: 'var(--mantine-spacing-sm)' }}>
            {t('pos.newOrder', language) || 'New Order'}
          </Title>
          {branches.length > 1 && (
            <Group gap="xs">
              <Text size="sm" fw={500}>
                {t('restaurant.branch', language) || 'Branch'}:
              </Text>
              <Select
                value={selectedBranchId}
                onChange={(value) => setSelectedBranchId(value)}
                data={branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name || '',
                }))}
                style={{ width: 200 }}
                size="sm"
              />
            </Group>
          )}
        </Group>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        {showOfflineIndicator && (
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" mb="md">
            {t('pos.offlineMode' as any, language) || 'You are currently offline. POS will work with cached menu data. Orders will be queued and synced when you come back online.'}
          </Alert>
        )}
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}
        <Grid gutter="md">
          {/* Left Panel - Food Items Grid (60%) */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <FoodItemsGrid
              tenantId={user.tenantId}
              selectedCategoryId={selectedCategoryId}
              onCategoryChange={setSelectedCategoryId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onAddToCart={handleAddToCart}
              orderType={orderType}
              onItemTypeChange={handleItemTypeChange}
            />
          </Grid.Col>

          {/* Right Panel - Cart and Billing (40%) */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <POSCart
              cartItems={cartItems}
              onRemoveItem={handleRemoveFromCart}
              onUpdateItem={handleUpdateCartItem}
              onClearCart={handleClearCart}
              orderType={orderType}
              onOrderTypeChange={(type) => {
              // Prevent switching away from dine_in when on buffet tab
              if (currentItemType === 'buffets' && type !== 'dine_in') {
                return;
              }
                // Prevent switching to delivery if delivery management is disabled
                if (type === 'delivery' && !settings?.general?.enableDeliveryManagement) {
                  return;
                }
                setOrderType(type);
              }}
            isBuffetMode={currentItemType === 'buffets'}
              selectedTableId={selectedTableId}
              onTableChange={setSelectedTableId}
              selectedTableIds={selectedTableIds}
              onTableIdsChange={setSelectedTableIds}
              selectedCustomerId={selectedCustomerId}
              onCustomerChange={setSelectedCustomerId}
              numberOfPersons={numberOfPersons}
              onNumberOfPersonsChange={setNumberOfPersons}
              tenantId={user.tenantId}
              branchId={selectedBranchId || (branches.length > 0 ? branches[0].id : '')}
              editingOrderId={editingOrderId}
            />
          </Grid.Col>
        </Grid>
      </div>
    </>
  );
}

export default function POSPage() {
  return (
    <Suspense
      fallback={
        <Box p="md">
          <Skeleton height={400} />
        </Box>
      }
    >
      <POSPageContent />
    </Suspense>
  );
}
