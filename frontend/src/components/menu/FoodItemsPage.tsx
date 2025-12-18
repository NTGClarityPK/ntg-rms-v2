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
  NumberInput,
  Stepper,
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
  IconCheck,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, FoodItem, FoodItemVariation, FoodItemDiscount } from '@/lib/api/menu';
import { Category } from '@/lib/api/menu';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';

export function FoodItemsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addOnGroups, setAddOnGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [shouldSubmit, setShouldSubmit] = useState(false);

  const form = useForm({
    initialValues: {
      name: '',
      description: '',
      categoryId: '',
      basePrice: 0,
      stockType: 'unlimited',
      stockQuantity: 0,
      menuTypes: [] as string[],
      ageLimit: undefined as number | undefined,
      imageUrl: '',
      variations: [] as FoodItemVariation[],
      labels: [] as string[],
      addOnGroupIds: [] as string[],
      discounts: [] as FoodItemDiscount[],
    },
    validate: {
      name: (value) => (!value ? (t('menu.foodItemName', language) || 'Name') + ' is required' : null),
      categoryId: (value) => (!value ? t('menu.selectCategory', language) + ' is required' : null),
      basePrice: (value) => (value <= 0 ? 'Base price must be greater than 0' : null),
    },
  });

  const loadData = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);

      // Load categories (only active ones for selection)
      const cats = await menuApi.getCategories();
      setCategories(cats.filter((cat) => cat.isActive));

      // Load add-on groups (only active ones for selection)
      const groups = await menuApi.getAddOnGroups();
      setAddOnGroups(groups.filter((group) => group.isActive));

      // Load food items from IndexedDB first
      const localItems = await db.foodItems
        .where('tenantId')
        .equals(user.tenantId)
        .filter((item) => !item.deletedAt)
        .toArray();

      // Load related data for each item
      const itemsWithRelations = await Promise.all(
        localItems.map(async (item) => {
          const [variations, labels, discounts, addOnGroups] = await Promise.all([
            db.foodItemVariations.where('foodItemId').equals(item.id).toArray(),
            db.foodItemLabels.where('foodItemId').equals(item.id).toArray(),
            db.foodItemDiscounts.where('foodItemId').equals(item.id).toArray(),
            db.foodItemAddOnGroups.where('foodItemId').equals(item.id).toArray(),
          ]);

          return {
        id: item.id,
        name: (item as any).name || (item as any).nameEn || (item as any).nameAr || '',
        description: (item as any).description || (item as any).descriptionEn || (item as any).descriptionAr || '',
        imageUrl: item.imageUrl,
        categoryId: item.categoryId,
        basePrice: item.basePrice,
        stockType: item.stockType,
        stockQuantity: item.stockQuantity,
            menuType: item.menuType || 'all_day', // Legacy field, default for compatibility
            menuTypes: item.menuTypes || (item.menuType ? [item.menuType] : []),
        ageLimit: item.ageLimit,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
            variations: variations.map((v) => ({
              id: v.id,
              variationGroup: v.variationGroup,
              variationName: v.variationName,
              priceAdjustment: v.priceAdjustment,
              stockQuantity: v.stockQuantity,
              displayOrder: v.displayOrder,
            })),
            labels: labels.map((l) => l.label),
            addOnGroupIds: addOnGroups.map((g) => g.addOnGroupId),
            discounts: discounts.map((d) => ({
              id: d.id,
              discountType: d.discountType,
              discountValue: d.discountValue,
              startDate: d.startDate,
              endDate: d.endDate,
              reason: d.reason,
              isActive: d.isActive,
            })),
          };
        })
      );

      setFoodItems(itemsWithRelations);

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverItems = await menuApi.getFoodItems();
          setFoodItems(serverItems);

          // Update IndexedDB
          for (const item of serverItems) {
            await db.foodItems.put({
              id: item.id,
              tenantId: user.tenantId,
              name: item.name || (item as any).nameEn || (item as any).nameAr || '',
              description: item.description || (item as any).descriptionEn || (item as any).descriptionAr || '',
              imageUrl: item.imageUrl,
              categoryId: item.categoryId,
              basePrice: item.basePrice,
              stockType: item.stockType,
              stockQuantity: item.stockQuantity,
              menuType: item.menuType || 'all_day', // Legacy field, default for compatibility
            menuTypes: item.menuTypes || (item.menuType ? [item.menuType] : []),
              ageLimit: item.ageLimit,
              displayOrder: item.displayOrder,
              isActive: item.isActive,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            } as any);

            // Save variations
            if (item.variations && item.variations.length > 0) {
              // Delete existing variations
              await db.foodItemVariations.where('foodItemId').equals(item.id).delete();
              // Add new variations
              await db.foodItemVariations.bulkAdd(
                item.variations.map((v) => ({
                  id: v.id || `${item.id}-var-${Date.now()}-${Math.random()}`,
                  foodItemId: item.id,
                  tenantId: user.tenantId,
                  variationGroup: v.variationGroup,
                  variationName: v.variationName,
                  priceAdjustment: v.priceAdjustment,
                  stockQuantity: v.stockQuantity,
                  displayOrder: v.displayOrder || 0,
                }))
              );
            }

            // Save labels
            if (item.labels && item.labels.length > 0) {
              // Delete existing labels
              await db.foodItemLabels.where('foodItemId').equals(item.id).delete();
              // Add new labels
              await db.foodItemLabels.bulkAdd(
                item.labels.map((label, idx) => ({
                  id: `${item.id}-label-${idx}`,
                  foodItemId: item.id,
                  tenantId: user.tenantId,
                  label,
                }))
              );
            }

            // Save discounts
            if (item.discounts && item.discounts.length > 0) {
              // Delete existing discounts
              await db.foodItemDiscounts.where('foodItemId').equals(item.id).delete();
              // Add new discounts
              await db.foodItemDiscounts.bulkAdd(
                item.discounts.map((d) => ({
                  id: d.id || `${item.id}-discount-${Date.now()}-${Math.random()}`,
                  foodItemId: item.id,
                  tenantId: user.tenantId,
                  discountType: d.discountType,
                  discountValue: d.discountValue,
                  startDate: d.startDate,
                  endDate: d.endDate,
                  reason: d.reason,
                  isActive: d.isActive ?? true,
                }))
              );
            }

            // Save add-on groups
            if (item.addOnGroupIds && item.addOnGroupIds.length > 0) {
              // Delete existing add-on groups
              await db.foodItemAddOnGroups.where('foodItemId').equals(item.id).delete();
              // Add new add-on groups
              await db.foodItemAddOnGroups.bulkAdd(
                item.addOnGroupIds.map((groupId) => ({
                  id: `${item.id}-addon-${groupId}`,
                  foodItemId: item.id,
                  tenantId: user.tenantId,
                  addOnGroupId: groupId,
                }))
              );
            }
          }
        } catch (err) {
          console.warn('Failed to sync food items from server:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language]);

  useEffect(() => {
    loadData();
    
    // Listen for data updates from other tabs
    const unsubscribe1 = onMenuDataUpdate('food-items-updated', () => {
      loadData();
    });
    
    // Also listen for category updates since food items depend on categories
    const unsubscribe2 = onMenuDataUpdate('categories-updated', () => {
      loadData();
    });
    
    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [loadData]);

  const handleOpenModal = async (item?: FoodItem) => {
    // Ensure add-on groups are loaded
    if (addOnGroups.length === 0) {
      try {
        const groups = await menuApi.getAddOnGroups();
        setAddOnGroups(groups.filter((group) => group.isActive));
      } catch (err) {
        console.error('Failed to load add-on groups:', err);
      }
    }

    if (item) {
      setEditingItem(item);
      
      // Load related data from IndexedDB to ensure we have the latest data
      const [variations, labels, discounts, addOnGroups] = await Promise.all([
        db.foodItemVariations.where('foodItemId').equals(item.id).toArray(),
        db.foodItemLabels.where('foodItemId').equals(item.id).toArray(),
        db.foodItemDiscounts.where('foodItemId').equals(item.id).toArray(),
        db.foodItemAddOnGroups.where('foodItemId').equals(item.id).toArray(),
      ]);

      // Use menuTypes from item if available, otherwise fallback to legacy menuType
      const menuTypes = item.menuTypes && item.menuTypes.length > 0 
        ? item.menuTypes 
        : (item.menuType ? [item.menuType] : []);

      form.setValues({
        name: item.name || (item as any).nameEn || (item as any).nameAr || '',
        description: item.description || (item as any).descriptionEn || (item as any).descriptionAr || '',
        categoryId: item.categoryId || '',
        basePrice: item.basePrice,
        stockType: item.stockType,
        stockQuantity: item.stockQuantity,
        menuTypes: menuTypes,
        ageLimit: item.ageLimit,
        imageUrl: item.imageUrl || '',
        variations: variations.map((v) => ({
          id: v.id,
          variationGroup: v.variationGroup,
          variationName: v.variationName,
          priceAdjustment: v.priceAdjustment,
          stockQuantity: v.stockQuantity,
          displayOrder: v.displayOrder,
        })),
        labels: labels.map((l) => l.label),
        addOnGroupIds: addOnGroups.map((g) => g.addOnGroupId),
        discounts: discounts.map((d) => ({
          id: d.id,
          discountType: d.discountType,
          discountValue: d.discountValue,
          startDate: d.startDate ? (d.startDate.includes('T') ? d.startDate.split('T')[0] : d.startDate) : new Date().toISOString().split('T')[0],
          endDate: d.endDate ? (d.endDate.includes('T') ? d.endDate.split('T')[0] : d.endDate) : new Date().toISOString().split('T')[0],
          reason: d.reason,
          isActive: d.isActive,
        })),
      });
      setImagePreview(item.imageUrl || null);
    } else {
      setEditingItem(null);
      form.reset();
      setImagePreview(null);
    }
    setActiveStep(0);
    setOpened(true);
  };

  const handleCloseModal = () => {
    setOpened(false);
    setEditingItem(null);
    setActiveStep(0);
    form.reset();
    setImagePreview(null);
    setImageFile(null);
    setShouldSubmit(false);
  };

  const nextStep = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (activeStep === 0) {
      const step1Valid = form.validateField('name').hasError === false &&
        form.validateField('categoryId').hasError === false &&
        form.validateField('basePrice').hasError === false;
      if (step1Valid) {
        setActiveStep(1);
      }
    } else if (activeStep === 1) {
      setActiveStep(2);
    }
    // Don't go beyond step 2 - user must click Save button explicitly
  };

  const prevStep = () => setActiveStep((s) => (s > 0 ? s - 1 : s));

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

    // If editing existing item, upload immediately
    if (editingItem) {
    try {
      setUploadingImage(true);
      const updated = await menuApi.uploadFoodItemImage(editingItem.id, file);
      
      await db.foodItems.update(editingItem.id, {
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

      loadData();
      // Notify other tabs that food items have been updated
      notifyMenuDataUpdate('food-items-updated');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to upload image';
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMessage,
        color: errorColor,
      });
    } finally {
      setUploadingImage(false);
    }
    }
    // If creating, the image will be uploaded after food item creation in handleSubmit
  };

  const handleSubmit = async (values: typeof form.values, event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    if (!user?.tenantId) return;

    // Close modal immediately
    const wasEditing = !!editingItem;
    const currentEditingItem = editingItem;
    const currentImageFile = imageFile;
    handleCloseModal();

    // Run API calls in background
    (async () => {
      try {
      const itemData = {
        name: values.name,
        description: values.description || undefined,
        categoryId: values.categoryId,
        basePrice: values.basePrice,
        stockType: values.stockType,
        stockQuantity: values.stockQuantity,
          menuTypes: values.menuTypes || [],
        ageLimit: values.ageLimit,
        imageUrl: values.imageUrl || undefined,
        variations: values.variations,
        labels: values.labels,
        addOnGroupIds: values.addOnGroupIds,
        discounts: values.discounts,
      };

      let savedItem: FoodItem;

        if (wasEditing && currentEditingItem) {
          savedItem = await menuApi.updateFoodItem(currentEditingItem.id, itemData);
        
          await db.foodItems.update(currentEditingItem.id, {
          ...itemData,
          updatedAt: new Date().toISOString(),
          lastSynced: new Date().toISOString(),
          syncStatus: 'synced',
        });

          // Save variations
          if (values.variations && values.variations.length > 0) {
            await db.foodItemVariations.where('foodItemId').equals(currentEditingItem.id).delete();
            await db.foodItemVariations.bulkAdd(
              values.variations.map((v) => ({
                id: v.id || `${currentEditingItem.id}-var-${Date.now()}-${Math.random()}`,
                foodItemId: currentEditingItem.id,
                tenantId: user.tenantId,
                variationGroup: v.variationGroup,
                variationName: v.variationName,
                priceAdjustment: v.priceAdjustment,
                stockQuantity: v.stockQuantity,
                displayOrder: v.displayOrder || 0,
              }))
            );
          } else {
            await db.foodItemVariations.where('foodItemId').equals(currentEditingItem.id).delete();
          }

          // Save labels
          if (values.labels && values.labels.length > 0) {
            await db.foodItemLabels.where('foodItemId').equals(currentEditingItem.id).delete();
            await db.foodItemLabels.bulkAdd(
              values.labels.map((label, idx) => ({
                id: `${currentEditingItem.id}-label-${idx}`,
                foodItemId: currentEditingItem.id,
                tenantId: user.tenantId,
                label,
              }))
            );
          } else {
            await db.foodItemLabels.where('foodItemId').equals(currentEditingItem.id).delete();
          }

          // Save discounts
          if (values.discounts && values.discounts.length > 0) {
            await db.foodItemDiscounts.where('foodItemId').equals(currentEditingItem.id).delete();
            await db.foodItemDiscounts.bulkAdd(
              values.discounts.map((d) => ({
                id: d.id || `${currentEditingItem.id}-discount-${Date.now()}-${Math.random()}`,
                foodItemId: currentEditingItem.id,
                tenantId: user.tenantId,
                discountType: d.discountType,
                discountValue: d.discountValue,
                startDate: d.startDate,
                endDate: d.endDate,
                reason: d.reason,
                isActive: d.isActive ?? true,
              }))
            );
          } else {
            await db.foodItemDiscounts.where('foodItemId').equals(currentEditingItem.id).delete();
          }

          // Save add-on groups
          if (values.addOnGroupIds && values.addOnGroupIds.length > 0) {
            await db.foodItemAddOnGroups.where('foodItemId').equals(currentEditingItem.id).delete();
            await db.foodItemAddOnGroups.bulkAdd(
              values.addOnGroupIds.map((groupId) => ({
                id: `${currentEditingItem.id}-addon-${groupId}`,
                foodItemId: currentEditingItem.id,
                tenantId: user.tenantId,
                addOnGroupId: groupId,
              }))
            );
          } else {
            await db.foodItemAddOnGroups.where('foodItemId').equals(currentEditingItem.id).delete();
          }

          await syncService.queueChange('foodItems', 'UPDATE', currentEditingItem.id, savedItem);
      } else {
        savedItem = await menuApi.createFoodItem(itemData);
          
          // If image was selected during creation, upload it now
          if (currentImageFile) {
            try {
              const updated = await menuApi.uploadFoodItemImage(savedItem.id, currentImageFile);
              savedItem = updated; // Update with image URL
              itemData.imageUrl = updated.imageUrl;
            } catch (err: any) {
              console.warn('Failed to upload image after food item creation:', err);
              // Continue even if image upload fails
            }
          }
        
        await db.foodItems.add({
          id: savedItem.id,
          tenantId: user.tenantId,
          ...itemData,
            menuType: savedItem.menuType || 'all_day', // Legacy field
            menuTypes: savedItem.menuTypes || [], // Array of menu types
            imageUrl: savedItem.imageUrl,
          displayOrder: savedItem.displayOrder,
          isActive: savedItem.isActive,
          createdAt: savedItem.createdAt,
          updatedAt: savedItem.updatedAt,
          lastSynced: new Date().toISOString(),
          syncStatus: 'synced',
        } as any);

          // Save variations
          if (values.variations && values.variations.length > 0) {
            await db.foodItemVariations.bulkAdd(
              values.variations.map((v) => ({
                id: v.id || `${savedItem.id}-var-${Date.now()}-${Math.random()}`,
                foodItemId: savedItem.id,
                tenantId: user.tenantId,
                variationGroup: v.variationGroup,
                variationName: v.variationName,
                priceAdjustment: v.priceAdjustment,
                stockQuantity: v.stockQuantity,
                displayOrder: v.displayOrder || 0,
              }))
            );
          }

          // Save labels
          if (values.labels && values.labels.length > 0) {
            await db.foodItemLabels.bulkAdd(
              values.labels.map((label, idx) => ({
                id: `${savedItem.id}-label-${idx}`,
                foodItemId: savedItem.id,
                tenantId: user.tenantId,
                label,
              }))
            );
          }

          // Save discounts
          if (values.discounts && values.discounts.length > 0) {
            await db.foodItemDiscounts.bulkAdd(
              values.discounts.map((d) => ({
                id: d.id || `${savedItem.id}-discount-${Date.now()}-${Math.random()}`,
                foodItemId: savedItem.id,
                tenantId: user.tenantId,
                discountType: d.discountType,
                discountValue: d.discountValue,
                startDate: d.startDate,
                endDate: d.endDate,
                reason: d.reason,
                isActive: d.isActive ?? true,
              }))
            );
          }

          // Save add-on groups
          if (values.addOnGroupIds && values.addOnGroupIds.length > 0) {
            await db.foodItemAddOnGroups.bulkAdd(
              values.addOnGroupIds.map((groupId) => ({
                id: `${savedItem.id}-addon-${groupId}`,
                foodItemId: savedItem.id,
                tenantId: user.tenantId,
                addOnGroupId: groupId,
              }))
            );
          }

        await syncService.queueChange('foodItems', 'CREATE', savedItem.id, savedItem);
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('menu.saveSuccess', language),
        color: successColor,
      });

      loadData();
        // Notify other tabs that food items have been updated
        notifyMenuDataUpdate('food-items-updated');
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to save food item';
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
    }
    })();
  };

  const handleDelete = (item: FoodItem) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: <Text size="sm">{t('menu.deleteConfirm', language)}</Text>,
      labels: { confirm: t('common.delete' as any, language) || 'Delete', cancel: t('common.cancel' as any, language) || 'Cancel' },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        try {
          await menuApi.deleteFoodItem(item.id);
          
          await db.foodItems.update(item.id, {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          await syncService.queueChange('foodItems', 'DELETE', item.id, item);

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          loadData();
      // Notify other tabs that food items have been updated
      notifyMenuDataUpdate('food-items-updated');
        } catch (err: any) {
          // Extract error message from NestJS response
          // The global exception filter formats errors as: { success: false, error: { message: "..." } }
          let errorMessage = 'Failed to delete food item';
          
          if (err.response?.data) {
            const data = err.response.data;
            // Check the custom error format from HttpExceptionFilter first
            if (data.error?.message) {
              errorMessage = data.error.message;
            } else if (typeof data === 'object' && data.message) {
              // Fallback to standard NestJS format
              errorMessage = data.message;
            } else if (typeof data === 'string') {
              errorMessage = data;
            }
          } else if (err.message && !err.message.includes('status code')) {
            // Only use err.message if it's not the generic Axios status code message
            errorMessage = err.message;
          }
          
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: errorMessage,
            color: errorColor,
          });
        }
      },
    });
  };

  const labelOptions = [
    { value: 'spicy', label: String(t('menu.spicy', language) || 'Spicy') },
    { value: 'vegetarian', label: String(t('menu.vegetarian', language) || 'Vegetarian') },
    { value: 'vegan', label: String(t('menu.vegan', language) || 'Vegan') },
    { value: 'gluten_free', label: String(t('menu.glutenFree', language) || 'Gluten Free') },
    { value: 'halal', label: String(t('menu.halal', language) || 'Halal') },
    { value: 'new', label: String(t('menu.new', language) || 'New') },
    { value: 'popular', label: String(t('menu.popular', language) || 'Popular') },
    { value: 'chefs_special', label: String(t('menu.chefsSpecial', language) || 'Chef\'s Special') },
  ];


  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => handleOpenModal()}
          style={{ backgroundColor: primaryColor }}
        >
          {t('menu.createFoodItem', language)}
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
              <Table.Th>{t('menu.foodItemName', language)}</Table.Th>
              <Table.Th>{t('menu.categoryName', language)}</Table.Th>
              <Table.Th>{t('menu.basePrice', language)}</Table.Th>
              <Table.Th>{t('menu.menuType', language)}</Table.Th>
              <Table.Th>{t('menu.active', language)}</Table.Th>
              <Table.Th>{t('menu.actions', language)}</Table.Th>
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
                  <Table.Td><Skeleton height={16} width={100} /></Table.Td>
                  <Table.Td><Skeleton height={16} width={80} /></Table.Td>
                  <Table.Td><Skeleton height={24} width={80} radius="xl" /></Table.Td>
                  <Table.Td><Skeleton height={24} width={60} radius="xl" /></Table.Td>
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
      ) : foodItems.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text ta="center" c="dimmed">
            {t('menu.noFoodItems', language)}
          </Text>
        </Paper>
      ) : (
        <Paper withBorder>
          <Table.ScrollContainer minWidth={1000}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ minWidth: 250 }}>{t('menu.foodItemName', language)}</Table.Th>
                  <Table.Th style={{ minWidth: 120 }}>{t('menu.categoryName', language)}</Table.Th>
                  <Table.Th style={{ minWidth: 100, width: 100 }}>{t('menu.basePrice', language)}</Table.Th>
                  <Table.Th style={{ minWidth: 180, width: 200 }}>{t('menu.menuType', language)}</Table.Th>
                  <Table.Th style={{ minWidth: 90, width: 100 }}>{t('menu.active', language)}</Table.Th>
                  <Table.Th style={{ minWidth: 100, width: 100 }}>{t('menu.actions', language)}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {foodItems.map((item) => {
              const category = categories.find((c) => c.id === item.categoryId);
              return (
                <Table.Tr key={item.id}>
                      <Table.Td style={{ maxWidth: 300 }}>
                        <Group gap="sm" wrap="nowrap">
                      {item.imageUrl ? (
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
                            src={item.imageUrl}
                            alt={item.name || ''}
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
                          {item.name || ''}
                        </Text>
                        {item.description && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                            {item.description || ''}
                          </Text>
                        )}
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                        <Text truncate>
                    {category
                      ? category.name || ''
                      : '-'}
                        </Text>
                  </Table.Td>
                  <Table.Td>
                        <Text fw={500}>{item.basePrice.toFixed(2)}</Text>
                      </Table.Td>
                      <Table.Td>
                        {item.menuTypes && item.menuTypes.length > 0 ? (
                          <Group gap={4} wrap="wrap" style={{ maxWidth: 200 }}>
                            {item.menuTypes.map((menuType) => {
                              const menuTypeLabel = menuType === 'all_day' ? t('menu.allDay', language) :
                                 menuType === 'breakfast' ? t('menu.breakfast', language) :
                                 menuType === 'lunch' ? t('menu.lunch', language) :
                                 menuType === 'dinner' ? t('menu.dinner', language) :
                                 menuType === 'kids_special' ? t('menu.kidsSpecial', language) :
                                 menuType;
                              return (
                                <Badge 
                                  key={menuType} 
                                  variant="light" 
                                  size="sm"
                                  color={getBadgeColorForText(menuTypeLabel)}
                                >
                                  {menuTypeLabel}
                                </Badge>
                              );
                            })}
                          </Group>
                        ) : item.menuType ? (
                          <Badge variant="light" size="sm" color={getBadgeColorForText(
                            item.menuType === 'all_day' ? t('menu.allDay', language) :
                            item.menuType === 'breakfast' ? t('menu.breakfast', language) :
                            item.menuType === 'lunch' ? t('menu.lunch', language) :
                            item.menuType === 'dinner' ? t('menu.dinner', language) :
                            item.menuType === 'kids_special' ? t('menu.kidsSpecial', language) :
                            item.menuType
                          )}>
                            {item.menuType === 'all_day' ? t('menu.allDay', language) :
                             item.menuType === 'breakfast' ? t('menu.breakfast', language) :
                             item.menuType === 'lunch' ? t('menu.lunch', language) :
                             item.menuType === 'dinner' ? t('menu.dinner', language) :
                             item.menuType === 'kids_special' ? t('menu.kidsSpecial', language) :
                             item.menuType}
                          </Badge>
                        ) : (
                          <Text c="dimmed" size="sm">-</Text>
                        )}
                  </Table.Td>
                  <Table.Td>
                        <Badge 
                          variant="light"
                          color={getBadgeColorForText(item.isActive ? t('menu.active', language) : t('menu.inactive', language))} 
                          size="sm"
                        >
                      {item.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        variant="light"
                        onClick={() => handleOpenModal(item)}
                        style={{ color: primaryColor }}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="light"
                        color={errorColor}
                        onClick={() => handleDelete(item)}
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
          </Table.ScrollContainer>
        </Paper>
      )}

      <Modal
        opened={opened}
        onClose={handleCloseModal}
        title={editingItem ? t('menu.editFoodItem', language) : t('menu.createFoodItem', language)}
        size="xl"
      >
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only submit if we're on the last step (step 3, index 2)
            // and the submit button was explicitly clicked
            if (activeStep === 2 && shouldSubmit) {
              setShouldSubmit(false); // Reset flag
              form.onSubmit(handleSubmit)(e);
            }
          }}
          onKeyDown={(e) => {
            // Prevent Enter key from submitting form unless on last step and Save button is focused
            if (e.key === 'Enter' && (activeStep < 2 || !shouldSubmit)) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <Stepper 
            active={activeStep} 
            onStepClick={(step) => {
              // Allow clicking on previous steps, but prevent going beyond step 2
              if (step <= 2) {
                setActiveStep(step);
              }
            }}
            allowNextStepsSelect={false}
          >
            <Stepper.Step
              label={t('menu.step1', language)}
              description={t('auth.basicInfo', language)}
              icon={<IconToolsKitchen2 size={18} />}
            >
              <Stack gap="md" mt="xl">
                <Grid>
                  <Grid.Col span={12}>
                    <TextInput
                      label={t('menu.foodItemName', language) || 'Name'}
                      required
                      {...form.getInputProps('name')}
                    />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <Textarea
                      label={t('menu.description', language) || 'Description'}
                      {...form.getInputProps('description')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select
                      label={t('menu.selectCategory', language)}
                      required
                      placeholder={categories.length === 0 ? t('menu.noCategories', language) : undefined}
                      data={categories.map((cat) => ({
                        value: cat.id,
                        label: cat.name || '',
                      }))}
                      disabled={categories.length === 0}
                      {...form.getInputProps('categoryId')}
                    />
                    {categories.length === 0 && (
                      <Text size="xs" c="dimmed" mt={4}>
                        {language === 'ar' 
                          ? 'يرجى إنشاء فئة أولاً قبل إضافة أصناف الطعام'
                          : 'Please create a category first before adding food items'}
                      </Text>
                    )}
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <NumberInput
                      label={t('menu.basePrice', language)}
                      required
                      min={0}
                      decimalScale={2}
                      {...form.getInputProps('basePrice')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select
                      label={t('menu.stockType', language)}
                      data={[
                        { value: 'unlimited', label: t('menu.unlimited', language) },
                        { value: 'limited', label: t('menu.limited', language) },
                        { value: 'daily_limited', label: t('menu.dailyLimited', language) },
                      ]}
                      {...form.getInputProps('stockType')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <NumberInput
                      label={t('menu.stockQuantity', language)}
                      min={0}
                      {...form.getInputProps('stockQuantity')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <MultiSelect
                      label={t('menu.menuTypes', language)}
                      placeholder={t('menu.selectMenuTypes', language)}
                      data={[
                        { value: 'all_day', label: t('menu.allDay', language) },
                        { value: 'breakfast', label: t('menu.breakfast', language) },
                        { value: 'lunch', label: t('menu.lunch', language) },
                        { value: 'dinner', label: t('menu.dinner', language) },
                        { value: 'kids_special', label: t('menu.kidsSpecial', language) },
                      ]}
                      {...form.getInputProps('menuTypes')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <NumberInput
                      label={t('menu.ageLimit', language)}
                      min={0}
                      {...form.getInputProps('ageLimit')}
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
                            loading={uploadingImage && !!editingItem}
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
              </Stack>
            </Stepper.Step>

            <Stepper.Step
              label={t('menu.step2', language)}
              description={t('menu.variations', language)}
              icon={<IconCheck size={18} />}
            >
              <Stack gap="md" mt="xl">
                <Group justify="space-between">
                  <Text fw={500}>{t('menu.variations', language)}</Text>
                  <Button
                    type="button"
                    size="xs"
                    variant="light"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      form.insertListItem('variations', {
                        variationGroup: '',
                        variationName: '',
                        priceAdjustment: 0,
                        stockQuantity: undefined,
                        displayOrder: form.values.variations.length,
                      });
                    }}
                    style={{ color: primaryColor }}
                  >
                    {t('menu.addVariation', language)}
                  </Button>
                </Group>

                {form.values.variations.map((variation, index) => (
                  <Paper key={index} p="md" withBorder>
                    <Grid>
                      <Grid.Col span={{ base: 12, md: 4 }}>
                        <TextInput
                          label={t('menu.variationGroup', language)}
                          placeholder="e.g., Size"
                          {...form.getInputProps(`variations.${index}.variationGroup`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 4 }}>
                        <TextInput
                          label={t('menu.variationName', language)}
                          placeholder="e.g., Large"
                          {...form.getInputProps(`variations.${index}.variationName`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 3 }}>
                        <NumberInput
                          label={t('menu.priceAdjustment', language)}
                          {...form.getInputProps(`variations.${index}.priceAdjustment`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 1 }}>
                        <Box mt="xl" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <ActionIcon
                            type="button"
                            color={errorColor}
                          variant="light"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              form.removeListItem('variations', index);
                            }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                        </Box>
                      </Grid.Col>
                    </Grid>
                  </Paper>
                ))}

                <MultiSelect
                  label={t('menu.labels', language)}
                  data={labelOptions}
                  {...form.getInputProps('labels')}
                />
              </Stack>
            </Stepper.Step>

            <Stepper.Step
              label={t('menu.step3', language)}
              description={t('menu.addOnGroups', language)}
              icon={<IconCheck size={18} />}
            >
              <Stack gap="md" mt="xl">
                <MultiSelect
                  label={t('menu.addOnGroups', language)}
                  placeholder={
                    addOnGroups.length === 0
                      ? t('menu.noAddOnGroupsAvailable', language)
                      : t('menu.selectAddOnGroups', language)
                  }
                  data={addOnGroups.map((group) => ({
                    value: group.id,
                    label: group.name || '',
                  }))}
                  disabled={addOnGroups.length === 0}
                  {...form.getInputProps('addOnGroupIds')}
                />
                {addOnGroups.length === 0 && (
                  <Text size="sm" c="dimmed">
                    {t('menu.createAddOnGroupsFirst', language)}
                  </Text>
                )}

                <Group justify="space-between">
                  <Text fw={500}>{t('menu.discounts', language)}</Text>
                  <Button
                    type="button"
                    size="xs"
                    variant="light"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                      form.insertListItem('discounts', {
                        discountType: 'percentage',
                        discountValue: 0,
                        startDate: new Date().toISOString().split('T')[0],
                        endDate: new Date().toISOString().split('T')[0],
                        reason: '',
                      });
                      return false;
                    }}
                    style={{ color: primaryColor }}
                  >
                    {t('menu.addDiscount', language)}
                  </Button>
                </Group>

                {form.values.discounts.map((discount, index) => (
                  <Paper 
                    key={index} 
                    p="md" 
                    withBorder
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                  >
                    <Grid>
                      <Grid.Col span={{ base: 12, md: 3 }}>
                        <Select
                          label={t('menu.discountType', language)}
                          data={[
                            { value: 'percentage', label: t('menu.percentage', language) },
                            { value: 'fixed', label: t('menu.fixed', language) },
                          ]}
                          {...form.getInputProps(`discounts.${index}.discountType`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 3 }}>
                        <NumberInput
                          label={t('menu.discountValue', language)}
                          min={0}
                          {...form.getInputProps(`discounts.${index}.discountValue`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 2 }}>
                        <TextInput
                          label={t('menu.startDate', language)}
                          type="date"
                          {...form.getInputProps(`discounts.${index}.startDate`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 2 }}>
                        <TextInput
                          label={t('menu.endDate', language)}
                          type="date"
                          {...form.getInputProps(`discounts.${index}.endDate`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 2 }}>
                        <ActionIcon
                          type="button"
                          color={errorColor}
                          variant="light"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            form.removeListItem('discounts', index);
                          }}
                          mt="xl"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Grid.Col>
                    </Grid>
                  </Paper>
                ))}
              </Stack>
            </Stepper.Step>

            <Stepper.Completed>
              <Stack gap="md" mt="xl">
                <Alert color={successColor}>
                  <Text size="sm">{t('menu.saveSuccess', language)}</Text>
                </Alert>
              </Stack>
            </Stepper.Completed>
          </Stepper>

          <Group justify="space-between" mt="xl">
            {activeStep > 0 && (
              <Button type="button" variant="default" onClick={prevStep}>
                {t('common.previousStep' as any, language) || 'Previous Step'}
              </Button>
            )}
            {activeStep < 2 ? (
              <Button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  nextStep(e);
                }} 
                style={{ backgroundColor: primaryColor }}
              >
                {t('common.nextStep' as any, language) || 'Next Step'}
              </Button>
            ) : (
              <Button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Set flag to allow form submission
                  setShouldSubmit(true);
                  // Trigger form submission manually
                  const formElement = e.currentTarget.closest('form');
                  if (formElement && activeStep === 2) {
                    form.onSubmit(handleSubmit)(e as any);
                  }
                }}
                style={{ backgroundColor: primaryColor }}
              >
                {t('common.save' as any, language) || 'Save'}
              </Button>
            )}
          </Group>
        </form>
      </Modal>
    </Stack>
  );
}

