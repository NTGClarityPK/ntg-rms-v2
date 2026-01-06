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
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { restaurantApi, Table as TableType, CreateTableDto, UpdateTableDto } from '@/lib/api/restaurant';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors } from '@/lib/hooks/use-theme-colors';
import { useErrorColor, useSuccessColor, useInfoColor, useWarningColor } from '@/lib/hooks/use-theme-colors';
import { generateUUID } from '@/lib/utils/uuid';

// TABLE_STATUS_COLORS will be generated dynamically based on theme

const TABLE_TYPE_OPTIONS = [
  { value: 'regular', label: 'Regular' },
  { value: 'vip', label: 'VIP' },
  { value: 'outdoor', label: 'Outdoor' },
];

const TABLE_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'out_of_service', label: 'Out of Service' },
];

export default function TablesPage() {
  const { language } = useLanguageStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const infoColor = useInfoColor();
  const warningColor = useWarningColor();
  const [tables, setTables] = useState<TableType[]>([]);
  const [branches, setBranches] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingTable, setEditingTable] = useState<TableType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate status colors based on theme
  const TABLE_STATUS_COLORS: Record<string, string> = {
    available: successColor,
    occupied: errorColor,
    reserved: warningColor,
    out_of_service: '#9e9e9e', // Gray stays gray
  };

  const form = useForm<CreateTableDto>({
    initialValues: {
      tableNumber: '',
      branchId: '',
      seatingCapacity: 4,
      tableType: 'regular',
    },
    validate: {
      tableNumber: (value) => (!value ? 'Table number is required' : null),
      branchId: (value) => (!value ? t('common.required', language) || 'Branch is required' : null),
      seatingCapacity: (value) => (value && value < 1 ? 'Seating capacity must be at least 1' : null),
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
              label: `${b.name} (${b.code})`,
            }))
          );
        } catch (err) {
          console.warn('Failed to load branches:', err);
        }
      }

      // Load from server if online
      if (navigator.onLine) {
        try {
          const serverTables = await restaurantApi.getTables();
          setTables(serverTables);
        } catch (err: any) {
          console.warn('Failed to load from server:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (table?: TableType) => {
    if (table) {
      setEditingTable(table);
      form.setValues({
        tableNumber: table.tableNumber,
        branchId: table.branchId,
        seatingCapacity: table.seatingCapacity,
        tableType: table.tableType,
      });
    } else {
      setEditingTable(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleSubmit = async (values: typeof form.values) => {
    try {
      setError(null);

      if (editingTable) {
        // Update table
        const updateData: UpdateTableDto = {
          tableNumber: values.tableNumber,
          seatingCapacity: values.seatingCapacity,
          tableType: values.tableType,
        };

        await restaurantApi.updateTable(editingTable.id, updateData);
        notifications.show({
          title: 'Success',
          message: 'Table updated successfully',
          color: notificationColors.success,
          icon: <IconCheck size={16} />,
        });
      } else {
        // Create table
        await restaurantApi.createTable(values);
        notifications.show({
          title: 'Success',
          message: 'Table created successfully',
          color: notificationColors.success,
          icon: <IconCheck size={16} />,
        });
      }

      setOpened(false);
      form.reset();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save table');
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to save table',
        color: notificationColors.error,
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  const handleDelete = (table: TableType) => {
    modals.openConfirmModal({
      title: 'Delete Table',
      children: (
        <Text size="sm">
          Are you sure you want to delete table &quot;{table.tableNumber}&quot;? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await restaurantApi.deleteTable(table.id);
          notifications.show({
            title: 'Success',
            message: 'Table deleted successfully',
            color: notificationColors.success,
            icon: <IconCheck size={16} />,
          });

          loadData();
        } catch (err: any) {
          notifications.show({
            title: 'Error',
            message: err.message || 'Failed to delete table',
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
        <Title order={1}>Table Management</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => handleOpenModal()}>
          Add Table
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
              <Table.Th>Table Number</Table.Th>
              <Table.Th>Branch</Table.Th>
              <Table.Th>Capacity</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tables.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6} style={{ textAlign: 'center' }}>
                  <Text c="dimmed" py="xl">
                    No tables found. Create your first table.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              tables.map((table) => (
                <Table.Tr key={table.id}>
                  <Table.Td>
                    <Text fw={500}>{table.tableNumber}</Text>
                  </Table.Td>
                  <Table.Td>
                    {(table.branch as any)?.name || (table.branch as any)?.nameEn || '-'}
                  </Table.Td>
                  <Table.Td>{table.seatingCapacity}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{table.tableType}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge style={{ 
                      backgroundColor: `${TABLE_STATUS_COLORS[table.status] || '#9e9e9e'}20`,
                      color: TABLE_STATUS_COLORS[table.status] || '#9e9e9e',
                      borderColor: TABLE_STATUS_COLORS[table.status] || '#9e9e9e',
                    }}>
                      {table.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        style={{ color: infoColor }}
                        onClick={() => handleOpenModal(table)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        style={{ color: errorColor }}
                        onClick={() => handleDelete(table)}
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
        title={editingTable ? 'Edit Table' : 'Create Table'}
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Select
              label={t('common.selectBranch', language) || t('restaurant.branch', language) || 'Branch'}
              placeholder={t('common.selectBranch', language) || 'Select Branch'}
              required
              data={branches}
              {...form.getInputProps('branchId')}
            />
            <TextInput
              label="Table Number"
              required
              {...form.getInputProps('tableNumber')}
            />
            <NumberInput
              label="Seating Capacity"
              min={1}
              {...form.getInputProps('seatingCapacity')}
            />
            <Select
              label="Table Type"
              data={TABLE_TYPE_OPTIONS}
              {...form.getInputProps('tableType')}
            />
            {editingTable && (
              <Select
                label="Status"
                data={TABLE_STATUS_OPTIONS}
                value={editingTable.status}
                onChange={async (value) => {
                  if (value && editingTable) {
                    try {
                      const updateData: UpdateTableDto = { status: value as any };
                      await restaurantApi.updateTable(editingTable.id, updateData);
                      notifications.show({
                        title: 'Success',
                        message: 'Table status updated',
                        color: notificationColors.success,
                        icon: <IconCheck size={16} />,
                      });
                      loadData();
                    } catch (err: any) {
                      notifications.show({
                        title: 'Error',
                        message: err.message || 'Failed to update status',
                        color: notificationColors.error,
                        icon: <IconAlertCircle size={16} />,
                      });
                    }
                  }
                }}
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

