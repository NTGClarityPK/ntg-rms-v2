'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from '@mantine/form';
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
  MultiSelect,
  PasswordInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconAlertCircle,
  IconSearch,
  IconCircleCheck,
  IconCircleX,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { employeesApi, Employee, CreateEmployeeDto, UpdateEmployeeDto } from '@/lib/api/employees';
import { restaurantApi } from '@/lib/api/restaurant';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import '@mantine/dates/styles.css';

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'kitchen_staff', label: 'Kitchen Staff' },
  { value: 'waiter', label: 'Waiter' },
  { value: 'delivery', label: 'Delivery' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
];

interface EmployeesPageProps {
  addTrigger?: number;
}

export function EmployeesPage({ addTrigger }: EmployeesPageProps) {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      email: '',
      name: '',
      role: '',
      phone: '',
      employeeId: '',
      nationalId: '',
      dateOfBirth: null as Date | null,
      employmentType: '',
      joiningDate: null as Date | null,
      salary: undefined as number | undefined,
      isActive: true,
      branchIds: [] as string[],
      createAuthAccount: false,
      password: '',
    },
    validate: {
      email: (value) => (!value ? (t('common.email' as any, language) || 'Email') + ' is required' : null),
      name: (value) => (!value ? t('employees.name', language) || 'Name is required' : null),
      role: (value) => (!value ? t('employees.roleLabel', language) + ' is required' : null),
      password: (value, values) =>
        values.createAuthAccount && !value ? (t('common.password' as any, language) || 'Password') + ' is required' : null,
    },
  });

  const loadBranches = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      const serverBranches = await restaurantApi.getBranches();
      setBranches(serverBranches.map(b => ({ id: b.id, name: b.name })));
    } catch (err: any) {
      console.error('Failed to load branches:', err);
    }
  }, [user?.tenantId]);

  const loadEmployees = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      if (navigator.onLine) {
        try {
          const filters: any = {};
          if (roleFilter) filters.role = roleFilter;
          if (statusFilter) filters.status = statusFilter;

          const serverEmployees = await employeesApi.getEmployees(filters);
          setEmployees(serverEmployees);

          // Update IndexedDB
          const employeesToStore = serverEmployees.map((emp) => ({
            id: emp.id,
            tenantId: user.tenantId,
            supabaseAuthId: emp.supabaseAuthId,
            email: emp.email,
            name: emp.name || (emp as any).nameEn || (emp as any).nameAr || '',
            phone: emp.phone,
            role: emp.role,
            employeeId: emp.employeeId,
            photoUrl: emp.photoUrl,
            nationalId: emp.nationalId,
            dateOfBirth: emp.dateOfBirth,
            employmentType: emp.employmentType,
            joiningDate: emp.joiningDate,
            salary: emp.salary,
            isActive: emp.isActive,
            lastLoginAt: emp.lastLoginAt,
            createdAt: emp.createdAt,
            updatedAt: emp.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced' as const,
          }));

          if (employeesToStore.length > 0) {
            await db.employees.bulkPut(employeesToStore as any);
          }
        } catch (err: any) {
          console.error('Failed to load employees from server:', err);
          // Fall back to IndexedDB
          const localEmployees = await db.employees.where('tenantId').equals(user.tenantId).toArray();
          setEmployees(localEmployees as unknown as Employee[]);
        }
      } else {
        // Load from IndexedDB when offline
        const localEmployees = await db.employees.where('tenantId').equals(user.tenantId).toArray();
        setEmployees(localEmployees as unknown as Employee[]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load employees');
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: err.message || 'Failed to load employees',
        color: notificationColors.error,
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId, roleFilter, statusFilter, language, notificationColors.error]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Trigger add modal from parent
  useEffect(() => {
    if (addTrigger && addTrigger > 0) {
      handleOpenModal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTrigger]);

  const handleOpenModal = (employee?: Employee) => {
    if (employee) {
      setEditingEmployee(employee);
      form.setValues({
        email: employee.email,
        name: employee.name || '',
        role: employee.role,
        phone: employee.phone || '',
        employeeId: employee.employeeId || '',
        nationalId: employee.nationalId || '',
        dateOfBirth: employee.dateOfBirth ? new Date(employee.dateOfBirth) : null,
        employmentType: employee.employmentType || '',
        joiningDate: employee.joiningDate ? new Date(employee.joiningDate) : null,
        salary: employee.salary,
        isActive: employee.isActive,
        branchIds: employee.branches?.map((b) => b.id) || [],
        createAuthAccount: false,
        password: '',
      });
    } else {
      setEditingEmployee(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    setOpened(false);
    setEditingEmployee(null);
    form.reset();
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    try {
      setError(null);

      if (editingEmployee) {
        // Update
        const updateDto: UpdateEmployeeDto = {
          name: values.name,
          email: values.email,
          phone: values.phone || undefined,
          role: values.role,
          employeeId: values.employeeId || undefined,
          nationalId: values.nationalId || undefined,
          dateOfBirth: values.dateOfBirth ? values.dateOfBirth.toISOString().split('T')[0] : undefined,
          employmentType: values.employmentType || undefined,
          joiningDate: values.joiningDate ? values.joiningDate.toISOString().split('T')[0] : undefined,
          salary: values.salary,
          isActive: values.isActive,
          branchIds: values.branchIds,
        };

        if (navigator.onLine) {
          const updated = await employeesApi.updateEmployee(editingEmployee.id, updateDto);
          setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

          // Update IndexedDB
          await db.employees.put({
            id: updated.id,
            tenantId: user.tenantId,
            supabaseAuthId: updated.supabaseAuthId,
            email: updated.email,
            name: updated.name,
            phone: updated.phone,
            role: updated.role,
            employeeId: updated.employeeId,
            photoUrl: updated.photoUrl,
            nationalId: updated.nationalId,
            dateOfBirth: updated.dateOfBirth,
            employmentType: updated.employmentType,
            joiningDate: updated.joiningDate,
            salary: updated.salary,
            isActive: updated.isActive,
            lastLoginAt: updated.lastLoginAt,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          } as any);
        } else {
          // Queue for sync
          await db.employees.put({
            id: editingEmployee.id,
            tenantId: user.tenantId,
            ...updateDto,
            updatedAt: new Date().toISOString(),
            syncStatus: 'pending',
          } as any);
          await syncService.queueChange('employees', 'UPDATE', editingEmployee.id, updateDto);
        }

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('employees.updateSuccess', language),
          color: notificationColors.success,
        });
      } else {
        // Create
        const createDto: CreateEmployeeDto = {
          email: values.email,
          name: values.name,
          role: values.role,
          phone: values.phone || undefined,
          employeeId: values.employeeId || undefined,
          nationalId: values.nationalId || undefined,
          dateOfBirth: values.dateOfBirth ? values.dateOfBirth.toISOString().split('T')[0] : undefined,
          employmentType: values.employmentType || undefined,
          joiningDate: values.joiningDate ? values.joiningDate.toISOString().split('T')[0] : undefined,
          salary: values.salary,
          isActive: values.isActive,
          branchIds: values.branchIds.length > 0 ? values.branchIds : undefined,
          createAuthAccount: values.createAuthAccount,
          password: values.createAuthAccount ? values.password : undefined,
        };

        if (navigator.onLine) {
          const created = await employeesApi.createEmployee(createDto);
          setEmployees((prev) => [created, ...prev]);

          // Store in IndexedDB
          await db.employees.put({
            id: created.id,
            tenantId: user.tenantId,
            supabaseAuthId: created.supabaseAuthId,
            email: created.email,
            name: created.name,
            phone: created.phone,
            role: created.role,
            employeeId: created.employeeId,
            photoUrl: created.photoUrl,
            nationalId: created.nationalId,
            dateOfBirth: created.dateOfBirth,
            employmentType: created.employmentType,
            joiningDate: created.joiningDate,
            salary: created.salary,
            isActive: created.isActive,
            lastLoginAt: created.lastLoginAt,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          } as any);
        } else {
          // Queue for sync
          const tempId = `employee-${Date.now()}`;
          await db.employees.put({
            id: tempId,
            tenantId: user.tenantId,
            ...createDto,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            syncStatus: 'pending',
          } as any);
          await syncService.queueChange('employees', 'CREATE', tempId, createDto);
        }

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('employees.createSuccess', language),
          color: notificationColors.success,
        });
      }

      handleCloseModal();
      loadEmployees();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || err.message || 'Failed to save employee';
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: notificationColors.error,
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  const handleDelete = (employee: Employee) => {
    modals.openConfirmModal({
      title: t('employees.deleteConfirm', language),
      children: (
        <Text size="sm">
          {t('employees.deleteConfirmMessage', language)} {employee.name}?
        </Text>
      ),
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          if (navigator.onLine) {
            await employeesApi.deleteEmployee(employee.id);
            setEmployees((prev) => prev.filter((e) => e.id !== employee.id));

            // Soft delete in IndexedDB
            await db.employees.update(employee.id, {
              deletedAt: new Date().toISOString(),
              isActive: false,
              syncStatus: 'synced',
            });
          } else {
            // Queue for sync
            await db.employees.update(employee.id, {
              deletedAt: new Date().toISOString(),
              isActive: false,
              syncStatus: 'pending',
            });
            await syncService.queueChange('employees', 'DELETE', employee.id, {});
          }

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('employees.deleteSuccess', language),
            color: notificationColors.success,
          });
        } catch (err: any) {
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || 'Failed to delete employee',
            color: notificationColors.error,
            icon: <IconAlertCircle size={16} />,
          });
        }
      },
    });
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      !searchQuery ||
      emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.phone?.includes(searchQuery) ||
      emp.employeeId?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getRoleLabel = (role: string) => {
    const translated = t(`employees.role.${role}` as any, language);
    if (translated && !translated.startsWith('employees.role.')) {
      return translated;
    }
    // Fallback: format the role name nicely
    return role
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const getEmploymentTypeLabel = (type?: string) => {
    if (!type) return '-';
    const translated = t(`employees.employmentType.${type}` as any, language);
    if (translated && !translated.startsWith('employees.employmentType.')) {
      return translated;
    }
    // Fallback: format the type nicely
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('-');
  };

  if (loading && employees.length === 0) {
    return (
      <Stack gap="md">
        <Skeleton height={36} width={250} />
        <Stack gap="md">
          <Skeleton height={40} width="100%" />
          <Skeleton height={300} width="100%" />
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md">
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput
              placeholder={t('common.search' as any, language) || 'Search'}
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              placeholder={t('employees.filterByRole', language)}
              data={ROLES.map((r) => ({
                value: r.value,
                label: t(`employees.role.${r.value}` as any, language) || r.label,
              }))}
              clearable
              value={roleFilter}
              onChange={setRoleFilter}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              placeholder={t('employees.filterByStatus', language)}
              data={[
                { value: 'active', label: t('common.active' as any, language) || 'Active' },
                { value: 'inactive', label: t('common.inactive' as any, language) || 'Inactive' },
              ]}
              clearable
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </Grid.Col>
        </Grid>
      </Paper>

      <Paper withBorder>
        <Table.ScrollContainer minWidth={800}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('employees.name', language)}</Table.Th>
                <Table.Th>{t('employees.email', language)}</Table.Th>
                <Table.Th>{t('employees.roleLabel', language)}</Table.Th>
                <Table.Th>{t('employees.phone', language)}</Table.Th>
                <Table.Th>{t('employees.employmentTypeLabel', language)}</Table.Th>
                <Table.Th>{t('common.status' as any, language)}</Table.Th>
                <Table.Th>{t('common.actions' as any, language)}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredEmployees.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7} ta="center" py="xl">
                    <Text c="dimmed">{t('employees.noEmployees', language)}</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredEmployees.map((employee) => (
                  <Table.Tr key={employee.id}>
                    <Table.Td>
                      <Text fw={500}>
                        {employee.name}
                      </Text>
                      {employee.employeeId && (
                        <Text size="xs" c="dimmed">
                          {t('employees.employeeId', language)}: {employee.employeeId}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{employee.email}</Table.Td>
                    <Table.Td>
                      <Badge color={getBadgeColorForText(getRoleLabel(employee.role))} variant="light">
                        {getRoleLabel(employee.role)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{employee.phone || '-'}</Table.Td>
                    <Table.Td>{getEmploymentTypeLabel(employee.employmentType)}</Table.Td>
                    <Table.Td>
                      <Badge
                        color={employee.isActive ? successColor : errorColor}
                        variant="light"
                        leftSection={employee.isActive ? <IconCircleCheck size={12} /> : <IconCircleX size={12} />}
                      >
                        {employee.isActive
                          ? (t('common.active' as any, language) || 'Active')
                          : (t('common.inactive' as any, language) || 'Inactive')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon variant="subtle" color={primaryColor} onClick={() => handleOpenModal(employee)}>
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color={errorColor} onClick={() => handleDelete(employee)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal
        opened={opened}
        onClose={handleCloseModal}
        title={editingEmployee ? t('employees.editEmployee', language) : t('employees.addEmployee', language)}
        size="lg"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label={t('employees.name', language) || 'Name'}
                  required
                  {...form.getInputProps('name')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('common.email' as any, language)} required {...form.getInputProps('email')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('common.phone' as any, language)} {...form.getInputProps('phone')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label={t('employees.roleLabel', language)}
                  required
                  data={ROLES.map((r) => ({
                    value: r.value,
                    label: t(`employees.role.${r.value}` as any, language) || r.label,
                  }))}
                  {...form.getInputProps('role')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('employees.employeeId', language)} {...form.getInputProps('employeeId')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t('employees.nationalId', language)} {...form.getInputProps('nationalId')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <DateInput
                  label={t('employees.dateOfBirth', language)}
                  valueFormat="YYYY-MM-DD"
                  {...form.getInputProps('dateOfBirth')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label={t('employees.employmentTypeLabel', language)}
                  data={EMPLOYMENT_TYPES.map((type) => ({
                    value: type.value,
                    label: t(`employees.employmentType.${type.value}` as any, language) || type.label,
                  }))}
                  {...form.getInputProps('employmentType')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <DateInput
                  label={t('employees.joiningDate', language)}
                  valueFormat="YYYY-MM-DD"
                  {...form.getInputProps('joiningDate')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={t('employees.salary', language)}
                  min={0}
                  decimalScale={2}
                  {...form.getInputProps('salary')}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <MultiSelect
                  label={t('employees.assignedBranches', language)}
                  data={branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                  {...form.getInputProps('branchIds')}
                />
              </Grid.Col>
              {!editingEmployee && (
                <>
                  <Grid.Col span={12}>
                    <Switch
                      label={t('employees.createAuthAccount', language)}
                      {...form.getInputProps('createAuthAccount', { type: 'checkbox' })}
                    />
                  </Grid.Col>
                  {form.values.createAuthAccount && (
                    <Grid.Col span={12}>
                      <PasswordInput
                        label={t('common.password' as any, language) || 'Password'}
                        required={form.values.createAuthAccount}
                        {...form.getInputProps('password')}
                      />
                    </Grid.Col>
                  )}
                </>
              )}
              <Grid.Col span={12}>
                <Switch
                  label={t('common.active' as any, language) || 'Active'}
                  {...form.getInputProps('isActive', { type: 'checkbox' })}
                />
              </Grid.Col>
            </Grid>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={handleCloseModal}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit">{t('common.save' as any, language) || 'Save'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

