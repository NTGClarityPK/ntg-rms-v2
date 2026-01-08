'use client';

import { useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from '@mantine/form';
import {
  Container,
  Title,
  Paper,
  Stack,
  Button,
  Group,
  Text,
  Table,
  ActionIcon,
  Modal,
  TextInput,
  NumberInput,
  Switch,
  Select,
  MultiSelect,
  Skeleton,
  Badge,
  Loader,
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { taxesApi, Tax, CreateTaxDto } from '@/lib/api/taxes';
import { menuApi } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor, getBadgeColorForText } from '@/lib/utils/theme';
import { isPaginatedResponse } from '@/lib/types/pagination.types';

export default function TaxesPage() {
  const language = useLanguageStore((state) => state.language);
  const themeColor = useThemeColor();
  const { selectedBranchId } = useBranchStore();
  const [loading, setLoading] = useState(true);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [foodItems, setFoodItems] = useState<Array<{ value: string; label: string }>>([]);
  const [opened, setOpened] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [deletingTax, setDeletingTax] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingTax, setPendingTax] = useState<Tax | null>(null);
  const [updatingTaxId, setUpdatingTaxId] = useState<string | null>(null);
  const [deletingTaxId, setDeletingTaxId] = useState<string | null>(null);
  const primary = useThemeColor();
  const form = useForm<CreateTaxDto>({
    initialValues: {
      name: '',
      taxCode: '',
      rate: 0,
      isActive: true,
      appliesTo: 'order',
      appliesToDelivery: false,
      appliesToServiceCharge: false,
      categoryIds: [],
      foodItemIds: [],
    },
    validate: {
      name: (value) => (!value ? t('common.required' as any, language) || 'Required' : null),
      rate: (value) => (value < 0 || value > 100 ? t('taxes.invalidRate' as any, language) || 'Rate must be between 0 and 100' : null),
    },
  });

  const loadTaxes = useCallback(async () => {
    if (!selectedBranchId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await taxesApi.getTaxes(selectedBranchId);
      setTaxes(data);
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.loadError' as any, language) || 'Failed to load taxes',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  }, [language, selectedBranchId]);

  const loadCategories = useCallback(async () => {
    try {
      const dataResponse = await menuApi.getCategories();
      // Handle both paginated and non-paginated responses
      const data: any[] = isPaginatedResponse(dataResponse) ? dataResponse.data : dataResponse;
      setCategories(
        data.map((cat: any) => ({
          value: cat.id,
          label: cat.name,
        }))
      );
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, []);

  const loadFoodItems = useCallback(async () => {
    try {
      const dataResponse = await menuApi.getFoodItems();
      // Handle both paginated and non-paginated responses
      const data: any[] = isPaginatedResponse(dataResponse) ? dataResponse.data : dataResponse;
      setFoodItems(
        data.map((item: any) => ({
          value: item.id,
          label: item.name,
        }))
      );
    } catch (error) {
      console.error('Failed to load food items:', error);
    }
  }, []);

  useEffect(() => {
    loadTaxes();
    loadCategories();
    loadFoodItems();
  }, [loadTaxes, loadCategories, loadFoodItems]);

  const handleOpenModal = (tax?: Tax) => {
    if (tax) {
      setEditingTax(tax);
      form.setValues({
        name: tax.name,
        taxCode: tax.taxCode || '',
        rate: tax.rate,
        isActive: tax.isActive,
        appliesTo: tax.appliesTo,
        appliesToDelivery: tax.appliesToDelivery,
        appliesToServiceCharge: tax.appliesToServiceCharge,
        categoryIds: tax.categoryIds || [],
        foodItemIds: tax.foodItemIds || [],
      });
    } else {
      setEditingTax(null);
      form.reset();
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setOpened(false);
    setEditingTax(null);
    form.reset();
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!selectedBranchId) {
      notifications.show({
        title: t('common.error' as any, language),
        message: 'Please select a branch first',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
      return;
    }
    
    flushSync(() => {
      setSubmitting(true);
    });

    try {
      if (editingTax) {
        setUpdatingTaxId(editingTax.id);
        setOpened(false);
        setEditingTax(null);

        await taxesApi.updateTax(editingTax.id, values);
        notifications.show({
          title: t('common.success' as any, language),
          message: t('taxes.updated' as any, language) || 'Tax updated successfully',
          color: getSuccessColor(),
          icon: <IconCheck size={16} />,
        });
      } else {
        const tempTax: Tax = {
          id: 'pending',
          name: values.name,
          taxCode: values.taxCode || '',
          rate: values.rate,
          isActive: values.isActive ?? true,
          appliesTo: values.appliesTo || 'order',
          appliesToDelivery: values.appliesToDelivery ?? false,
          appliesToServiceCharge: values.appliesToServiceCharge ?? false,
          categoryIds: values.categoryIds || [],
          foodItemIds: values.foodItemIds || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tenantId: '',
        };

        setPendingTax(tempTax);
        setOpened(false);
        setEditingTax(null);
        form.reset();

        await taxesApi.createTax(values, selectedBranchId);
        notifications.show({
          title: t('common.success' as any, language),
          message: t('taxes.created' as any, language) || 'Tax created successfully',
          color: getSuccessColor(),
          icon: <IconCheck size={16} />,
        });
      }
      loadTaxes();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.saveError' as any, language) || 'Failed to save tax',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
      // Reopen modal on error
      if (editingTax) {
        setOpened(true);
        setEditingTax(editingTax);
      } else {
        setOpened(true);
      }
    } finally {
      setSubmitting(false);
      setPendingTax(null);
      setUpdatingTaxId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingTaxId(id);
    try {
      await taxesApi.deleteTax(id);
      notifications.show({
        title: t('common.success' as any, language),
        message: t('taxes.deleted' as any, language) || 'Tax deleted successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
      setDeletingTax(null);
      loadTaxes();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.deleteError' as any, language) || 'Failed to delete tax',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    } finally {
      setDeletingTaxId(null);
    }
  };

  if (!selectedBranchId) {
    return (
      <Container size="xl">
        <Stack gap="md">
          <Text c="dimmed" ta="center" py="xl">
            Please select a branch to view taxes
          </Text>
        </Stack>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container size="xl">
        <Stack gap="md">
          <Skeleton height={40} width="30%" />
          <Skeleton height={400} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={1}>{t('taxes.title' as any, language) || 'Tax Management'}</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => handleOpenModal()}
            style={{ backgroundColor: themeColor }}
          >
            {t('taxes.addTax' as any, language) || 'Add Tax'}
          </Button>
        </Group>

        <Paper p="md" withBorder>
          {taxes.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {t('taxes.noTaxes' as any, language) || 'No taxes configured'}
            </Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('taxes.name' as any, language) || 'Name'}</Table.Th>
                  <Table.Th>{t('taxes.code' as any, language) || 'Code'}</Table.Th>
                  <Table.Th>{t('taxes.rate' as any, language) || 'Rate'}</Table.Th>
                  <Table.Th>{t('taxes.appliesTo' as any, language) || 'Applies To'}</Table.Th>
                  <Table.Th>{t('common.status' as any, language) || 'Status'}</Table.Th>
                  <Table.Th>{t('common.actions' as any, language) || 'Actions'}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pendingTax && (
                  <Table.Tr>
                    <Table.Td>
                      <Group gap="xs">
                        <Loader size="sm" />
                        <Skeleton height={20} width={150} />
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={20} width={100} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={20} width={60} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={20} width={100} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={24} width={80} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={32} width={80} />
                    </Table.Td>
                  </Table.Tr>
                )}
                {taxes.map((tax) => {
                  const isUpdating = updatingTaxId === tax.id;
                  
                  if (isUpdating) {
                    return (
                      <Table.Tr key={tax.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <Loader size="sm" />
                            <Skeleton height={20} width={150} />
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={20} width={100} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={20} width={60} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={20} width={100} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={24} width={80} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={32} width={80} />
                        </Table.Td>
                      </Table.Tr>
                    );
                  }
                  
                  return (
                  <Table.Tr key={tax.id}>
                    <Table.Td>{tax.name}</Table.Td>
                    <Table.Td>{tax.taxCode || '-'}</Table.Td>
                    <Table.Td>{tax.rate}%</Table.Td>
                    <Table.Td>
                      {tax.appliesTo === 'order'
                        ? t('taxes.orderWise' as any, language) || 'Order'
                        : tax.appliesTo === 'category'
                        ? t('taxes.categoryWise' as any, language) || 'Category'
                        : t('taxes.itemWise' as any, language) || 'Item'}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={getBadgeColorForText(tax.isActive
                        ? (t('common.active' as any, language) || 'Active')
                        : (t('common.inactive' as any, language) || 'Inactive'))}>
                        {tax.isActive
                          ? t('common.active' as any, language) || 'Active'
                          : t('common.inactive' as any, language) || 'Inactive'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon
                          variant="light"
                          color={themeColor}
                          onClick={() => handleOpenModal(tax)}
                            disabled={updatingTaxId === tax.id || deletingTaxId === tax.id}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color={primary}
                          onClick={() => setDeletingTax(tax.id)}
                            disabled={updatingTaxId === tax.id || deletingTaxId === tax.id}
                            loading={deletingTaxId === tax.id}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Paper>

        <Modal
          opened={opened}
          onClose={handleCloseModal}
          title={editingTax ? t('taxes.editTax' as any, language) || 'Edit Tax' : t('taxes.addTax' as any, language) || 'Add Tax'}
          size="lg"
          closeOnClickOutside={!submitting}
          closeOnEscape={!submitting}
        >
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <TextInput
                label={t('taxes.name' as any, language) || 'Name'}
                required
                {...form.getInputProps('name')}
              />
              <TextInput
                label={t('taxes.code' as any, language) || 'Tax Code'}
                {...form.getInputProps('taxCode')}
              />
              <NumberInput
                label={t('taxes.rate' as any, language) || 'Rate (%)'}
                required
                min={0}
                max={100}
                decimalScale={2}
                {...form.getInputProps('rate')}
              />
              <Select
                label={t('taxes.appliesTo' as any, language) || 'Applies To'}
                data={[
                  { value: 'order', label: t('taxes.orderWise' as any, language) || 'Order' },
                  { value: 'category', label: t('taxes.categoryWise' as any, language) || 'Category' },
                  { value: 'item', label: t('taxes.itemWise' as any, language) || 'Item' },
                ]}
                {...form.getInputProps('appliesTo')}
              />
              {form.values.appliesTo === 'category' && (
                <MultiSelect
                  label={t('taxes.categories' as any, language) || 'Categories'}
                  data={categories}
                  {...form.getInputProps('categoryIds')}
                />
              )}
              {form.values.appliesTo === 'item' && (
                <MultiSelect
                  label={t('taxes.foodItems' as any, language) || 'Food Items'}
                  data={foodItems}
                  {...form.getInputProps('foodItemIds')}
                />
              )}
              {/* <Switch
                label={t('taxes.applyToDelivery' as any, language) || 'Apply to Delivery Charges'}
                {...form.getInputProps('appliesToDelivery', { type: 'checkbox' })}
              /> */}
              {/* <Switch
                label={t('taxes.applyToServiceCharge' as any, language) || 'Apply to Service Charges'}
                {...form.getInputProps('appliesToServiceCharge', { type: 'checkbox' })}
              /> */}
              <Switch
                label={t('common.active' as any, language) || 'Active'}
                {...form.getInputProps('isActive', { type: 'checkbox' })}
              />
              <Group justify="flex-end" mt="md">
                <Button variant="subtle" onClick={handleCloseModal} disabled={submitting}>
                  {t('common.cancel' as any, language) || 'Cancel'}
                </Button>
                <Button type="submit" style={{ backgroundColor: themeColor }} loading={submitting} disabled={submitting}>
                  {t('common.save' as any, language) || 'Save'}
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>

        <Modal
          opened={!!deletingTax}
          onClose={() => setDeletingTax(null)}
          title={t('taxes.deleteTax' as any, language) || 'Delete Tax'}
        >
          <Stack gap="md">
            <Text>{t('taxes.deleteConfirm' as any, language) || 'Are you sure you want to delete this tax?'}</Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setDeletingTax(null)}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button color={primary} onClick={() => deletingTax && handleDelete(deletingTax)} loading={deletingTaxId === deletingTax} disabled={deletingTaxId === deletingTax}>
                {t('common.delete' as any, language) || 'Delete'}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}

