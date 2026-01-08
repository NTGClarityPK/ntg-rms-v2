'use client';

import { useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from '@mantine/form';
import {
  Title,
  Button,
  Stack,
  Modal,
  TextInput,
  Select,
  Switch,
  NumberInput,
  Table,
  Group,
  ActionIcon,
  Badge,
  Text,
  Paper,
  Skeleton,
  Alert,
  Grid,
  Center,
  Box,
  Progress,
  Loader,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconAlertCircle,
  IconList,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, AddOnGroup, AddOn } from '@/lib/api/menu';
import { inventoryApi, Ingredient, CreateRecipeDto } from '@/lib/api/inventory';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { handleApiError } from '@/shared/utils/error-handler';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';

export function AddOnGroupsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<AddOnGroup>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [addOnGroups, setAddOnGroups] = useState<AddOnGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<AddOnGroup | null>(null);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAddOns, setLoadingAddOns] = useState(false);
  const [groupModalOpened, setGroupModalOpened] = useState(false);
  const [addOnModalOpened, setAddOnModalOpened] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AddOnGroup | null>(null);
  const [editingAddOn, setEditingAddOn] = useState<AddOn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ ingredientId: string; quantity: number; unit: string }>>([]);
  const [submittingGroup, setSubmittingGroup] = useState(false);
  const [submittingAddOn, setSubmittingAddOn] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [deletingAddOnId, setDeletingAddOnId] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingAddOn, setCreatingAddOn] = useState(false);
  const [openingGroupModalId, setOpeningGroupModalId] = useState<string | null>(null);
  const [openingAddOnModalId, setOpeningAddOnModalId] = useState<string | null>(null);
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [updatingAddOnId, setUpdatingAddOnId] = useState<string | null>(null);

  // Track if any API call is in progress
  const isApiInProgress = loading || submittingGroup || submittingAddOn || deletingGroupId !== null || deletingAddOnId !== null || creatingGroup || creatingAddOn || openingGroupModalId !== null || openingAddOnModalId !== null || updatingGroupId !== null || updatingAddOnId !== null;

  const groupForm = useForm({
    initialValues: {
      name: '',
      selectionType: 'multiple',
      isRequired: false,
      minSelections: 0,
      maxSelections: undefined as number | undefined,
      category: undefined as 'Add' | 'Remove' | 'Change' | undefined,
    },
    validate: {
      name: (value) => (!value ? (t('menu.addOnGroupName', language) || 'Name') + ' is required' : null),
      category: (value) => (!value ? (t('menu.category' as any, language) || 'Category') + ' is required' : null),
    },
  });

  const addOnForm = useForm({
    initialValues: {
      name: '',
      price: 0,
      isActive: true,
      recipeIngredients: [] as Array<{ ingredientId: string; quantity: number; unit: string }>,
    },
    validate: {
      name: (value) => (!value ? (t('menu.addOnName', language) || 'Name') + ' is required' : null),
    },
  });

  const loadAddOnGroups = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const serverGroupsResponse = await menuApi.getAddOnGroups(pagination.paginationParams, selectedBranchId || undefined);
      const serverGroups = pagination.extractData(serverGroupsResponse);
      pagination.extractPagination(serverGroupsResponse);
      setAddOnGroups(serverGroups);

      // If no groups on current page but we have total, reset to page 1
      if (serverGroups.length === 0 && pagination.total > 0 && pagination.page > 1) {
        pagination.setPage(1);
        return; // Will reload with page 1
      }
    } catch (err: any) {
      const errorMsg = handleApiError(err, {
        defaultMessage: 'Failed to load add-on groups',
        language,
        showNotification: false, // Don't show notification for load errors
      });
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language, pagination.page, pagination.limit]);

  const loadAddOns = useCallback(async (groupId: string) => {
    try {
      setLoadingAddOns(true);
      const items = await menuApi.getAddOns(groupId);
      setAddOns(items);
    } catch (err: any) {
      console.error('Failed to load add-ons:', err);
    } finally {
      setLoadingAddOns(false);
    }
  }, []);

  const loadIngredients = useCallback(async () => {
    if (!user?.tenantId) return;
    try {
      const ingredientsResponse = await inventoryApi.getIngredients({ isActive: true });
      
      const ingredientsList = Array.isArray(ingredientsResponse) 
        ? ingredientsResponse 
        : (ingredientsResponse?.data || []);
      
      // Ensure ingredients have name property
      const validIngredients = ingredientsList.filter((ing: any) => ing && ing.id && ing.name);
      
      setIngredients(validIngredients);
      
      if (validIngredients.length === 0) {
        console.warn('No active ingredients found. Please create ingredients in the Inventory section.');
      }
    } catch (err: any) {
      console.error('Failed to load ingredients:', err);
      setIngredients([]);
    }
  }, [user?.tenantId]);

  const loadAddOnRecipe = useCallback(async (addOnId: string) => {
    try {
      const recipesResponse = await inventoryApi.getRecipes(undefined, addOnId);
      const recipesList = Array.isArray(recipesResponse) 
        ? recipesResponse 
        : (recipesResponse?.data || []);
      const recipeIngs = recipesList.map((r: any) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
        unit: r.unit,
      }));
      setRecipeIngredients(recipeIngs);
      addOnForm.setFieldValue('recipeIngredients', recipeIngs);
    } catch (err: any) {
      console.error('Failed to load add-on recipe:', err);
      setRecipeIngredients([]);
      addOnForm.setFieldValue('recipeIngredients', []);
    }
  }, [addOnForm]);

  useEffect(() => {
    loadAddOnGroups();
    
    // Listen for data updates from other tabs
    const unsubscribe = onMenuDataUpdate('add-on-groups-updated', () => {
      loadAddOnGroups();
    });
    
    return unsubscribe;
  }, [loadAddOnGroups]);

  useEffect(() => {
    if (selectedGroup) {
      setAddOns([]); // Clear previous add-ons while loading
      loadAddOns(selectedGroup.id);
    } else {
      setAddOns([]); // Clear when no group is selected
    }
  }, [selectedGroup, loadAddOns]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  // Helper function to get ingredient options for Select dropdowns
  const getIngredientOptions = useCallback(() => {
    // Deduplicate by ID first
    const byId = new Map(ingredients.map(ing => [ing.id, ing]));
    const uniqueIngredients = Array.from(byId.values());
    
    return uniqueIngredients
      .filter((ing) => ing && ing.name)
      .map((ing) => ({
        value: ing.id,
        label: ing.name || '',
      }));
  }, [ingredients]);

  const handleOpenGroupModal = (group?: AddOnGroup) => {
    if (group) {
      setOpeningGroupModalId(group.id);
      setEditingGroup(group);
      groupForm.setValues({
        name: group.name,
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelections: group.minSelections,
        maxSelections: group.selectionType === 'single' ? 1 : group.maxSelections,
        category: group.category || undefined,
      });
    } else {
      setEditingGroup(null);
      groupForm.reset();
    }
    setGroupModalOpened(true);
    setOpeningGroupModalId(null);
  };

  const handleOpenAddOnModal = async (addOn?: AddOn) => {
    if (addOn) {
      setOpeningAddOnModalId(addOn.id);
    }
    
    try {
      // Ensure ingredients are loaded before opening modal
      if (ingredients.length === 0) {
        await loadIngredients();
      }
      
      if (addOn) {
        setEditingAddOn(addOn);
        addOnForm.setValues({
          name: addOn.name,
          price: addOn.price,
          isActive: addOn.isActive,
          recipeIngredients: [],
        });
        // Load existing recipe
        await loadAddOnRecipe(addOn.id);
      } else {
        setEditingAddOn(null);
        addOnForm.reset();
        setRecipeIngredients([]);
      }
      setAddOnModalOpened(true);
    } finally {
      setOpeningAddOnModalId(null);
    }
  };

  const handleGroupSubmit = async (values: typeof groupForm.values) => {
    if (!user?.tenantId || submittingGroup) return;

    const wasEditing = !!editingGroup;
    const currentEditingGroupId = editingGroup?.id;

    flushSync(() => {
      setSubmittingGroup(true);
    });

    try {
      // Close modal immediately after validation passes
      setGroupModalOpened(false);
      
      if (wasEditing && currentEditingGroupId) {
        flushSync(() => {
          setUpdatingGroupId(currentEditingGroupId);
        });
      } else {
        flushSync(() => {
          setCreatingGroup(true);
        });
      }
      
      const groupData: Partial<AddOnGroup> = {
        name: values.name,
        selectionType: values.selectionType as 'single' | 'multiple',
        isRequired: values.isRequired,
        minSelections: values.minSelections,
        maxSelections: values.maxSelections,
        category: (values.category as 'Add' | 'Remove' | 'Change' | undefined) || null,
      };

      let savedGroup: AddOnGroup;

      if (wasEditing && currentEditingGroupId) {
        savedGroup = await menuApi.updateAddOnGroup(currentEditingGroupId, groupData);
        await loadAddOnGroups();
        setUpdatingGroupId(null);
      } else {
        savedGroup = await menuApi.createAddOnGroup(groupData, selectedBranchId || undefined);
        await loadAddOnGroups();
        setCreatingGroup(false);
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('menu.saveSuccess', language),
        color: successColor,
      });

      // Notify other tabs that add-on groups have been updated
      notifyMenuDataUpdate('add-on-groups-updated');
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to save add-on group';
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
      // Reopen modal on error
      if (editingGroup) {
        setGroupModalOpened(true);
        setEditingGroup(editingGroup);
        groupForm.setValues(values);
      } else {
        setGroupModalOpened(true);
        groupForm.setValues(values);
      }
    } finally {
      setSubmittingGroup(false);
      setCreatingGroup(false);
      setUpdatingGroupId(null);
      setEditingGroup(null);
      groupForm.reset();
    }
  };

  const handleAddOnSubmit = async (values: typeof addOnForm.values) => {
    if (!selectedGroup || submittingAddOn) return;

    const wasEditing = !!editingAddOn;
    const currentEditingAddOnId = editingAddOn?.id;
    
    // Close modal immediately
    setAddOnModalOpened(false);
    
    setSubmittingAddOn(true);
    if (wasEditing && currentEditingAddOnId) {
      setUpdatingAddOnId(currentEditingAddOnId);
    } else {
      setCreatingAddOn(true);
    }
    
    try {
      const addOnData = {
        name: values.name,
        price: values.price,
        isActive: values.isActive,
      };

      let savedAddOn: AddOn;

      if (wasEditing && currentEditingAddOnId) {
        savedAddOn = await menuApi.updateAddOn(selectedGroup.id, currentEditingAddOnId, addOnData);
      } else {
        savedAddOn = await menuApi.createAddOn(selectedGroup.id, addOnData);
      }

      // Save or delete recipe
      try {
        if (values.recipeIngredients && values.recipeIngredients.length > 0) {
          // Save recipe with ingredients
          const recipeData: CreateRecipeDto = {
            addOnId: savedAddOn.id,
            ingredients: values.recipeIngredients.map((ing) => ({
              ingredientId: ing.ingredientId,
              quantity: ing.quantity,
              unit: ing.unit,
            })),
          };
          await inventoryApi.createOrUpdateRecipe(recipeData);
        } else {
          // Delete recipe if no ingredients provided (createOrUpdateRecipe with empty array will delete)
          const recipeData: CreateRecipeDto = {
            addOnId: savedAddOn.id,
            ingredients: [],
          };
          await inventoryApi.createOrUpdateRecipe(recipeData);
        }
      } catch (err: any) {
        console.error('Failed to save add-on recipe:', err);
        // Don't fail the whole operation if recipe save fails
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('menu.saveSuccess', language),
        color: successColor,
      });

      loadAddOns(selectedGroup.id);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to save add-on';
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
    } finally {
      setSubmittingAddOn(false);
      setCreatingAddOn(false);
      setUpdatingAddOnId(null);
    }
  };

  const handleDeleteGroup = (group: AddOnGroup) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        setDeletingGroupId(group.id);
        try {
          await menuApi.deleteAddOnGroup(group.id);

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          loadAddOnGroups();
          // Notify other tabs that add-on groups have been updated
          notifyMenuDataUpdate('add-on-groups-updated');
          if (selectedGroup?.id === group.id) {
            setSelectedGroup(null);
          }
        } catch (err: any) {
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || 'Failed to delete add-on group',
            color: errorColor,
          });
        } finally {
          setDeletingGroupId(null);
        }
      },
    });
  };

  const handleDeleteAddOn = (addOn: AddOn) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        if (!selectedGroup) return;
        setDeletingAddOnId(addOn.id);
        try {
          await menuApi.deleteAddOn(selectedGroup.id, addOn.id);

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          loadAddOns(selectedGroup.id);
        } catch (err: any) {
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || 'Failed to delete add-on',
            color: errorColor,
          });
        } finally {
          setDeletingAddOnId(null);
        }
      },
    });
  };


  return (
    <Stack gap="md">
      {/* Top loader for any API in progress */}
      {isApiInProgress && (
        <Progress value={100} animated color={primaryColor} size="xs" radius={0} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }} />
      )}
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => handleOpenGroupModal()}
          style={{ backgroundColor: primaryColor }}
        >
          {t('menu.createAddOnGroup', language)}
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      {loading ? (
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper p="md" withBorder>
              <Stack gap="xs">
                {[1, 2, 3].map((i) => (
                  <Paper key={i} p="sm" withBorder>
                    <Group justify="space-between">
                      <Skeleton height={16} width={120} />
                      <Skeleton height={24} width={60} radius="xl" />
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Skeleton height={20} width={200} />
                <Stack gap="xs">
                  {[1, 2, 3].map((i) => (
                    <Group key={i} justify="space-between">
                      <Skeleton height={16} width={150} />
                      <Skeleton height={16} width={80} />
                      <Skeleton height={32} width={32} radius="md" />
                    </Group>
                  ))}
                </Stack>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      ) : (
        <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" withBorder>
            <Stack gap="xs">
              {creatingGroup && (
                <Paper p="sm" withBorder>
                  <Group justify="space-between">
                    <Group>
                      <Loader size="sm" />
                      <Skeleton height={16} width={120} />
                      <Skeleton height={16} width={60} radius="xl" />
                    </Group>
                  </Group>
                </Paper>
              )}
              {addOnGroups.length === 0 && !creatingGroup ? (
                <Text ta="center" c="dimmed" size="sm">
                  {t('menu.noAddOnGroups', language)}
                </Text>
              ) : (
                addOnGroups.map((group) => (
                  <Paper
                    key={group.id}
                    p="sm"
                    withBorder
                    style={{
                      cursor: 'pointer',
                      backgroundColor:
                        selectedGroup?.id === group.id ? `${primaryColor}10` : undefined,
                      borderColor:
                        selectedGroup?.id === group.id ? primaryColor : undefined,
                    }}
                    onClick={() => setSelectedGroup(group)}
                  >
                    {updatingGroupId === group.id ? (
                      <Group justify="space-between">
                        <Group>
                          <Loader size="sm" />
                          <Skeleton height={16} width={120} />
                          <Skeleton height={16} width={60} radius="xl" />
                        </Group>
                      </Group>
                    ) : (
                      <>
                        <Group justify="space-between">
                          <div>
                            <Text fw={500} size="sm">
                              {group.name}
                            </Text>
                            <Group gap="xs" mt={4}>
                              <Text size="xs" c="dimmed">
                                {group.selectionType === 'single'
                                  ? t('menu.single', language)
                                  : t('menu.multiple', language)}
                              </Text>
                              {group.category && (
                                <>
                                  <Text size="xs" c="dimmed">•</Text>
                                  <Badge variant="light" color="blue" size="xs">
                                    {group.category}
                                  </Badge>
                                </>
                              )}
                            </Group>
                          </div>
                          <Group gap="xs">
                        <ActionIcon
                          size="sm"
                          variant="light"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenGroupModal(group);
                          }}
                          style={{ color: primaryColor }}
                          disabled={openingGroupModalId === group.id}
                        >
                          {openingGroupModalId === group.id ? (
                            <Loader size={14} />
                          ) : (
                            <IconEdit size={14} />
                          )}
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color={errorColor}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(group);
                          }}
                          disabled={deletingGroupId === group.id}
                        >
                          {deletingGroupId === group.id ? (
                            <Loader size={14} />
                          ) : (
                            <IconTrash size={14} />
                          )}
                        </ActionIcon>
                      </Group>
                    </Group>
                      </>
                    )}
                  </Paper>
                ))
              )}
            </Stack>
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
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          {selectedGroup ? (
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={4}>
                  {selectedGroup.name}
                </Title>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => handleOpenAddOnModal()}
                  style={{ backgroundColor: primaryColor }}
                  disabled={loadingAddOns}
                >
                  {t('menu.createAddOn', language)}
                </Button>
              </Group>

              {loadingAddOns ? (
                <Stack gap="md">
                  <Skeleton height={20} width={200} />
                  <Stack gap="xs">
                    {[1, 2, 3].map((i) => (
                      <Group key={i} justify="space-between">
                        <Skeleton height={16} width={150} />
                        <Skeleton height={16} width={80} />
                        <Skeleton height={32} width={32} radius="md" />
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              ) : (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('menu.addOnName', language)}</Table.Th>
                      <Table.Th>{t('menu.price', language)}</Table.Th>
                      <Table.Th>{t('menu.active', language)}</Table.Th>
                      <Table.Th>{t('menu.actions', language)}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {creatingAddOn && (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Group>
                            <Loader size="sm" />
                            <Skeleton height={16} width={150} />
                            <Skeleton height={16} width={80} />
                            <Skeleton height={32} width={32} radius="md" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    )}
                    {addOns.length === 0 && !creatingAddOn ? (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text ta="center" c="dimmed" size="sm">
                            {t('menu.noAddOns', language)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      addOns.map((addOn) => (
                      <Table.Tr key={addOn.id}>
                        {updatingAddOnId === addOn.id ? (
                          <Table.Td colSpan={4}>
                            <Group>
                              <Loader size="sm" />
                              <Skeleton height={16} width={150} />
                              <Skeleton height={16} width={80} />
                              <Skeleton height={32} width={32} radius="md" />
                            </Group>
                          </Table.Td>
                        ) : (
                          <>
                            <Table.Td>
                              {addOn.name}
                            </Table.Td>
                            <Table.Td>{addOn.price.toFixed(2)}</Table.Td>
                            <Table.Td>
                              <Badge variant="light" color={getBadgeColorForText(addOn.isActive ? t('menu.active', language) : t('menu.inactive', language))}>
                                {addOn.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <ActionIcon
                                  size="sm"
                                  variant="light"
                                  onClick={() => handleOpenAddOnModal(addOn)}
                                  style={{ color: primaryColor }}
                                  disabled={openingAddOnModalId === addOn.id}
                                >
                                  {openingAddOnModalId === addOn.id ? (
                                    <Loader size={14} />
                                  ) : (
                                    <IconEdit size={14} />
                                  )}
                                </ActionIcon>
                                <ActionIcon
                                  size="sm"
                                  variant="light"
                                  color={errorColor}
                                  onClick={() => handleDeleteAddOn(addOn)}
                                  disabled={deletingAddOnId === addOn.id}
                                >
                                  {deletingAddOnId === addOn.id ? (
                                    <Loader size={14} />
                                  ) : (
                                    <IconTrash size={14} />
                                  )}
                                </ActionIcon>
                              </Group>
                            </Table.Td>
                          </>
                        )}
                      </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>
          ) : (
            <Paper p="xl" withBorder>
              <Center>
                <Stack align="center" gap="xs">
                  <IconList size={48} color={primaryColor} opacity={0.5} />
                  <Text c="dimmed" size="sm">
                    {t('menu.selectAddOnGroup', language)}
                  </Text>
                </Stack>
              </Center>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
      )}

      {/* Add-on Group Modal */}
      <Modal
        opened={groupModalOpened}
        onClose={() => {
          if (submittingGroup) return;
          setGroupModalOpened(false);
        }}
        title={
          editingGroup ? t('menu.editAddOnGroup', language) : t('menu.createAddOnGroup', language)
        }
        size="lg"
        closeOnClickOutside={!submittingGroup}
        closeOnEscape={!submittingGroup}
      >
        <form onSubmit={groupForm.onSubmit(handleGroupSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('menu.addOnGroupName', language)}
                  required
                  {...groupForm.getInputProps('name')}
                  disabled={submittingGroup}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label={t('menu.category' as any, language) || 'Category'}
                  placeholder="Select category type"
                  data={[
                    { value: 'Add', label: 'Add' },
                    { value: 'Remove', label: 'Remove' },
                    { value: 'Change', label: 'Change' },
                  ]}
                  required
                  {...groupForm.getInputProps('category')}
                  disabled={submittingGroup}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label={t('menu.selectionType', language)}
                  data={[
                    { value: 'single', label: t('menu.single', language) },
                    { value: 'multiple', label: t('menu.multiple', language) },
                  ]}
                  {...groupForm.getInputProps('selectionType')}
                  disabled={submittingGroup}
                  onChange={(value) => {
                    if (submittingGroup) return;
                    groupForm.setFieldValue('selectionType', value || 'multiple');
                    // Auto-set maxSelections to 1 when selection type is single
                    if (value === 'single') {
                      groupForm.setFieldValue('maxSelections', 1);
                      // Also set minSelections to 1 if required
                      if (groupForm.values.isRequired) {
                        groupForm.setFieldValue('minSelections', 1);
                      }
                    }
                  }}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={t('menu.minSelections', language)}
                  min={0}
                  max={groupForm.values.selectionType === 'single' ? 1 : undefined}
                  {...groupForm.getInputProps('minSelections')}
                  disabled={submittingGroup}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={t('menu.maxSelections', language)}
                  min={0}
                  value={groupForm.values.selectionType === 'single' ? 1 : (groupForm.values.maxSelections ?? undefined)}
                  disabled={groupForm.values.selectionType === 'single' || submittingGroup}
                  onChange={(value) => {
                    if (submittingGroup) return;
                    if (groupForm.values.selectionType !== 'single') {
                      groupForm.setFieldValue('maxSelections', typeof value === 'number' ? value : undefined);
                    }
                  }}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Box style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: '28px' }}>
                  <Switch
                    label={t('menu.isRequired', language)}
                    {...groupForm.getInputProps('isRequired', { type: 'checkbox' })}
                    disabled={submittingGroup}
                    onChange={(event) => {
                      if (submittingGroup) return;
                      const isRequired = event.currentTarget.checked;
                      groupForm.setFieldValue('isRequired', isRequired);
                      // If required and single selection, set min to 1
                      if (isRequired && groupForm.values.selectionType === 'single') {
                        groupForm.setFieldValue('minSelections', 1);
                      } else if (!isRequired && groupForm.values.selectionType === 'single') {
                        groupForm.setFieldValue('minSelections', 0);
                      }
                    }}
                  />
                </Box>
              </Grid.Col>
            </Grid>

            <Group justify="flex-end" mt="md">
              <Button 
                variant="subtle" 
                onClick={() => {
                  if (submittingGroup) return;
                  setGroupModalOpened(false);
                }} 
                disabled={submittingGroup}
              >
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }} loading={submittingGroup} disabled={submittingGroup}>
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Add-on Modal */}
      <Modal
        opened={addOnModalOpened}
        onClose={() => setAddOnModalOpened(false)}
        title={editingAddOn ? t('menu.editAddOn', language) : t('menu.createAddOn', language)}
        size="lg"
      >
        <form onSubmit={addOnForm.onSubmit(handleAddOnSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('menu.addOnName', language)}
                  required
                  {...addOnForm.getInputProps('name')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={t('menu.price', language)}
                  min={0}
                  decimalScale={2}
                  {...addOnForm.getInputProps('price')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Switch
                  label={t('menu.active', language)}
                  {...addOnForm.getInputProps('isActive', { type: 'checkbox' })}
                />
              </Grid.Col>
            </Grid>

            {/* Recipe Ingredients Section */}
            <Stack gap="md" mt="md">
              <Group justify="space-between">
                <Text fw={500}>{t('inventory.recipes', language) || 'Recipe Ingredients'}</Text>
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    addOnForm.insertListItem('recipeIngredients', {
                      ingredientId: '',
                      quantity: 0,
                      unit: 'g',
                    });
                  }}
                  style={{ color: primaryColor }}
                >
                  {t('common.add', language) || 'Add Ingredient'}
                </Button>
              </Group>

              {addOnForm.values.recipeIngredients.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  {t('inventory.noRecipe', language) || 'No recipe defined for this add-on'}
                </Text>
              ) : (
                <Stack gap="sm">
                  {addOnForm.values.recipeIngredients.map((ingredient, index) => (
                    <Paper key={index} p="md" withBorder>
                      <Grid>
                        <Grid.Col span={{ base: 12, md: 5 }}>
                          <Select
                            label={t('inventory.ingredient', language) || 'Ingredient'}
                            placeholder={t('inventory.selectIngredient', language) || 'Select ingredient'}
                            data={getIngredientOptions()}
                            disabled={ingredients.length === 0}
                            searchable
                            {...addOnForm.getInputProps(`recipeIngredients.${index}.ingredientId`)}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 3 }}>
                          <NumberInput
                            label={t('inventory.quantity', language) || 'Quantity'}
                            min={0}
                            step={0.01}
                            decimalScale={2}
                            {...addOnForm.getInputProps(`recipeIngredients.${index}.quantity`)}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 3 }}>
                          <Select
                            label={t('inventory.unit', language) || 'Unit'}
                            data={[
                              { value: 'g', label: 'g (grams)' },
                              { value: 'kg', label: 'kg (kilograms)' },
                              { value: 'ml', label: 'ml (milliliters)' },
                              { value: 'l', label: 'l (liters)' },
                              { value: 'pcs', label: 'pcs (pieces)' },
                              { value: 'cup', label: 'cup' },
                              { value: 'tbsp', label: 'tbsp (tablespoon)' },
                              { value: 'tsp', label: 'tsp (teaspoon)' },
                            ]}
                            {...addOnForm.getInputProps(`recipeIngredients.${index}.unit`)}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 1 }}>
                          <Box mt="xl" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <ActionIcon
                              type="button"
                              color={errorColor}
                              variant="light"
                              onClick={() => {
                                addOnForm.removeListItem('recipeIngredients', index);
                              }}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Box>
                        </Grid.Col>
                      </Grid>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={() => setAddOnModalOpened(false)} disabled={submittingAddOn}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }} loading={submittingAddOn} disabled={submittingAddOn}>
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

