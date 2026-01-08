'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Progress,
  Loader,
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconUpload, IconToolsKitchen2, IconAlertCircle } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, Category } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor, useInfoColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';
import { handleApiError } from '@/shared/utils/error-handler';
import { TranslationStatusBadge, LanguageIndicator, RetranslateButton } from '@/components/translations';
import { translationsApi, SupportedLanguage } from '@/lib/api/translations';

export function CategoriesPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([]);
  const [categoryTranslations, setCategoryTranslations] = useState<{ [categoryId: string]: { [fieldName: string]: { [languageCode: string]: string } } }>({});

  // Track if any API call is in progress
  const isApiInProgress = loading || submitting || deletingCategoryId !== null;

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
    try {
      setLoading(true);
      setError(null);

      const serverCategoriesResponse = await menuApi.getCategories(undefined, selectedBranchId || undefined, language);
      const serverCategories = Array.isArray(serverCategoriesResponse) ? serverCategoriesResponse : (serverCategoriesResponse?.data || []);
      setCategories(serverCategories);
    } catch (err: any) {
      const errorMsg = handleApiError(err, {
        defaultMessage: 'Failed to load categories',
        language,
        showNotification: false, // Don't show notification for load errors
      });
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language, selectedBranchId]);

  useEffect(() => {
    loadCategories();
    
    // Listen for data updates from other tabs
    const unsubscribe = onMenuDataUpdate('categories-updated', () => {
      loadCategories();
    });
    
    return unsubscribe;
  }, [loadCategories]);

  // Load supported languages and translations
  useEffect(() => {
    const loadTranslationData = async () => {
      try {
        // Load supported languages
        const languages = await translationsApi.getSupportedLanguages(true);
        setSupportedLanguages(languages);

        // Load translations for all categories
        const translationsMap: { [categoryId: string]: { [fieldName: string]: { [languageCode: string]: string } } } = {};
        for (const category of categories) {
          try {
            const translations = await translationsApi.getEntityTranslations('category', category.id);
            translationsMap[category.id] = translations;
          } catch (err) {
            // Ignore errors for individual translations
            console.warn(`Failed to load translations for category ${category.id}:`, err);
          }
        }
        setCategoryTranslations(translationsMap);
      } catch (err) {
        console.warn('Failed to load translation data:', err);
      }
    };

    if (categories.length > 0) {
      loadTranslationData();
    }
  }, [categories]);

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

    // Store file for upload - will be uploaded when form is submitted
    setImageFile(file);
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId || submitting) return;

    try {
      setSubmitting(true);
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
        savedCategory = await menuApi.updateCategory(editingCategory.id, categoryData, language);
        
        // If image was selected during editing, upload it now
        if (imageFile) {
          try {
            const updated = await menuApi.uploadCategoryImage(savedCategory.id, imageFile);
            savedCategory = updated; // Update with image URL
            categoryData.imageUrl = updated.imageUrl;
          } catch (err: any) {
            console.warn('Failed to upload image after category update:', err);
            // Continue even if image upload fails
          }
        }
        

      } else {
        // Create
        savedCategory = await menuApi.createCategory(categoryData, selectedBranchId || undefined);
        
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (category: Category) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        setDeletingCategoryId(category.id);
        try {
          await menuApi.deleteCategory(category.id);


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
        } finally {
          setDeletingCategoryId(null);
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
      {/* Top loader for any API in progress */}
      {isApiInProgress && (
        <Progress value={100} animated color={primaryColor} size="xs" radius={0} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }} />
      )}
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
                      <Group gap="xs" wrap="nowrap">
                        <Text fw={500}>
                          {category.name || ''}
                        </Text>
                        {supportedLanguages.length > 0 && categoryTranslations[category.id] && (
                          <TranslationStatusBadge
                            translations={categoryTranslations[category.id].name || {}}
                            supportedLanguages={supportedLanguages}
                            fieldName="name"
                          />
                        )}
                      </Group>
                      {category.description && (
                        <Text size="sm" c="dimmed">
                          {category.description || ''}
                        </Text>
                      )}
                    </div>
                  </Group>
                  <Group gap="xs" align="center">
                    <Badge color={getBadgeColorForText(category.isActive ? t('menu.active', language) : t('menu.inactive', language))} variant="light">
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
                      disabled={deletingCategoryId !== null}
                    >
                      {deletingCategoryId === category.id ? (
                        <Loader size={16} />
                      ) : (
                        <IconTrash size={16} />
                      )}
                    </ActionIcon>
                  </Group>
                </Group>
                {subcategories.length > 0 && (
                  <Stack gap="xs" mt="md" pl="md" style={{ borderLeft: `2px solid ${primaryColor}20` }}>
                    {subcategories.map((sub) => (
                      <Group key={sub.id} justify="space-between" align="center">
                        <Group align="center" gap="xs">
                          <Text size="sm" c="dimmed">
                            {sub.name || ''}
                          </Text>
                          {supportedLanguages.length > 0 && categoryTranslations[sub.id] && (
                            <TranslationStatusBadge
                              translations={categoryTranslations[sub.id].name || {}}
                              supportedLanguages={supportedLanguages}
                              fieldName="name"
                            />
                          )}
                        </Group>
                        <Group gap="xs" align="center">
                          <Badge color={getBadgeColorForText(sub.isActive ? t('menu.active', language) : t('menu.inactive', language))} variant="light">
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
                            disabled={deletingCategoryId !== null}
                          >
                            {deletingCategoryId === sub.id ? (
                              <Loader size={14} />
                            ) : (
                              <IconTrash size={14} />
                            )}
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
            <Group justify="space-between">
              <Title order={4}>{editingCategory ? t('menu.editCategory', language) : t('menu.createCategory', language)}</Title>
              <Group gap="xs">
                <LanguageIndicator variant="badge" size="sm" />
                {editingCategory && user?.role === 'tenant_owner' && (
                  <RetranslateButton
                    entityType="category"
                    entityId={editingCategory.id}
                    onSuccess={() => {
                      loadCategories();
                      // Reload translations
                      const reloadTranslations = async () => {
                        try {
                          const translations = await translationsApi.getEntityTranslations('category', editingCategory.id);
                          setCategoryTranslations((prev) => ({
                            ...prev,
                            [editingCategory.id]: translations,
                          }));
                        } catch (err) {
                          console.warn('Failed to reload translations:', err);
                        }
                      };
                      reloadTranslations();
                    }}
                    size="sm"
                    variant="light"
                  />
                )}
              </Group>
            </Group>
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
                        variant="outline"
                        style={{ color: primaryColor }}
                        disabled={submitting}
                      >
                        {t('menu.uploadImage', language)}
                      </Button>
                    )}
                  </FileButton>
                </Stack>
              </Grid.Col>
              <Grid.Col span={12}>
                <Switch
                  label={t('menu.active', language)}
                  {...form.getInputProps('isActive', { type: 'checkbox' })}
                  color={form.values.isActive ? successColor : getBadgeColorForText(t('menu.inactive', language) || 'Inactive')}
                />
              </Grid.Col>
            </Grid>

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseModal} disabled={submitting}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }} loading={submitting} disabled={submitting}>
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

