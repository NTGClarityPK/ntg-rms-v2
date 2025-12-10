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
import { FoodItem } from '@/lib/indexeddb/database';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { getErrorColor, getWarningColor } from '@/lib/utils/theme';
import { ItemSelectionModal } from './ItemSelectionModal';
import { useCurrency } from '@/lib/hooks/use-currency';

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
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [modalOpened, setModalOpened] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selectedCategoryId, searchQuery]);

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

      // Load food items
      let itemsQuery = db.foodItems
        .where('tenantId')
        .equals(tenantId)
        .filter((item) => item.isActive && !item.deletedAt);

      if (selectedCategoryId) {
        itemsQuery = itemsQuery.filter((item) => item.categoryId === selectedCategoryId);
      }

      const items = await itemsQuery.toArray();

      // Filter by search query
      let filteredItems = items;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredItems = items.filter(
          (item) =>
            item.nameEn?.toLowerCase().includes(query) ||
            item.nameAr?.toLowerCase().includes(query) ||
            item.descriptionEn?.toLowerCase().includes(query) ||
            item.descriptionAr?.toLowerCase().includes(query),
        );
      }

      setFoodItems(filteredItems);
    } catch (error) {
      console.error('Failed to load food items:', error);
    } finally {
      setLoading(false);
    }
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
                  {language === 'ar' && category.nameAr ? category.nameAr : category.nameEn}
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
                          alt={language === 'ar' && item.nameAr ? item.nameAr : item.nameEn}
                          fit="cover"
                        />
                      </Card.Section>

                      <Stack gap="xs" mt="md" style={{ flex: 1 }}>
                        <Text fw={500} size="sm" lineClamp={2}>
                          {language === 'ar' && item.nameAr ? item.nameAr : item.nameEn}
                        </Text>

                        {item.descriptionEn && (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {language === 'ar' && item.descriptionAr
                              ? item.descriptionAr
                              : item.descriptionEn}
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

