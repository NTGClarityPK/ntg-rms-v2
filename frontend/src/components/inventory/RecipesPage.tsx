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
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { useInventoryRefresh } from '@/lib/contexts/inventory-refresh-context';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';

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
  const foodItemsPagination = usePagination<FoodItem>({ initialPage: 1, initialLimit: 10 });
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
      // Load from server if online
      if (navigator.onLine) {
        try {
          const serverFoodItemsResponse = await menuApi.getFoodItems(undefined, foodItemsPagination.paginationParams);
          // Handle both paginated and non-paginated responses
          const serverFoodItems = foodItemsPagination.extractData(serverFoodItemsResponse);
          foodItemsPagination.extractPagination(serverFoodItemsResponse);
          setFoodItems(serverFoodItems);
        } catch (err: any) {
          console.warn('Failed to sync food items from server:', err);
          // Fallback to IndexedDB
          const localFoodItems = await db.foodItems
            .where('tenantId')
            .equals(user.tenantId)
            .filter((item) => !item.deletedAt)
            .toArray();
          
          // Apply local pagination for IndexedDB
          const totalItems = localFoodItems.length;
          const startIndex = (foodItemsPagination.page - 1) * foodItemsPagination.limit;
          const endIndex = startIndex + foodItemsPagination.limit;
          const paginatedFoodItems = localFoodItems.slice(startIndex, endIndex);
          
          setFoodItems(paginatedFoodItems.map((item) => ({
            id: item.id,
            name: (item as any).name || (item as any).nameEn || (item as any).nameAr || '',
            description: (item as any).description || (item as any).descriptionEn || (item as any).descriptionAr || undefined,
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
          
          // Update pagination info for local pagination
          foodItemsPagination.setTotal(totalItems);
          foodItemsPagination.setTotalPages(Math.ceil(totalItems / foodItemsPagination.limit));
          foodItemsPagination.setHasNext(endIndex < totalItems);
          foodItemsPagination.setHasPrev(foodItemsPagination.page > 1);
        }
      } else {
        // Load from IndexedDB when offline
        const localFoodItems = await db.foodItems
          .where('tenantId')
          .equals(user.tenantId)
          .filter((item) => !item.deletedAt)
          .toArray();
        
        // Apply local pagination for IndexedDB
        const totalItems = localFoodItems.length;
        const startIndex = (foodItemsPagination.page - 1) * foodItemsPagination.limit;
        const endIndex = startIndex + foodItemsPagination.limit;
        const paginatedFoodItems = localFoodItems.slice(startIndex, endIndex);
        
        setFoodItems(paginatedFoodItems.map((item) => ({
          id: item.id,
          name: (item as any).name || (item as any).nameEn || (item as any).nameAr || '',
          description: (item as any).description || (item as any).descriptionEn || (item as any).descriptionAr || undefined,
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
        
        // Update pagination info for local pagination
        foodItemsPagination.setTotal(totalItems);
        foodItemsPagination.setTotalPages(Math.ceil(totalItems / foodItemsPagination.limit));
        foodItemsPagination.setHasNext(endIndex < totalItems);
        foodItemsPagination.setHasPrev(foodItemsPagination.page > 1);
      }
    } catch (err: any) {
      console.error('Failed to load food items:', err);
    }
  }, [user?.tenantId, foodItemsPagination]);

  const loadAllFoodItems = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      // Load from server if online
      if (navigator.onLine) {
        try {
          const allFoodItems: FoodItem[] = [];
          let page = 1;
          const limit = 100; // Fetch in larger batches
          let hasMore = true;

          // Fetch all pages sequentially
          while (hasMore) {
            const response = await menuApi.getFoodItems(undefined, { page, limit });
            
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
          console.warn('Failed to sync all food items from server:', err);
          // Fallback to IndexedDB
          const localFoodItems = await db.foodItems
            .where('tenantId')
            .equals(user.tenantId)
            .filter((item) => !item.deletedAt)
            .toArray();
          
          setAllFoodItems(localFoodItems.map((item) => ({
            id: item.id,
            name: (item as any).name || (item as any).nameEn || (item as any).nameAr || '',
            description: (item as any).description || (item as any).descriptionEn || (item as any).descriptionAr || undefined,
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
        }
      } else {
        // Load from IndexedDB when offline
        const localFoodItems = await db.foodItems
          .where('tenantId')
          .equals(user.tenantId)
          .filter((item) => !item.deletedAt)
          .toArray();
        
        setAllFoodItems(localFoodItems.map((item) => ({
          id: item.id,
          name: (item as any).name || (item as any).nameEn || (item as any).nameAr || '',
          description: (item as any).description || (item as any).descriptionEn || (item as any).descriptionAr || undefined,
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
      }
    } catch (err: any) {
      console.error('Failed to load all food items:', err);
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
        const key = ((ing as any).name || (ing as any).nameEn || (ing as any).nameAr || '').toLowerCase().trim();
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
        name: (ing as any).name || (ing as any).nameEn || (ing as any).nameAr || '',
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
          const allServerIngredients: Ingredient[] = [];
          let page = 1;
          const limit = 100; // Fetch in larger batches
          let hasMore = true;

          // Fetch all pages sequentially
          while (hasMore) {
            const response = await inventoryApi.getIngredients({ isActive: true }, { page, limit });
            
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

          // Update IndexedDB using bulkPut
          const ingredientsToStore = uniqueServerIngredients.map(ing => ({
            id: ing.id,
            tenantId: user.tenantId,
            name: ing.name,
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
            await db.ingredients.bulkPut(ingredientsToStore as any);
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
          const serverRecipesResponse = await inventoryApi.getRecipes();
          // Handle both paginated and non-paginated responses
          const serverRecipes = Array.isArray(serverRecipesResponse) 
            ? serverRecipesResponse 
            : (serverRecipesResponse?.data || []);
          setRecipes(serverRecipes);

          // Update IndexedDB
          for (const rec of serverRecipes) {
            await db.recipes.put({
              id: rec.id,
              ...(rec.foodItemId && { foodItemId: rec.foodItemId }),
              ...(rec.addOnId && { addOnId: rec.addOnId }),
              ingredientId: rec.ingredientId,
              quantity: rec.quantity,
              unit: rec.unit,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced' as const,
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
      await Promise.all([loadFoodItems(), loadAllFoodItems(), loadIngredients()]);
      setLoading(false);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodItemsPagination.page, foodItemsPagination.limit, refreshKey]);

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
                                  <Badge variant="light" color={getBadgeColorForText(`${rec.quantity} ${rec.unit}`)} size="sm">
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

