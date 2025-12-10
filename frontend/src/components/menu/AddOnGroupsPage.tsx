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
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';

export function AddOnGroupsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const [addOnGroups, setAddOnGroups] = useState<AddOnGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<AddOnGroup | null>(null);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupModalOpened, setGroupModalOpened] = useState(false);
  const [addOnModalOpened, setAddOnModalOpened] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AddOnGroup | null>(null);
  const [editingAddOn, setEditingAddOn] = useState<AddOn | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groupForm = useForm({
    initialValues: {
      nameEn: '',
      nameAr: '',
      selectionType: 'multiple',
      isRequired: false,
      minSelections: 0,
      maxSelections: undefined as number | undefined,
    },
    validate: {
      nameEn: (value) => (!value ? t('menu.addOnGroupNameEn', language) + ' is required' : null),
    },
  });

  const addOnForm = useForm({
    initialValues: {
      nameEn: '',
      nameAr: '',
      price: 0,
      isActive: true,
    },
    validate: {
      nameEn: (value) => (!value ? t('menu.addOnNameEn', language) + ' is required' : null),
    },
  });

  const loadAddOnGroups = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      // Load from IndexedDB first
      const localGroups = await db.addOnGroups
        .where('tenantId')
        .equals(user.tenantId)
        .filter((group) => !group.deletedAt)
        .toArray();

      setAddOnGroups(localGroups.map((group) => ({
        id: group.id,
        nameEn: group.nameEn,
        nameAr: group.nameAr,
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        displayOrder: group.displayOrder,
        isActive: group.isActive,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        addOns: [],
      })));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverGroups = await menuApi.getAddOnGroups();
          setAddOnGroups(serverGroups);

          // Update IndexedDB
          for (const group of serverGroups) {
            await db.addOnGroups.put({
              id: group.id,
              tenantId: user.tenantId,
              nameEn: group.nameEn,
              nameAr: group.nameAr,
              selectionType: group.selectionType,
              isRequired: group.isRequired,
              minSelections: group.minSelections,
              maxSelections: group.maxSelections,
              displayOrder: group.displayOrder,
              isActive: group.isActive,
              createdAt: group.createdAt,
              updatedAt: group.updatedAt,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            });
          }
        } catch (err) {
          console.warn('Failed to sync add-on groups from server:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load add-on groups');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language]);

  const loadAddOns = useCallback(async (groupId: string) => {
    try {
      const items = await menuApi.getAddOns(groupId);
      setAddOns(items);
    } catch (err: any) {
      console.error('Failed to load add-ons:', err);
    }
  }, []);

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
      loadAddOns(selectedGroup.id);
    }
  }, [selectedGroup, loadAddOns]);

  const handleOpenGroupModal = (group?: AddOnGroup) => {
    if (group) {
      setEditingGroup(group);
      groupForm.setValues({
        nameEn: group.nameEn,
        nameAr: group.nameAr || '',
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelections: group.minSelections,
        maxSelections: group.selectionType === 'single' ? 1 : group.maxSelections,
      });
    } else {
      setEditingGroup(null);
      groupForm.reset();
    }
    setGroupModalOpened(true);
  };

  const handleOpenAddOnModal = (addOn?: AddOn) => {
    if (addOn) {
      setEditingAddOn(addOn);
      addOnForm.setValues({
        nameEn: addOn.nameEn,
        nameAr: addOn.nameAr || '',
        price: addOn.price,
        isActive: addOn.isActive,
      });
    } else {
      setEditingAddOn(null);
      addOnForm.reset();
    }
    setAddOnModalOpened(true);
  };

  const handleGroupSubmit = async (values: typeof groupForm.values) => {
    if (!user?.tenantId) return;

    // Close modal immediately
    const wasEditing = !!editingGroup;
    const currentEditingGroupId = editingGroup?.id;
    setGroupModalOpened(false);

    // Run API calls in background
    (async () => {
      try {
        const groupData: Partial<AddOnGroup> = {
          nameEn: values.nameEn,
          nameAr: values.nameAr || undefined,
          selectionType: values.selectionType as 'single' | 'multiple',
          isRequired: values.isRequired,
          minSelections: values.minSelections,
          maxSelections: values.maxSelections,
        };

        let savedGroup: AddOnGroup;

        if (wasEditing && currentEditingGroupId) {
          savedGroup = await menuApi.updateAddOnGroup(currentEditingGroupId, groupData);
          
          await db.addOnGroups.update(currentEditingGroupId, {
            nameEn: groupData.nameEn,
            nameAr: groupData.nameAr,
            selectionType: groupData.selectionType as 'single' | 'multiple',
            isRequired: groupData.isRequired,
            minSelections: groupData.minSelections,
            maxSelections: groupData.maxSelections,
            updatedAt: new Date().toISOString(),
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          await syncService.queueChange('addOnGroups', 'UPDATE', currentEditingGroupId, savedGroup);
        } else {
          savedGroup = await menuApi.createAddOnGroup(groupData);
          
          await db.addOnGroups.add({
            id: savedGroup.id,
            tenantId: user.tenantId,
            nameEn: groupData.nameEn!,
            nameAr: groupData.nameAr,
            selectionType: (groupData.selectionType || 'multiple') as 'single' | 'multiple',
            isRequired: groupData.isRequired ?? false,
            minSelections: groupData.minSelections ?? 0,
            maxSelections: groupData.maxSelections,
            displayOrder: savedGroup.displayOrder,
            isActive: savedGroup.isActive,
            createdAt: savedGroup.createdAt,
            updatedAt: savedGroup.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          await syncService.queueChange('addOnGroups', 'CREATE', savedGroup.id, savedGroup);
        }

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.saveSuccess', language),
          color: successColor,
        });

        loadAddOnGroups();
        // Notify other tabs that add-on groups have been updated
        notifyMenuDataUpdate('add-on-groups-updated');
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to save add-on group';
        notifications.show({
          title: t('common.error' as any, language) || 'Error',
          message: errorMsg,
          color: errorColor,
        });
      }
    })();
  };

  const handleAddOnSubmit = async (values: typeof addOnForm.values) => {
    if (!selectedGroup) return;

    // Close modal immediately
    const currentSelectedGroup = selectedGroup;
    const wasEditing = !!editingAddOn;
    const currentEditingAddOnId = editingAddOn?.id;
    setAddOnModalOpened(false);

    // Run API calls in background
    (async () => {
      try {
        const addOnData = {
          nameEn: values.nameEn,
          nameAr: values.nameAr || undefined,
          price: values.price,
          isActive: values.isActive,
        };

        let savedAddOn: AddOn;

        if (wasEditing && currentEditingAddOnId) {
          savedAddOn = await menuApi.updateAddOn(currentSelectedGroup.id, currentEditingAddOnId, addOnData);
          
          await db.addOns.update(currentEditingAddOnId, {
            ...addOnData,
            updatedAt: new Date().toISOString(),
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          await syncService.queueChange('addOns', 'UPDATE', currentEditingAddOnId, savedAddOn);
        } else {
          savedAddOn = await menuApi.createAddOn(currentSelectedGroup.id, addOnData);
          
          await db.addOns.add({
            id: savedAddOn.id,
            addOnGroupId: currentSelectedGroup.id,
            ...addOnData,
            displayOrder: savedAddOn.displayOrder,
            createdAt: savedAddOn.createdAt,
            updatedAt: savedAddOn.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          await syncService.queueChange('addOns', 'CREATE', savedAddOn.id, savedAddOn);
        }

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.saveSuccess', language),
          color: successColor,
        });

        loadAddOns(currentSelectedGroup.id);
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to save add-on';
        notifications.show({
          title: t('common.error' as any, language) || 'Error',
          message: errorMsg,
          color: errorColor,
        });
      }
    })();
  };

  const handleDeleteGroup = (group: AddOnGroup) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await menuApi.deleteAddOnGroup(group.id);
          
          await db.addOnGroups.update(group.id, {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          await syncService.queueChange('addOnGroups', 'DELETE', group.id, group);

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
        try {
          await menuApi.deleteAddOn(selectedGroup.id, addOn.id);
          
          await db.addOns.update(addOn.id, {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          await syncService.queueChange('addOns', 'DELETE', addOn.id, addOn);

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
        }
      },
    });
  };


  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>{t('menu.addOnGroupManagement', language)}</Title>
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
              {addOnGroups.length === 0 ? (
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
                    <Group justify="space-between">
                      <div>
                        <Text fw={500} size="sm">
                          {language === 'ar' && group.nameAr ? group.nameAr : group.nameEn}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {group.selectionType === 'single'
                            ? t('menu.single', language)
                            : t('menu.multiple', language)}
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
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          {selectedGroup ? (
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={4}>
                  {language === 'ar' && selectedGroup.nameAr
                    ? selectedGroup.nameAr
                    : selectedGroup.nameEn}
                </Title>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => handleOpenAddOnModal()}
                  style={{ backgroundColor: primaryColor }}
                >
                  {t('menu.createAddOn', language)}
                </Button>
              </Group>

              {addOns.length === 0 ? (
                <Text ta="center" c="dimmed" size="sm">
                  {t('menu.noAddOns', language)}
                </Text>
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
                    {addOns.map((addOn) => (
                      <Table.Tr key={addOn.id}>
                        <Table.Td>
                          {language === 'ar' && addOn.nameAr ? addOn.nameAr : addOn.nameEn}
                        </Table.Td>
                        <Table.Td>{addOn.price.toFixed(2)}</Table.Td>
                        <Table.Td>
                          <Badge color={addOn.isActive ? successColor : 'gray'}>
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
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                            <ActionIcon
                              size="sm"
                              variant="light"
                              color={errorColor}
                              onClick={() => handleDeleteAddOn(addOn)}
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
        onClose={() => setGroupModalOpened(false)}
        title={
          editingGroup ? t('menu.editAddOnGroup', language) : t('menu.createAddOnGroup', language)
        }
        size="lg"
      >
        <form onSubmit={groupForm.onSubmit(handleGroupSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('menu.addOnGroupNameEn', language)}
                  required
                  {...groupForm.getInputProps('nameEn')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('menu.addOnGroupNameAr', language)}
                  {...groupForm.getInputProps('nameAr')}
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
                  onChange={(value) => {
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
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={t('menu.maxSelections', language)}
                  min={0}
                  value={groupForm.values.selectionType === 'single' ? 1 : (groupForm.values.maxSelections ?? undefined)}
                  disabled={groupForm.values.selectionType === 'single'}
                  onChange={(value) => {
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
                    onChange={(event) => {
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
              <Button variant="subtle" onClick={() => setGroupModalOpened(false)}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }}>
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
      >
        <form onSubmit={addOnForm.onSubmit(handleAddOnSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('menu.addOnNameEn', language)}
                  required
                  {...addOnForm.getInputProps('nameEn')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('menu.addOnNameAr', language)}
                  {...addOnForm.getInputProps('nameAr')}
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

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={() => setAddOnModalOpened(false)}>
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

