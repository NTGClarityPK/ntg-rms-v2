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
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getWarningColor } from '@/lib/utils/theme';
import { useInventoryRefresh } from '@/lib/contexts/inventory-refresh-context';

const CATEGORIES = [
  { value: 'vegetables', label: 'Vegetables' },
  { value: 'meats', label: 'Meats' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'spices', label: 'Spices' },
  { value: 'beverages', label: 'Beverages' },
  { value: 'other', label: 'Other' },
];

const UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'liter', label: 'liter' },
  { value: 'ml', label: 'ml' },
  { value: 'piece', label: 'piece' },
  { value: 'box', label: 'box' },
  { value: 'pack', label: 'pack' },
];

export function IngredientsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { refreshKey, triggerRefresh } = useInventoryRefresh();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<boolean | null>(null);

  const form = useForm({
    initialValues: {
      nameEn: '',
      nameAr: '',
      category: '',
      unitOfMeasurement: '',
      currentStock: 0,
      minimumThreshold: 0,
      costPerUnit: 0,
      storageLocation: '',
      isActive: true,
    },
    validate: {
      nameEn: (value) => (!value ? t('inventory.ingredientNameEn', language) + ' is required' : null),
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

          const serverIngredients = await inventoryApi.getIngredients(filters);
          
          // Deduplicate by ID first, then by nameEn to catch any duplicates with different IDs
          const byId = new Map(serverIngredients.map(ing => [ing.id, ing]));
          const byName = new Map<string, Ingredient>();
          
          // Keep the most recent ingredient if there are duplicates by name
          for (const ing of Array.from(byId.values())) {
            const key = ing.nameEn?.toLowerCase().trim() || '';
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
          // Fallback to IndexedDB if server sync fails
      const localIngredients = await db.ingredients
        .where('tenantId')
        .equals(user.tenantId)
        .filter((ing) => !ing.deletedAt)
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
        }
      } else {
        // Load from IndexedDB when offline
        const localIngredients = await db.ingredients
          .where('tenantId')
          .equals(user.tenantId)
          .filter((ing) => !ing.deletedAt)
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
      }
    } catch (err: any) {
      setError(err.message || t('inventory.loadError', language));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language, categoryFilter, statusFilter]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients, refreshKey]);

  const handleOpenModal = (ingredient?: Ingredient) => {
    if (ingredient) {
      setEditingIngredient(ingredient);
      form.setValues({
        nameEn: ingredient.nameEn,
        nameAr: ingredient.nameAr || '',
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
        nameEn: values.nameEn,
        nameAr: values.nameAr || undefined,
        category: values.category || undefined,
        unitOfMeasurement: values.unitOfMeasurement,
        currentStock: values.currentStock,
        minimumThreshold: values.minimumThreshold,
        costPerUnit: values.costPerUnit,
        storageLocation: values.storageLocation || undefined,
        isActive: values.isActive,
      };

        savedIngredient = await inventoryApi.updateIngredient(editingIngredient.id, updateData);
        
        // Update IndexedDB
        await db.ingredients.update(editingIngredient.id, {
          ...updateData,
          updatedAt: new Date().toISOString(),
          lastSynced: new Date().toISOString(),
          syncStatus: 'synced',
        });

        // Only queue if offline (already synced via API when online)
        if (!navigator.onLine) {
        await syncService.queueChange('ingredients', 'UPDATE', editingIngredient.id, savedIngredient);
        }
      } else {
        // Create
        const createData: CreateIngredientDto = {
          nameEn: values.nameEn,
          nameAr: values.nameAr || undefined,
          category: values.category || undefined,
          unitOfMeasurement: values.unitOfMeasurement,
          currentStock: values.currentStock,
          minimumThreshold: values.minimumThreshold,
          costPerUnit: values.costPerUnit,
          storageLocation: values.storageLocation || undefined,
          isActive: values.isActive,
        };

        savedIngredient = await inventoryApi.createIngredient(createData);
        
        // Save to IndexedDB using put (handles both add and update)
        await db.ingredients.put({
          id: savedIngredient.id,
          tenantId: user.tenantId,
          nameEn: savedIngredient.nameEn,
          nameAr: savedIngredient.nameAr,
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
        });

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
      children: <Text size="sm">{t('inventory.deleteIngredient', language)}: {language === 'ar' && ingredient.nameAr ? ingredient.nameAr : ingredient.nameEn}?</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await inventoryApi.deleteIngredient(ingredient.id);
          
          // Update IndexedDB (soft delete)
          await db.ingredients.update(ingredient.id, {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

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
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || t('inventory.deleteError', language),
            color: errorColor,
          });
        }
      },
    });
  };

  // Filter ingredients
  const filteredIngredients = ingredients.filter((ing) => {
    if (!ing.nameEn) return false;
    const matchesSearch = 
      ing.nameEn?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ing.nameAr && ing.nameAr.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  const isLowStock = (ingredient: Ingredient) => {
    return ingredient.currentStock <= ingredient.minimumThreshold;
  };

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>{t('inventory.ingredients', language)}</Title>
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
                { value: '', label: t('inventory.allCategories', language) },
                ...CATEGORIES.map(cat => ({
                  value: cat.value,
                  label: t(`inventory.${cat.value}` as any, language) || cat.label
                }))
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
      ) : filteredIngredients.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text ta="center" c="dimmed">
            {t('inventory.noIngredients', language)}
          </Text>
        </Paper>
      ) : (
        <Table.ScrollContainer minWidth={800}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('inventory.ingredientNameEn', language)}</Table.Th>
                <Table.Th>{t('inventory.category', language)}</Table.Th>
                <Table.Th>{t('inventory.currentStock', language)}</Table.Th>
                <Table.Th>{t('inventory.minimumThreshold', language)}</Table.Th>
                <Table.Th>{t('inventory.costPerUnit', language)}</Table.Th>
                <Table.Th>{t('common.status' as any, language) || 'Status'}</Table.Th>
                <Table.Th>{t('common.actions' as any, language) || 'Actions'}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredIngredients.map((ingredient) => (
                <Table.Tr key={ingredient.id}>
                  <Table.Td>
                    <Text fw={500}>
                      {language === 'ar' && ingredient.nameAr ? ingredient.nameAr : ingredient.nameEn}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {ingredient.category ? (
                      <Badge variant="light" color={primaryColor}>
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
                        <Badge color={getWarningColor()} size="sm">
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
              label={t('inventory.ingredientNameEn', language)}
              placeholder={t('inventory.ingredientNameEn', language)}
              required
              {...form.getInputProps('nameEn')}
            />
            <TextInput
              label={t('inventory.ingredientNameAr', language)}
              placeholder={t('inventory.ingredientNameAr', language)}
              {...form.getInputProps('nameAr')}
            />
            <Select
              label={t('inventory.category', language)}
              placeholder={t('inventory.category', language)}
              data={CATEGORIES.map(cat => ({
                value: cat.value,
                label: t(`inventory.${cat.value}` as any, language) || cat.label
              }))}
              {...form.getInputProps('category')}
            />
            <Select
              label={t('inventory.unitOfMeasurement', language)}
              placeholder={t('inventory.unitOfMeasurement', language)}
              required
              data={UNITS.map(unit => ({
                value: unit.value,
                label: t(`inventory.${unit.value}` as any, language) || unit.label
              }))}
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
    </Container>
  );
}

