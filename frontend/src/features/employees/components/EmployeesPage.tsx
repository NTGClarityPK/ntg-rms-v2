'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Loader,
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
import { rolesApi, Role } from '@/lib/api/roles';
import { restaurantApi } from '@/lib/api/restaurant';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { PermissionGuard } from '@/components/common/PermissionGuard';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { Fragment } from 'react';
import { getBadgeColorForText } from '@/lib/utils/theme';
import '@mantine/dates/styles.css';
import { EMPLOYMENT_TYPES } from '@/shared/constants/employees.constants';
import { handleApiError } from '@/shared/utils/error-handler';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';

interface EmployeesPageProps {
  addTrigger?: number;
}

export function EmployeesPage({ addTrigger }: EmployeesPageProps) {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<Employee>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);


  const [opened, setOpened] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmployee, setPendingEmployee] = useState<Partial<Employee> | null>(null);
  const [updatingEmployeeId, setUpdatingEmployeeId] = useState<string | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      email: '',
      name: '',
      roleIds: [] as string[],
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
      roleIds: (value) => (!value || value.length === 0 ? t('employees.roleLabel', language) + ' is required' : null),
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

  const loadRoles = useCallback(async () => {
    try {
      const serverRoles = await rolesApi.getRoles();
      console.log('Loaded roles:', serverRoles);
      setRoles(serverRoles);
    } catch (err: any) {
      console.error('Failed to load roles:', err);
      handleApiError(err, {
        defaultMessage: 'Failed to load roles. Please refresh the page.',
        language,
        errorColor: notificationColors.error,
      });
    }
  }, [language, notificationColors.error]);

  const loadEmployees = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const filters: any = {};
      if (roleFilter) filters.role = roleFilter;
      if (statusFilter) filters.status = statusFilter;

      // Fetch paginated data from server
      const serverEmployeesResponse = await employeesApi.getEmployees(filters, pagination.paginationParams);
      // Handle both paginated and non-paginated responses
      const serverEmployees: Employee[] = pagination.extractData(serverEmployeesResponse);
      pagination.extractPagination(serverEmployeesResponse);
      
      setEmployees(serverEmployees);
    } catch (err: any) {
      const errorMsg = handleApiError(err, {
        defaultMessage: 'Failed to load employees',
        language,
        showNotification: false, // Don't show notification for load errors
      });
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId, roleFilter, statusFilter, pagination, language]);

  useEffect(() => {
    loadBranches();
    loadRoles();
  }, [loadBranches, loadRoles]);

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
      const roleIds = employee.roles?.map((r) => r.id) || [];
      console.log('Opening modal for employee:', employee);
      console.log('Employee roles:', employee.roles);
      console.log('Role IDs to set:', roleIds);
      form.setValues({
        email: employee.email,
        name: employee.name || '',
        roleIds: roleIds,
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
      console.log('Form values after setValues:', form.values);
    } else {
      setEditingEmployee(null);
      form.reset();
      console.log('Opening modal for new employee');
    }
    console.log('Available roles:', roles);
    setOpened(true);
  };

  const handleCloseModal = () => {
    setOpened(false);
    setEditingEmployee(null);
    form.reset();
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId || submitting) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmitting(true);
    });

    const wasEditing = !!editingEmployee;
    const currentEditingEmployee = editingEmployee;
    const currentEditingEmployeeId = editingEmployee?.id;

    // Close modal immediately
    handleCloseModal();

    // If editing, track which employee is being updated to show skeleton
    if (wasEditing && currentEditingEmployeeId) {
      setUpdatingEmployeeId(currentEditingEmployeeId);
    }

    // If creating a new employee, add a skeleton item to show progress
    if (!wasEditing) {
      setPendingEmployee({
        id: `pending-${Date.now()}`,
        name: values.name,
        email: values.email,
        phone: values.phone,
        employeeId: values.employeeId,
        employmentType: values.employmentType,
        isActive: values.isActive,
        roles: values.roleIds.map(roleId => {
          const role = roles.find(r => r.id === roleId);
          return role ? { id: role.id, name: role.name } as Role : null;
        }).filter(Boolean) as Role[],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    try {
      setError(null);

      if (wasEditing && currentEditingEmployee) {
        // Update
        const updateDto: UpdateEmployeeDto = {
          name: values.name,
          email: values.email,
          phone: values.phone || undefined,
          roleIds: values.roleIds,
          employeeId: values.employeeId || undefined,
          nationalId: values.nationalId || undefined,
          dateOfBirth: values.dateOfBirth ? values.dateOfBirth.toISOString().split('T')[0] : undefined,
          employmentType: values.employmentType || undefined,
          joiningDate: values.joiningDate ? values.joiningDate.toISOString().split('T')[0] : undefined,
          salary: values.salary,
          isActive: values.isActive,
          branchIds: values.branchIds,
        };

        const updated = await employeesApi.updateEmployee(currentEditingEmployee.id, updateDto);
        setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

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
          roleIds: values.roleIds,
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

        const created = await employeesApi.createEmployee(createDto);
        setEmployees((prev) => [created, ...prev]);

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('employees.createSuccess', language),
          color: notificationColors.success,
        });
      }

      // Remove pending employee skeleton and updating state
      setPendingEmployee(null);
      setUpdatingEmployeeId(null);

      // Reload employees to get fresh data with roles
      await loadEmployees();
    } catch (err: any) {
      const errorMsg = handleApiError(err, {
        defaultMessage: 'Failed to save employee',
        language,
        errorColor: notificationColors.error,
      });
      setError(errorMsg);
      
      // Remove pending employee skeleton and updating state on error
      setPendingEmployee(null);
      setUpdatingEmployeeId(null);
    } finally {
      setSubmitting(false);
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
        setDeletingEmployeeId(employee.id);
        try {
          await employeesApi.deleteEmployee(employee.id);
          setEmployees((prev) => prev.filter((e) => e.id !== employee.id));

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('employees.deleteSuccess', language),
            color: notificationColors.success,
          });
          
          setDeletingEmployeeId(null);
        } catch (err: any) {
          setDeletingEmployeeId(null);
          handleApiError(err, {
            defaultMessage: 'Failed to delete employee',
            language,
            errorColor: notificationColors.error,
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

  const getRoleLabel = (roleName: string) => {
    const role = roles.find((r) => r.name === roleName);
    if (role) {
      const translated = t(`employees.role.${role.name}` as any, language);
      if (translated && !translated.startsWith('employees.role.')) {
        return translated;
      }
      return role.displayNameEn;
    }
    // Fallback: format the role name nicely
    return roleName
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const getRoleLabels = (employeeRoles?: Role[]) => {
    if (!employeeRoles || employeeRoles.length === 0) {
      return [getRoleLabel('')];
    }
    return employeeRoles.map((r) => {
      const translated = t(`employees.role.${r.name}` as any, language);
      if (translated && !translated.startsWith('employees.role.')) {
        return translated;
      }
      return r.displayNameEn;
    });
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
              data={roles.map((r) => ({
                value: r.name,
                label: t(`employees.role.${r.name}` as any, language) || r.displayNameEn,
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
        <Fragment>
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
                {/* Show pending employee skeleton when creating */}
                {pendingEmployee && !editingEmployee && (
                  <Table.Tr key={pendingEmployee.id} style={{ opacity: 0.7, position: 'relative' }}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Skeleton height={16} width={150} />
                        <Loader size={16} style={{ flexShrink: 0 }} />
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={200} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={24} width={100} radius="xl" />
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
                {filteredEmployees.length === 0 && !pendingEmployee ? (
                  <Table.Tr>
                    <Table.Td colSpan={7} ta="center" py="xl">
                      <Text c="dimmed">{t('employees.noEmployees', language)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filteredEmployees.map((employee) => {
                    const isUpdating = updatingEmployeeId === employee.id;
                    return (
                      <Table.Tr key={employee.id} style={{ opacity: isUpdating ? 0.7 : 1, position: 'relative' }}>
                        {isUpdating ? (
                          <>
                            <Table.Td>
                              <Group gap="xs" wrap="nowrap">
                                <Skeleton height={16} width={150} />
                                <Loader size={16} style={{ flexShrink: 0 }} />
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={16} width={200} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={24} width={100} radius="xl" />
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
                              <Group gap="xs">
                                {(() => {
                                  // Debug: log employee roles
                                  if (employee.name === 'Lingo' || employee.email === 'lingo@gmail.com') {
                                    console.log('Lingo employee data:', {
                                      name: employee.name,
                                      roles: employee.roles,
                                      role: employee.role,
                                      fullEmployee: employee
                                    });
                                  }
                                  
                                  // Display multiple roles if available
                                  if (employee.roles && Array.isArray(employee.roles) && employee.roles.length > 0) {
                                    return employee.roles.map((role) => {
                                      const roleLabel = getRoleLabel(role.name);
                                      return (
                                        <Badge key={role.id} color={getBadgeColorForText(roleLabel)} variant="light">
                                          {roleLabel}
                                        </Badge>
                                      );
                                    });
                                  }
                                  // Fallback to single role
                                  return (
                                    <Badge color={primaryColor} variant="light">
                                      {getRoleLabel(employee.role)}
                                    </Badge>
                                  );
                                })()}
                              </Group>
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
                                <PermissionGuard resource="employees" action="update">
                                  <ActionIcon 
                                    variant="subtle" 
                                    color={primaryColor} 
                                    onClick={() => handleOpenModal(employee)}
                                    disabled={deletingEmployeeId === employee.id || updatingEmployeeId === employee.id}
                                  >
                                    <IconEdit size={16} />
                                  </ActionIcon>
                                </PermissionGuard>
                                <PermissionGuard resource="employees" action="delete">
                                  <ActionIcon 
                                    variant="subtle" 
                                    color={errorColor} 
                                    onClick={() => handleDelete(employee)}
                                    disabled={deletingEmployeeId === employee.id || updatingEmployeeId === employee.id}
                                  >
                                    {deletingEmployeeId === employee.id ? (
                                      <Loader size={16} />
                                    ) : (
                                      <IconTrash size={16} />
                                    )}
                                  </ActionIcon>
                                </PermissionGuard>
                              </Group>
                            </Table.Td>
                          </>
                        )}
                      </Table.Tr>
                    );
                  })
                )}
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
        </Fragment>
      </Paper>

      <Modal
        opened={opened}
        onClose={() => {
          if (!submitting) {
            handleCloseModal();
          }
        }}
        title={editingEmployee ? t('employees.editEmployee', language) : t('employees.addEmployee', language)}
        size="lg"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
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
                {roles.length > 0 ? (
                  <MultiSelect
                    key={`role-select-${editingEmployee?.id || 'new'}`}
                    label={t('employees.roleLabel', language)}
                    placeholder={t('employees.selectRoles', language) || 'Select one or more roles'}
                    required
                    searchable
                    clearable
                    value={form.values.roleIds}
                    onChange={(value) => form.setFieldValue('roleIds', value || [])}
                    data={roles.map((r) => ({
                      value: r.id,
                      label: t(`employees.role.${r.name}` as any, language) || r.displayNameEn,
                    }))}
                  />
                ) : (
                  <Select
                    label={t('employees.roleLabel', language)}
                    placeholder="Loading roles..."
                    disabled
                    data={[]}
                  />
                )}
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
              <Button 
                type="submit"
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

