'use client';

import { useState, useEffect } from 'react';
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
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { restaurantApi, Branch, CreateBranchDto, UpdateBranchDto } from '@/lib/api/restaurant';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors } from '@/lib/hooks/use-theme-colors';
import { useErrorColor, useSuccessColor, useInfoColor } from '@/lib/hooks/use-theme-colors';

export default function BranchesPage() {
  const { language } = useLanguageStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const infoColor = useInfoColor();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateBranchDto>({
    initialValues: {
      nameEn: '',
      nameAr: '',
      code: '',
      addressEn: '',
      addressAr: '',
      city: '',
      state: '',
      country: 'Iraq',
      phone: '',
      email: '',
      latitude: undefined,
      longitude: undefined,
      managerId: undefined,
    },
    validate: {
      nameEn: (value) => (!value ? 'Name (English) is required' : null),
      code: (value) => (!value ? 'Code is required' : null),
      email: (value) => (value && !/^\S+@\S+$/.test(value) ? 'Invalid email' : null),
    },
  });

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load from IndexedDB first
      const localBranches = await db.branches.toArray();
      setBranches(localBranches.map(b => ({
        id: b.id,
        tenantId: b.tenantId,
        nameEn: b.nameEn,
        nameAr: b.nameAr,
        code: b.code,
        addressEn: b.addressEn,
        addressAr: b.addressAr,
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
              nameEn: branch.nameEn,
              nameAr: branch.nameAr,
              code: branch.code,
              addressEn: branch.addressEn,
              addressAr: branch.addressAr,
              city: branch.city,
              phone: branch.phone,
              isActive: branch.isActive,
              createdAt: branch.createdAt,
              updatedAt: branch.updatedAt,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            });
          }
        } catch (err: any) {
          console.warn('Failed to load from server:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      form.setValues({
        nameEn: branch.nameEn,
        nameAr: branch.nameAr || '',
        code: branch.code,
        addressEn: branch.addressEn || '',
        addressAr: branch.addressAr || '',
        city: branch.city || '',
        state: branch.state || '',
        country: branch.country || 'Iraq',
        phone: branch.phone || '',
        email: branch.email || '',
        latitude: branch.latitude,
        longitude: branch.longitude,
        managerId: branch.managerId,
      });
    } else {
      setEditingBranch(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleSubmit = async (values: typeof form.values) => {
    try {
      setError(null);

      if (editingBranch) {
        // Update branch
        const updateData: UpdateBranchDto = { ...values };

        // Save to IndexedDB first
        await db.branches.update(editingBranch.id, {
          nameEn: updateData.nameEn || editingBranch.nameEn,
          nameAr: updateData.nameAr,
          code: updateData.code || editingBranch.code,
          addressEn: updateData.addressEn,
          addressAr: updateData.addressAr,
          city: updateData.city,
          phone: updateData.phone,
          isActive: updateData.isActive ?? editingBranch.isActive,
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        });

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
              title: 'Success',
              message: 'Branch updated successfully',
              color: notificationColors.success,
              icon: <IconCheck size={16} />,
            });
          } catch (err: any) {
            notifications.show({
              title: 'Saved Locally',
              message: 'Changes saved locally and will sync when online',
              color: notificationColors.info,
            });
          }
        } else {
          notifications.show({
            title: 'Saved Locally',
            message: 'Changes saved locally and will sync when online',
            color: notificationColors.info,
          });
        }
      } else {
        // Create branch
        const newId = crypto.randomUUID();
        const branchData: Branch = {
          id: newId,
          tenantId: '', // Will be set from user context
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          code: values.code,
          addressEn: values.addressEn,
          addressAr: values.addressAr,
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
        });

        // Queue sync
        await syncService.queueChange('branches', 'CREATE', newId, values);

        // Try to sync immediately if online
        if (navigator.onLine) {
          try {
            const created = await restaurantApi.createBranch(values);
            await db.branches.update(newId, {
              id: created.id,
              tenantId: created.tenantId,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            });
            notifications.show({
              title: 'Success',
              message: 'Branch created successfully',
              color: notificationColors.success,
              icon: <IconCheck size={16} />,
            });
          } catch (err: any) {
            notifications.show({
              title: 'Saved Locally',
              message: 'Branch saved locally and will sync when online',
              color: notificationColors.info,
            });
          }
        } else {
          notifications.show({
            title: 'Saved Locally',
            message: 'Branch saved locally and will sync when online',
            color: notificationColors.info,
          });
        }
      }

      setOpened(false);
      form.reset();
      loadBranches();
    } catch (err: any) {
      setError(err.message || 'Failed to save branch');
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to save branch',
        color: notificationColors.error,
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  const handleDelete = (branch: Branch) => {
    modals.openConfirmModal({
      title: 'Delete Branch',
      children: (
        <Text size="sm">
          Are you sure you want to delete &quot;{branch.nameEn}&quot;? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
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
                title: 'Success',
                message: 'Branch deleted successfully',
                color: notificationColors.success,
                icon: <IconCheck size={16} />,
              });
            } catch (err: any) {
              notifications.show({
                title: 'Queued for Deletion',
                message: 'Branch will be deleted when online',
                color: notificationColors.info,
              });
            }
          } else {
            notifications.show({
              title: 'Queued for Deletion',
              message: 'Branch will be deleted when online',
              color: notificationColors.info,
            });
          }

          loadBranches();
        } catch (err: any) {
          notifications.show({
            title: 'Error',
            message: err.message || 'Failed to delete branch',
            color: notificationColors.error,
            icon: <IconAlertCircle size={16} />,
          });
        }
      },
    });
  };


  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>Branch Management</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => handleOpenModal()}>
          Add Branch
        </Button>
      </Group>

      {error && (
        <Alert 
          icon={<IconAlertCircle size={16} />} 
          style={{
            backgroundColor: `${errorColor}15`,
            borderColor: errorColor,
            color: errorColor,
          }}
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
                <Table.Th>Name</Table.Th>
                <Table.Th>Code</Table.Th>
                <Table.Th>City</Table.Th>
                <Table.Th>Phone</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[1, 2, 3, 4, 5].map((i) => (
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
                <Table.Th>Name</Table.Th>
                <Table.Th>Code</Table.Th>
                <Table.Th>City</Table.Th>
                <Table.Th>Phone</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {branches.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6} style={{ textAlign: 'center' }}>
                  <Text c="dimmed" py="xl">
                    No branches found. Create your first branch.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              branches.map((branch) => (
                <Table.Tr key={branch.id}>
                  <Table.Td>
                    <Text fw={500}>{branch.nameEn}</Text>
                    {branch.nameAr && (
                      <Text size="xs" c="dimmed">
                        {branch.nameAr}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{branch.code}</Table.Td>
                  <Table.Td>{branch.city || '-'}</Table.Td>
                  <Table.Td>{branch.phone || '-'}</Table.Td>
                  <Table.Td>
                    <Badge style={{ 
                      backgroundColor: branch.isActive ? `${successColor}20` : `${errorColor}20`,
                      color: branch.isActive ? successColor : errorColor,
                      borderColor: branch.isActive ? successColor : errorColor,
                    }}>
                      {branch.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        style={{ color: infoColor }}
                        onClick={() => handleOpenModal(branch)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        style={{ color: errorColor }}
                        onClick={() => handleDelete(branch)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
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
        onClose={() => {
          setOpened(false);
          form.reset();
        }}
        title={editingBranch ? 'Edit Branch' : 'Create Branch'}
        size="lg"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="Name (English)"
                  required
                  {...form.getInputProps('nameEn')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="Name (Arabic)"
                  {...form.getInputProps('nameAr')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="Code"
                  required
                  {...form.getInputProps('code')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="City"
                  {...form.getInputProps('city')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="Phone"
                  {...form.getInputProps('phone')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="Email"
                  type="email"
                  {...form.getInputProps('email')}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput
                  label="Address (English)"
                  {...form.getInputProps('addressEn')}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput
                  label="Address (Arabic)"
                  {...form.getInputProps('addressAr')}
                />
              </Grid.Col>
            </Grid>
            {editingBranch && (
              <Switch
                label="Active"
                {...form.getInputProps('isActive', { type: 'checkbox' })}
              />
            )}
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => {
                  setOpened(false);
                  form.reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}

