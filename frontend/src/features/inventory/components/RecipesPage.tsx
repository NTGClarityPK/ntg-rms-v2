'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from '@mantine/form';
import {
  Title,
  Button,
  Stack,
  Modal,
  TextInput,
  Select,
  NumberInput,
  Table,
  Group,
  ActionIcon,
  Text,
  Paper,
  Skeleton,
  Alert,
  Grid,
  Badge,
} from '@mantine/core';
import {
  IconPlus,
  IconTrash,
  IconAlertCircle,
  IconSearch,
  IconLink,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  inventoryApi,
  Ingredient,
  Recipe,
  CreateRecipeDto,
} from '@/lib/api/inventory';
import { menuApi, FoodItem } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { useInventoryRefresh } from '@/lib/contexts/inventory-refresh-context';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';

interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  unit: string;
}

export function RecipesPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const { refreshKey, triggerRefresh } = useInventoryRefresh();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const foodItemsPagination = usePagination<FoodItem>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [allFoodItems, setAllFoodItems] = useState<FoodItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [opened, setOpened] = useState(false);
  const [selectedFoodItem, setSelectedFoodItem] = useState<FoodItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const form = useForm({
    initialValues: {
      foodItemId: '',
      ingredients: [] as RecipeIngredient[],
    },
  });

  const loadFoodItems = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      const serverFoodItemsResponse = await menuApi.getFoodItems(undefined, foodItemsPagination.paginationParams, undefined, false, selectedBranchId || undefined, language);
      const serverFoodItems = foodItemsPagination.extractData(serverFoodItemsResponse);
      foodItemsPagination.extractPagination(serverFoodItemsResponse);
      setFoodItems(serverFoodItems);
    } catch (err: any) {
      console.error('Failed to load food items:', err);
    }
  }, [user?.tenantId, foodItemsPagination, selectedBranchId, language]);

  const loadAllFoodItems = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      const allFoodItems: FoodItem[] = [];
      let page = 1;
      const limit = 100; // Fetch in larger batches
      let hasMore = true;

      // Fetch all pages sequentially
      while (hasMore) {
        const response = await menuApi.getFoodItems(undefined, { page, limit }, undefined, false, selectedBranchId || undefined, language);
        
        if (isPaginatedResponse(response)) {
          allFoodItems.push(...response.data);
          hasMore = response.pagination.hasNext;
          page++;
        } else {
          // Non-paginated response - treat as single page
          allFoodItems.push(...(Array.isArray(response) ? response : []));
          hasMore = false;
        }
      }

      setAllFoodItems(allFoodItems);
    } catch (err: any) {
      console.error('Failed to load all food items:', err);
    }
  }, [user?.tenantId, selectedBranchId, language]);

  const loadIngredients = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      const allServerIngredients: Ingredient[] = [];
      let page = 1;
      const limit = 100; // Fetch in larger batches
      let hasMore = true;

      // Fetch all pages sequentially
      while (hasMore) {
        const response = await inventoryApi.getIngredients({ isActive: true }, { page, limit }, selectedBranchId || undefined, language);
        
        if (isPaginatedResponse(response)) {
          allServerIngredients.push(...response.data);
          hasMore = response.pagination.hasNext;
          page++;
        } else {
          // Non-paginated response - treat as single page
          allServerIngredients.push(...(Array.isArray(response) ? response : []));
          hasMore = false;
        }
      }
      
      // Deduplicate server ingredients
      const serverById = new Map(allServerIngredients.map((ing: Ingredient) => [ing.id, ing]));
      const serverByName = new Map<string, Ingredient>();
      
      for (const ing of Array.from(serverById.values())) {
        const key = ing.name?.toLowerCase().trim() || '';
        if (key) {
          const existing = serverByName.get(key);
          if (!existing || new Date(ing.updatedAt) > new Date(existing.updatedAt)) {
            serverByName.set(key, ing);
          }
        }
      }
      
      const uniqueServerIngredients = serverByName.size < serverById.size 
        ? Array.from(serverByName.values())
        : Array.from(serverById.values());
      
      setIngredients(uniqueServerIngredients);
    } catch (err: any) {
      console.error('Failed to load ingredients:', err);
    }
  }, [user?.tenantId, selectedBranchId, language]);

  const loadRecipes = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      const serverRecipesResponse = await inventoryApi.getRecipes(undefined, undefined, undefined, selectedBranchId || undefined);
      const serverRecipes = Array.isArray(serverRecipesResponse) 
        ? serverRecipesResponse 
        : (serverRecipesResponse?.data || []);
      setRecipes(serverRecipes);
    } catch (err: any) {
      console.error('Failed to load recipes:', err);
    }
  }, [user?.tenantId, selectedBranchId]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadFoodItems(), loadAllFoodItems(), loadIngredients()]);
      setLoading(false);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodItemsPagination.page, foodItemsPagination.limit, refreshKey, selectedBranchId, language]);

  useEffect(() => {
    if (foodItems.length > 0) {
      loadRecipes();
    }
  }, [loadRecipes, foodItems.length, refreshKey, selectedBranchId]);

  // Helper function to get deduplicated ingredient options for Select dropdowns
  const getIngredientOptions = useCallback(() => {
    // Deduplicate by ID first
    const byId = new Map(ingredients.map(ing => [ing.id, ing]));
    const uniqueIngredients = Array.from(byId.values());
    
    return uniqueIngredients
      .filter((ing) => ing.name)
      .map((ing) => ({
        value: ing.id,
        label: ing.unitOfMeasurement 
          ? `${ing.name || ''} (${ing.unitOfMeasurement})`
          : ing.name || '',
      }));
  }, [ingredients]);

  const handleOpenModal = (foodItem?: FoodItem) => {
    // Open modal immediately
    if (foodItem) {
      setSelectedFoodItem(foodItem);
      
      // Load existing recipe for this food item
      const existingRecipe = recipes.filter((r) => r.foodItemId === foodItem.id);
      
      form.setValues({
        foodItemId: foodItem.id,
        ingredients: existingRecipe.map((r) => {
          // Use the ingredient's current unitOfMeasurement instead of stored unit
          const ingredient = ingredients.find((ing) => ing.id === r.ingredientId);
          return {
            ingredientId: r.ingredientId,
            quantity: r.quantity,
            unit: ingredient?.unitOfMeasurement || r.unit,
          };
        }),
      });
    } else {
      setSelectedFoodItem(null);
      form.reset();
    }
    setOpened(true);
    
    // Refresh all food items in the background to ensure dropdown has latest data
    loadAllFoodItems().catch((err) => {
      console.warn('Failed to refresh food items:', err);
    });
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setOpened(false);
    setSelectedFoodItem(null);
    form.reset();
    setSubmitting(false);
  };

  const handleAddIngredient = () => {
    form.insertListItem('ingredients', {
      ingredientId: '',
      quantity: 0,
      unit: '',
    });
  };

  const handleIngredientChange = (index: number, ingredientId: string) => {
    const ingredient = ingredients.find((ing) => ing.id === ingredientId);
    if (ingredient) {
      form.setFieldValue(`ingredients.${index}.unit`, ingredient.unitOfMeasurement);
    }
    form.setFieldValue(`ingredients.${index}.ingredientId`, ingredientId);
  };

  const handleRemoveIngredient = (index: number) => {
    form.removeListItem('ingredients', index);
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    try {
      setSubmitting(true);
      setError(null);

      if (values.ingredients.length === 0) {
        throw new Error('At least one ingredient is required');
      }

      const recipeData: CreateRecipeDto = {
        foodItemId: values.foodItemId,
        ingredients: values.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
          unit: ing.unit,
        })),
      };

      await inventoryApi.createOrUpdateRecipe(recipeData, selectedBranchId || undefined);

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: selectedFoodItem
          ? t('inventory.recipeUpdated', language)
          : t('inventory.recipeCreated', language),
        color: successColor,
      });

      handleCloseModal();
      loadRecipes();
      triggerRefresh(); // Trigger refresh for all tabs
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || t('inventory.recipeError', language);
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (foodItem: FoodItem) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: (
        <Text size="sm">
          {t('inventory.deleteRecipe', language) || 'Delete recipe'} for {foodItem.name}?
        </Text>
      ),
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await inventoryApi.deleteRecipe(foodItem.id);

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('inventory.recipeDeleted', language),
            color: successColor,
          });

          loadRecipes();
          triggerRefresh(); // Trigger refresh for all tabs
        } catch (err: any) {
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || t('inventory.recipeError', language),
            color: errorColor,
          });
        }
      },
    });
  };

  // Filter food items
  const filteredFoodItems = foodItems.filter((item) => {
    const matchesSearch =
      item.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Get recipes for a food item
  const getRecipesForFoodItem = (foodItemId: string) => {
    return recipes.filter((r) => r.foodItemId === foodItemId);
  };

  // Calculate total cost for a recipe
  const calculateRecipeCost = (foodItemId: string) => {
    const itemRecipes = getRecipesForFoodItem(foodItemId);
    return itemRecipes.reduce((total, rec) => {
      const ingredient = ingredients.find((ing) => ing.id === rec.ingredientId);
      if (ingredient) {
        return total + rec.quantity * ingredient.costPerUnit;
      }
      return total;
    }, 0);
  };

  // Helper function to translate unit of measurement
  const getTranslatedUnit = useCallback((unit: string | undefined | null): string => {
    if (!unit) return '';
    
    // Try exact match first (for uppercase units like PIECE, SLICE, CUP)
    let translated = t(`inventory.${unit}` as any, language);
    const hasNonAscii = /[^\x00-\x7F]/.test(translated);
    if (hasNonAscii) {
      return translated;
    }
    
    // Try uppercase version
    const upperUnit = unit.toUpperCase();
    if (upperUnit !== unit) {
      translated = t(`inventory.${upperUnit}` as any, language);
      const upperHasNonAscii = /[^\x00-\x7F]/.test(translated);
      if (upperHasNonAscii) {
        return translated;
      }
    }
    
    // Try lowercase version
    const lowerUnit = unit.toLowerCase();
    if (lowerUnit !== unit && lowerUnit !== upperUnit) {
      translated = t(`inventory.${lowerUnit}` as any, language);
      const lowerHasNonAscii = /[^\x00-\x7F]/.test(translated);
      if (lowerHasNonAscii) {
        return translated;
      }
    }
    
    // Check if different from formatted fallback (for English/French)
    const formattedFallback = unit
      .replace(/([A-Z])/g, ' $1')
      .split(/[\s_]+/)
      .filter(word => word.length > 0)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
    
    if (translated !== formattedFallback && translated !== `inventory.${unit}` && translated !== unit) {
      return translated;
    }
    
    // If no translation found, return original
    return unit;
  }, [language]);

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<IconLink size={16} />}
          onClick={() => handleOpenModal()}
          style={{ backgroundColor: primaryColor }}
        >
          {t('inventory.linkIngredients', language)}
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      {/* Search */}
      <Paper p="md" withBorder mb="md">
        <TextInput
          placeholder={(t('common.search' as any, language) || 'Search') + ' ' + (t('inventory.foodItem', language) || 'food items')}
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />
      </Paper>

      {loading ? (
        <Stack gap="md">
          {[1, 2, 3, 4, 5].map((i) => (
            <Paper key={i} p="md" withBorder>
              <Skeleton height={20} width="100%" mb="xs" />
              <Skeleton height={16} width="60%" />
            </Paper>
          ))}
        </Stack>
      ) : filteredFoodItems.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text ta="center" c="dimmed">
            {t('menu.noFoodItems', language)}
          </Text>
        </Paper>
      ) : (
        <>
          <Table.ScrollContainer minWidth={800}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('inventory.foodItem', language)}</Table.Th>
                  <Table.Th>{t('inventory.ingredients', language)}</Table.Th>
                  <Table.Th>{t('inventory.recipeCost', language) || 'Recipe Cost'}</Table.Th>
                  <Table.Th>{t('common.actions' as any, language) || 'Actions'}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredFoodItems.map((item) => {
                  const itemRecipes = getRecipesForFoodItem(item.id);
                  const recipeCost = calculateRecipeCost(item.id);
                  return (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <Text fw={500}>
                          {item.name}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {itemRecipes.length > 0 ? (
                          <Stack gap="xs">
                            {itemRecipes.map((rec) => {
                              const ingredient = ingredients.find((ing) => ing.id === rec.ingredientId);
                              return (
                                <Group key={rec.id} gap="xs">
                                  <Text size="sm">
                                    {ingredient
                                      ? ingredient.name
                                      : 'Unknown'}
                                  </Text>
                                  <Badge variant="light" color={getBadgeColorForText(`${rec.quantity} ${getTranslatedUnit(rec.unit)}`)} size="sm">
                                    {rec.quantity} {getTranslatedUnit(rec.unit)}
                                  </Badge>
                                </Group>
                              );
                            })}
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed">
                            {t('inventory.noRecipe', language)}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {recipeCost > 0 ? (
                          <Text fw={500}>{recipeCost.toFixed(2)}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">-</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon
                            variant="light"
                            color={primaryColor}
                            onClick={() => handleOpenModal(item)}
                          >
                            <IconPlus size={16} />
                          </ActionIcon>
                          {itemRecipes.length > 0 && (
                            <ActionIcon
                              variant="light"
                              color={errorColor}
                              onClick={() => handleDelete(item)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          
          {/* Pagination Controls */}
          {foodItemsPagination.total > 0 && (
            <PaginationControls
              page={foodItemsPagination.page}
              totalPages={foodItemsPagination.totalPages}
              limit={foodItemsPagination.limit}
              total={foodItemsPagination.total}
              onPageChange={(page) => {
                foodItemsPagination.setPage(page);
              }}
              onLimitChange={(newLimit) => {
                foodItemsPagination.setLimit(newLimit);
                foodItemsPagination.setPage(1);
              }}
            />
          )}
        </>
      )}

      {/* Create/Edit Recipe Modal */}
      <Modal
        opened={opened}
        onClose={handleCloseModal}
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        withCloseButton={!submitting}
        title={
          selectedFoodItem
            ? `${t('inventory.linkIngredients', language)} - ${selectedFoodItem.name}`
            : t('inventory.linkIngredients', language)
        }
        size="lg"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            {!selectedFoodItem && (
              <Select
                label={t('inventory.foodItem', language)}
                placeholder={t('inventory.selectFoodItem', language)}
                required
                data={allFoodItems
                  .filter((item) => item.name)
                  .map((item) => ({
                    value: item.id,
                    label: item.name || '',
                  }))}
                searchable
                {...form.getInputProps('foodItemId')}
              />
            )}
            {selectedFoodItem && (
              <Text size="sm" c="dimmed">
                {t('inventory.foodItem', language)}: {selectedFoodItem.name}
              </Text>
            )}

            <Group justify="space-between" align="center">
              <Text fw={500}>{t('inventory.ingredients', language)}</Text>
              <Button
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={handleAddIngredient}
                variant="light"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                {t('common.add' as any, language) || 'Add'}
              </Button>
            </Group>

            {form.values.ingredients.length === 0 ? (
              <Paper p="md" withBorder>
                <Text ta="center" c="dimmed" size="sm">
                  {t('inventory.noIngredients', language)}. {(t('common.add' as any, language) || 'Add')} {t('inventory.ingredients', language).toLowerCase()} to create a recipe.
                </Text>
              </Paper>
            ) : (
              <Stack gap="md">
                {form.values.ingredients.map((ingredient, index) => (
                  <Paper key={index} p="md" withBorder>
                    <Grid>
                      <Grid.Col span={7}>
                        <Select
                          label={t('inventory.ingredient', language)}
                          placeholder={t('inventory.selectIngredient', language)}
                          required
                          data={getIngredientOptions()}
                          searchable
                          value={form.values.ingredients[index].ingredientId}
                          onChange={(value) => {
                            if (value) {
                              handleIngredientChange(index, value);
                            }
                          }}
                        />
                      </Grid.Col>
                      <Grid.Col span={4}>
                        <NumberInput
                          label={t('inventory.quantity', language)}
                          required
                          min={0.001}
                          decimalScale={3}
                          {...form.getInputProps(`ingredients.${index}.quantity`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={1}>
                        <ActionIcon
                          color={errorColor}
                          variant="light"
                          onClick={() => handleRemoveIngredient(index)}
                          mt="xl"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Grid.Col>
                    </Grid>
                  </Paper>
                ))}
              </Stack>
            )}

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseModal} disabled={submitting}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }} loading={submitting}>
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

