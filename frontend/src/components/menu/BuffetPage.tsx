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
  NumberInput,
  Group,
  ActionIcon,
  Badge,
  Text,
  Paper,
  Skeleton,
  Alert,
  Grid,
  FileButton,
  Image,
  Box,
  MultiSelect,
  Table,
  Textarea,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUpload,
  IconToolsKitchen2,
  IconAlertCircle,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, Buffet, FoodItem } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';

export function BuffetPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<Buffet>({ initialPage: 1, initialLimit: 10 });
  const [buffets, setBuffets] = useState<Buffet[]>([]);
  const [menus, setMenus] = useState<any[]>([]);
  const [selectedMenuFoodItems, setSelectedMenuFoodItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingBuffet, setEditingBuffet] = useState<Buffet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const form = useForm({
    initialValues: {
      name: '',
      description: '',
      pricePerPerson: 0,
      minPersons: undefined as number | undefined,
      duration: undefined as number | undefined,
      menuTypes: [] as string[],
      imageUrl: '',
    },
    validate: {
      name: (value) => (!value ? (t('common.nameRequired', language) || 'Name is required') : null),
      pricePerPerson: (value) => (value <= 0 ? (t('menu.pricePerPersonRequired', language) || 'Price per person must be greater than 0') : null),
      menuTypes: (value) => (value.length === 0 ? (t('menu.menuTypesRequired', language) || 'At least one menu type is required') : null),
    },
  });

  const loadData = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);

      // Load menus for menu type selection
      const menuListResponse = await menuApi.getMenus();
      const menuList = Array.isArray(menuListResponse) ? menuListResponse : (menuListResponse?.data || []);
      setMenus(menuList);

      // Load buffets
      if (navigator.onLine) {
        try {
          const serverResponse = await menuApi.getBuffets(pagination.paginationParams);
          const serverBuffets = pagination.extractData(serverResponse);
          pagination.extractPagination(serverResponse);
          setBuffets(serverBuffets);
        } catch (err) {
          console.warn('Failed to load buffets from server:', err);
          setBuffets([]);
        }
      } else {
        setBuffets([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId, pagination]);

  useEffect(() => {
    loadData();

    const unsubscribe = onMenuDataUpdate('buffets-updated', () => {
      loadData();
    });

    return () => {
      unsubscribe();
    };
  }, [loadData, pagination.page, pagination.limit]);

  const getMenuName = (menuType: string): string => {
    const menu = menus.find((m) => m.menuType === menuType);
    if (menu) {
      return menu.name || menu.menuType;
    }

    const menuTypeLabels: Record<string, string> = {
      all_day: t('menu.allDay', language),
      breakfast: t('menu.breakfast', language),
      lunch: t('menu.lunch', language),
      dinner: t('menu.dinner', language),
      kids_special: t('menu.kidsSpecial', language),
    };

    return menuTypeLabels[menuType] || menuType;
  };

  const loadFoodItemsFromMenus = async (menuTypes: string[]) => {
    if (menuTypes.length === 0) {
      setSelectedMenuFoodItems([]);
      return;
    }

    try {
      const allItems: FoodItem[] = [];
      for (const menuType of menuTypes) {
        const itemsResponse = await menuApi.getMenuItems(menuType);
        // getMenuItems returns string[] (food item IDs), so we need to fetch the actual items
        const items = await Promise.all(
          itemsResponse.map(async (itemId) => {
            try {
              return await menuApi.getFoodItemById(itemId);
            } catch {
              return null;
            }
          })
        );
        allItems.push(...items.filter((item): item is FoodItem => item !== null && item.isActive));
      }
      // Remove duplicates
      const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());
      setSelectedMenuFoodItems(uniqueItems);
    } catch (error) {
      console.error('Failed to load food items from menus:', error);
      setSelectedMenuFoodItems([]);
    }
  };

  const handleOpenModal = async (buffet?: Buffet) => {
    if (buffet) {
      setEditingBuffet(buffet);
      const menuTypes = buffet.menuTypes || [];
      form.setValues({
        name: buffet.name,
        description: buffet.description || '',
        pricePerPerson: buffet.pricePerPerson,
        minPersons: buffet.minPersons,
        duration: buffet.duration,
        menuTypes: menuTypes,
        imageUrl: buffet.imageUrl || '',
      });
      setImagePreview(buffet.imageUrl || null);
      await loadFoodItemsFromMenus(menuTypes);
    } else {
      setEditingBuffet(null);
      form.reset();
      setImagePreview(null);
      setSelectedMenuFoodItems([]);
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    setOpened(false);
    setEditingBuffet(null);
    form.reset();
    setImagePreview(null);
    setImageFile(null);
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
    setImageFile(file);

    if (editingBuffet) {
      try {
        setUploadingImage(true);
        const updated = await menuApi.uploadBuffetImage(editingBuffet.id, file);
        form.setFieldValue('imageUrl', updated.imageUrl || '');
        setImagePreview(updated.imageUrl || null);
        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: 'Image uploaded successfully',
          color: successColor,
        });
        loadData();
        notifyMenuDataUpdate('buffets-updated');
      } catch (err: any) {
        notifications.show({
          title: t('common.error' as any, language) || 'Error',
          message: err.message || 'Failed to upload image',
          color: errorColor,
        });
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    const wasEditing = !!editingBuffet;
    const currentEditingBuffet = editingBuffet;
    const currentImageFile = imageFile;
    handleCloseModal();

    (async () => {
      try {
        const buffetData = {
          name: values.name,
          description: values.description || undefined,
          pricePerPerson: values.pricePerPerson,
          minPersons: values.minPersons,
          duration: values.duration,
          menuTypes: values.menuTypes,
          imageUrl: values.imageUrl || undefined,
        };

        let savedBuffet: Buffet;

        if (wasEditing && currentEditingBuffet) {
          savedBuffet = await menuApi.updateBuffet(currentEditingBuffet.id, buffetData);
        } else {
          savedBuffet = await menuApi.createBuffet(buffetData);

          if (currentImageFile) {
            try {
              const updated = await menuApi.uploadBuffetImage(savedBuffet.id, currentImageFile);
              savedBuffet = updated;
            } catch (err) {
              console.warn('Failed to upload image after buffet creation:', err);
            }
          }
        }

        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.saveSuccess', language),
          color: successColor,
        });

        loadData();
        notifyMenuDataUpdate('buffets-updated');
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to save buffet';
        notifications.show({
          title: t('common.error' as any, language) || 'Error',
          message: errorMsg,
          color: errorColor,
        });
      }
    })();
  };

  const handleDelete = (buffet: Buffet) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteBuffetConfirm', language) || 'Are you sure you want to delete this buffet?'}</Text>,
      labels: {
        confirm: t('common.delete' as any, language) || 'Delete',
        cancel: t('common.cancel' as any, language) || 'Cancel',
      },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await menuApi.deleteBuffet(buffet.id);
        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.deleteSuccess', language),
          color: successColor,
        });
          loadData();
          notifyMenuDataUpdate('buffets-updated');
        } catch (err: any) {
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || 'Failed to delete buffet',
            color: errorColor,
          });
        }
      },
    });
  };

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>{t('menu.buffetManagement', language)}</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => handleOpenModal()}
          style={{ backgroundColor: primaryColor }}
        >
          {t('menu.createBuffet', language)}
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      {loading ? (
        <Paper withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('common.name', language)}</Table.Th>
                <Table.Th>{t('menu.pricePerPerson', language)}</Table.Th>
                <Table.Th>{t('menu.capacity', language)}</Table.Th>
                <Table.Th>{t('menu.menuTypes', language)}</Table.Th>
                <Table.Th>{t('menu.active', language)}</Table.Th>
                <Table.Th>{t('common.actions', language)}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <Table.Tr key={i}>
                  <Table.Td>
                    <Group gap="sm">
                      <Skeleton height={40} width={40} radius="md" />
                      <Skeleton height={16} width={150} />
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={16} width={80} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={16} width={80} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={24} width={80} radius="xl" />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={24} width={60} radius="xl" />
                  </Table.Td>
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
      ) : buffets.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text ta="center" c="dimmed">
            {t('menu.noBuffetsFound', language) || 'No buffets found. Create your first buffet to get started.'}
          </Text>
        </Paper>
      ) : (
        <>
          <Paper withBorder>
            <Table.ScrollContainer minWidth={1000}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ minWidth: 250 }}>{t('common.name', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 120 }}>{t('menu.pricePerPerson', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 100 }}>{t('menu.capacity', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 180 }}>{t('menu.menuTypes', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 90 }}>{t('menu.active', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 100 }}>{t('menu.actions', language)}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {buffets.map((buffet) => (
                    <Table.Tr key={buffet.id}>
                      <Table.Td style={{ maxWidth: 300 }}>
                        <Group gap="sm" wrap="nowrap">
                          {buffet.imageUrl ? (
                            <Image
                              src={buffet.imageUrl}
                              alt={buffet.name}
                              width={40}
                              height={40}
                              radius="sm"
                              fit="cover"
                              style={{ flexShrink: 0 }}
                            />
                          ) : (
                            <Box
                              w={40}
                              h={40}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: `${primaryColor}15`,
                                borderRadius: '4px',
                                flexShrink: 0,
                              }}
                            >
                              <IconToolsKitchen2 size={20} color={primaryColor} />
                            </Box>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <Text fw={500} truncate>
                              {buffet.name}
                            </Text>
                            {buffet.description && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {buffet.description}
                              </Text>
                            )}
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={500}>{buffet.pricePerPerson.toFixed(2)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {t('menu.unlimited', language) || 'Unlimited'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {buffet.menuTypes && buffet.menuTypes.length > 0 ? (
                          <Group gap={4} wrap="wrap" style={{ maxWidth: 200 }}>
                            {buffet.menuTypes.map((menuType) => (
                              <Badge key={menuType} variant="light" size="sm" style={{ color: primaryColor }}>
                                {getMenuName(menuType)}
                              </Badge>
                            ))}
                          </Group>
                        ) : (
                          <Text c="dimmed" size="sm">
                            -
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={buffet.isActive ? successColor : 'gray'} size="sm">
                          {buffet.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <ActionIcon
                            variant="light"
                            onClick={() => handleOpenModal(buffet)}
                            style={{ color: primaryColor }}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon variant="light" color={errorColor} onClick={() => handleDelete(buffet)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
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
        </>
      )}

      <Modal opened={opened} onClose={handleCloseModal} title={editingBuffet ? t('menu.editBuffet', language) : t('menu.createBuffet', language)} size="xl">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={12}>
                <TextInput label={t('menu.buffetName', language)} required {...form.getInputProps('name')} />
              </Grid.Col>
              <Grid.Col span={12}>
                <Textarea label={t('menu.description', language)} {...form.getInputProps('description')} />
              </Grid.Col>
              <Grid.Col span={12}>
                <MultiSelect
                  label={t('menu.menuTypes', language)}
                  required
                  placeholder={t('menu.selectMenuTypes', language)}
                  description={t('menu.availableFoodItemsDescription', language)}
                  data={menus.map((menu) => ({
                    value: menu.menuType,
                    label: menu.name || menu.menuType,
                  }))}
                  {...form.getInputProps('menuTypes')}
                  searchable
                  onChange={(value) => {
                    form.setFieldValue('menuTypes', value);
                    loadFoodItemsFromMenus(value);
                  }}
                />
              </Grid.Col>
              {selectedMenuFoodItems.length > 0 && (
                <Grid.Col span={12}>
                  <Paper p="md" withBorder>
                    <Text size="sm" fw={500} mb="xs">
                      {t('menu.availableFoodItems', language)} ({selectedMenuFoodItems.length} {t('menu.items', language) || 'items'})
                    </Text>
                    <Text size="xs" c="dimmed">
                      {selectedMenuFoodItems.slice(0, 10).map((item) => item.name).join(', ')}
                      {selectedMenuFoodItems.length > 10 && ` ${t('common.and', language) || 'and'} ${selectedMenuFoodItems.length - 10} ${t('common.more', language) || 'more'}...`}
                    </Text>
                  </Paper>
                </Grid.Col>
              )}
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={t('menu.pricePerPerson', language)}
                  required
                  min={0.01}
                  decimalScale={2}
                  description={t('menu.pricePerPersonDescription', language)}
                  {...form.getInputProps('pricePerPerson')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <NumberInput
                  label={`${t('menu.duration', language)} (${t('menu.minutes', language)}, ${t('common.optional', language)})`}
                  min={1}
                  description={t('menu.durationDescription', language)}
                  {...form.getInputProps('duration')}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <Stack gap="xs">
                  <Text size="sm" fw={500}>
                    {t('menu.image', language)}
                  </Text>
                  <Box
                    w={150}
                    h={150}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: `${primaryColor}10`,
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: `1px solid ${primaryColor}20`,
                    }}
                  >
                    {imagePreview ? (
                      <Image
                        src={imagePreview}
                        alt="Preview"
                        width={150}
                        height={150}
                        fit="cover"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <IconToolsKitchen2 size={48} color={primaryColor} opacity={0.5} />
                    )}
                  </Box>
                  <FileButton onChange={handleImageUpload} accept="image/png,image/jpeg,image/jpg,image/webp">
                    {(props) => (
                      <Button
                        {...props}
                        leftSection={<IconUpload size={16} />}
                        loading={uploadingImage && !!editingBuffet}
                        variant="outline"
                        style={{ color: primaryColor }}
                      >
                        {t('menu.uploadImage', language)}
                      </Button>
                    )}
                  </FileButton>
                </Stack>
              </Grid.Col>
            </Grid>

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseModal}>
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
