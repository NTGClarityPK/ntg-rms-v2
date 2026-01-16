'use client';

import { useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
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
  Loader,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUpload,
  IconToolsKitchen2,
  IconAlertCircle,
  IconFileSpreadsheet,
  IconDownload,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, Buffet, FoodItem } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { BulkImportModal } from '@/components/common/BulkImportModal';
import { handleApiError } from '@/shared/utils/error-handler';

export function BuffetPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<Buffet>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [buffets, setBuffets] = useState<Buffet[]>([]);
  const [menus, setMenus] = useState<any[]>([]);
  const [selectedMenuFoodItems, setSelectedMenuFoodItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [opened, setOpened] = useState(false);
  const [editingBuffet, setEditingBuffet] = useState<Buffet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingBuffet, setPendingBuffet] = useState<Partial<Buffet> | null>(null);
  const [updatingBuffetId, setUpdatingBuffetId] = useState<string | null>(null);
  const [deletingBuffetId, setDeletingBuffetId] = useState<string | null>(null);
  const [bulkImportOpened, setBulkImportOpened] = useState(false);

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

      // Load menus for menu type selection (with branch filter)
      const menuListResponse = await menuApi.getMenus(undefined, selectedBranchId || undefined, language);
      const menuList = Array.isArray(menuListResponse) ? menuListResponse : (menuListResponse?.data || []);
      setMenus(menuList);

      // Load buffets
      if (navigator.onLine) {
        try {
          const serverResponse = await menuApi.getBuffets(pagination.paginationParams, selectedBranchId || undefined, language);
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
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, selectedBranchId, language, pagination.page, pagination.limit]);

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
    // Always use the menu name from backend if available
    if (menu && menu.name) {
      return menu.name;
    }
    // Only fallback to menuType if no name is available
    return menuType;
  };

  const loadFoodItemsFromMenus = async (menuTypes: string[]) => {
    if (menuTypes.length === 0) {
      setSelectedMenuFoodItems([]);
      return;
    }

    try {
      // Get menu item IDs for all selected menu types in ONE API call (much faster!)
      const menuItemsMap = await menuApi.getMenuItemsForTypes(menuTypes, selectedBranchId || undefined);
      
      // Collect all unique food item IDs from all menu types
      const menuItemIds = new Set<string>();
      Object.values(menuItemsMap).forEach(itemIds => {
        itemIds.forEach(id => menuItemIds.add(id));
      });
      
      if (menuItemIds.size === 0) {
        setSelectedMenuFoodItems([]);
        return;
      }
      
      // Get all food items for the branch at once
      const itemsResponse = await menuApi.getFoodItems(undefined, undefined, undefined, false, selectedBranchId || undefined);
      const allFoodItems = Array.isArray(itemsResponse) ? itemsResponse : (itemsResponse?.data || []);
      
      // Filter food items that are in the selected menus
      const filteredItems = allFoodItems.filter(item => menuItemIds.has(item.id));
      setSelectedMenuFoodItems(filteredItems);
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
    if (!user?.tenantId || submitting) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmitting(true);
    });

    const wasEditing = !!editingBuffet;
    const currentEditingBuffet = editingBuffet;
    const currentEditingBuffetId = editingBuffet?.id;
    const currentImageFile = imageFile;

    // Close modal immediately
    handleCloseModal();

    // If editing, track which buffet is being updated to show skeleton
    if (wasEditing && currentEditingBuffetId) {
      setUpdatingBuffetId(currentEditingBuffetId);
    }

    // If creating a new buffet, add a skeleton item to show progress
    if (!wasEditing) {
      setPendingBuffet({
        id: `pending-${Date.now()}`,
        name: values.name,
        description: values.description,
        pricePerPerson: values.pricePerPerson,
        minPersons: values.minPersons,
        duration: values.duration,
        menuTypes: values.menuTypes,
        imageUrl: values.imageUrl || undefined,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

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
        savedBuffet = await menuApi.createBuffet(buffetData, selectedBranchId || undefined);

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

      // Remove pending buffet skeleton and updating state
      setPendingBuffet(null);
      setUpdatingBuffetId(null);

      loadData();
      notifyMenuDataUpdate('buffets-updated');
    } catch (err: any) {
      handleApiError(err, {
        defaultMessage: 'Failed to save buffet',
        language,
        errorColor,
        showNotification: true,
      });
      
      // Remove pending buffet skeleton and updating state on error
      setPendingBuffet(null);
      setUpdatingBuffetId(null);
    } finally {
      setSubmitting(false);
    }
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
        setDeletingBuffetId(buffet.id);
        try {
          await menuApi.deleteBuffet(buffet.id);
        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.deleteSuccess', language),
          color: successColor,
        });
          setDeletingBuffetId(null);
          loadData();
          notifyMenuDataUpdate('buffets-updated');
        } catch (err: any) {
          setDeletingBuffetId(null);
          handleApiError(err, {
            defaultMessage: 'Failed to delete buffet',
            language,
            errorColor,
            showNotification: true,
          });
        }
      },
    });
  };

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>{t('menu.buffetManagement', language)}</Title>
        <Group gap="xs">
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={async () => {
              try {
                setExportLoading(true);
                const blob = await menuApi.exportEntities('buffet', selectedBranchId || undefined, language);
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `buffets-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                notifications.show({
                  title: t('common.success' as any, language) || 'Success',
                  message: t('bulkImport.exportSuccess', language) || 'Data exported successfully',
                  color: notificationColors.success,
                });
              } catch (error: any) {
                handleApiError(error, {
                  defaultMessage: 'Failed to export buffets',
                  language,
                  errorColor: notificationColors.error,
                });
              } finally {
                setExportLoading(false);
              }
            }}
            loading={exportLoading}
            variant="light"
          >
            {t('bulkImport.export', language) || 'Export'}
          </Button>
          <Button
            leftSection={<IconFileSpreadsheet size={16} />}
            onClick={() => setBulkImportOpened(true)}
            variant="light"
          >
            {t('bulkImport.bulkImport', language) || 'Bulk Import'}
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => handleOpenModal()}
            style={{ backgroundColor: primaryColor }}
          >
            {t('menu.createBuffet', language)}
          </Button>
        </Group>
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
                  {/* Show pending buffet skeleton when creating */}
                  {pendingBuffet && !editingBuffet && (
                    <Table.Tr key={pendingBuffet.id} style={{ opacity: 0.7, position: 'relative' }}>
                      <Table.Td style={{ maxWidth: 300 }}>
                        <Group gap="sm" wrap="nowrap">
                          <Skeleton height={40} width={40} radius="md" />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <Group gap="xs" wrap="nowrap">
                              <Skeleton height={16} width={150} />
                              <Loader size={16} style={{ flexShrink: 0 }} />
                            </Group>
                            <Skeleton height={12} width={200} mt={4} />
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Skeleton height={16} width={80} />
                      </Table.Td>
                      <Table.Td>
                        <Skeleton height={16} width={80} />
                      </Table.Td>
                      <Table.Td>
                        <Skeleton height={24} width={120} radius="xl" />
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
                  {buffets.map((buffet) => {
                    const isUpdating = updatingBuffetId === buffet.id;
                    return (
                      <Table.Tr key={buffet.id} style={{ opacity: isUpdating ? 0.7 : 1, position: 'relative' }}>
                        {isUpdating ? (
                          <>
                            <Table.Td style={{ maxWidth: 300 }}>
                              <Group gap="sm" wrap="nowrap">
                                <Skeleton height={40} width={40} radius="md" />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <Group gap="xs" wrap="nowrap">
                                    <Skeleton height={16} width={150} />
                                    <Loader size={16} style={{ flexShrink: 0 }} />
                                  </Group>
                                  <Skeleton height={12} width={200} mt={4} />
                                </div>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={16} width={80} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={16} width={80} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={24} width={120} radius="xl" />
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
                            <Table.Td style={{ maxWidth: 300 }}>
                              <Group gap="sm" wrap="nowrap">
                                {buffet.imageUrl ? (
                                  <Box
                            w={40}
                            h={40}
                            style={{
                              flexShrink: 0,
                              borderRadius: 'var(--mantine-radius-sm)',
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Image
                              src={buffet.imageUrl}
                              alt={buffet.name}
                              width={40}
                              height={40}
                              fit="cover"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center',
                              }}
                            />
                          </Box>
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
                              <Badge 
                                variant="light" 
                                color={buffet.isActive ? successColor : getBadgeColorForText(t('menu.inactive', language) || 'Inactive')} 
                                size="sm"
                              >
                                {buffet.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs" wrap="nowrap">
                                <ActionIcon
                                  variant="light"
                                  onClick={() => handleOpenModal(buffet)}
                                  style={{ color: primaryColor }}
                                  disabled={deletingBuffetId === buffet.id || updatingBuffetId === buffet.id}
                                >
                                  <IconEdit size={16} />
                                </ActionIcon>
                                <ActionIcon 
                                  variant="light" 
                                  color={errorColor} 
                                  onClick={() => handleDelete(buffet)}
                                  disabled={deletingBuffetId === buffet.id || updatingBuffetId === buffet.id}
                                >
                                  {deletingBuffetId === buffet.id ? (
                                    <Loader size={16} />
                                  ) : (
                                    <IconTrash size={16} />
                                  )}
                                </ActionIcon>
                              </Group>
                            </Table.Td>
                          </>
                        )}
                      </Table.Tr>
                    );
                  })}
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

      <Modal 
        opened={opened} 
        onClose={() => {
          if (!submitting) {
            handleCloseModal();
          }
        }}
        title={editingBuffet ? t('menu.editBuffet', language) : t('menu.createBuffet', language)} 
        size="xl"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
      >
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
              <Button 
                type="submit" 
                style={{ backgroundColor: primaryColor }}
                loading={submitting}
                disabled={submitting}
              >
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <BulkImportModal
        opened={bulkImportOpened}
        onClose={() => setBulkImportOpened(false)}
        onSuccess={() => {
          loadData();
          notifyMenuDataUpdate('buffets-updated');
        }}
        entityType="buffet"
        entityName={t('menu.buffets', language) || 'Buffets'}
        downloadSample={async () => {
          return await menuApi.downloadBulkImportSample('buffet', language);
        }}
        uploadFile={async (file: File) => {
          return await menuApi.bulkImportBuffets(file, selectedBranchId || undefined);
        }}
      />
    </Container>
  );
}

