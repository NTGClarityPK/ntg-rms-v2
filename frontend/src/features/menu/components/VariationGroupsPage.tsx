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
  Progress,
  Loader,
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
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';

export function VariationGroupsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
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
  const [submittingGroup, setSubmittingGroup] = useState(false);
  const [submittingVariation, setSubmittingVariation] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [deletingVariationId, setDeletingVariationId] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingVariation, setCreatingVariation] = useState(false);
  const [openingGroupModalId, setOpeningGroupModalId] = useState<string | null>(null);
  const [openingVariationModalId, setOpeningVariationModalId] = useState<string | null>(null);
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [updatingVariationId, setUpdatingVariationId] = useState<string | null>(null);

  // Track if any API call is in progress
  const isApiInProgress = loading || submittingGroup || submittingVariation || deletingGroupId !== null || deletingVariationId !== null || creatingGroup || creatingVariation || openingGroupModalId !== null || openingVariationModalId !== null || updatingGroupId !== null || updatingVariationId !== null;

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

      const serverGroupsResponse = await menuApi.getVariationGroups(pagination.paginationParams, selectedBranchId || undefined);
      const serverGroups = pagination.extractData(serverGroupsResponse);
      pagination.extractPagination(serverGroupsResponse);
      setVariationGroups(serverGroups);

      // If no groups on current page but we have total, reset to page 1
      if (serverGroups.length === 0 && pagination.total > 0 && pagination.page > 1) {
        pagination.setPage(1);
        return; // Will reload with page 1
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
      setOpeningGroupModalId(group.id);
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
    setOpeningGroupModalId(null);
  };

  const handleOpenVariationModal = (variation?: Variation) => {
    if (variation) {
      setOpeningVariationModalId(variation.id);
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
    setOpeningVariationModalId(null);
  };

  const handleGroupSubmit = async (values: typeof groupForm.values) => {
    if (!user?.tenantId || submittingGroup) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmittingGroup(true);
      if (editingGroup) {
        setUpdatingGroupId(editingGroup.id);
      } else {
        setCreatingGroup(true);
      }
    });

    try {
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
          // Reset loading states - modal stays open
          setSubmittingGroup(false);
          setUpdatingGroupId(null);
          setCreatingGroup(false);
          return;
        }
      }

      const wasEditing = !!editingGroup;
      const currentEditingGroupId = editingGroup?.id;
      
      // Close modal after validation passes
      setGroupModalOpened(false);
      setShowFoodItemsTable(false);
      setEditingFoodItems(false);
      setEditingGroup(null);

      const groupData: Partial<VariationGroup> = {
        name: values.name,
      };

      let savedGroup: VariationGroup;

      if (wasEditing && currentEditingGroupId) {
        savedGroup = await menuApi.updateVariationGroup(currentEditingGroupId, groupData);
      } else {
        savedGroup = await menuApi.createVariationGroup(groupData, selectedBranchId || undefined);
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
    } finally {
      setSubmittingGroup(false);
      setCreatingGroup(false);
      setUpdatingGroupId(null);
    }
  };

  const handleVariationSubmit = async (values: typeof variationForm.values) => {
    if (!selectedGroup || submittingVariation) return;

    const wasEditing = !!editingVariation;
    const currentEditingVariationId = editingVariation?.id;
    
    // Close modal immediately
    setVariationModalOpened(false);

    setSubmittingVariation(true);
    if (wasEditing && currentEditingVariationId) {
      setUpdatingVariationId(currentEditingVariationId);
    } else {
      setCreatingVariation(true);
    }

    try {
      const variationData = {
        name: values.name,
        recipeMultiplier: values.recipeMultiplier,
        pricingAdjustment: values.pricingAdjustment,
      };

      let savedVariation: Variation;

      if (wasEditing && currentEditingVariationId) {
        savedVariation = await menuApi.updateVariation(selectedGroup.id, currentEditingVariationId, variationData);
      } else {
        savedVariation = await menuApi.createVariation(selectedGroup.id, variationData);
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('menu.saveSuccess', language),
        color: successColor,
      });

      loadVariations(selectedGroup.id);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to save variation';
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
    } finally {
      setSubmittingVariation(false);
      setCreatingVariation(false);
      setUpdatingVariationId(null);
    }
  };

  const handleDeleteGroup = (group: VariationGroup) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        setDeletingGroupId(group.id);
        try {
          await menuApi.deleteVariationGroup(group.id);
          

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
        } finally {
          setDeletingGroupId(null);
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
        setDeletingVariationId(variation.id);
        try {
          await menuApi.deleteVariation(selectedGroup.id, variation.id);
          

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
        } finally {
          setDeletingVariationId(null);
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
              {variationGroups.length === 0 && !creatingGroup ? (
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
                    {creatingVariation && (
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
                    {variations.length === 0 && !creatingVariation ? (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text ta="center" c="dimmed" size="sm">
                            {t('menu.noVariations', language)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      variations.map((variation) => (
                        <Table.Tr key={variation.id}>
                          {updatingVariationId === variation.id ? (
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
                                    disabled={openingVariationModalId === variation.id}
                                  >
                                    {openingVariationModalId === variation.id ? (
                                      <Loader size={14} />
                                    ) : (
                                      <IconEdit size={14} />
                                    )}
                                  </ActionIcon>
                                  <ActionIcon
                                    size="sm"
                                    variant="light"
                                    color={errorColor}
                                    onClick={() => handleDeleteVariation(variation)}
                                    disabled={deletingVariationId === variation.id}
                                  >
                                    {deletingVariationId === variation.id ? (
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
          setEditingGroup(null);
          groupForm.reset();
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
                    setEditingGroup(null);
                    groupForm.reset();
                  }} disabled={submittingGroup}>
                    {t('common.cancel' as any, language) || 'Cancel'}
                  </Button>
                  <Button type="submit" style={{ backgroundColor: primaryColor }} loading={submittingGroup} disabled={submittingGroup}>
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
              <Button variant="subtle" onClick={() => setVariationModalOpened(false)} disabled={submittingVariation}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }} loading={submittingVariation} disabled={submittingVariation}>
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

