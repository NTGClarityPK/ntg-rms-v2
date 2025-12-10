'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from '@mantine/form';
import {
  Container,
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
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { useInventoryRefresh } from '@/lib/contexts/inventory-refresh-context';

interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  unit: string;
}

export function RecipesPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { refreshKey, triggerRefresh } = useInventoryRefresh();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
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
      // Load from IndexedDB first
      const localFoodItems = await db.foodItems
        .where('tenantId')
        .equals(user.tenantId)
        .filter((item) => !item.deletedAt && item.isActive)
        .toArray();

      setFoodItems(localFoodItems.map((item) => ({
        id: item.id,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        descriptionEn: item.descriptionEn,
        descriptionAr: item.descriptionAr,
        imageUrl: item.imageUrl,
        categoryId: item.categoryId,
        basePrice: item.basePrice,
        stockType: item.stockType,
        stockQuantity: item.stockQuantity,
        menuType: item.menuType,
        menuTypes: item.menuTypes,
        ageLimit: item.ageLimit,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverFoodItems = await menuApi.getFoodItems();
          setFoodItems(serverFoodItems);
        } catch (err: any) {
          console.warn('Failed to sync food items from server:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load food items:', err);
    }
  }, [user?.tenantId]);

  const loadIngredients = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      // Load from IndexedDB first
      const localIngredients = await db.ingredients
        .where('tenantId')
        .equals(user.tenantId)
        .filter((ing) => !ing.deletedAt && ing.isActive)
        .toArray();

      // Deduplicate by ID first, then by nameEn
      const byId = new Map(localIngredients.map(ing => [ing.id, ing]));
      const byName = new Map<string, typeof localIngredients[0]>();
      
      for (const ing of Array.from(byId.values())) {
        const key = ing.nameEn?.toLowerCase().trim() || '';
        if (key) {
          const existing = byName.get(key);
          if (!existing || new Date(ing.updatedAt || ing.createdAt || '') > new Date(existing.updatedAt || existing.createdAt || '')) {
            byName.set(key, ing);
          }
        }
      }
      
      const uniqueIngredients = byName.size < byId.size 
        ? Array.from(byName.values())
        : Array.from(byId.values());

      setIngredients(uniqueIngredients.map((ing) => ({
        id: ing.id,
        tenantId: ing.tenantId,
        nameEn: ing.nameEn,
        nameAr: ing.nameAr,
        category: ing.category,
        unitOfMeasurement: ing.unitOfMeasurement,
        currentStock: ing.currentStock,
        minimumThreshold: ing.minimumThreshold,
        costPerUnit: ing.costPerUnit,
        storageLocation: ing.storageLocation,
        isActive: ing.isActive,
        createdAt: ing.createdAt,
        updatedAt: ing.updatedAt,
      })));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverIngredients = await inventoryApi.getIngredients({ isActive: true });
          
          // Deduplicate server ingredients
          const serverById = new Map(serverIngredients.map(ing => [ing.id, ing]));
          const serverByName = new Map<string, Ingredient>();
          
          for (const ing of Array.from(serverById.values())) {
            const key = ing.nameEn?.toLowerCase().trim() || '';
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

          // Update IndexedDB using bulkPut
          const ingredientsToStore = uniqueServerIngredients.map(ing => ({
            id: ing.id,
            tenantId: user.tenantId,
            nameEn: ing.nameEn,
            nameAr: ing.nameAr,
            category: ing.category,
            unitOfMeasurement: ing.unitOfMeasurement,
            currentStock: ing.currentStock,
            minimumThreshold: ing.minimumThreshold,
            costPerUnit: ing.costPerUnit,
            storageLocation: ing.storageLocation,
            isActive: ing.isActive,
            createdAt: ing.createdAt,
            updatedAt: ing.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced' as const,
          }));
          
          if (ingredientsToStore.length > 0) {
            await db.ingredients.bulkPut(ingredientsToStore);
          }
        } catch (err: any) {
          console.warn('Failed to sync ingredients from server:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load ingredients:', err);
    }
  }, [user?.tenantId]);

  const loadRecipes = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      // Load from IndexedDB first
      const localRecipes = await db.recipes
        .where('foodItemId')
        .anyOf(foodItems.map((item) => item.id))
        .toArray();

      setRecipes(localRecipes.map((rec) => ({
        id: rec.id,
        foodItemId: rec.foodItemId,
        ingredientId: rec.ingredientId,
        quantity: rec.quantity,
        unit: rec.unit,
      })));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverRecipes = await inventoryApi.getRecipes();
          setRecipes(serverRecipes);

          // Update IndexedDB
          for (const rec of serverRecipes) {
            await db.recipes.put({
              id: rec.id,
              foodItemId: rec.foodItemId,
              ingredientId: rec.ingredientId,
              quantity: rec.quantity,
              unit: rec.unit,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            });
          }
        } catch (err: any) {
          console.warn('Failed to sync recipes from server:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load recipes:', err);
    }
  }, [user?.tenantId, foodItems]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadFoodItems(), loadIngredients()]);
      setLoading(false);
    };
    loadData();
  }, [loadFoodItems, loadIngredients, refreshKey]);

  useEffect(() => {
    if (foodItems.length > 0) {
      loadRecipes();
    }
  }, [loadRecipes, foodItems.length, refreshKey]);

  // Helper function to get deduplicated ingredient options for Select dropdowns
  const getIngredientOptions = useCallback(() => {
    // Deduplicate by ID first
    const byId = new Map(ingredients.map(ing => [ing.id, ing]));
    const uniqueIngredients = Array.from(byId.values());
    
    return uniqueIngredients
      .filter((ing) => ing.nameEn)
      .map((ing) => ({
        value: ing.id,
        label: (language === 'ar' && ing.nameAr ? ing.nameAr : ing.nameEn) || '',
      }));
  }, [ingredients, language]);

  const handleOpenModal = (foodItem?: FoodItem) => {
    if (foodItem) {
      setSelectedFoodItem(foodItem);
      
      // Load existing recipe for this food item
      const existingRecipe = recipes.filter((r) => r.foodItemId === foodItem.id);
      
      form.setValues({
        foodItemId: foodItem.id,
        ingredients: existingRecipe.map((r) => ({
          ingredientId: r.ingredientId,
          quantity: r.quantity,
          unit: r.unit,
        })),
      });
    } else {
      setSelectedFoodItem(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    setOpened(false);
    setSelectedFoodItem(null);
    form.reset();
  };

  const handleAddIngredient = () => {
    form.insertListItem('ingredients', {
      ingredientId: '',
      quantity: 0,
      unit: '',
    });
  };

  const handleRemoveIngredient = (index: number) => {
    form.removeListItem('ingredients', index);
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    try {
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

      // Save to IndexedDB first (offline-first)
      const existingRecipes = recipes.filter((r) => r.foodItemId === values.foodItemId);
      
      // Delete existing recipes locally
      for (const rec of existingRecipes) {
        await db.recipes.delete(rec.id);
      }

      // Add new recipes locally
      const tempRecipes = recipeData.ingredients.map((ing, index) => ({
        id: `temp_${Date.now()}_${index}`,
        foodItemId: recipeData.foodItemId,
        ingredientId: ing.ingredientId,
        quantity: ing.quantity,
        unit: ing.unit,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending' as const,
      }));

      await db.recipes.bulkAdd(tempRecipes);

      // Try to sync if online
      if (navigator.onLine) {
        try {
          const result = await inventoryApi.createOrUpdateRecipe(recipeData);
          
          // Update recipes with server IDs
          for (let i = 0; i < tempRecipes.length; i++) {
            if (result[i]) {
              await db.recipes.update(tempRecipes[i].id, {
                id: result[i].id,
                syncStatus: 'synced',
                lastSynced: new Date().toISOString(),
              });
            }
          }

          // Queue sync
          for (const rec of result) {
            await syncService.queueChange('recipes', 'CREATE', rec.id, rec);
          }
        } catch (err: any) {
          // Keep as pending, will sync later
          console.warn('Failed to sync recipe:', err);
        }
      }

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
    }
  };

  const handleDelete = (foodItem: FoodItem) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: (
        <Text size="sm">
          {t('inventory.deleteRecipe', language) || 'Delete recipe'} for {language === 'ar' && foodItem.nameAr ? foodItem.nameAr : foodItem.nameEn}?
        </Text>
      ),
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          // Delete from IndexedDB first
          const existingRecipes = recipes.filter((r) => r.foodItemId === foodItem.id);
          for (const rec of existingRecipes) {
            await db.recipes.delete(rec.id);
          }

          // Try to sync if online
          if (navigator.onLine) {
            try {
              await inventoryApi.deleteRecipe(foodItem.id);
              await syncService.queueChange('recipes', 'DELETE', foodItem.id, { foodItemId: foodItem.id });
            } catch (err: any) {
              console.warn('Failed to sync recipe deletion:', err);
            }
          }

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
      item.nameEn?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.nameAr && item.nameAr.toLowerCase().includes(searchQuery.toLowerCase()));
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

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>{t('inventory.recipes', language)}</Title>
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
                        {language === 'ar' && item.nameAr ? item.nameAr : item.nameEn}
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
                                    ? language === 'ar' && ingredient.nameAr
                                      ? ingredient.nameAr
                                      : ingredient.nameEn
                                    : 'Unknown'}
                                </Text>
                                <Badge variant="light" color={primaryColor} size="sm">
                                  {rec.quantity} {rec.unit}
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
      )}

      {/* Create/Edit Recipe Modal */}
      <Modal
        opened={opened}
        onClose={handleCloseModal}
        title={
          selectedFoodItem
            ? `${t('inventory.linkIngredients', language)} - ${language === 'ar' && selectedFoodItem.nameAr ? selectedFoodItem.nameAr : selectedFoodItem.nameEn}`
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
                data={foodItems
                  .filter((item) => item.nameEn)
                  .map((item) => ({
                    value: item.id,
                    label: (language === 'ar' && item.nameAr ? item.nameAr : item.nameEn) || '',
                  }))}
                searchable
                {...form.getInputProps('foodItemId')}
              />
            )}
            {selectedFoodItem && (
              <Text size="sm" c="dimmed">
                {t('inventory.foodItem', language)}: {language === 'ar' && selectedFoodItem.nameAr ? selectedFoodItem.nameAr : selectedFoodItem.nameEn}
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
                      <Grid.Col span={5}>
                        <Select
                          label={t('inventory.ingredient', language)}
                          placeholder={t('inventory.selectIngredient', language)}
                          required
                          data={getIngredientOptions()}
                          searchable
                          {...form.getInputProps(`ingredients.${index}.ingredientId`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={3}>
                        <NumberInput
                          label={t('inventory.quantity', language)}
                          required
                          min={0.001}
                          decimalScale={3}
                          {...form.getInputProps(`ingredients.${index}.quantity`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={3}>
                        <TextInput
                          label={t('inventory.unit', language) || 'Unit'}
                          placeholder="kg, g, liter, etc."
                          required
                          {...form.getInputProps(`ingredients.${index}.unit`)}
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
              <Button variant="subtle" onClick={handleCloseModal}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }}>
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}

