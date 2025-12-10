'use client';

import { useState, useEffect, useCallback } from 'react';
import { Grid, Box, Select, Group, Text, Stack, Skeleton } from '@mantine/core';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLanguageStore } from '@/lib/store/language-store';
import { db } from '@/lib/indexeddb/database';
import { FoodItemsGrid } from '@/components/pos/FoodItemsGrid';
import { POSCart } from '@/components/pos/POSCart';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { t } from '@/lib/utils/translations';
import { ordersApi } from '@/lib/api/orders';
import { useSettings } from '@/lib/hooks/use-settings';

export default function POSPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const editOrderId = searchParams?.get('editOrder');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartItems, setCartItems] = useState<any[]>([]);
  
  // Initialize order type from settings
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [numberOfPersons, setNumberOfPersons] = useState<number>(1);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

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
              // Use food item from API response, or load from IndexedDB as fallback
              let foodItem = item.foodItem;
              if (!foodItem) {
                foodItem = await db.foodItems.get(item.foodItemId);
              }
              
              // If still not found, try to fetch from API
              if (!foodItem && navigator.onLine) {
                try {
                  const { menuApi } = await import('@/lib/api/menu');
                  foodItem = await menuApi.getFoodItemById(item.foodItemId);
                } catch (error) {
                  console.error('Failed to fetch food item:', error);
                }
              }

              // Extract add-ons with names from API response
              const addOns = item.addOns?.map((addOn: any) => ({
                addOnId: addOn.addOnId || addOn.id,
                quantity: addOn.quantity || 1,
                addOnNameEn: addOn.addOn?.nameEn,
                addOnNameAr: addOn.addOn?.nameAr,
              })) || [];

              // Get variation info from API response
              const variation = item.variation;
              
              return {
                foodItemId: item.foodItemId,
                foodItemNameEn: foodItem?.nameEn || item.foodItem?.nameEn || 'Unknown Item',
                foodItemNameAr: foodItem?.nameAr || item.foodItem?.nameAr,
                foodItemImageUrl: foodItem?.imageUrl || item.foodItem?.imageUrl,
                variationId: item.variationId,
                variationGroup: variation?.variationGroup || item.variation?.variationGroup,
                variationName: variation?.variationName || item.variation?.variationName,
                variationPriceAdjustment: variation?.priceAdjustment || item.variation?.priceAdjustment || 0,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
                specialInstructions: item.specialInstructions,
                addOns: addOns.length > 0 ? addOns : undefined,
                foodItem: foodItem, // Keep for compatibility
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

  // Load branches and cart from IndexedDB on mount, and pull from server
  useEffect(() => {
    const loadData = async () => {
      setLoadingBranches(true);
      try {
        // First, pull latest data from server
        if (navigator.onLine) {
          const { syncService } = await import('@/lib/sync/sync-service');
          await syncService.pullChanges();
        }

        // Then load branches from IndexedDB
        const allBranches = await db.branches
          .where('tenantId')
          .equals(user?.tenantId || '')
          .toArray();
        
        const activeBranches = allBranches.filter((branch) => branch.isActive && !branch.deletedAt);
        setBranches(activeBranches);

        // Set first branch as selected if available
        if (activeBranches.length > 0 && !selectedBranchId) {
          setSelectedBranchId(activeBranches[0].id);
        }

        // Load cart only if not editing an order
        if (!editOrderId) {
          const items = await db.cart.toArray();
          setCartItems(items);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
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

  // Save cart to IndexedDB whenever it changes
  useEffect(() => {
    const saveCart = async () => {
      try {
        await db.cart.clear();
        if (cartItems.length > 0) {
          await db.cart.bulkAdd(cartItems);
        }
      } catch (error) {
        console.error('Failed to save cart:', error);
      }
    };
    saveCart();
  }, [cartItems]);

  const handleAddToCart = useCallback((item: any) => {
    setCartItems((prev) => [...prev, item]);
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

  // Ensure a branch is always selected
  useEffect(() => {
    if (branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  if (!user?.tenantId) {
    return null;
  }

  // Only show "no branches" message after loading is complete
  if (!loadingBranches && (!selectedBranchId || branches.length === 0)) {
    return (
      <Box p="md">
        <Text>{t('pos.selectBranch', language) || 'Please select a branch'}</Text>
        {branches.length === 0 && (
          <Text size="sm" c="dimmed" mt="xs">
            No branches available. Please create a branch first.
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box style={{ height: 'auto' }}>
      {/* Branch Selector */}
     {branches.length > 1 ? (
        <Box p="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
          <Group gap="xs">
            <Text size="sm" fw={500}>
              {t('restaurant.branch', language) || 'Branch'}:
            </Text>
            <Select
              value={selectedBranchId}
              onChange={(value) => setSelectedBranchId(value)}
              data={branches.map((branch) => ({
                value: branch.id,
                label: language === 'ar' && branch.nameAr ? branch.nameAr : branch.nameEn,
              }))}
              style={{ width: 200 }}
            />
          </Group>
        </Box>
      ) : null}

      <Grid gutter={0} style={{ height: (loadingBranches || branches.length > 1) ? 'calc(100% - 50px)' : '100%' }}>
        {/* Left Panel - Food Items Grid (60%) */}
        <Grid.Col span={{ base: 12, md: 7 }} style={{ height: '100%', overflow: 'hidden' }}>
          <FoodItemsGrid
            tenantId={user.tenantId}
            selectedCategoryId={selectedCategoryId}
            onCategoryChange={setSelectedCategoryId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onAddToCart={handleAddToCart}
          />
        </Grid.Col>

        {/* Right Panel - Cart and Billing (40%) */}
        <Grid.Col span={{ base: 12, md: 5 }} style={{ height: '100%', overflow: 'hidden' }}>
          <POSCart
            cartItems={cartItems}
            onRemoveItem={handleRemoveFromCart}
            onUpdateItem={handleUpdateCartItem}
            onClearCart={handleClearCart}
            orderType={orderType}
            onOrderTypeChange={(type) => {
              // Prevent switching to delivery if delivery management is disabled
              if (type === 'delivery' && !settings?.general?.enableDeliveryManagement) {
                return;
              }
              setOrderType(type);
            }}
            selectedTableId={selectedTableId}
            onTableChange={setSelectedTableId}
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
    </Box>
  );
}
