'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
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
  Loader,
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconAlertCircle, IconSearch, IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { inventoryApi, Ingredient, CreateIngredientDto, UpdateIngredientDto } from '@/lib/api/inventory';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
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
  const { selectedBranchId } = useBranchStore();
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
  const [submitting, setSubmitting] = useState(false);
  const [pendingIngredient, setPendingIngredient] = useState<Partial<Ingredient> | null>(null);
  const [updatingIngredientId, setUpdatingIngredientId] = useState<string | null>(null);
  const [deletingIngredientId, setDeletingIngredientId] = useState<string | null>(null);

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

      const filters: any = {};
      if (categoryFilter) filters.category = categoryFilter;
      if (statusFilter !== null) filters.isActive = statusFilter;
      if (debouncedSearchQuery.trim()) filters.search = debouncedSearchQuery.trim();

      const serverIngredientsResponse = await inventoryApi.getIngredients(filters, pagination.paginationParams, selectedBranchId || undefined);
      // Handle both paginated and non-paginated responses
      const serverIngredients = pagination.extractData(serverIngredientsResponse);
      pagination.extractPagination(serverIngredientsResponse);
      
      setIngredients(serverIngredients);
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
    if (!user?.tenantId || submitting) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmitting(true);
    });

    const wasEditing = !!editingIngredient;
    const currentEditingIngredient = editingIngredient;
    const currentEditingIngredientId = editingIngredient?.id;

    // Close modal immediately
    handleCloseModal();

    // If editing, track which ingredient is being updated to show skeleton
    if (wasEditing && currentEditingIngredientId) {
      setUpdatingIngredientId(currentEditingIngredientId);
    }

    // If creating a new ingredient, add a skeleton item to show progress
    if (!wasEditing) {
      setPendingIngredient({
        id: `pending-${Date.now()}`,
        name: values.name,
        category: values.category || undefined,
        unitOfMeasurement: values.unitOfMeasurement,
        currentStock: values.currentStock,
        minimumThreshold: values.minimumThreshold,
        costPerUnit: values.costPerUnit,
        storageLocation: values.storageLocation || undefined,
        isActive: values.isActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    try {
      setError(null);

      let savedIngredient: Ingredient;

      if (wasEditing && currentEditingIngredient) {
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

        savedIngredient = await inventoryApi.updateIngredient(currentEditingIngredient.id, updateData);
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

        savedIngredient = await inventoryApi.createIngredient(createData, selectedBranchId || undefined);
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: wasEditing 
          ? t('inventory.ingredientUpdated', language)
          : t('inventory.ingredientCreated', language),
        color: successColor,
      });

      // Remove pending ingredient skeleton and updating state
      setPendingIngredient(null);
      setUpdatingIngredientId(null);

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
      
      // Remove pending ingredient skeleton and updating state on error
      setPendingIngredient(null);
      setUpdatingIngredientId(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (ingredient: Ingredient) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('inventory.deleteIngredient', language)}: {ingredient.name}?</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        setDeletingIngredientId(ingredient.id);
        try {
          await inventoryApi.deleteIngredient(ingredient.id);

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('inventory.ingredientDeleted', language),
            color: successColor,
          });

          setDeletingIngredientId(null);
          loadIngredients();
          triggerRefresh(); // Trigger refresh for all tabs
        } catch (err: any) {
          setDeletingIngredientId(null);
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
                {/* Show pending ingredient skeleton when creating */}
                {pendingIngredient && !editingIngredient && (
                  <Table.Tr key={pendingIngredient.id} style={{ opacity: 0.7, position: 'relative' }}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Skeleton height={16} width={150} />
                        <Loader size={16} style={{ flexShrink: 0 }} />
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={24} width={80} radius="xl" />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={100} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={100} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={80} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={24} width={60} radius="xl" />
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Skeleton height={32} width={32} radius="md" />
                        <Skeleton height={32} width={32} radius="md" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )}
                {ingredients.map((ingredient) => {
                  const isUpdating = updatingIngredientId === ingredient.id;
                  return (
                    <Table.Tr key={ingredient.id} style={{ opacity: isUpdating ? 0.7 : 1, position: 'relative' }}>
                      {isUpdating ? (
                        <>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <Skeleton height={16} width={150} />
                              <Loader size={16} style={{ flexShrink: 0 }} />
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={24} width={80} radius="xl" />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={16} width={100} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={16} width={100} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={16} width={80} />
                          </Table.Td>
                          <Table.Td>
                            <Skeleton height={24} width={60} radius="xl" />
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <Skeleton height={32} width={32} radius="md" />
                              <Skeleton height={32} width={32} radius="md" />
                            </Group>
                          </Table.Td>
                        </>
                      ) : (
                        <>
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
                              color={ingredient.isActive ? successColor : getBadgeColorForText(t('menu.inactive', language) || 'Inactive')}
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
                                disabled={deletingIngredientId === ingredient.id || updatingIngredientId === ingredient.id}
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                              <ActionIcon
                                variant="light"
                                color={errorColor}
                                onClick={() => handleDelete(ingredient)}
                                disabled={deletingIngredientId === ingredient.id || updatingIngredientId === ingredient.id}
                              >
                                {deletingIngredientId === ingredient.id ? (
                                  <Loader size={16} />
                                ) : (
                                  <IconTrash size={16} />
                                )}
                              </ActionIcon>
                            </Group>
                          </Table.Td>
                        </>
                      )}
                    </Table.Tr>
                  );
                })}
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
        onClose={() => {
          if (!submitting) {
            handleCloseModal();
          }
        }}
        title={editingIngredient ? t('inventory.editIngredient', language) : t('inventory.addIngredient', language)}
        size="lg"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
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
              <Button 
                type="submit" 
                style={{ backgroundColor: primaryColor }}
                loading={submitting}
                disabled={submitting}
              >
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

