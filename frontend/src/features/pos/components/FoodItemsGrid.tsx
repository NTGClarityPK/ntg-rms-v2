'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import NextImage from 'next/image';

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
  const [activeMenuTypes, setActiveMenuTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FoodItem | Buffet | ComboMeal | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [comboMealItems, setComboMealItems] = useState<FoodItem[]>([]);
  const [loadingComboItems, setLoadingComboItems] = useState(false);
  
  // Debounced search query - updates after user stops typing for 500ms
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>(searchQuery);
  
  // Ref to prevent duplicate API calls (especially in React StrictMode)
  const loadingRef = useRef(false);
  const lastRequestRef = useRef<string>('');
  // Ref to track the current search query to prevent race conditions
  const currentSearchRef = useRef<string>(searchQuery);
  // Ref to track request sequence to handle out-of-order responses
  const requestSequenceRef = useRef<number>(0);
  // Refs to track if categories and menus have been loaded
  const categoriesLoadedRef = useRef(false);
  const menusLoadedRef = useRef(false);
  
  // Debounce search query - wait 500ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery]);

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

  // Reload buffets only when order type changes and we're on buffets tab
  // This prevents full menu reload when switching between dine_in, takeaway, and delivery
  useEffect(() => {
    if (itemType === 'buffets' && orderType === 'dine_in') {
      // Only reload buffets if we're on the buffets tab and it's dine_in
      // Use cached activeMenuTypes instead of refetching
      loadBuffets(activeMenuTypes);
    } else if (itemType === 'buffets' && orderType !== 'dine_in') {
      // Clear buffets if order type is not dine_in
      setBuffets([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, itemType, activeMenuTypes]);

  // Notify parent when item type changes
  useEffect(() => {
    if (onItemTypeChange) {
      onItemTypeChange(itemType);
    }
  }, [itemType, onItemTypeChange]);

  // Load categories once on mount - they don't change when switching tabs
  const loadCategories = useCallback(async () => {
    // Only load if categories haven't been loaded yet
    if (categoriesLoadedRef.current) return;
    
    try {
      const catsResponse = await menuApi.getCategories();
      const cats = Array.isArray(catsResponse) ? catsResponse : (catsResponse?.data || []);
      setCategories(cats.filter((cat: any) => cat.isActive && !cat.deletedAt));
      categoriesLoadedRef.current = true;
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, []);

  // Load menus once on mount - cache them in state to avoid refetching
  const loadMenus = useCallback(async () => {
    // Only load if menus haven't been loaded yet
    if (menusLoadedRef.current) return;
    
    try {
      const menusResponse = await menuApi.getMenus();
      const menus = Array.isArray(menusResponse) ? menusResponse : (menusResponse?.data || []);
      const menuTypes = menus
        .filter((menu) => menu.isActive)
        .map((menu) => menu.menuType)
        .filter(Boolean);
      setActiveMenuTypes(menuTypes);
      menusLoadedRef.current = true;
    } catch (error) {
      console.error('Failed to load menus:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    // Use debounced search query for API calls to reduce requests
    const effectiveSearchQuery = debouncedSearchQuery;
    
    // Create a unique key for this request to prevent duplicates
    const requestKey = `${tenantId}-${selectedCategoryId}-${effectiveSearchQuery}-${itemType}-${foodItemsPagination.page}-${foodItemsPagination.limit}-${buffetsPagination.page}-${buffetsPagination.limit}-${comboMealsPagination.page}-${comboMealsPagination.limit}`;
    
    // Prevent duplicate calls with the same parameters (handles React StrictMode double renders)
    if (lastRequestRef.current === requestKey && loadingRef.current) {
      return;
    }
    
    // Increment request sequence to track the order of requests
    const currentRequestSequence = ++requestSequenceRef.current;
    
    // Allow new requests even if one is in progress - stale responses will be ignored
    // This ensures that when user types quickly, the latest search is always sent
    lastRequestRef.current = requestKey;
    loadingRef.current = true;
    
    // Capture the search query and request sequence at the start
    const requestSearchQuery = effectiveSearchQuery;
    const requestSequence = currentRequestSequence;
    
    try {
      setLoading(true);

      // Use cached active menu types - no need to refetch
      // Menus are loaded once on mount and cached in state

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
        // Use backend filtering for active menus and search
        // Note: We don't need to fetch menus here since onlyActiveMenus=true handles it on backend
        const serverItemsResponse = await menuApi.getFoodItems(
          selectedCategoryId || undefined,
          foodItemsPagination.paginationParams,
          requestSearchQuery.trim() || undefined,
          true // onlyActiveMenus = true - filter by active menus on backend
        );
        
        // Check if this response is still relevant (search query hasn't changed)
        if (currentSearchRef.current !== requestSearchQuery) {
          // Search query changed while request was in flight, ignore this response
          console.log('⚠️ Ignoring stale search results for:', requestSearchQuery);
          return;
        }
        
        // Check if this is still the latest request
        if (requestSequence !== requestSequenceRef.current) {
          // A newer request was made, ignore this response
          console.log('⚠️ Ignoring outdated request response');
          return;
        }
        
        const serverItems = foodItemsPagination.extractData(serverItemsResponse) as FoodItem[];
        foodItemsPagination.extractPagination(serverItemsResponse);
        setFoodItems(serverItems);
      }
    } catch (error) {
      console.error('Failed to load food items:', error);
      setFoodItems([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selectedCategoryId, debouncedSearchQuery, itemType, foodItemsPagination.page, foodItemsPagination.limit, buffetsPagination.page, buffetsPagination.limit, comboMealsPagination.page, comboMealsPagination.limit, activeMenuTypes]);

  // Load categories and menus once on mount only - they don't need to reload when switching tabs
  useEffect(() => {
    loadCategories();
    loadMenus();
  }, [loadCategories, loadMenus]);

  // Update currentSearchRef when debounced search changes
  useEffect(() => {
    currentSearchRef.current = debouncedSearchQuery;
  }, [debouncedSearchQuery]);

  // Reset pagination to page 1 when search or category changes
  useEffect(() => {
    if (itemType === 'food-items') {
      foodItemsPagination.setPage(1);
    } else if (itemType === 'buffets') {
      buffetsPagination.setPage(1);
    } else if (itemType === 'combo-meals') {
      comboMealsPagination.setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, selectedCategoryId, itemType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadBuffets = async (activeMenuTypes: string[]) => {
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
      } else {
        // If no active menus, show no items
        filtered = [];
      }
      
      if (debouncedSearchQuery.trim()) {
        const query = debouncedSearchQuery.toLowerCase();
        filtered = filtered.filter(
          (buffet) =>
            buffet.name?.toLowerCase().includes(query) ||
            buffet.description?.toLowerCase().includes(query),
        );
      }
      
      // Update pagination totals based on filtered results
      // Since filtering happens client-side, we update totals to reflect filtered count
      const filteredTotal = filtered.length;
      buffetsPagination.setTotal(filteredTotal);
      buffetsPagination.setTotalPages(Math.ceil(filteredTotal / buffetsPagination.limit));
      buffetsPagination.setHasNext(false); // Client-side filtering, no next page from server
      buffetsPagination.setHasPrev(buffetsPagination.page > 1);
      
      setBuffets(filtered);
    } catch (error) {
      console.error('Failed to load buffets:', error);
      setBuffets([]);
      // Reset pagination when error occurs
      buffetsPagination.setTotal(0);
      buffetsPagination.setTotalPages(0);
      buffetsPagination.setHasNext(false);
      buffetsPagination.setHasPrev(false);
    }
  };

  const loadComboMeals = async (activeMenuTypes: string[]) => {
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
      } else {
        // If no active menus, show no items
        filtered = [];
      }
      
      if (debouncedSearchQuery.trim()) {
        const query = debouncedSearchQuery.toLowerCase();
        filtered = filtered.filter(
          (combo) =>
            combo.name?.toLowerCase().includes(query) ||
            combo.description?.toLowerCase().includes(query),
        );
      }
      
      // Update pagination totals based on filtered results
      // Since filtering happens client-side, we update totals to reflect filtered count
      const filteredTotal = filtered.length;
      comboMealsPagination.setTotal(filteredTotal);
      comboMealsPagination.setTotalPages(Math.ceil(filteredTotal / comboMealsPagination.limit));
      comboMealsPagination.setHasNext(false); // Client-side filtering, no next page from server
      comboMealsPagination.setHasPrev(comboMealsPagination.page > 1);
      
      setComboMeals(filtered);
    } catch (error) {
      console.error('Failed to load combo meals:', error);
      setComboMeals([]);
      // Reset pagination when error occurs
      comboMealsPagination.setTotal(0);
      comboMealsPagination.setTotalPages(0);
      comboMealsPagination.setHasNext(false);
      comboMealsPagination.setHasPrev(false);
    }
  };

  const handleItemClick = (item: FoodItem | Buffet | ComboMeal) => {
    setSelectedItem(item);
    setModalOpened(true);
  };

  // Load combo meal items when a combo meal is selected
  useEffect(() => {
    const loadComboMealItems = async () => {
      if (!selectedItem || !('foodItemIds' in selectedItem) || ('pricePerPerson' in selectedItem)) {
        setComboMealItems([]);
        return;
      }

      const comboMeal = selectedItem as ComboMeal;
      
      // If foodItems are already populated, use them
      if (comboMeal.foodItems && comboMeal.foodItems.length > 0) {
        setComboMealItems(comboMeal.foodItems);
        return;
      }

      // Otherwise, load from foodItemIds
      if (!comboMeal.foodItemIds || comboMeal.foodItemIds.length === 0) {
        setComboMealItems([]);
        return;
      }

      setLoadingComboItems(true);
      try {
        // Load food items from API
        const itemsFromAPI = await Promise.all(
          comboMeal.foodItemIds.map(async (id) => {
            try {
              return await menuApi.getFoodItemById(id);
            } catch (error) {
              console.error(`Failed to load food item ${id}:`, error);
              return null;
            }
          })
        );
        
        const validApiItems = itemsFromAPI.filter((item): item is FoodItem => item !== null);
        setComboMealItems(validApiItems);
      } catch (error) {
        console.error('Failed to load combo meal items:', error);
        setComboMealItems([]);
      } finally {
        setLoadingComboItems(false);
      }
    };

    if (modalOpened && selectedItem) {
      loadComboMealItems();
    } else {
      setComboMealItems([]);
    }
  }, [modalOpened, selectedItem]);

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
            setComboMealItems([]);
          }}
          title={selectedItem?.name || ''}
          size="md"
        >
          <Stack gap="md">
            {selectedItem?.description && <Text size="sm">{selectedItem.description}</Text>}
            
            {/* Combo Meal Items */}
            {selectedItem && ('foodItemIds' in selectedItem && !('pricePerPerson' in selectedItem)) && (
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  {t('menu.itemsIncluded', language) || 'Items Included'} ({selectedItem.foodItemIds?.length || 0})
                </Text>
                {loadingComboItems ? (
                  <Stack gap="xs">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} height={40} radius="md" />
                    ))}
                  </Stack>
                ) : comboMealItems.length > 0 ? (
                  <Paper p="sm" withBorder radius="md">
                    <Stack gap="xs">
                      {comboMealItems.map((item) => (
                        <Group key={item.id} justify="space-between" wrap="nowrap">
                          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                            <Box
                              w={40}
                              h={40}
                              style={{
                                flexShrink: 0,
                                borderRadius: 'var(--mantine-radius-sm)',
                                overflow: 'hidden',
                                backgroundColor: item.imageUrl ? 'transparent' : 'var(--mantine-color-gray-2)',
                              }}
                            >
                              {item.imageUrl ? (
                                <NextImage
                                  src={item.imageUrl}
                                  alt={item.name}
                                  width={40}
                                  height={40}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block',
                                  }}
                                />
                              ) : null}
                            </Box>
                            <Text size="sm" fw={500} style={{ flex: 1, minWidth: 0 }} lineClamp={1}>
                              {item.name}
                            </Text>
                          </Group>
                          <Text size="sm" c="dimmed">
                            {formatCurrency(item.basePrice, currency)}
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  </Paper>
                ) : (
                  <Text size="sm" c="dimmed">
                    {t('menu.itemsIncluded', language) ? 'No items included' : 'No items included in this combo'}
                  </Text>
                )}
                <Group gap="xs" mt="xs">
                  <Text size="sm" fw={600}>
                    {t('menu.price', language) || 'Price'}:
                  </Text>
                  <Text size="sm" fw={600} c={primaryColor}>
                    {formatCurrency((selectedItem as ComboMeal).basePrice, currency)}
                  </Text>
                </Group>
              </Stack>
            )}
            
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

