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
  Button,
  Paper,
} from '@mantine/core';
import { IconSearch, IconShoppingCart } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { db } from '@/lib/indexeddb/database';
import { FoodItem } from '@/lib/indexeddb/database';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { getErrorColor, getWarningColor, getBadgeColorForText } from '@/lib/utils/theme';
import { ItemSelectionModal } from './ItemSelectionModal';
import { useCurrency } from '@/lib/hooks/use-currency';

interface FoodItemsGridProps {
  tenantId: string;
  selectedCategoryIds: string[];
  onCategoryChange: (categoryIds: string[]) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddToCart: (item: any) => void;
}

export function FoodItemsGrid({
  tenantId,
  selectedCategoryIds,
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
  }, [tenantId, selectedCategoryIds, searchQuery]);

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

      if (selectedCategoryIds.length > 0) {
        itemsQuery = itemsQuery.filter((item) => {
          const categoryId = item.categoryId;
          return categoryId !== undefined && categoryId !== null && selectedCategoryIds.includes(categoryId);
        });
      }

      const items = await itemsQuery.toArray();

      // Filter by search query
      let filteredItems = items;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredItems = items.filter(
          (item) =>
            item.name?.toLowerCase().includes(query) ||
            item.description?.toLowerCase().includes(query),
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
    <Stack gap="md">
      {/* Search */}
      <Paper p="md" withBorder>
        <TextInput
          placeholder={t('pos.searchItems', language)}
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </Paper>

      {/* Categories */}
      <Paper p="sm" withBorder>
        <ScrollArea>
          <Group gap="xs" wrap="wrap" className="filter-chip-group">
            <Chip
              checked={selectedCategoryIds.length === 0}
              onChange={() => onCategoryChange([])}
              variant="filled"
            >
              {t('pos.allCategories', language)}
            </Chip>
            <Chip.Group multiple value={selectedCategoryIds} onChange={onCategoryChange}>
              {categories.map((category) => (
                <Chip key={category.id} value={category.id} variant="filled">
                  {category.name}
                </Chip>
              ))}
            </Chip.Group>
          </Group>
        </ScrollArea>
      </Paper>

      {/* Food Items Grid */}
      <Box>
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
      </Box>

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
    </Stack>
  );
}

