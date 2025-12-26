'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  TextInput,
  ScrollArea,
  Grid,
  Card,
  Image,
  Text,
  Badge,
  Group,
  Chip,
  Stack,
  Skeleton,
  Modal,
  NumberInput,
  Button,
  Paper,
  SegmentedControl,
} from '@mantine/core';
import { IconSearch, IconShoppingCart, IconChefHat, IconShoppingBag } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { db } from '@/lib/indexeddb/database';
import { FoodItem as IndexedDBFoodItem } from '@/lib/indexeddb/database';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { getErrorColor, getWarningColor, getBadgeColorForText } from '@/lib/utils/theme';
import { useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { ItemSelectionModal } from './ItemSelectionModal';
import { useCurrency } from '@/lib/hooks/use-currency';
import { menuApi, FoodItem, Buffet, ComboMeal } from '@/lib/api/menu';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { formatCurrency } from '@/lib/utils/currency-formatter';

interface FoodItemsGridProps {
  tenantId: string;
  selectedCategoryId: string | null;
  onCategoryChange: (categoryId: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddToCart: (item: any) => void;
  orderType?: 'dine_in' | 'takeaway' | 'delivery';
  onItemTypeChange?: (itemType: 'food-items' | 'buffets' | 'combo-meals') => void;
}

export function FoodItemsGrid({
  tenantId,
  selectedCategoryId,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  onAddToCart,
  orderType = 'dine_in',
  onItemTypeChange,
}: FoodItemsGridProps) {
  const { language } = useLanguageStore();
  const primaryColor = useThemeColor();
  const primaryShade = useThemeColorShade(6);
  const successColor = useSuccessColor();
  const currency = useCurrency();
  
  // Separate pagination for each item type
  const foodItemsPagination = usePagination<FoodItem>({ initialPage: 1, initialLimit: 24 });
  const buffetsPagination = usePagination<Buffet>({ initialPage: 1, initialLimit: 24 });
  const comboMealsPagination = usePagination<ComboMeal>({ initialPage: 1, initialLimit: 24 });
  
  const [itemType, setItemType] = useState<'food-items' | 'buffets' | 'combo-meals'>('food-items');
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [buffets, setBuffets] = useState<Buffet[]>([]);
  const [comboMeals, setComboMeals] = useState<ComboMeal[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FoodItem | Buffet | ComboMeal | null>(null);
  const [modalOpened, setModalOpened] = useState(false);

  // Get current pagination based on item type
  const currentPagination = itemType === 'buffets' 
    ? buffetsPagination 
    : itemType === 'combo-meals' 
    ? comboMealsPagination 
    : foodItemsPagination;

  // Switch away from buffets tab if order type is not dine-in
  useEffect(() => {
    if (itemType === 'buffets' && orderType !== 'dine_in') {
      setItemType('food-items');
    }
  }, [orderType, itemType]);

  // Notify parent when item type changes
  useEffect(() => {
    if (onItemTypeChange) {
      onItemTypeChange(itemType);
    }
  }, [itemType, onItemTypeChange]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selectedCategoryId, searchQuery, foodItemsPagination.page, foodItemsPagination.limit, buffetsPagination.page, buffetsPagination.limit, comboMealsPagination.page, comboMealsPagination.limit, itemType]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load categories
      const cats = await db.categories
        .where('tenantId')
        .equals(tenantId)
        .filter((cat) => cat.isActive && !cat.deletedAt)
        .sortBy('displayOrder');

      setCategories(cats);

      // Load active menus from API (menus are not stored in IndexedDB)
      // This is only needed for buffets and combo meals which still use client-side filtering
      let activeMenuTypes: string[] = [];
      try {
        if (navigator.onLine) {
          try {
            const menusResponse = await menuApi.getMenus();
            // Handle both paginated and non-paginated responses
            const menus = Array.isArray(menusResponse) ? menusResponse : (menusResponse?.data || []);
            activeMenuTypes = menus
              .filter((menu) => menu.isActive)
              .map((menu) => menu.menuType)
              .filter(Boolean);
          } catch (apiError) {
            // Network error even though navigator.onLine is true - fall back to offline mode
            console.warn('⚠️ Failed to load menus from API, using offline fallback:', apiError);
            throw apiError; // Re-throw to trigger offline fallback
          }
        } else {
          throw new Error('Offline'); // Trigger offline fallback
        }
      } catch (error) {
        // Offline fallback: Cannot determine active menus without API access
        // Show no items when offline since we need to know which menus are active
        console.warn('⚠️ Cannot load active menus while offline. No items will be shown.');
        activeMenuTypes = [];
      }

      // Load items based on selected type
      // Buffets are only available for dine-in orders
      if (itemType === 'buffets') {
        if (orderType === 'dine_in') {
          await loadBuffets(activeMenuTypes);
        } else {
          setBuffets([]);
        }
      } else if (itemType === 'combo-meals') {
        await loadComboMeals(activeMenuTypes);
      } else {
        // Load food items - use server pagination with backend filtering for active menus
        if (navigator.onLine) {
          try {
            // Use backend filtering for active menus and search
            const serverItemsResponse = await menuApi.getFoodItems(
              selectedCategoryId || undefined,
              foodItemsPagination.paginationParams,
              searchQuery.trim() || undefined,
              true // onlyActiveMenus = true - filter by active menus on backend
            ).catch((error) => {
              console.warn('⚠️ Failed to load food items from API, using offline fallback:', error);
              throw error;
            });
            const serverItems = foodItemsPagination.extractData(serverItemsResponse) as FoodItem[];
            foodItemsPagination.extractPagination(serverItemsResponse);
            setFoodItems(serverItems);
            
            // Update IndexedDB cache (but don't wait for it)
            serverItems.forEach((item: FoodItem) => {
              db.foodItems.put({
                id: item.id,
                tenantId,
                name: item.name,
                description: item.description,
                imageUrl: item.imageUrl,
                categoryId: item.categoryId,
                basePrice: item.basePrice,
                stockType: item.stockType,
                stockQuantity: item.stockQuantity,
                menuType: item.menuType || 'all_day',
                menuTypes: item.menuTypes || (item.menuType ? [item.menuType] : []),
                ageLimit: item.ageLimit,
                displayOrder: item.displayOrder,
                isActive: item.isActive,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              } as any).catch(console.error);
            });
          } catch (error) {
            console.error('Failed to load food items from server, falling back to IndexedDB:', error);
            // Fall through to IndexedDB loading
            await loadFromIndexedDB(activeMenuTypes);
          }
        } else {
          // Offline: load from IndexedDB with local pagination
          await loadFromIndexedDB(activeMenuTypes);
        }
      }
    } catch (error) {
      console.error('Failed to load food items:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFromIndexedDB = async (activeMenuTypes: string[]) => {
    // Load food items from IndexedDB
    // Only filter by deletedAt - isActive is no longer used for food items
    // Items show/hide based on menu membership only
    let itemsQuery = db.foodItems
      .where('tenantId')
      .equals(tenantId)
      .filter((item) => !item.deletedAt);

    if (selectedCategoryId) {
      itemsQuery = itemsQuery.filter((item) => {
        return item.categoryId === selectedCategoryId;
      });
    }

    const items = await itemsQuery.toArray();

    // Filter food items to only include those in active menus
    let filteredItems = items;
    if (activeMenuTypes.length > 0) {
      filteredItems = items.filter((item) => {
        // Check if item belongs to at least one active menu
        const itemMenuTypes = item.menuTypes || (item.menuType ? [item.menuType] : []);
        return itemMenuTypes.some((menuType: string) => activeMenuTypes.includes(menuType));
      });
    } else {
      // If no active menus, show no items
      filteredItems = [];
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredItems = filteredItems.filter(
        (item) =>
          item.name?.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query),
      );
    }

    // Convert IndexedDB items to API FoodItem format
    const convertedItems: FoodItem[] = filteredItems.map((item) => ({
      id: item.id,
      name: item.name || '',
      description: item.description,
      imageUrl: item.imageUrl,
      categoryId: item.categoryId,
      basePrice: item.basePrice,
      stockType: item.stockType,
      stockQuantity: item.stockQuantity,
      menuType: item.menuType,
      menuTypes: item.menuTypes || (item.menuType ? [item.menuType] : []),
      ageLimit: item.ageLimit,
      displayOrder: item.displayOrder,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    // Apply local pagination
    const totalItems = convertedItems.length;
    const startIndex = (foodItemsPagination.page - 1) * foodItemsPagination.limit;
    const endIndex = startIndex + foodItemsPagination.limit;
    const paginatedItems = convertedItems.slice(startIndex, endIndex);

    setFoodItems(paginatedItems);
    
    // Set pagination info
    foodItemsPagination.setTotal(totalItems);
    foodItemsPagination.setTotalPages(Math.ceil(totalItems / foodItemsPagination.limit));
    foodItemsPagination.setHasNext(endIndex < totalItems);
    foodItemsPagination.setHasPrev(foodItemsPagination.page > 1);
  };

  const loadBuffets = async (activeMenuTypes: string[]) => {
    try {
      if (navigator.onLine) {
        try {
          const response = await menuApi.getBuffets(buffetsPagination.paginationParams);
        const serverBuffets: Buffet[] = buffetsPagination.extractData(response) as Buffet[];
        buffetsPagination.extractPagination(response);
        
        // Filter by active menus and search
        let filtered: Buffet[] = serverBuffets.filter((buffet) => buffet.isActive);
        
        if (activeMenuTypes.length > 0) {
          filtered = filtered.filter((buffet) => {
            const buffetMenuTypes = buffet.menuTypes || [];
            return buffetMenuTypes.some((mt) => activeMenuTypes.includes(mt));
          });
        }
        
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (buffet) =>
              buffet.name?.toLowerCase().includes(query) ||
              buffet.description?.toLowerCase().includes(query),
          );
        }
        
          setBuffets(filtered);
        } catch (apiError) {
          // Network error - fall back to empty array (buffets not stored in IndexedDB)
          console.warn('⚠️ Failed to load buffets from API:', apiError);
          setBuffets([]);
        }
      } else {
        // Offline: buffets not available offline (not stored in IndexedDB)
        setBuffets([]);
      }
    } catch (error) {
      console.error('Failed to load buffets:', error);
      setBuffets([]);
    }
  };

  const loadComboMeals = async (activeMenuTypes: string[]) => {
    try {
      if (navigator.onLine) {
        try {
          const response = await menuApi.getComboMeals(comboMealsPagination.paginationParams);
        const serverComboMeals: ComboMeal[] = comboMealsPagination.extractData(response) as ComboMeal[];
        comboMealsPagination.extractPagination(response);
        
        // Filter by active menus and search
        let filtered: ComboMeal[] = serverComboMeals.filter((combo) => combo.isActive);
        
        if (activeMenuTypes.length > 0) {
          filtered = filtered.filter((combo) => {
            const comboMenuTypes = combo.menuTypes || [];
            return comboMenuTypes.some((mt) => activeMenuTypes.includes(mt));
          });
        }
        
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (combo) =>
              combo.name?.toLowerCase().includes(query) ||
              combo.description?.toLowerCase().includes(query),
          );
        }
        
          setComboMeals(filtered);
        } catch (apiError) {
          // Network error - fall back to empty array (combo meals not stored in IndexedDB)
          console.warn('⚠️ Failed to load combo meals from API:', apiError);
          setComboMeals([]);
        }
      } else {
        // Offline: combo meals not available offline (not stored in IndexedDB)
        setComboMeals([]);
      }
    } catch (error) {
      console.error('Failed to load combo meals:', error);
      setComboMeals([]);
    }
  };

  const handleItemClick = (item: FoodItem | Buffet | ComboMeal) => {
    setSelectedItem(item);
    setModalOpened(true);
  };

  const handleItemSelected = useCallback(
    (itemData: any) => {
      onAddToCart(itemData);
      setModalOpened(false);
      setSelectedItem(null);
    },
    [onAddToCart],
  );

  const currentItems = itemType === 'buffets' ? buffets : itemType === 'combo-meals' ? comboMeals : foodItems;

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with Search and Categories */}
      <Box py="md" px={0} style={{ borderBottom: `1px solid var(--mantine-color-gray-3)` }}>
        <Stack gap="md">
          {/* Item Type Selector */}
          <SegmentedControl
            value={itemType}
            onChange={(value: string) => {
              const newItemType = value as 'food-items' | 'buffets' | 'combo-meals';
              setItemType(newItemType);
              // Reset pagination for the selected type
              if (newItemType === 'food-items') {
                foodItemsPagination.setPage(1);
              } else if (newItemType === 'buffets') {
                buffetsPagination.setPage(1);
              } else if (newItemType === 'combo-meals') {
                comboMealsPagination.setPage(1);
              }
              // Notify parent immediately
              if (onItemTypeChange) {
                onItemTypeChange(newItemType);
              }
            }}
            data={[
              { label: t('menu.foodItems', language) || 'Food Items', value: 'food-items' },
              // Buffets are only available for dine-in orders
              ...(orderType === 'dine_in' 
                ? [{ label: t('menu.buffets', language) || 'Buffets', value: 'buffets' }]
                : []),
              { label: t('menu.comboMeals', language) || 'Combo Meals', value: 'combo-meals' },
            ]}
            fullWidth
          />

          {/* Search */}
          <TextInput
            placeholder={t('pos.searchItems', language)}
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />

          {/* Categories - Only show for food items */}
          {itemType === 'food-items' && (
            <Paper p="sm" withBorder>
              <Group gap="xs" wrap="wrap" className="filter-chip-group">
                <Chip
                  checked={selectedCategoryId === null}
                  onChange={() => onCategoryChange(null)}
                  variant="filled"
                >
                  {t('pos.allCategories', language)}
                </Chip>
                <Chip.Group value={selectedCategoryId || ''} onChange={(value) => {
                  const categoryId = Array.isArray(value) ? (value[0] || null) : (value || null);
                  onCategoryChange(categoryId);
                }}>
                  {categories.map((category) => (
                    <Chip key={category.id} value={category.id} variant="filled">
                      {category.name}
                    </Chip>
                  ))}
                </Chip.Group>
              </Group>
            </Paper>
          )}
        </Stack>
      </Box>

      {/* Food Items Grid */}
      <Box pt="md">
          {loading ? (
            <Grid>
              {[...Array(12)].map((_, i) => (
                <Grid.Col key={i} span={{ base: 6, sm: 4, md: 3 }}>
                  <Skeleton height={200} />
                </Grid.Col>
              ))}
            </Grid>
          ) : currentItems.length === 0 ? (
            <Box style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <Text c="dimmed" size="lg">
                {t('pos.noItemsFound', language)}
              </Text>
            </Box>
          ) : (
            <Grid>
              {currentItems.map((item) => {
                // Handle different item types
                const isFoodItem = 'stockType' in item;
                const isBuffet = 'pricePerPerson' in item && !('stockType' in item);
                const isComboMeal = 'foodItemIds' in item && !isBuffet && !isFoodItem;
                
                const isOutOfStock = isFoodItem && (item as FoodItem).stockType === 'limited' && (item as FoodItem).stockQuantity === 0;
                const isLimitedStock = isFoodItem && (item as FoodItem).stockType === 'limited' && (item as FoodItem).stockQuantity > 0 && (item as FoodItem).stockQuantity < 10;
                const price = isBuffet 
                  ? (item as Buffet).pricePerPerson 
                  : isComboMeal 
                    ? (item as ComboMeal).basePrice
                    : (item as FoodItem).basePrice;
                const displayPrice = isBuffet 
                  ? `${price.toFixed(2)}/${t('menu.perPerson', language) || 'person'}` 
                  : `${price.toFixed(2)}`;

                return (
                  <Grid.Col key={item.id} span={{ base: 6, sm: 4, md: 3 }}>
                    <Card
                      shadow="sm"
                      padding="lg"
                      radius="md"
                      withBorder
                      style={{
                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                        opacity: isOutOfStock ? 0.6 : 1,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      onClick={() => !isOutOfStock && handleItemClick(item)}
                    >
                      <Card.Section>
                        <Image
                          src={item.imageUrl || '/placeholder-food.png'}
                          height={120}
                          alt={item.name || ''}
                          fit="cover"
                        />
                        {(isBuffet || isComboMeal) && (
                          <Box
                            style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              backgroundColor: 'rgba(0,0,0,0.7)',
                              borderRadius: 4,
                              padding: '4px 8px',
                            }}
                          >
                            {isBuffet ? (
                              <IconChefHat size={16} color="white" />
                            ) : (
                              <IconShoppingBag size={16} color="white" />
                            )}
                          </Box>
                        )}
                      </Card.Section>

                      <Stack gap="xs" mt="md" style={{ flex: 1 }}>
                        <Group gap="xs">
                          <Text fw={500} size="sm" lineClamp={2} style={{ flex: 1 }}>
                            {item.name}
                          </Text>
                          {isComboMeal && (item as ComboMeal).discountPercentage && (
                            <Badge color={successColor} size="sm" variant="light">
                              {(item as ComboMeal).discountPercentage?.toFixed(0)}% {t('menu.off', language) || 'off'}
                            </Badge>
                          )}
                        </Group>

                        {item.description && (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {item.description}
                          </Text>
                        )}

                        {isBuffet && (
                          <Text size="xs" c="dimmed">
                            {(item as Buffet).pricePerPerson.toFixed(2)} {currency} {t('menu.perPerson', language) || 'per person'}
                          </Text>
                        )}

                        {isComboMeal && (
                          <Text size="xs" c="dimmed">
                            {(item as ComboMeal).foodItemIds?.length || 0} {t('menu.itemsIncluded', language)}
                          </Text>
                        )}

                        <Group justify="space-between" mt="auto">
                          <Text fw={700} size="lg" c={primaryColor}>
                            {displayPrice} {currency}
                          </Text>

                          {isOutOfStock && (
                            <Badge variant="light" color={getBadgeColorForText(t('pos.outOfStock', language))} size="sm">
                              {t('pos.outOfStock', language)}
                            </Badge>
                          )}
                          {isLimitedStock && (
                            <Badge variant="light" color={getBadgeColorForText(t('pos.limitedStock', language))} size="sm">
                              {t('pos.limitedStock', language)}
                            </Badge>
                          )}
                        </Group>

                        <Button
                          fullWidth
                          mt="xs"
                          leftSection={<IconShoppingCart size={16} />}
                          disabled={isOutOfStock}
                          style={{
                            backgroundColor: isOutOfStock ? undefined : primaryShade,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isOutOfStock) {
                              handleItemClick(item);
                            }
                          }}
                        >
                          {t('pos.addToCart', language)}
                        </Button>
                      </Stack>
                    </Card>
                  </Grid.Col>
                );
              })}
            </Grid>
          )}
          
          {/* Pagination Controls */}
          {currentPagination.total > 0 && (
            <PaginationControls
              page={currentPagination.page}
              totalPages={currentPagination.totalPages}
              limit={currentPagination.limit}
              total={currentPagination.total}
              onPageChange={(page) => {
                currentPagination.setPage(page);
              }}
              onLimitChange={(newLimit) => {
                currentPagination.setLimit(newLimit);
                currentPagination.setPage(1);
              }}
              limitOptions={[12, 24, 48, 96]}
            />
          )}
        </Box>

      {/* Item Selection Modal - Only for food items */}
      {selectedItem && 'stockType' in selectedItem && !('pricePerPerson' in selectedItem) && (
        <ItemSelectionModal
          opened={modalOpened}
          onClose={() => {
            setModalOpened(false);
            setSelectedItem(null);
          }}
          foodItem={selectedItem as FoodItem}
          onItemSelected={handleItemSelected}
        />
      )}
      
      {/* Direct add to cart for buffets and combo meals */}
      {selectedItem && (('pricePerPerson' in selectedItem) || ('foodItemIds' in selectedItem && !('pricePerPerson' in selectedItem))) && modalOpened && (
        <Modal
          opened={modalOpened}
          onClose={() => {
            setModalOpened(false);
            setSelectedItem(null);
          }}
          title={selectedItem?.name || ''}
          size="md"
        >
          <Stack gap="md">
            {selectedItem?.description && <Text size="sm">{selectedItem.description}</Text>}
            {selectedItem && ('pricePerPerson' in selectedItem && !('stockType' in selectedItem)) && (
              <Stack gap="xs">
                <Text size="sm" fw={500}>{t('menu.buffetDetails', language)}</Text>
                <Text size="xs">{t('menu.pricePerPerson', language)}: {(selectedItem as Buffet).pricePerPerson.toFixed(2)} {currency}</Text>
                <NumberInput
                  label={t('menu.numberOfPersons', language)}
                  min={1}
                  defaultValue={1}
                  id="buffet-persons"
                />
              </Stack>
            )}
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => {
                  setModalOpened(false);
                  setSelectedItem(null);
                }}
              >
                {t('common.cancel', language)}
              </Button>
              <Button
                style={{ backgroundColor: primaryColor }}
                onClick={() => {
                  if (!selectedItem) return;
                  
                  let quantity = 1;
                  if ('pricePerPerson' in selectedItem) {
                    const personsInput = document.getElementById('buffet-persons') as HTMLInputElement;
                    quantity = personsInput ? parseInt(personsInput.value) || 1 : 1;
                  }
                  // Type guards - check properties to determine item type
                  const hasStockType = 'stockType' in selectedItem;
                  const hasPricePerPerson = 'pricePerPerson' in selectedItem;
                  const hasFoodItemIds = 'foodItemIds' in selectedItem;
                  
                  let finalPrice: number;
                  
                  if (hasPricePerPerson && !hasStockType) {
                    // It's a Buffet
                    finalPrice = (selectedItem as Buffet).pricePerPerson * quantity;
                  } else if (hasFoodItemIds && !hasPricePerPerson && !hasStockType) {
                    // It's a ComboMeal
                    finalPrice = (selectedItem as ComboMeal).basePrice;
                  } else if (hasStockType) {
                    // It's a FoodItem - cast through unknown as TypeScript suggests
                    finalPrice = (selectedItem as unknown as FoodItem).basePrice;
                  } else {
                    // Fallback - should not happen
                    finalPrice = 0;
                  }
                  
                  const itemType = (hasPricePerPerson && !hasStockType) 
                    ? 'buffet' 
                    : (hasFoodItemIds && !hasPricePerPerson && !hasStockType)
                      ? 'combo-meal'
                      : 'food-item';
                  
                  onAddToCart({
                    ...selectedItem,
                    type: itemType,
                    quantity,
                    price: finalPrice,
                  });
                  setModalOpened(false);
                  setSelectedItem(null);
                }}
              >
                {t('pos.addToCart', language)}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Box>
  );
}

