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
  FileButton,
  Image,
  Box,
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconUpload, IconToolsKitchen2, IconAlertCircle } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, Category } from '@/lib/api/menu';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor, useInfoColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';

export function CategoriesPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const infoColor = useInfoColor();
  const primaryColor = useThemeColor();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const form = useForm({
    initialValues: {
      name: '',
      description: '',
      categoryType: 'food',
      parentId: '',
      imageUrl: '',
      isActive: true,
    },
    validate: {
      name: (value) => (!value ? (t('menu.categoryName', language) || 'Name') + ' is required' : null),
    },
  });

  const loadCategories = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      // Load from IndexedDB first
      const localCategories = await db.categories
        .where('tenantId')
        .equals(user.tenantId)
        .filter((cat) => !cat.deletedAt)
        .toArray();

      setCategories(localCategories.map((cat) => ({
        id: cat.id,
        name: (cat as any).name || (cat as any).nameEn || (cat as any).nameAr || '',
        description: (cat as any).description || (cat as any).descriptionEn || (cat as any).descriptionAr || '',
        imageUrl: cat.imageUrl,
        categoryType: cat.categoryType,
        parentId: cat.parentId,
        displayOrder: cat.displayOrder,
        isActive: cat.isActive,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
        subcategories: [],
      })));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverCategories = await menuApi.getCategories();
          setCategories(serverCategories);

          // Update IndexedDB
          for (const cat of serverCategories) {
            await db.categories.put({
              id: cat.id,
              tenantId: user.tenantId,
              name: cat.name,
              description: cat.description,
              imageUrl: cat.imageUrl,
              categoryType: cat.categoryType,
              parentId: cat.parentId,
              displayOrder: cat.displayOrder,
              isActive: cat.isActive,
              createdAt: cat.createdAt,
              updatedAt: cat.updatedAt,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            } as any);
          }
        } catch (err: any) {
          console.warn('Failed to sync categories from server:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language]);

  useEffect(() => {
    loadCategories();
    
    // Listen for data updates from other tabs
    const unsubscribe = onMenuDataUpdate('categories-updated', () => {
      loadCategories();
    });
    
    return unsubscribe;
  }, [loadCategories]);

  const handleOpenModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      form.setValues({
        name: category.name || (category as any).nameEn || (category as any).nameAr || '',
        description: category.description || (category as any).descriptionEn || (category as any).descriptionAr || '',
        categoryType: category.categoryType,
        parentId: category.parentId || '',
        imageUrl: category.imageUrl || '',
        isActive: category.isActive,
      });
      setImagePreview(category.imageUrl || null);
    } else {
      setEditingCategory(null);
      form.reset();
      setImagePreview(null);
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    setOpened(false);
    setEditingCategory(null);
    form.reset();
    setImagePreview(null);
    setImageFile(null);
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);

    // Store file for upload
    setImageFile(file);

    // If editing existing category, upload immediately
    if (editingCategory) {
      try {
        setUploadingImage(true);
        const updated = await menuApi.uploadCategoryImage(editingCategory.id, file);
        
        // Update IndexedDB
        await db.categories.update(editingCategory.id, {
          imageUrl: updated.imageUrl,
          updatedAt: new Date().toISOString(),
        });

        form.setFieldValue('imageUrl', updated.imageUrl || '');
        setImagePreview(updated.imageUrl || null);
        
        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.uploadSuccess', language),
          color: successColor,
        });

        loadCategories();
        // Notify other tabs that categories have been updated
        notifyMenuDataUpdate('categories-updated');
        // Also notify food items tab since it depends on categories
        notifyMenuDataUpdate('food-items-updated');
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
    // If creating, the image will be uploaded after category creation in handleSubmit
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    try {
      setError(null);

      const categoryData = {
        name: values.name,
        description: values.description || undefined,
        categoryType: values.categoryType,
        parentId: values.parentId || undefined,
        imageUrl: values.imageUrl || undefined,
        isActive: values.isActive,
      };

      let savedCategory: Category;

      if (editingCategory) {
        // Update
        savedCategory = await menuApi.updateCategory(editingCategory.id, categoryData);
        
        // Update IndexedDB
        await db.categories.update(editingCategory.id, {
          ...categoryData,
          updatedAt: new Date().toISOString(),
          lastSynced: new Date().toISOString(),
          syncStatus: 'synced',
        });

        // Queue sync
        await syncService.queueChange('categories', 'UPDATE', editingCategory.id, savedCategory);
      } else {
        // Create
        savedCategory = await menuApi.createCategory(categoryData);
        
        // If image was selected during creation, upload it now
        if (imageFile) {
          try {
            const updated = await menuApi.uploadCategoryImage(savedCategory.id, imageFile);
            savedCategory = updated; // Update with image URL
            categoryData.imageUrl = updated.imageUrl;
          } catch (err: any) {
            console.warn('Failed to upload image after category creation:', err);
            // Continue even if image upload fails
          }
        }
        
        // Save to IndexedDB
        await db.categories.add({
          id: savedCategory.id,
          tenantId: user.tenantId,
          ...categoryData,
          imageUrl: savedCategory.imageUrl,
          displayOrder: savedCategory.displayOrder,
          isActive: savedCategory.isActive,
          createdAt: savedCategory.createdAt,
          updatedAt: savedCategory.updatedAt,
          lastSynced: new Date().toISOString(),
          syncStatus: 'synced',
        } as any);

        // Queue sync
        await syncService.queueChange('categories', 'CREATE', savedCategory.id, savedCategory);
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('menu.saveSuccess', language),
        color: successColor,
      });

      handleCloseModal();
      loadCategories();
      // Notify other tabs that categories have been updated
      notifyMenuDataUpdate('categories-updated');
      // Also notify food items tab since it depends on categories
      notifyMenuDataUpdate('food-items-updated');
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to save category';
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
    }
  };

  const handleDelete = (category: Category) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await menuApi.deleteCategory(category.id);
          
          // Update IndexedDB (soft delete)
          await db.categories.update(category.id, {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Queue sync
          await syncService.queueChange('categories', 'DELETE', category.id, category);

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          loadCategories();
          // Notify other tabs that categories have been updated
          notifyMenuDataUpdate('categories-updated');
          // Also notify food items tab since it depends on categories
          notifyMenuDataUpdate('food-items-updated');
        } catch (err: any) {
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: err.message || 'Failed to delete category',
            color: errorColor,
          });
        }
      },
    });
  };

  // Get root categories (no parent) and their subcategories
  const rootCategories = categories.filter((cat) => !cat.parentId);
  const getSubcategories = (parentId: string) => {
    return categories.filter((cat) => cat.parentId === parentId);
  };

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => handleOpenModal()}
          style={{ backgroundColor: primaryColor }}
        >
          {t('menu.createCategory', language)}
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack gap="md">
          {[1, 2, 3].map((i) => (
            <Paper key={i} p="md" withBorder>
              <Group justify="space-between" align="center" mb="sm">
                <Group align="center">
                  <Skeleton height={80} width={80} radius="md" />
                  <div>
                    <Skeleton height={20} width={200} mb="xs" />
                    <Skeleton height={16} width={300} />
                  </div>
                </Group>
                <Group gap="xs">
                  <Skeleton height={24} width={60} radius="xl" />
                  <Skeleton height={32} width={32} radius="md" />
                  <Skeleton height={32} width={32} radius="md" />
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : rootCategories.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text ta="center" c="dimmed">
            {t('menu.noCategories', language)}
          </Text>
        </Paper>
      ) : (
        <Stack gap="md">
          {rootCategories.map((category) => {
            const subcategories = getSubcategories(category.id);
            return (
              <Paper key={category.id} p="md" withBorder>
                <Group justify="space-between" align="center" mb="sm">
                  <Group align="center">
                    <Box
                      w={80}
                      h={80}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: `${primaryColor}10`,
                        borderRadius: '8px',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {category.imageUrl ? (
                        <Image
                          src={category.imageUrl}
                          alt={category.name || ''}
                          width={80}
                          height={80}
                          fit="cover"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <IconToolsKitchen2 size={32} color={primaryColor} />
                      )}
                    </Box>
                    <div>
                      <Text fw={500}>
                        {category.name || ''}
                      </Text>
                      {category.description && (
                        <Text size="sm" c="dimmed">
                          {category.description || ''}
                        </Text>
                      )}
                    </div>
                  </Group>
                  <Group gap="xs" align="center">
                    <Badge color={category.isActive ? successColor : 'gray'} variant="light">
                      {category.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                    </Badge>
                    <ActionIcon
                      variant="light"
                      onClick={() => handleOpenModal(category)}
                      style={{ color: primaryColor }}
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="light"
                      color={errorColor}
                      onClick={() => handleDelete(category)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
                {subcategories.length > 0 && (
                  <Stack gap="xs" mt="md" pl="md" style={{ borderLeft: `2px solid ${primaryColor}20` }}>
                    {subcategories.map((sub) => (
                      <Group key={sub.id} justify="space-between" align="center">
                        <Group align="center">
                          <Text size="sm" c="dimmed">
                            {sub.name || ''}
                          </Text>
                        </Group>
                        <Group gap="xs" align="center">
                          <Badge color={sub.isActive ? successColor : 'gray'} variant="light">
                            {sub.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                          </Badge>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            onClick={() => handleOpenModal(sub)}
                            style={{ color: primaryColor }}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color={errorColor}
                            onClick={() => handleDelete(sub)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Paper>
            );
          })}
        </Stack>
      )}

      <Modal
        opened={opened}
        onClose={handleCloseModal}
        title={editingCategory ? t('menu.editCategory', language) : t('menu.createCategory', language)}
        size="lg"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={12}>
                <TextInput
                  label={t('menu.categoryName', language) || 'Name'}
                  required
                  {...form.getInputProps('name')}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput
                  label={t('menu.description', language) || 'Description'}
                  {...form.getInputProps('description')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label={t('menu.categoryType', language)}
                  data={[
                    { value: 'food', label: t('menu.food', language) },
                    { value: 'beverage', label: t('menu.beverage', language) },
                    { value: 'dessert', label: t('menu.dessert', language) },
                  ]}
                  {...form.getInputProps('categoryType')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label={t('menu.parentCategory', language)}
                  data={[
                    { value: '', label: t('menu.noParent', language) },
                    ...rootCategories
                      .filter((cat) => !editingCategory || cat.id !== editingCategory.id)
                      .map((cat) => ({
                        value: cat.id,
                        label: cat.name || '',
                      })),
                  ]}
                  {...form.getInputProps('parentId')}
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
                  <FileButton
                    onChange={handleImageUpload}
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                  >
                    {(props) => (
                      <Button
                        {...props}
                        leftSection={<IconUpload size={16} />}
                        loading={uploadingImage && !!editingCategory}
                        variant="outline"
                        style={{ color: primaryColor }}
                      >
                        {editingCategory ? t('menu.uploadImage', language) : t('menu.uploadImage', language)}
                      </Button>
                    )}
                  </FileButton>
                </Stack>
              </Grid.Col>
              <Grid.Col span={12}>
                <Switch
                  label={t('menu.active', language)}
                  {...form.getInputProps('isActive', { type: 'checkbox' })}
                  color={form.values.isActive ? successColor : 'gray'}
                />
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
    </Stack>
  );
}

