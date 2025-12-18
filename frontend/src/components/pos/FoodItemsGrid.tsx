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
  Button,
  Stack,
  SegmentedControl,
  Skeleton,
} from '@mantine/core';
import { IconSearch, IconShoppingCart } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { db } from '@/lib/indexeddb/database';
import { FoodItem as IndexedDBFoodItem } from '@/lib/indexeddb/database';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { getErrorColor, getWarningColor } from '@/lib/utils/theme';
import { ItemSelectionModal } from './ItemSelectionModal';
import { useCurrency } from '@/lib/hooks/use-currency';
import { menuApi, FoodItem } from '@/lib/api/menu';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';

interface FoodItemsGridProps {
  tenantId: string;
  selectedCategoryId: string | null;
  onCategoryChange: (categoryId: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddToCart: (item: any) => void;
}

export function FoodItemsGrid({
  tenantId,
  selectedCategoryId,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  onAddToCart,
}: FoodItemsGridProps) {
  const { language } = useLanguageStore();
  const primaryColor = useThemeColor();
  const primaryShade = useThemeColorShade(6);
  const currency = useCurrency();
  const pagination = usePagination<FoodItem>({ initialPage: 1, initialLimit: 24 }); // 24 items for grid (6x4 or 4x6)
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [modalOpened, setModalOpened] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selectedCategoryId, searchQuery, pagination.page, pagination.limit]);

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
      let activeMenuTypes: string[] = [];
      try {
        if (navigator.onLine) {
          const menusResponse = await menuApi.getMenus();
          // Handle both paginated and non-paginated responses
          const menus = Array.isArray(menusResponse) ? menusResponse : (menusResponse?.data || []);
          activeMenuTypes = menus
            .filter((menu) => menu.isActive)
            .map((menu) => menu.menuType)
            .filter(Boolean);
        } else {
          // Offline: use food items' menuTypes to infer active menus
          // This is a fallback - ideally menus should be synced to IndexedDB
          const allItems = await db.foodItems
            .where('tenantId')
            .equals(tenantId)
            .filter((item) => item.isActive && !item.deletedAt)
            .toArray();
          const allMenuTypes = new Set<string>();
          allItems.forEach((item) => {
            if (item.menuTypes) {
              item.menuTypes.forEach((mt) => allMenuTypes.add(mt));
            } else if (item.menuType) {
              allMenuTypes.add(item.menuType);
            }
          });
          activeMenuTypes = Array.from(allMenuTypes);
        }
      } catch (error) {
        console.error('Failed to load active menus:', error);
        // Continue with empty array - will show no items if no active menus
      }

      // Load food items - use server pagination if online, otherwise use IndexedDB with local pagination
      if (navigator.onLine) {
        try {
          // Load from server with pagination
          const serverItemsResponse = await menuApi.getFoodItems(
            selectedCategoryId || undefined,
            pagination.paginationParams
          );
          const serverItems = pagination.extractData(serverItemsResponse);
          pagination.extractPagination(serverItemsResponse);
          
          // Filter by search query on client side (since backend doesn't support search yet)
          let filteredItems = serverItems;
          if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filteredItems = serverItems.filter(
              (item) =>
                item.name?.toLowerCase().includes(query) ||
                item.description?.toLowerCase().includes(query),
            );
          }
          
          setFoodItems(filteredItems);
          
          // Update IndexedDB cache (but don't wait for it)
          serverItems.forEach((item) => {
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
    } catch (error) {
      console.error('Failed to load food items:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFromIndexedDB = async (activeMenuTypes: string[]) => {
    // Load food items from IndexedDB
    let itemsQuery = db.foodItems
      .where('tenantId')
      .equals(tenantId)
      .filter((item) => item.isActive && !item.deletedAt);

    if (selectedCategoryId) {
      itemsQuery = itemsQuery.filter((item) => item.categoryId === selectedCategoryId);
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
    const startIndex = (pagination.page - 1) * pagination.limit;
    const endIndex = startIndex + pagination.limit;
    const paginatedItems = convertedItems.slice(startIndex, endIndex);

    setFoodItems(paginatedItems);
    
    // Set pagination info
    pagination.setTotal(totalItems);
    pagination.setTotalPages(Math.ceil(totalItems / pagination.limit));
    pagination.setHasNext(endIndex < totalItems);
    pagination.setHasPrev(pagination.page > 1);
  };

  const handleItemClick = (item: FoodItem) => {
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

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with Search and Categories */}
      <Box p="md" style={{ borderBottom: `1px solid var(--mantine-color-gray-3)` }}>
        <Stack gap="md">
          {/* Search */}
          <TextInput
            placeholder={t('pos.searchItems', language)}
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />

          {/* Categories */}
          <ScrollArea>
            <Group gap="xs">
              <Button
                variant={selectedCategoryId === null ? 'filled' : 'light'}
                size="sm"
                onClick={() => onCategoryChange(null)}
                style={{
                  backgroundColor: selectedCategoryId === null ? primaryShade : undefined,
                }}
              >
                {t('pos.allCategories', language)}
              </Button>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategoryId === category.id ? 'filled' : 'light'}
                  size="sm"
                  onClick={() => onCategoryChange(category.id)}
                  style={{
                    backgroundColor: selectedCategoryId === category.id ? primaryShade : undefined,
                  }}
                >
                  {category.name}
                </Button>
              ))}
            </Group>
          </ScrollArea>
        </Stack>
      </Box>

      {/* Food Items Grid */}
      <ScrollArea style={{ flex: 1 }}>
        <Box p="md">
          {loading ? (
            <Grid>
              {[...Array(12)].map((_, i) => (
                <Grid.Col key={i} span={{ base: 6, sm: 4, md: 3 }}>
                  <Skeleton height={200} />
                </Grid.Col>
              ))}
            </Grid>
          ) : foodItems.length === 0 ? (
            <Box style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <Text c="dimmed" size="lg">
                {t('pos.noItemsFound', language)}
              </Text>
            </Box>
          ) : (
            <Grid>
              {foodItems.map((item) => {
                const isOutOfStock = item.stockType === 'limited' && item.stockQuantity === 0;
                const isLimitedStock = item.stockType === 'limited' && item.stockQuantity > 0 && item.stockQuantity < 10;

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
                      </Card.Section>

                      <Stack gap="xs" mt="md" style={{ flex: 1 }}>
                        <Text fw={500} size="sm" lineClamp={2}>
                          {item.name}
                        </Text>

                        {item.description && (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {item.description}
                          </Text>
                        )}

                        <Group justify="space-between" mt="auto">
                          <Text fw={700} size="lg" c={primaryColor}>
                            {item.basePrice.toFixed(2)} {currency}
                          </Text>

                          {isOutOfStock && (
                            <Badge color={getErrorColor()} size="sm">
                              {t('pos.outOfStock', language)}
                            </Badge>
                          )}
                          {isLimitedStock && (
                            <Badge color={getWarningColor()} size="sm">
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
              limitOptions={[12, 24, 48, 96]}
            />
          )}
        </Box>
      </ScrollArea>

      {/* Item Selection Modal */}
      {selectedItem && (
        <ItemSelectionModal
          opened={modalOpened}
          onClose={() => {
            setModalOpened(false);
            setSelectedItem(null);
          }}
          foodItem={selectedItem}
          onItemSelected={handleItemSelected}
        />
      )}
    </Box>
  );
}

