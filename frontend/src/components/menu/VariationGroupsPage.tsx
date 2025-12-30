'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from '@mantine/form';
import {
  Title,
  Button,
  Stack,
  Modal,
  TextInput,
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
  Tabs,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconAlertCircle,
  IconList,
  IconTable,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, VariationGroup, Variation, FoodItemVariation } from '@/lib/api/menu';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';

export function VariationGroupsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<VariationGroup>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [variationGroups, setVariationGroups] = useState<VariationGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<VariationGroup | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVariations, setLoadingVariations] = useState(false);
  const [groupModalOpened, setGroupModalOpened] = useState(false);
  const [variationModalOpened, setVariationModalOpened] = useState(false);
  const [editingGroup, setEditingGroup] = useState<VariationGroup | null>(null);
  const [editingVariation, setEditingVariation] = useState<Variation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foodItemsWithGroup, setFoodItemsWithGroup] = useState<any[]>([]);
  const [showFoodItemsTable, setShowFoodItemsTable] = useState(false);
  const [editingFoodItems, setEditingFoodItems] = useState(false);

  const groupForm = useForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (!value ? (t('menu.variationGroupName', language) || 'Name') + ' is required' : null),
    },
  });

  const variationForm = useForm({
    initialValues: {
      name: '',
      recipeMultiplier: 1,
      pricingAdjustment: 0,
    },
    validate: {
      name: (value) => (!value ? (t('menu.variationName', language) || 'Name') + ' is required' : null),
      recipeMultiplier: (value) => (value <= 0 ? (t('menu.recipeMultiplier', language) || 'Recipe Multiplier') + ' must be greater than 0' : null),
    },
  });

  const loadVariationGroups = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      // Load from IndexedDB first (for offline mode)
      const localGroups = await db.variationGroups
        .where('tenantId')
        .equals(user.tenantId)
        .filter((group) => !group.deletedAt)
        .toArray();

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverGroupsResponse = await menuApi.getVariationGroups(pagination.paginationParams);
          const serverGroups = pagination.extractData(serverGroupsResponse);
          pagination.extractPagination(serverGroupsResponse);
          setVariationGroups(serverGroups);

          // If no groups on current page but we have total, reset to page 1
          if (serverGroups.length === 0 && pagination.total > 0 && pagination.page > 1) {
            pagination.setPage(1);
            return; // Will reload with page 1
          }

          // Update IndexedDB
          for (const group of serverGroups) {
            await db.variationGroups.put({
              id: group.id,
              tenantId: user.tenantId,
              name: group.name,
              createdAt: group.createdAt,
              updatedAt: group.updatedAt,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            } as any);
          }
        } catch (err) {
          console.warn('Failed to sync variation groups from server:', err);
          // Fallback: use IndexedDB data with local pagination
          const startIndex = (pagination.page - 1) * pagination.limit;
          const endIndex = startIndex + pagination.limit;
          const paginatedGroups = localGroups.slice(startIndex, endIndex).map((group) => ({
            id: group.id,
            name: (group as any).name || '',
            createdAt: group.createdAt,
            updatedAt: group.updatedAt,
            variations: [],
          }));
          setVariationGroups(paginatedGroups);
          pagination.setTotal(localGroups.length);
          pagination.setTotalPages(Math.ceil(localGroups.length / pagination.limit));
          pagination.setHasNext(endIndex < localGroups.length);
          pagination.setHasPrev(pagination.page > 1);
        }
      } else {
        // Offline mode - apply local pagination
        const startIndex = (pagination.page - 1) * pagination.limit;
        const endIndex = startIndex + pagination.limit;
        const paginatedGroups = localGroups.slice(startIndex, endIndex).map((group) => ({
          id: group.id,
          name: (group as any).name || '',
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
          variations: [],
        }));
        setVariationGroups(paginatedGroups);
        pagination.setTotal(localGroups.length);
        pagination.setTotalPages(Math.ceil(localGroups.length / pagination.limit));
        pagination.setHasNext(endIndex < localGroups.length);
        pagination.setHasPrev(pagination.page > 1);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load variation groups');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language, pagination.page, pagination.limit]);

  const loadVariations = useCallback(async (groupId: string) => {
    try {
      setLoadingVariations(true);
      const items = await menuApi.getVariations(groupId);
      setVariations(items);
    } catch (err: any) {
      console.error('Failed to load variations:', err);
    } finally {
      setLoadingVariations(false);
    }
  }, []);

  const loadFoodItemsWithGroup = useCallback(async (groupId: string) => {
    try {
      const items = await menuApi.getFoodItemsWithVariationGroup(groupId);
      setFoodItemsWithGroup(items);
    } catch (err: any) {
      console.error('Failed to load food items:', err);
      setFoodItemsWithGroup([]);
    }
  }, []);

  useEffect(() => {
    loadVariationGroups();
    
    // Listen for data updates from other tabs
    const unsubscribe = onMenuDataUpdate('variation-groups-updated', () => {
      loadVariationGroups();
    });
    
    return unsubscribe;
  }, [loadVariationGroups]);

  useEffect(() => {
    if (selectedGroup) {
      setVariations([]); // Clear previous variations while loading
      loadVariations(selectedGroup.id);
      loadFoodItemsWithGroup(selectedGroup.id);
    } else {
      setVariations([]); // Clear when no group is selected
    }
  }, [selectedGroup, loadVariations, loadFoodItemsWithGroup]);

  const checkFoodItemsHaveBlankValues = useCallback(async (groupId: string, groupName: string): Promise<boolean> => {
    try {
      const items = await menuApi.getFoodItemsWithVariationGroup(groupId);
      // Check if any food item has variations with this group that have blank values
      for (const item of items) {
        if (item.variations) {
          for (const variation of item.variations) {
            if (variation.variationGroup === groupName) {
              if (!variation.variationName || variation.variationName.trim() === '') {
                return true; // Found a blank value
              }
            }
          }
        }
      }
      return false;
    } catch (err) {
      console.error('Failed to check food items:', err);
      return false;
    }
  }, []);

  const handleOpenGroupModal = async (group?: VariationGroup) => {
    if (group) {
      setEditingGroup(group);
      groupForm.setValues({
        name: group.name,
      });
      
      // Check if food items have blank values
      const hasBlankValues = await checkFoodItemsHaveBlankValues(group.id, group.name);
      if (hasBlankValues) {
        setShowFoodItemsTable(true);
        await loadFoodItemsWithGroup(group.id);
      }
    } else {
      setEditingGroup(null);
      groupForm.reset();
      setShowFoodItemsTable(false);
    }
    setGroupModalOpened(true);
  };

  const handleOpenVariationModal = (variation?: Variation) => {
    if (variation) {
      setEditingVariation(variation);
      variationForm.setValues({
        name: variation.name,
        recipeMultiplier: variation.recipeMultiplier || 1,
        pricingAdjustment: variation.pricingAdjustment || 0,
      });
    } else {
      setEditingVariation(null);
      variationForm.reset();
    }
    setVariationModalOpened(true);
  };

  const handleGroupSubmit = async (values: typeof groupForm.values) => {
    if (!user?.tenantId) return;

    // If editing, check for blank values
    if (editingGroup) {
      const hasBlankValues = await checkFoodItemsHaveBlankValues(editingGroup.id, values.name);
      if (hasBlankValues && !editingFoodItems) {
        notifications.show({
          title: t('common.error' as any, language) || 'Error',
          message: t('menu.variationGroupHasBlankValues', language) || 'Cannot save: Some food items have blank variation values. Please edit them first.',
          color: errorColor,
        });
        setShowFoodItemsTable(true);
        await loadFoodItemsWithGroup(editingGroup.id);
        return;
      }
    }

    // Close modal immediately
    const wasEditing = !!editingGroup;
    const currentEditingGroupId = editingGroup?.id;
    setGroupModalOpened(false);
    setShowFoodItemsTable(false);
    setEditingFoodItems(false);

    // Run API calls in background
    (async () => {
      try {
        const groupData: Partial<VariationGroup> = {
          name: values.name,
        };

        let savedGroup: VariationGroup;

        if (wasEditing && currentEditingGroupId) {
          savedGroup = await menuApi.updateVariationGroup(currentEditingGroupId, groupData);
          
          await db.variationGroups.update(currentEditingGroupId, {
            name: groupData.name,
            updatedAt: new Date().toISOString(),
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          await syncService.queueChange('variationGroups', 'UPDATE', currentEditingGroupId, savedGroup);
        } else {
          savedGroup = await menuApi.createVariationGroup(groupData);
          
          await db.variationGroups.add({
            id: savedGroup.id,
            tenantId: user.tenantId,
            name: groupData.name!,
            createdAt: savedGroup.createdAt,
            updatedAt: savedGroup.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          } as any);

          await syncService.queueChange('variationGroups', 'CREATE', savedGroup.id, savedGroup);
        }

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.saveSuccess', language),
          color: successColor,
        });

        loadVariationGroups();
        // Notify other tabs that variation groups have been updated
        notifyMenuDataUpdate('variation-groups-updated');
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to save variation group';
        notifications.show({
          title: t('common.error' as any, language) || 'Error',
          message: errorMsg,
          color: errorColor,
        });
      }
    })();
  };

  const handleVariationSubmit = async (values: typeof variationForm.values) => {
    if (!selectedGroup) return;

    // Close modal immediately
    const currentSelectedGroup = selectedGroup;
    const wasEditing = !!editingVariation;
    const currentEditingVariationId = editingVariation?.id;
    setVariationModalOpened(false);

    // Run API calls in background
    (async () => {
      try {
        const variationData = {
          name: values.name,
          recipeMultiplier: values.recipeMultiplier,
          pricingAdjustment: values.pricingAdjustment,
        };

        let savedVariation: Variation;

        if (wasEditing && currentEditingVariationId) {
          savedVariation = await menuApi.updateVariation(currentSelectedGroup.id, currentEditingVariationId, variationData);
          
          await db.variations.update(currentEditingVariationId, {
            ...variationData,
            updatedAt: new Date().toISOString(),
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          await syncService.queueChange('variations', 'UPDATE', currentEditingVariationId, savedVariation);
        } else {
          savedVariation = await menuApi.createVariation(currentSelectedGroup.id, variationData);
          
          await db.variations.add({
            id: savedVariation.id,
            variationGroupId: currentSelectedGroup.id,
            ...variationData,
            displayOrder: savedVariation.displayOrder,
            createdAt: savedVariation.createdAt,
            updatedAt: savedVariation.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          } as any);

          await syncService.queueChange('variations', 'CREATE', savedVariation.id, savedVariation);
        }

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.saveSuccess', language),
          color: successColor,
        });

        loadVariations(currentSelectedGroup.id);
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to save variation';
        notifications.show({
          title: t('common.error' as any, language) || 'Error',
          message: errorMsg,
          color: errorColor,
        });
      }
    })();
  };

  const handleDeleteGroup = (group: VariationGroup) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await menuApi.deleteVariationGroup(group.id);
          
          await db.variationGroups.update(group.id, {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          await syncService.queueChange('variationGroups', 'DELETE', group.id, group);

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          loadVariationGroups();
          // Notify other tabs that variation groups have been updated
          notifyMenuDataUpdate('variation-groups-updated');
          if (selectedGroup?.id === group.id) {
            setSelectedGroup(null);
          }
        } catch (err: any) {
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || 'Failed to delete variation group',
            color: errorColor,
          });
        }
      },
    });
  };

  const handleDeleteVariation = (variation: Variation) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        if (!selectedGroup) return;
        try {
          await menuApi.deleteVariation(selectedGroup.id, variation.id);
          
          await db.variations.update(variation.id, {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          await syncService.queueChange('variations', 'DELETE', variation.id, variation);

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          loadVariations(selectedGroup.id);
        } catch (err: any) {
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || 'Failed to delete variation',
            color: errorColor,
          });
        }
      },
    });
  };

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => handleOpenGroupModal()}
          style={{ backgroundColor: primaryColor }}
        >
          {t('menu.createVariationGroup', language)}
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
              {variationGroups.length === 0 ? (
                <Text ta="center" c="dimmed" size="sm">
                  {t('menu.noVariationGroups', language)}
                </Text>
              ) : (
                variationGroups.map((group) => (
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
                    <Group justify="space-between">
                      <div>
                        <Text fw={500} size="sm">
                          {group.name}
                        </Text>
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
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color={errorColor}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(group);
                          }}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
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
                  onClick={() => handleOpenVariationModal()}
                  style={{ backgroundColor: primaryColor }}
                  disabled={loadingVariations}
                >
                  {t('menu.createVariation', language)}
                </Button>
              </Group>

              {loadingVariations ? (
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
              ) : variations.length === 0 ? (
                <Text ta="center" c="dimmed" size="sm">
                  {t('menu.noVariations', language)}
                </Text>
              ) : (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('menu.variationName', language)}</Table.Th>
                      <Table.Th>{t('menu.recipeMultiplier', language)}</Table.Th>
                      <Table.Th>{t('menu.pricingAdjustment', language)}</Table.Th>
                      <Table.Th>{t('menu.actions', language)}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {variations.map((variation) => (
                      <Table.Tr key={variation.id}>
                        <Table.Td>
                          {variation.name}
                        </Table.Td>
                        <Table.Td>{variation.recipeMultiplier || 1}</Table.Td>
                        <Table.Td>{variation.pricingAdjustment || 0}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <ActionIcon
                              size="sm"
                              variant="light"
                              onClick={() => handleOpenVariationModal(variation)}
                              style={{ color: primaryColor }}
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                            <ActionIcon
                              size="sm"
                              variant="light"
                              color={errorColor}
                              onClick={() => handleDeleteVariation(variation)}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
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
                    {t('menu.selectVariationGroup', language)}
                  </Text>
                </Stack>
              </Center>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
      )}

      {/* Variation Group Modal */}
      <Modal
        opened={groupModalOpened}
        onClose={() => {
          setGroupModalOpened(false);
          setShowFoodItemsTable(false);
          setEditingFoodItems(false);
        }}
        title={
          editingGroup ? t('menu.editVariationGroup', language) : t('menu.createVariationGroup', language)
        }
        size="lg"
      >
        <Tabs value={showFoodItemsTable ? 'food-items' : 'group'}>
          <Tabs.List>
            <Tabs.Tab value="group">{t('menu.groupDetails', language) || 'Group Details'}</Tabs.Tab>
            {editingGroup && foodItemsWithGroup.length > 0 && (
              <Tabs.Tab value="food-items" leftSection={<IconTable size={14} />}>
                {t('menu.editFoodItems', language) || 'Edit Food Items'} ({foodItemsWithGroup.length})
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="group" pt="md">
            <form onSubmit={groupForm.onSubmit(handleGroupSubmit)}>
              <Stack gap="md">
                {editingGroup && foodItemsWithGroup.length > 0 && (
                  <Alert icon={<IconAlertCircle size={16} />} color="yellow">
                    <Text size="sm">
                      {t('menu.variationGroupHasFoodItems', language) || 
                        `This variation group is used by ${foodItemsWithGroup.length} food item(s). All variations must have values.`}
                    </Text>
                  </Alert>
                )}
                <TextInput
                  label={t('menu.variationGroupName', language)}
                  required
                  {...groupForm.getInputProps('name')}
                />

                <Group justify="flex-end" mt="md">
                  <Button variant="subtle" onClick={() => {
                    setGroupModalOpened(false);
                    setShowFoodItemsTable(false);
                    setEditingFoodItems(false);
                  }}>
                    {t('common.cancel' as any, language) || 'Cancel'}
                  </Button>
                  <Button type="submit" style={{ backgroundColor: primaryColor }}>
                    {t('common.save' as any, language) || 'Save'}
                  </Button>
                </Group>
              </Stack>
            </form>
          </Tabs.Panel>

          {editingGroup && (
            <Tabs.Panel value="food-items" pt="md">
              <Stack gap="md">
                <Alert icon={<IconAlertCircle size={16} />} color="blue">
                  <Text size="sm">
                    {t('menu.editFoodItemsVariations', language) || 
                      'Please ensure all variations for this group have values. You can edit food items individually or use this table to update them.'}
                  </Text>
                </Alert>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('menu.foodItemName', language)}</Table.Th>
                      <Table.Th>{t('menu.variationName', language)}</Table.Th>
                      <Table.Th>{t('menu.actions', language)}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {foodItemsWithGroup.map((item) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>{item.name}</Table.Td>
                        <Table.Td>
                          {item.variations?.find((v: FoodItemVariation) => v.variationGroup === editingGroup.name)?.variationName || '-'}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => {
                              // Open food item edit modal - this would need to be implemented
                              notifications.show({
                                title: t('common.info' as any, language) || 'Info',
                                message: t('menu.editFoodItemToUpdateVariation', language) || 'Please edit the food item to update its variation.',
                                color: 'blue',
                              });
                            }}
                            style={{ color: primaryColor }}
                          >
                            {t('common.edit' as any, language) || 'Edit'}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Tabs.Panel>
          )}
        </Tabs>
      </Modal>

      {/* Variation Modal */}
      <Modal
        opened={variationModalOpened}
        onClose={() => setVariationModalOpened(false)}
        title={editingVariation ? t('menu.editVariation', language) : t('menu.createVariation', language)}
      >
        <form onSubmit={variationForm.onSubmit(handleVariationSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('menu.variationName', language)}
                  required
                  {...variationForm.getInputProps('name')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={t('menu.recipeMultiplier', language)}
                  min={0.01}
                  step={0.01}
                  decimalScale={2}
                  required
                  {...variationForm.getInputProps('recipeMultiplier')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={t('menu.pricingAdjustment', language)}
                  decimalScale={2}
                  description={t('menu.pricingAdjustmentDescription', language) || 'Price adjustment for this variation'}
                  {...variationForm.getInputProps('pricingAdjustment')}
                />
              </Grid.Col>
            </Grid>

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={() => setVariationModalOpened(false)}>
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

