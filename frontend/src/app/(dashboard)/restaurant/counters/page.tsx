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
import { restaurantApi, Counter, CreateCounterDto, UpdateCounterDto } from '@/lib/api/restaurant';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors } from '@/lib/hooks/use-theme-colors';
import { useErrorColor, useSuccessColor, useInfoColor } from '@/lib/hooks/use-theme-colors';

export default function CountersPage() {
  const { language } = useLanguageStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const infoColor = useInfoColor();
  const [counters, setCounters] = useState<Counter[]>([]);
  const [branches, setBranches] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingCounter, setEditingCounter] = useState<Counter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateCounterDto>({
    initialValues: {
      name: '',
      code: '',
      branchId: '',
    },
    validate: {
      name: (value) => (!value ? 'Name is required' : null),
      code: (value) => (!value ? 'Code is required' : null),
      branchId: (value) => (!value ? 'Branch is required' : null),
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load branches first
      if (navigator.onLine) {
        try {
          const branchesData = await restaurantApi.getBranches();
          setBranches(
            branchesData.map((b) => ({
              value: b.id,
              label: `${b.nameEn} (${b.code})`,
            }))
          );
        } catch (err) {
          console.warn('Failed to load branches:', err);
        }
      }

      // Load counters from IndexedDB first
      // Note: We don't have a counters table in IndexedDB yet, so we'll work with API only for now
      // In a full implementation, you'd add counters to IndexedDB

      // Load from server if online
      if (navigator.onLine) {
        try {
          const serverCounters = await restaurantApi.getCounters();
          setCounters(serverCounters);
        } catch (err: any) {
          console.warn('Failed to load from server:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load counters');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (counter?: Counter) => {
    if (counter) {
      setEditingCounter(counter);
      form.setValues({
        name: counter.name,
        code: counter.code,
        branchId: counter.branchId,
      });
    } else {
      setEditingCounter(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleSubmit = async (values: typeof form.values) => {
    try {
      setError(null);

      if (editingCounter) {
        // Update counter
        const updateData: UpdateCounterDto = {
          name: values.name,
          code: values.code,
        };

        // Queue sync
        await syncService.queueChange('counters', 'UPDATE', editingCounter.id, updateData);

        // Try to sync immediately if online
        if (navigator.onLine) {
          try {
            await restaurantApi.updateCounter(editingCounter.id, updateData);
            notifications.show({
              title: 'Success',
              message: 'Counter updated successfully',
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
        // Create counter
        // Queue sync
        const newId = crypto.randomUUID();
        await syncService.queueChange('counters', 'CREATE', newId, values);

        // Try to sync immediately if online
        if (navigator.onLine) {
          try {
            await restaurantApi.createCounter(values);
            notifications.show({
              title: 'Success',
              message: 'Counter created successfully',
              color: notificationColors.success,
              icon: <IconCheck size={16} />,
            });
          } catch (err: any) {
            notifications.show({
              title: 'Saved Locally',
              message: 'Counter saved locally and will sync when online',
              color: notificationColors.info,
            });
          }
        } else {
          notifications.show({
            title: 'Saved Locally',
            message: 'Counter saved locally and will sync when online',
            color: notificationColors.info,
          });
        }
      }

      setOpened(false);
      form.reset();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save counter');
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to save counter',
        color: notificationColors.error,
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  const handleDelete = (counter: Counter) => {
    modals.openConfirmModal({
      title: 'Delete Counter',
      children: (
        <Text size="sm">
          Are you sure you want to delete &quot;{counter.name}&quot;? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          // Queue sync
          await syncService.queueChange('counters', 'DELETE', counter.id, {});

          // Try to sync immediately if online
          if (navigator.onLine) {
            try {
              await restaurantApi.deleteCounter(counter.id);
              notifications.show({
                title: 'Success',
                message: 'Counter deleted successfully',
                color: notificationColors.success,
                icon: <IconCheck size={16} />,
              });
            } catch (err: any) {
              notifications.show({
                title: 'Queued for Deletion',
                message: 'Counter will be deleted when online',
                color: notificationColors.info,
              });
            }
          } else {
            notifications.show({
              title: 'Queued for Deletion',
              message: 'Counter will be deleted when online',
              color: notificationColors.info,
            });
          }

          loadData();
        } catch (err: any) {
          notifications.show({
            title: 'Error',
            message: err.message || 'Failed to delete counter',
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
        <Title order={2}>Counter Management</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => handleOpenModal()}>
          Add Counter
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

      <Paper withBorder>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Code</Table.Th>
              <Table.Th>Branch</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {counters.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5} style={{ textAlign: 'center' }}>
                  <Text c="dimmed" py="xl">
                    No counters found. Create your first counter.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              counters.map((counter) => (
                <Table.Tr key={counter.id}>
                  <Table.Td>
                    <Text fw={500}>{counter.name}</Text>
                  </Table.Td>
                  <Table.Td>{counter.code}</Table.Td>
                  <Table.Td>
                    {counter.branch?.nameEn || '-'}
                  </Table.Td>
                  <Table.Td>
                    <Badge style={{ 
                      backgroundColor: counter.isActive ? `${successColor}20` : `${errorColor}20`,
                      color: counter.isActive ? successColor : errorColor,
                      borderColor: counter.isActive ? successColor : errorColor,
                    }}>
                      {counter.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        style={{ color: infoColor }}
                        onClick={() => handleOpenModal(counter)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        style={{ color: errorColor }}
                        onClick={() => handleDelete(counter)}
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


      <Modal
        opened={opened}
        onClose={() => {
          setOpened(false);
          form.reset();
        }}
        title={editingCounter ? 'Edit Counter' : 'Create Counter'}
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Select
              label="Branch"
              required
              data={branches}
              {...form.getInputProps('branchId')}
            />
            <TextInput
              label="Name"
              required
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Code"
              required
              {...form.getInputProps('code')}
            />
            {editingCounter && (
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

