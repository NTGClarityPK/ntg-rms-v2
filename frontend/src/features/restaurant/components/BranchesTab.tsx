'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from '@mantine/form';
import {
  Button,
  Stack,
  Modal,
  TextInput,
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
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { restaurantApi, Branch, CreateBranchDto, UpdateBranchDto } from '@/lib/api/restaurant';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors } from '@/lib/hooks/use-theme-colors';
import { useErrorColor, useSuccessColor, useInfoColor } from '@/lib/hooks/use-theme-colors';
import { PermissionGuard } from '@/components/common/PermissionGuard';
import { generateUUID } from '@/lib/utils/uuid';

export function BranchesTab() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const infoColor = useInfoColor();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateBranchDto & { isActive?: boolean }>({
    initialValues: {
      name: '',
      code: '',
      address: '',
      city: '',
      state: '',
      country: 'Iraq',
      phone: '',
      email: '',
      latitude: undefined,
      longitude: undefined,
      managerId: undefined,
      isActive: true,
    },
    validate: {
      name: (value) => (!value ? t('common.required', language) || 'Name is required' : null),
      code: (value) => (!value ? t('common.required', language) || 'Code is required' : null),
      email: (value) => (value && value.trim() && !/^\S+@\S+$/.test(value) ? t('common.invalidEmail', language) || 'Invalid email' : null),
    },
  });

  const loadBranches = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      // Load from IndexedDB first
      const localBranches = await db.branches.where('tenantId').equals(user.tenantId).toArray();
      setBranches(localBranches.map(b => ({
        id: b.id,
        tenantId: b.tenantId,
        name: (b as any).name || (b as any).nameEn || (b as any).nameAr || '',
        code: b.code,
        address: (b as any).address || (b as any).addressEn || (b as any).addressAr || '',
        city: b.city,
        state: b.state,
        country: b.country,
        phone: b.phone,
        email: b.email,
        latitude: undefined,
        longitude: undefined,
        managerId: undefined,
        isActive: b.isActive,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverBranches = await restaurantApi.getBranches();
          setBranches(serverBranches);

          // Update IndexedDB
          for (const branch of serverBranches) {
            await db.branches.put({
              id: branch.id,
              tenantId: branch.tenantId,
              name: branch.name,
              code: branch.code,
              address: branch.address || '',
              city: branch.city,
              state: branch.state,
              country: branch.country,
              phone: branch.phone,
              email: branch.email,
              isActive: branch.isActive,
              createdAt: branch.createdAt,
              updatedAt: branch.updatedAt,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            } as any);
          }
        } catch (err: any) {
          console.warn('Failed to load from server:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || t('restaurant.branchManagement', language) || 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId, language]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const handleOpenModal = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      form.setValues({
        name: branch.name || '',
        code: branch.code,
        address: branch.address || '',
        city: branch.city || '',
        state: branch.state || '',
        country: branch.country || 'Iraq',
        phone: branch.phone || '',
        email: branch.email || '',
        latitude: branch.latitude,
        longitude: branch.longitude,
        managerId: branch.managerId,
        isActive: branch.isActive ?? true,
      });
    } else {
      setEditingBranch(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    setOpened(false);
    setEditingBranch(null);
    form.reset();
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    try {
      setError(null);

      if (editingBranch) {
        // Update branch
        const updateData: UpdateBranchDto = { ...values };

        // Save to IndexedDB first
        await db.branches.update(editingBranch.id, {
          name: updateData.name || editingBranch.name,
          code: updateData.code || editingBranch.code,
          address: updateData.address || '',
          city: updateData.city,
          state: updateData.state,
          country: updateData.country,
          phone: updateData.phone,
          email: updateData.email,
          isActive: updateData.isActive ?? editingBranch.isActive,
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        } as any);

        // Queue sync
        await syncService.queueChange('branches', 'UPDATE', editingBranch.id, updateData);

        // Try to sync immediately if online
        if (navigator.onLine) {
          try {
            await restaurantApi.updateBranch(editingBranch.id, updateData);
            await db.branches.update(editingBranch.id, {
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            });
            notifications.show({
              title: t('common.success', language) || 'Success',
              message: t('restaurant.branchUpdated', language),
              color: notificationColors.success,
              icon: <IconCheck size={16} />,
            });
          } catch (err: any) {
            notifications.show({
              title: t('common.success', language) || 'Saved Locally',
              message: t('restaurant.branchSavedLocally', language),
              color: notificationColors.info,
            });
          }
        } else {
          notifications.show({
            title: t('common.success', language) || 'Saved Locally',
            message: t('restaurant.branchSavedLocally', language),
            color: notificationColors.info,
          });
        }
      } else {
        // Create branch
        const newId = generateUUID();
        const branchData: Branch = {
          id: newId,
          tenantId: user.tenantId,
          name: values.name,
          code: values.code,
          address: values.address,
          city: values.city,
          state: values.state,
          country: values.country || 'Iraq',
          phone: values.phone,
          email: values.email,
          latitude: values.latitude,
          longitude: values.longitude,
          managerId: values.managerId,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Save to IndexedDB first
        await db.branches.add({
          ...branchData,
          lastSynced: undefined,
          syncStatus: 'pending',
        } as any);

        // Queue sync - exclude isActive from create payload and clean empty strings
        const { isActive, ...createData } = values;
        const cleanedData: CreateBranchDto = {
          ...createData,
          email: createData.email?.trim() || undefined,
          phone: createData.phone?.trim() || undefined,
          address: createData.address?.trim() || undefined,
          city: createData.city?.trim() || undefined,
          state: createData.state?.trim() || undefined,
        };
        await syncService.queueChange('branches', 'CREATE', newId, cleanedData);

        // Try to sync immediately if online
        if (navigator.onLine) {
          try {
            // Remove isActive from create payload as it's not in CreateBranchDto
            // Also convert empty strings to undefined for optional fields
            const { isActive, ...createData } = values;
            const cleanedData: CreateBranchDto = {
              ...createData,
              email: createData.email?.trim() || undefined,
              phone: createData.phone?.trim() || undefined,
              address: createData.address?.trim() || undefined,
              city: createData.city?.trim() || undefined,
              state: createData.state?.trim() || undefined,
            };
            const created = await restaurantApi.createBranch(cleanedData);
            await db.branches.update(newId, {
              id: created.id,
              tenantId: created.tenantId,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            });
            notifications.show({
              title: t('common.success', language) || 'Success',
              message: t('restaurant.branchCreated', language),
              color: notificationColors.success,
              icon: <IconCheck size={16} />,
            });
          } catch (err: any) {
            notifications.show({
              title: t('common.success', language) || 'Saved Locally',
              message: t('restaurant.branchSavedLocally', language),
              color: notificationColors.info,
            });
          }
        } else {
          notifications.show({
            title: t('common.success', language) || 'Saved Locally',
            message: t('restaurant.branchSavedLocally', language),
            color: notificationColors.info,
          });
        }
      }

      handleCloseModal();
      await loadBranches();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || err.message || t('restaurant.branchManagement', language) || 'Failed to save branch';
      setError(errorMsg);
      notifications.show({
        title: t('common.error', language) || 'Error',
        message: errorMsg,
        color: notificationColors.error,
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  const handleDelete = (branch: Branch) => {
    modals.openConfirmModal({
      title: t('restaurant.deleteBranchConfirm', language),
      children: (
        <Text size="sm">
          {t('restaurant.deleteBranchMessage', language)?.replace('{name}', branch.name) || `Are you sure you want to delete "${branch.name}"? This action cannot be undone.`}
        </Text>
      ),
      labels: { 
        confirm: t('common.delete', language) || 'Delete', 
        cancel: t('common.cancel', language) || 'Cancel' 
      },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          // Mark as deleted in IndexedDB
          await db.branches.update(branch.id, {
            deletedAt: new Date().toISOString(),
            syncStatus: 'pending',
          });

          // Queue sync
          await syncService.queueChange('branches', 'DELETE', branch.id, {});

          // Try to sync immediately if online
          if (navigator.onLine) {
            try {
              await restaurantApi.deleteBranch(branch.id);
              await db.branches.delete(branch.id);
              notifications.show({
                title: t('common.success', language) || 'Success',
                message: t('restaurant.branchDeleted', language),
                color: notificationColors.success,
                icon: <IconCheck size={16} />,
              });
            } catch (err: any) {
              notifications.show({
                title: t('common.success', language) || 'Queued for Deletion',
                message: t('restaurant.branchQueuedForDeletion', language),
                color: notificationColors.info,
              });
            }
          } else {
            notifications.show({
              title: t('common.success', language) || 'Queued for Deletion',
              message: t('restaurant.branchQueuedForDeletion', language),
              color: notificationColors.info,
            });
          }

          await loadBranches();
        } catch (err: any) {
          notifications.show({
            title: t('common.error', language) || 'Error',
            message: err.message || t('restaurant.deleteBranch', language) || 'Failed to delete branch',
            color: notificationColors.error,
            icon: <IconAlertCircle size={16} />,
          });
        }
      },
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t('restaurant.branchManagement', language)}
        </Text>
        <PermissionGuard resource="restaurant" action="create">
          <Button leftSection={<IconPlus size={16} />} onClick={() => handleOpenModal()} size="sm">
            {t('restaurant.addBranch', language)}
          </Button>
        </PermissionGuard>
      </Group>

      {error && (
        <Alert 
          icon={<IconAlertCircle size={16} />} 
          color={errorColor}
          mb="md"
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Paper withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('restaurant.branchName', language)}</Table.Th>
                <Table.Th>{t('restaurant.branchCode', language)}</Table.Th>
                <Table.Th>{t('restaurant.branchCity', language)}</Table.Th>
                <Table.Th>{t('restaurant.branchPhone', language)}</Table.Th>
                <Table.Th>{t('common.status', language)}</Table.Th>
                <Table.Th>{t('common.actions', language)}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[1, 2, 3].map((i) => (
                <Table.Tr key={i}>
                  <Table.Td><Skeleton height={16} width={150} /></Table.Td>
                  <Table.Td><Skeleton height={16} width={80} /></Table.Td>
                  <Table.Td><Skeleton height={16} width={100} /></Table.Td>
                  <Table.Td><Skeleton height={16} width={120} /></Table.Td>
                  <Table.Td><Skeleton height={24} width={60} radius="xl" /></Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Skeleton height={32} width={32} radius="md" />
                      <Skeleton height={32} width={32} radius="md" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      ) : (
        <Paper withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('restaurant.branchName', language)}</Table.Th>
                <Table.Th>{t('restaurant.branchCode', language)}</Table.Th>
                <Table.Th>{t('restaurant.branchCity', language)}</Table.Th>
                <Table.Th>{t('restaurant.branchPhone', language)}</Table.Th>
                <Table.Th>{t('common.status', language)}</Table.Th>
                <Table.Th>{t('common.actions', language)}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {branches.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6} style={{ textAlign: 'center' }}>
                    <Text c="dimmed" py="xl">
                      {t('restaurant.noBranches', language)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                branches.map((branch) => (
                  <Table.Tr key={branch.id}>
                    <Table.Td>
                      <Text fw={500}>{branch.name}</Text>
                    </Table.Td>
                    <Table.Td>{branch.code}</Table.Td>
                    <Table.Td>{branch.city || '-'}</Table.Td>
                    <Table.Td>{branch.phone || '-'}</Table.Td>
                    <Table.Td>
                      <Badge 
                        color={branch.isActive ? successColor : errorColor}
                        variant="light"
                      >
                        {branch.isActive
                          ? (t('common.active', language) || 'Active')
                          : (t('common.inactive', language) || 'Inactive')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <PermissionGuard resource="restaurant" action="update">
                          <ActionIcon
                            variant="subtle"
                            color={infoColor}
                            onClick={() => handleOpenModal(branch)}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </PermissionGuard>
                        <PermissionGuard resource="restaurant" action="delete">
                          <ActionIcon
                            variant="subtle"
                            color={errorColor}
                            onClick={() => handleDelete(branch)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </PermissionGuard>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <Modal
        opened={opened}
        onClose={handleCloseModal}
        title={editingBranch ? t('restaurant.editBranch', language) : t('restaurant.createBranch', language)}
        size="lg"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.branchName', language)}
                  required
                  {...form.getInputProps('name')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.branchCode', language)}
                  required
                  {...form.getInputProps('code')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.branchCity', language)}
                  {...form.getInputProps('city')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.branchPhone', language)}
                  {...form.getInputProps('phone')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('restaurant.branchEmail', language)}
                  type="email"
                  {...form.getInputProps('email')}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput
                  label={t('restaurant.branchAddress', language)}
                  {...form.getInputProps('address')}
                />
              </Grid.Col>
            </Grid>
            {editingBranch && (
              <Switch
                label={t('common.active', language) || 'Active'}
                checked={form.values.isActive ?? true}
                {...form.getInputProps('isActive', { type: 'checkbox' })}
              />
            )}
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={handleCloseModal}
              >
                {t('common.cancel', language) || 'Cancel'}
              </Button>
              <Button type="submit">{t('common.save', language) || 'Save'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
