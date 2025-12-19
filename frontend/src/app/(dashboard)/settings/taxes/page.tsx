'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { taxesApi, Tax, CreateTaxDto } from '@/lib/api/taxes';
import { menuApi } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor, getBadgeColorForText } from '@/lib/utils/theme';
import { db } from '@/lib/indexeddb/database';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { isPaginatedResponse } from '@/lib/types/pagination.types';

export default function TaxesPage() {
  const language = useLanguageStore((state) => state.language);
  const themeColor = useThemeColor();
  const { isOnline } = useSyncStatus();
  const [loading, setLoading] = useState(true);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [foodItems, setFoodItems] = useState<Array<{ value: string; label: string }>>([]);
  const [opened, setOpened] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [deletingTax, setDeletingTax] = useState<string | null>(null);
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
    try {
      setLoading(true);
      let data: Tax[];
      if (isOnline) {
        data = await taxesApi.getTaxes();
        // Cache in IndexedDB
        for (const tax of data) {
          await db.taxes.put({
            id: tax.id,
            tenantId: tax.tenantId,
            name: tax.name,
            taxCode: tax.taxCode,
            rate: tax.rate,
            isActive: tax.isActive,
            appliesTo: tax.appliesTo,
            appliesToDelivery: tax.appliesToDelivery,
            appliesToServiceCharge: tax.appliesToServiceCharge,
            categoryIds: tax.categoryIds || [],
            foodItemIds: tax.foodItemIds || [],
            createdAt: tax.createdAt,
            updatedAt: tax.updatedAt,
            syncStatus: 'synced',
          });
        }
      } else {
        const cached = await db.taxes.toArray();
        data = cached.map((tax) => ({
          id: tax.id,
          tenantId: tax.tenantId,
          name: tax.name,
          taxCode: tax.taxCode,
          rate: tax.rate,
          isActive: tax.isActive,
          appliesTo: tax.appliesTo,
          appliesToDelivery: tax.appliesToDelivery,
          appliesToServiceCharge: tax.appliesToServiceCharge,
          categoryIds: tax.categoryIds || [],
          foodItemIds: tax.foodItemIds || [],
          createdAt: tax.createdAt,
          updatedAt: tax.updatedAt,
        }));
      }
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
  }, [isOnline, language]);

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
    setOpened(false);
    setEditingTax(null);
    form.reset();
  };

  const handleSubmit = async (values: typeof form.values) => {
    try {
      if (editingTax) {
        await taxesApi.updateTax(editingTax.id, values);
        notifications.show({
          title: t('common.success' as any, language),
          message: t('taxes.updated' as any, language) || 'Tax updated successfully',
          color: getSuccessColor(),
          icon: <IconCheck size={16} />,
        });
      } else {
        await taxesApi.createTax(values);
        notifications.show({
          title: t('common.success' as any, language),
          message: t('taxes.created' as any, language) || 'Tax created successfully',
          color: getSuccessColor(),
          icon: <IconCheck size={16} />,
        });
      }
      handleCloseModal();
      loadTaxes();
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('taxes.saveError' as any, language) || 'Failed to save tax',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    }
  };

  const handleDelete = async (id: string) => {
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
    }
  };

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
                {taxes.map((tax) => (
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
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color={primary}
                          onClick={() => setDeletingTax(tax.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>

        <Modal
          opened={opened}
          onClose={handleCloseModal}
          title={editingTax ? t('taxes.editTax' as any, language) || 'Edit Tax' : t('taxes.addTax' as any, language) || 'Add Tax'}
          size="lg"
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
                <Button variant="subtle" onClick={handleCloseModal}>
                  {t('common.cancel' as any, language) || 'Cancel'}
                </Button>
                <Button type="submit" style={{ backgroundColor: themeColor }}>
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
              <Button color={primary} onClick={() => deletingTax && handleDelete(deletingTax)}>
                {t('common.delete' as any, language) || 'Delete'}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}

