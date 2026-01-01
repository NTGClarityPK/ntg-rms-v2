'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import {
  Title,
  Button,
  Stack,
  Modal,
  TextInput,
  Select,
  Switch,
  Table,
  Group,
  ActionIcon,
  Badge,
  Text,
  Paper,
  Skeleton,
  Alert,
  Grid,
  NumberInput,
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconAlertCircle, IconSearch, IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { inventoryApi, Ingredient, CreateIngredientDto, UpdateIngredientDto } from '@/lib/api/inventory';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { IngredientsRepository } from '../repositories/ingredients.repository';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getWarningColor, getBadgeColorForText } from '@/lib/utils/theme';
import { useInventoryRefresh } from '@/lib/contexts/inventory-refresh-context';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { INGREDIENT_CATEGORIES, MEASUREMENT_UNITS } from '@/shared/constants/ingredients.constants';
import { handleApiError } from '@/shared/utils/error-handler';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';

export function IngredientsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { refreshKey, triggerRefresh } = useInventoryRefresh();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<Ingredient>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<boolean | null>(null);
  const prevSearchQueryRef = useRef<string>('');

  // Initialize repository
  const ingredientsRepository = useMemo(() => {
    return user?.tenantId ? new IngredientsRepository(user.tenantId) : null;
  }, [user?.tenantId]);

  const form = useForm({
    initialValues: {
      name: '',
      category: '',
      unitOfMeasurement: '',
      currentStock: 0,
      minimumThreshold: 0,
      costPerUnit: 0,
      storageLocation: '',
      isActive: true,
    },
    validate: {
      name: (value) => (!value ? (t('inventory.ingredientName', language) || 'Ingredient name') + ' is required' : null),
      unitOfMeasurement: (value) => (!value ? t('inventory.unitOfMeasurement', language) + ' is required' : null),
    },
  });

  const loadIngredients = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      // Sync from server if online, otherwise load from IndexedDB
      if (navigator.onLine) {
        try {
          const filters: any = {};
          if (categoryFilter) filters.category = categoryFilter;
          if (statusFilter !== null) filters.isActive = statusFilter;
          if (debouncedSearchQuery.trim()) filters.search = debouncedSearchQuery.trim();

          const serverIngredientsResponse = await inventoryApi.getIngredients(filters, pagination.paginationParams);
          // Handle both paginated and non-paginated responses
          const serverIngredients = pagination.extractData(serverIngredientsResponse);
          pagination.extractPagination(serverIngredientsResponse);
          
          // Deduplicate by ID first, then by nameEn to catch any duplicates with different IDs
          const byId = new Map(serverIngredients.map(ing => [ing.id, ing]));
          const byName = new Map<string, Ingredient>();
          
          // Keep the most recent ingredient if there are duplicates by name
          for (const ing of Array.from(byId.values())) {
            const key = ing.name?.toLowerCase().trim() || '';
            if (key) {
              const existing = byName.get(key);
              if (!existing || new Date(ing.updatedAt) > new Date(existing.updatedAt)) {
                byName.set(key, ing);
              }
            }
          }
          
          // Use name-based deduplication if it results in fewer items, otherwise use ID-based
          const uniqueIngredients = byName.size < byId.size 
            ? Array.from(byName.values())
            : Array.from(byId.values());
          
          setIngredients(uniqueIngredients);

          // Update IndexedDB using bulkPut (handles duplicates automatically)
          const ingredientsToStore = uniqueIngredients.map(ing => ({
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
          })) as any;
          
          if (ingredientsToStore.length > 0 && ingredientsRepository) {
            await ingredientsRepository.bulkPut(ingredientsToStore);
          }
        } catch (err: any) {
          console.warn('Failed to sync ingredients from server:', err);
          // Fallback to IndexedDB if server sync fails using repository
          let localIngredients: Ingredient[] = [];
          if (ingredientsRepository) {
            const filters: Partial<Ingredient> = {};
            if (categoryFilter) filters.category = categoryFilter;
            if (statusFilter !== null) filters.isActive = statusFilter;
            localIngredients = await ingredientsRepository.findAll(filters);
          }

          // Apply search filter for offline mode
          if (debouncedSearchQuery.trim()) {
            const searchTerm = debouncedSearchQuery.toLowerCase().trim();
            localIngredients = localIngredients.filter((ing) => {
              const name = ((ing as any).name || (ing as any).nameEn || (ing as any).nameAr || '').toLowerCase();
              return name.includes(searchTerm);
            });
          }

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
          
          // Apply local pagination
          const totalItems = uniqueIngredients.length;
          const startIndex = (pagination.page - 1) * pagination.limit;
          const endIndex = startIndex + pagination.limit;
          const paginatedIngredients = uniqueIngredients.slice(startIndex, endIndex);
          
          setIngredients(paginatedIngredients.map((ing) => ({
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
          
          // Update pagination info for local pagination
          pagination.setTotal(totalItems);
          pagination.setTotalPages(Math.ceil(totalItems / pagination.limit));
          pagination.setHasNext(endIndex < totalItems);
          pagination.setHasPrev(pagination.page > 1);
        }
      } else {
        // Load from IndexedDB when offline using repository
        let localIngredients: Ingredient[] = [];
        if (ingredientsRepository) {
          const filters: Partial<Ingredient> = {};
          if (categoryFilter) filters.category = categoryFilter;
          if (statusFilter !== null) filters.isActive = statusFilter;
          localIngredients = await ingredientsRepository.findAll(filters);
        }

        // Apply search filter for offline mode
        if (debouncedSearchQuery.trim()) {
          const searchTerm = debouncedSearchQuery.toLowerCase().trim();
          localIngredients = localIngredients.filter((ing) => {
            const name = ((ing as any).name || (ing as any).nameEn || (ing as any).nameAr || '').toLowerCase();
            return name.includes(searchTerm);
          });
        }

        // Deduplicate by ID first, then by nameEn
        const byId = new Map(localIngredients.map(ing => [ing.id, ing]));
        const byName = new Map<string, typeof localIngredients[0]>();
        
        for (const ing of Array.from(byId.values())) {
          const key = (ing as any).name?.toLowerCase().trim() || (ing as any).nameEn?.toLowerCase().trim() || '';
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

        // Apply local pagination
        const totalItems = uniqueIngredients.length;
        const startIndex = (pagination.page - 1) * pagination.limit;
        const endIndex = startIndex + pagination.limit;
        const paginatedIngredients = uniqueIngredients.slice(startIndex, endIndex);

        setIngredients(paginatedIngredients.map((ing) => ({
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
        
        // Update pagination info for local pagination
        pagination.setTotal(totalItems);
        pagination.setTotalPages(Math.ceil(totalItems / pagination.limit));
        pagination.setHasNext(endIndex < totalItems);
        pagination.setHasPrev(pagination.page > 1);
      }
    } catch (err: any) {
      setError(err.message || t('inventory.loadError', language));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language, categoryFilter, statusFilter, debouncedSearchQuery, pagination.page, pagination.limit]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    if (prevSearchQueryRef.current !== debouncedSearchQuery && pagination.page !== 1) {
      pagination.setPage(1);
    }
    prevSearchQueryRef.current = debouncedSearchQuery;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients, refreshKey]);

  const handleOpenModal = (ingredient?: Ingredient) => {
    if (ingredient) {
      setEditingIngredient(ingredient);
      form.setValues({
        name: ingredient.name,
        category: ingredient.category || '',
        unitOfMeasurement: ingredient.unitOfMeasurement,
        currentStock: ingredient.currentStock,
        minimumThreshold: ingredient.minimumThreshold,
        costPerUnit: ingredient.costPerUnit,
        storageLocation: ingredient.storageLocation || '',
        isActive: ingredient.isActive,
      });
    } else {
      setEditingIngredient(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    setOpened(false);
    setEditingIngredient(null);
    form.reset();
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    try {
      setError(null);

      let savedIngredient: Ingredient;

      if (editingIngredient) {
        // Update
        const updateData: UpdateIngredientDto = {
          name: values.name,
          category: values.category || undefined,
          unitOfMeasurement: values.unitOfMeasurement,
          currentStock: values.currentStock,
          minimumThreshold: values.minimumThreshold,
          costPerUnit: values.costPerUnit,
          storageLocation: values.storageLocation || undefined,
          isActive: values.isActive,
        };

        savedIngredient = await inventoryApi.updateIngredient(editingIngredient.id, updateData);
        
        // Update IndexedDB using repository
        if (ingredientsRepository) {
          await ingredientsRepository.update(editingIngredient.id, {
            ...updateData,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          } as Partial<Ingredient>);
        }

        // Only queue if offline (already synced via API when online)
        if (!navigator.onLine) {
        await syncService.queueChange('ingredients', 'UPDATE', editingIngredient.id, savedIngredient);
        }
      } else {
        // Create
        const createData: CreateIngredientDto = {
          name: values.name,
          category: values.category || undefined,
          unitOfMeasurement: values.unitOfMeasurement,
          currentStock: values.currentStock,
          minimumThreshold: values.minimumThreshold,
          costPerUnit: values.costPerUnit,
          storageLocation: values.storageLocation || undefined,
          isActive: values.isActive,
        };

        savedIngredient = await inventoryApi.createIngredient(createData);
        
        // Save to IndexedDB using repository
        if (ingredientsRepository) {
          await ingredientsRepository.create({
          id: savedIngredient.id,
          tenantId: user.tenantId,
          name: savedIngredient.name,
          category: savedIngredient.category,
          unitOfMeasurement: savedIngredient.unitOfMeasurement,
          currentStock: savedIngredient.currentStock,
          minimumThreshold: savedIngredient.minimumThreshold,
          costPerUnit: savedIngredient.costPerUnit,
          storageLocation: savedIngredient.storageLocation,
          isActive: savedIngredient.isActive,
          createdAt: savedIngredient.createdAt,
          updatedAt: savedIngredient.updatedAt,
          lastSynced: new Date().toISOString(),
          syncStatus: 'synced' as const,
        } as any);
        }

        // Only queue if offline (already synced via API when online)
        if (!navigator.onLine) {
        await syncService.queueChange('ingredients', 'CREATE', savedIngredient.id, savedIngredient);
        }
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: editingIngredient 
          ? t('inventory.ingredientUpdated', language)
          : t('inventory.ingredientCreated', language),
        color: successColor,
      });

      handleCloseModal();
      loadIngredients();
      triggerRefresh(); // Trigger refresh for all tabs
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || t('inventory.createError', language);
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
    }
  };

  const handleDelete = (ingredient: Ingredient) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('inventory.deleteIngredient', language)}: {ingredient.name}?</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await inventoryApi.deleteIngredient(ingredient.id);
          
          // Update IndexedDB (soft delete) using repository
          if (ingredientsRepository) {
            await ingredientsRepository.delete(ingredient.id);
          }

          // Only queue if offline (already synced via API when online)
          if (!navigator.onLine) {
          await syncService.queueChange('ingredients', 'DELETE', ingredient.id, ingredient);
          }

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('inventory.ingredientDeleted', language),
            color: successColor,
          });

          loadIngredients();
          triggerRefresh(); // Trigger refresh for all tabs
        } catch (err: any) {
          handleApiError(err, {
            defaultMessage: t('inventory.deleteError', language),
            language,
            errorColor,
          });
        }
      },
    });
  };


  const isLowStock = (ingredient: Ingredient) => {
    return ingredient.currentStock <= ingredient.minimumThreshold;
  };

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => handleOpenModal()}
          style={{ backgroundColor: primaryColor }}
        >
          {t('inventory.addIngredient', language)}
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper p="md" withBorder mb="md">
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput
              placeholder={t('inventory.searchIngredients', language)}
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              placeholder={t('inventory.filterByCategory', language)}
              data={[
                { value: '', label: String(t('inventory.allCategories', language) || 'All Categories') },
                ...INGREDIENT_CATEGORIES.map(cat => {
                  const label = t(`inventory.${cat.value}` as any, language) || cat.label || '';
                  return {
                    value: cat.value,
                    label: String(label),
                  };
                })
              ]}
              value={categoryFilter || ''}
              onChange={(value) => setCategoryFilter(value || null)}
              clearable
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              placeholder={t('inventory.filterByStatus', language)}
              data={[
                { value: '', label: t('common.all' as any, language) || 'All' },
                { value: 'true', label: t('common.active' as any, language) || 'Active' },
                { value: 'false', label: t('common.inactive' as any, language) || 'Inactive' },
              ]}
              value={statusFilter === null ? '' : String(statusFilter)}
              onChange={(value) => setStatusFilter(value === '' ? null : value === 'true')}
              clearable
            />
          </Grid.Col>
        </Grid>
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
      ) : ingredients.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text ta="center" c="dimmed">
            {t('inventory.noIngredients', language)}
          </Text>
        </Paper>
      ) : (
        <>
          <Table.ScrollContainer minWidth={800}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('inventory.ingredientName', language)}</Table.Th>
                  <Table.Th>{t('inventory.category', language)}</Table.Th>
                  <Table.Th>{t('inventory.currentStock', language)}</Table.Th>
                  <Table.Th>{t('inventory.minimumThreshold', language)}</Table.Th>
                  <Table.Th>{t('inventory.costPerUnit', language)}</Table.Th>
                  <Table.Th>{t('common.status' as any, language) || 'Status'}</Table.Th>
                  <Table.Th>{t('common.actions' as any, language) || 'Actions'}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {ingredients.map((ingredient) => (
                  <Table.Tr key={ingredient.id}>
                    <Table.Td>
                      <Text fw={500}>
                        {ingredient.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {ingredient.category ? (
                        <Badge variant="light" color={getBadgeColorForText(t(`inventory.${ingredient.category}` as any, language) || ingredient.category)}>
                          {t(`inventory.${ingredient.category}` as any, language) || ingredient.category}
                        </Badge>
                      ) : (
                        <Text size="sm" c="dimmed">-</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Text>{ingredient.currentStock} {ingredient.unitOfMeasurement}</Text>
                        {isLowStock(ingredient) && (
                          <Badge variant="light" color={getWarningColor()} size="sm">
                            {t('inventory.isLowStock', language)}
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text>{ingredient.minimumThreshold} {ingredient.unitOfMeasurement}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text>{ingredient.costPerUnit.toFixed(2)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={ingredient.isActive ? successColor : 'gray'}
                        variant="light"
                        leftSection={
                          ingredient.isActive ? (
                            <IconCircleCheck size={14} />
                          ) : (
                            <IconCircleX size={14} />
                          )
                        }
                      >
                        {ingredient.isActive ? (t('common.active' as any, language) || 'Active') : (t('common.inactive' as any, language) || 'Inactive')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon
                          variant="light"
                          color={primaryColor}
                          onClick={() => handleOpenModal(ingredient)}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color={errorColor}
                          onClick={() => handleDelete(ingredient)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          
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
            />
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal
        opened={opened}
        onClose={handleCloseModal}
        title={editingIngredient ? t('inventory.editIngredient', language) : t('inventory.addIngredient', language)}
        size="lg"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label={t('inventory.ingredientName', language) || 'Ingredient Name'}
              placeholder={t('inventory.ingredientName', language) || 'Enter ingredient name'}
              required
              {...form.getInputProps('name')}
            />
            <Select
              label={t('inventory.category', language)}
              placeholder={t('inventory.category', language)}
              data={INGREDIENT_CATEGORIES.map(cat => {
                const label = t(`inventory.${cat.value}` as any, language) || cat.label || '';
                return {
                  value: cat.value,
                  label: String(label),
                };
              })}
              {...form.getInputProps('category')}
            />
            <Select
              label={t('inventory.unitOfMeasurement', language)}
              placeholder={t('inventory.unitOfMeasurement', language)}
              required
              data={MEASUREMENT_UNITS.map(unit => {
                const label = t(`inventory.${unit.value}` as any, language) || unit.label || '';
                return {
                  value: unit.value,
                  label: String(label),
                };
              })}
              {...form.getInputProps('unitOfMeasurement')}
            />
            <Grid>
              <Grid.Col span={6}>
                <NumberInput
                  label={t('inventory.currentStock', language)}
                  min={0}
                  decimalScale={3}
                  {...form.getInputProps('currentStock')}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label={t('inventory.minimumThreshold', language)}
                  min={0}
                  decimalScale={3}
                  {...form.getInputProps('minimumThreshold')}
                />
              </Grid.Col>
            </Grid>
            <NumberInput
              label={t('inventory.costPerUnit', language)}
              min={0}
              decimalScale={2}
              {...form.getInputProps('costPerUnit')}
            />
            <TextInput
              label={t('inventory.storageLocation', language)}
              placeholder={t('inventory.storageLocation', language)}
              {...form.getInputProps('storageLocation')}
            />
            <Switch
              label={t('inventory.isActive', language)}
              {...form.getInputProps('isActive', { type: 'checkbox' })}
            />
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
    </Stack>
  );
}

