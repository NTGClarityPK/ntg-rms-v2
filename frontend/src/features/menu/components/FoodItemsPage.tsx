'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
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
  Loader,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUpload,
  IconToolsKitchen2,
  IconAlertCircle,
  IconCheck,
  IconSearch,
  IconFileSpreadsheet,
  IconDownload,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, FoodItem, FoodItemVariation, FoodItemDiscount, VariationGroup } from '@/lib/api/menu';
import { Category } from '@/lib/api/menu';
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
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { FOOD_ITEM_LABELS, MENU_TYPES, STOCK_TYPES, DISCOUNT_TYPES } from '@/shared/constants/menu.constants';
import { handleApiError } from '@/shared/utils/error-handler';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';
import { TranslationStatusBadge, LanguageIndicator, RetranslateButton } from '@/components/translations';
import { translationsApi, SupportedLanguage } from '@/lib/api/translations';
import { BulkImportModal } from '@/components/common/BulkImportModal';

export function FoodItemsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<FoodItem>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  
  
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addOnGroups, setAddOnGroups] = useState<any[]>([]);
  const [menus, setMenus] = useState<any[]>([]);
  const [variationGroups, setVariationGroups] = useState<VariationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [shouldSubmit, setShouldSubmit] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const prevDebouncedSearchRef = useRef<string | null>(null);
  const debouncedSearchRef = useRef<string>('');
  const paginationPageRef = useRef<number>(pagination.page);
  const paginationLimitRef = useRef<number>(pagination.limit);
  const [pendingItem, setPendingItem] = useState<Partial<FoodItem> | null>(null);
  const [variationGroupsMap, setVariationGroupsMap] = useState<Map<string, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([]);
  const [bulkImportOpened, setBulkImportOpened] = useState(false);
  const [itemTranslations, setItemTranslations] = useState<{ [itemId: string]: { [fieldName: string]: { [languageCode: string]: string } } }>({});

  // Helper function to resolve variation group name from UUID
  const resolveVariationGroupName = useCallback((variationGroup: string | undefined): string => {
    if (!variationGroup) return '';
    // Check if it's a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variationGroup);
    if (isUUID) {
      return variationGroupsMap.get(variationGroup) || variationGroup;
    }
    return variationGroup;
  }, [variationGroupsMap]);

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
      variationGroupIds: [] as string[],
      labels: [] as string[],
      addOnGroupIds: [] as string[],
      discounts: [] as FoodItemDiscount[],
    },
    validate: {
      name: (value) => (!value ? (t('menu.foodItemName', language) || 'Name') + ' is required' : null),
      categoryId: (value) => (!value ? t('menu.selectCategory', language) + ' is required' : null),
      basePrice: (value) => (value <= 0 ? 'Base price must be greater than 0' : null),
      menuTypes: (value) => (!value || value.length === 0 ? (t('menu.menuTypes', language) || 'Menu Types') + ' is required' : null),
    },
  });

  const loadData = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);

      // Use refs to get the latest values to avoid stale closures
      const currentSearch = debouncedSearchRef.current;
      const currentPage = paginationPageRef.current;
      const currentLimit = paginationLimitRef.current;

      // Start all API calls in parallel for faster loading
      // Food items is the main content, so prioritize it by starting it first
      const foodItemsPromise = menuApi.getFoodItems(undefined, {
        page: currentPage,
        limit: currentLimit,
      }, currentSearch, false, selectedBranchId || undefined, language);

      const categoriesPromise = menuApi.getCategories(undefined, selectedBranchId || undefined, language);
      const addOnGroupsPromise = menuApi.getAddOnGroups(undefined, selectedBranchId || undefined, language);
      const menusPromise = menuApi.getMenus(undefined, selectedBranchId || undefined, language);
      const variationGroupsPromise = menuApi.getVariationGroups(undefined, selectedBranchId || undefined, language);

      // Wait for food items first (main content) - don't block on other data
      const serverItemsResponse = await foodItemsPromise;
      const serverItems = pagination.extractData(serverItemsResponse);
      pagination.extractPagination(serverItemsResponse);
      setFoodItems(serverItems);
      
      // Set loading to false immediately after food items are loaded
      // This allows the UI to update right away
      setLoading(false);

      // Load supporting data in the background (non-blocking)
      // These are needed for the form but don't block the main content display
      Promise.all([
        categoriesPromise,
        addOnGroupsPromise,
        menusPromise,
        variationGroupsPromise,
      ]).then(([catsResponse, groupsResponse, menuListResponse, variationGroupsResponse]) => {
        // Process categories
        const cats = Array.isArray(catsResponse) ? catsResponse : (catsResponse?.data || []);
        setCategories((cats as Category[]).filter((cat: Category) => cat.isActive));

        // Process add-on groups
        const groups = Array.isArray(groupsResponse) ? groupsResponse : (groupsResponse?.data || []);
        setAddOnGroups((groups as any[]).filter((group: any) => group.isActive));

        // Process menus
        const menuList = Array.isArray(menuListResponse) ? menuListResponse : (menuListResponse?.data || []);
        setMenus(menuList);

        // Process variation groups
        const variationGroupsList = Array.isArray(variationGroupsResponse) 
          ? variationGroupsResponse 
          : (variationGroupsResponse?.data || []);
        
        // Load variations for each group (this can take time, but doesn't block UI)
        Promise.all(
          variationGroupsList.map(async (group) => {
            try {
              const groupWithVariations = await menuApi.getVariationGroupById(group.id, language);
              return groupWithVariations;
            } catch (err) {
              return group;
            }
          })
        ).then((groupsWithVariations) => {
          // Create a map of variation group IDs to names for resolving UUIDs
          const map = new Map<string, string>();
          groupsWithVariations.forEach((group) => {
            map.set(group.id, group.name);
          });
          setVariationGroupsMap(map);
          setVariationGroups(groupsWithVariations);
        }).catch((err) => {
          console.error('Failed to load variation group details:', err);
        });
      }).catch((err) => {
        console.error('Failed to load supporting data:', err);
        // Don't show error to user for supporting data - main content is already loaded
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, selectedBranchId, language]);

  // Handle search changes: update ref and reset page if needed
  useEffect(() => {
    const currentSearch = debouncedSearch || '';
    const prevSearch = prevDebouncedSearchRef.current;
    
    // Update ref immediately so loadData always has latest value
    debouncedSearchRef.current = currentSearch;
    
    // Only reset page/reload if search actually changed (skip initial mount when prevSearch is null)
    if (prevSearch !== null && prevSearch !== currentSearch) {
      // Search changed - reset page to 1 (this will trigger the main effect via pagination.page dependency)
      if (pagination.page !== 1) {
        pagination.setPage(1);
      } else {
        // Page is already 1, trigger loadData directly since page change won't trigger reload
        loadData();
      }
    }
    
    // Always update the previous search ref
    prevDebouncedSearchRef.current = currentSearch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    // Update refs before calling loadData to ensure latest values are used
    paginationPageRef.current = pagination.page;
    paginationLimitRef.current = pagination.limit;
    
    loadData();
    
    // Listen for data updates from other tabs
    const unsubscribe1 = onMenuDataUpdate('food-items-updated', () => {
      loadData();
    });
    
    // Also listen for category updates since food items depend on categories
    const unsubscribe2 = onMenuDataUpdate('categories-updated', () => {
      loadData();
    });
    
    // Listen for menu updates to refresh menu list
    const unsubscribe3 = onMenuDataUpdate('menus-updated', () => {
      loadData();
    });
    
    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
    };
  }, [pagination.page, pagination.limit, loadData]);

  // Load supported languages and translations
  useEffect(() => {
    const loadTranslationData = async () => {
      try {
        // Load supported languages
        const languages = await translationsApi.getSupportedLanguages(true);
        setSupportedLanguages(languages);

        // Load translations for all food items
        const translationsMap: { [itemId: string]: { [fieldName: string]: { [languageCode: string]: string } } } = {};
        for (const item of foodItems) {
          try {
            const translations = await translationsApi.getEntityTranslations('food_item', item.id);
            translationsMap[item.id] = translations;
          } catch (err) {
            // Ignore errors for individual translations
            console.warn(`Failed to load translations for food item ${item.id}:`, err);
          }
        }
        setItemTranslations(translationsMap);
      } catch (err) {
        console.warn('Failed to load translation data:', err);
      }
    };

    if (foodItems.length > 0) {
      loadTranslationData();
    }
  }, [foodItems]);

  // Helper function to get menu name from menu type
  const getMenuName = (menuType: string): string => {
    const menu = menus.find((m) => m.menuType === menuType);
    // Always use the menu name from backend if available
    if (menu && menu.name) {
      return menu.name;
    }
    // Only fallback to menuType if no name is available
    return menuType;
  };

  const handleOpenModal = async (item?: FoodItem) => {
    // Ensure add-on groups are loaded
    if (addOnGroups.length === 0) {
      try {
        const groupsResponse = await menuApi.getAddOnGroups(undefined, selectedBranchId || undefined, language);
        const groups = Array.isArray(groupsResponse) ? groupsResponse : (groupsResponse?.data || []);
        setAddOnGroups(groups.filter((group) => group.isActive));
      } catch (err) {
        console.error('Failed to load add-on groups:', err);
      }
    }

    // Ensure menus are loaded
    if (menus.length === 0) {
      try {
        const menuListResponse = await menuApi.getMenus(undefined, selectedBranchId || undefined, language);
        const menuList = Array.isArray(menuListResponse) ? menuListResponse : (menuListResponse?.data || []);
        setMenus(menuList);
      } catch (err) {
        console.error('Failed to load menus:', err);
      }
    }

    if (item) {
      setEditingItem(item);
      
      // Use variations, labels, discounts, and addOnGroupIds from the item (API should return these)
      const variations = item.variations || [];
      const labels = item.labels || [];
      const discounts = item.discounts || [];
      const addOnGroupIds = item.addOnGroupIds || [];

      // Use menuTypes from item if available, otherwise fallback to legacy menuType
      const menuTypes = item.menuTypes && item.menuTypes.length > 0 
        ? item.menuTypes 
        : (item.menuType ? [item.menuType] : []);

      // Extract unique variation groups from existing variations
      const uniqueVariationGroups = Array.from(new Set(variations.map((v) => v.variationGroup))).filter(Boolean);
      
      // Find variation group IDs by name
      const variationGroupIds = uniqueVariationGroups
        .map((groupName) => {
          const group = variationGroups.find((g) => g.name === groupName);
          return group?.id;
        })
        .filter((id): id is string => !!id);

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
        variationGroupIds: uniqueVariationGroups
          .map((groupName) => {
            const group = variationGroups.find((g) => g.name === groupName);
            return group?.id;
          })
          .filter((id): id is string => !!id),
        labels: labels,
        addOnGroupIds: addOnGroupIds,
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
    // Don't clear pendingItem or updatingItemId here - they should only be cleared after API call completes
  };

  const nextStep = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (activeStep === 0) {
      const step1Valid = form.validateField('name').hasError === false &&
        form.validateField('categoryId').hasError === false &&
        form.validateField('basePrice').hasError === false &&
        form.validateField('menuTypes').hasError === false;
      if (step1Valid) {
        setActiveStep(1);
      }
    } else if (activeStep === 1) {
      setActiveStep(2);
    }
    // Don't go beyond step 2 - user must click Save button explicitly
  };

  const prevStep = () => setActiveStep((s) => (s > 0 ? s - 1 : s));

  const handleVariationGroupChange = (selectedGroupIds: string[]) => {
    // Get current variations to preserve any manual edits
    const currentVariations = form.values.variations;
    const currentGroupNames = new Set(
      currentVariations.map((v) => v.variationGroup).filter(Boolean)
    );

    // Find selected groups
    const selectedGroups = variationGroups.filter((g) => selectedGroupIds.includes(g.id));
    const selectedGroupNames = new Set(selectedGroups.map((g) => g.name));

    // Get groups that were removed
    const removedGroupNames = Array.from(currentGroupNames).filter(
      (name) => !selectedGroupNames.has(name)
    );

    // Remove variations from deselected groups
    const updatedVariations = currentVariations.filter(
      (v) => !removedGroupNames.includes(v.variationGroup)
    );

    // Add variations from newly selected groups
    selectedGroups.forEach((group) => {
      // Check if this group is already represented
      const existingVariationsFromGroup = updatedVariations.filter(
        (v) => v.variationGroup === group.name
      );

      // Only add if group is newly selected (no existing variations)
      if (existingVariationsFromGroup.length === 0 && group.variations) {
        group.variations.forEach((variation, index) => {
          updatedVariations.push({
            id: undefined,
            variationGroup: group.name,
            variationName: variation.name,
            priceAdjustment: variation.pricingAdjustment || 0,
            stockQuantity: undefined,
            displayOrder: index,
          });
        });
      }
    });

    // Update form
    form.setFieldValue('variationGroupIds', selectedGroupIds);
    form.setFieldValue('variations', updatedVariations);
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

    // If editing existing item, upload immediately
    if (editingItem) {
    try {
      setUploadingImage(true);
      const updated = await menuApi.uploadFoodItemImage(editingItem.id, file);
      

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
    if (!user?.tenantId || submitting) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmitting(true);
    });

    const wasEditing = !!editingItem;
    const currentEditingItem = editingItem;
    const currentEditingItemId = editingItem?.id;
    const currentImageFile = imageFile;

    // Close modal immediately
    handleCloseModal();

    // If editing, track which item is being updated to show skeleton
    if (wasEditing && currentEditingItemId) {
      setUpdatingItemId(currentEditingItemId);
    }

    // If creating a new item, add a skeleton item to show progress
    if (!wasEditing) {
      const category = categories.find((c) => c.id === values.categoryId);
      setPendingItem({
        id: `pending-${Date.now()}`,
        name: values.name,
        description: values.description,
        categoryId: values.categoryId,
        basePrice: values.basePrice,
        stockType: values.stockType,
        stockQuantity: values.stockQuantity,
        menuTypes: values.menuTypes || [],
        ageLimit: values.ageLimit,
        imageUrl: values.imageUrl || undefined,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

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
        savedItem = await menuApi.updateFoodItem(currentEditingItem.id, itemData, language);
      } else {
        savedItem = await menuApi.createFoodItem(itemData, selectedBranchId || undefined);
        
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
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('menu.saveSuccess', language),
        color: successColor,
      });

      // Remove pending item skeleton and updating state
      setPendingItem(null);
      setUpdatingItemId(null);

      loadData();
      // Notify other tabs that food items have been updated
      notifyMenuDataUpdate('food-items-updated');
    } catch (err: any) {
      handleApiError(err, {
        defaultMessage: 'Failed to save food item',
        language,
        errorColor,
      });
      
      // Remove pending item skeleton and updating state on error
      setPendingItem(null);
      setUpdatingItemId(null);
    } finally {
      setSubmitting(false);
    }
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
          

          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          loadData();
      // Notify other tabs that food items have been updated
      notifyMenuDataUpdate('food-items-updated');
        } catch (err: any) {
          handleApiError(err, {
            defaultMessage: 'Failed to delete food item',
            language,
            errorColor,
          });
        }
      },
    });
  };

  // Use constants for labels
  // Convert snake_case to camelCase for translation keys
  const getTranslationKey = (value: string): string => {
    return value.split('_').map((word, index) => 
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
  };

  const labelOptions = FOOD_ITEM_LABELS.map(label => ({
    value: label.value,
    label: String(t(`menu.${getTranslationKey(label.value)}` as any, language) || label.label),
  }));


  return (
    <Stack gap="md">
      <Group justify="space-between">
        <TextInput
          placeholder={t('common.search', language) || 'Search food items...'}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, maxWidth: 400 }}
        />
        <Group gap="xs">
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={async () => {
              try {
                const blob = await menuApi.exportEntities('foodItem', selectedBranchId || undefined, language);
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `food-items-export-${new Date().toISOString().split('T')[0]}.xlsx`;
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
                  defaultMessage: 'Failed to export food items',
                  language,
                  errorColor: notificationColors.error,
                });
              }
            }}
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
            {t('menu.createFoodItem', language)}
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
                <Table.Th>{t('menu.foodItemName', language)}</Table.Th>
                <Table.Th>{t('menu.categoryName', language)}</Table.Th>
                <Table.Th>{t('menu.basePrice', language)}</Table.Th>
                <Table.Th>{t('menu.menuType', language)}</Table.Th>
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
        <>
          <Paper withBorder>
            <Table.ScrollContainer minWidth={1000}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ minWidth: 250 }}>{t('menu.foodItemName', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 120 }}>{t('menu.categoryName', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 100, width: 100 }}>{t('menu.basePrice', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 180, width: 200 }}>{t('menu.menuType', language)}</Table.Th>
                    <Table.Th style={{ minWidth: 100, width: 100 }}>{t('menu.actions', language)}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {/* Show pending skeleton item at the top when creating */}
                  {pendingItem && !editingItem && (
                    <Table.Tr key={pendingItem.id} style={{ opacity: 0.7, position: 'relative' }}>
                      <Table.Td style={{ maxWidth: 300 }}>
                        <Group gap="sm" wrap="nowrap">
                          {pendingItem.imageUrl ? (
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
                                backgroundColor: `${primaryColor}15`,
                              }}
                            >
                              <Image
                                src={pendingItem.imageUrl}
                                alt={pendingItem.name || ''}
                                width={40}
                                height={40}
                                fit="cover"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
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
                            <Group gap="xs" wrap="nowrap">
                              <Text fw={500} truncate>
                                {pendingItem.name || ''}
                              </Text>
                              <Loader size={16} style={{ flexShrink: 0 }} />
                            </Group>
                            {pendingItem.description && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {pendingItem.description || ''}
                              </Text>
                            )}
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text truncate>
                          {categories.find((c) => c.id === pendingItem.categoryId)?.name || '-'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={500}>{pendingItem.basePrice?.toFixed(2) || '0.00'}</Text>
                      </Table.Td>
                      <Table.Td>
                        {pendingItem.menuTypes && pendingItem.menuTypes.length > 0 ? (
                          <Group gap={4} wrap="wrap" style={{ maxWidth: 200 }}>
                            {pendingItem.menuTypes.map((menuType) => {
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
                        ) : (
                          <Text c="dimmed" size="sm">-</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Skeleton height={32} width={32} radius="md" />
                          <Skeleton height={32} width={32} radius="md" />
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {foodItems.map((item) => {
                    const category = categories.find((c) => c.id === item.categoryId);
                    const isUpdating = updatingItemId === item.id;
                    return (
                      <Table.Tr key={item.id} style={{ opacity: isUpdating ? 0.7 : 1, position: 'relative' }}>
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
                              <Skeleton height={16} width={100} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={16} width={80} />
                            </Table.Td>
                            <Table.Td>
                              <Skeleton height={24} width={120} radius="xl" />
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
                                  <Group gap="xs" wrap="nowrap">
                                    <Text fw={500} truncate>
                                      {item.name || ''}
                                    </Text>
                                  </Group>
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
                              ) : (
                                <Text c="dimmed" size="sm">-</Text>
                              )}
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
        title={editingItem ? t('menu.editFoodItem', language) : t('menu.createFoodItem', language)}
        size="xl"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
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
          <Group justify="space-between" mb="md">
            <Title order={4}>{editingItem ? t('menu.editFoodItem', language) : t('menu.createFoodItem', language)}</Title>
            <Group gap="xs">
              <LanguageIndicator variant="badge" size="sm" />
              
            </Group>
          </Group>
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
              label={t('auth.stepOne', language)}
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
                      data={STOCK_TYPES.map(type => {
                        // Map storage type values to translation keys
                        const translationKeyMap: Record<string, string> = {
                          'unlimited': 'menu.unlimited',
                          'limited': 'menu.limited',
                          'daily_limited': 'menu.dailyLimited',
                        };
                        const translationKey = translationKeyMap[type.value] || `menu.${type.value}`;
                        return {
                          value: type.value,
                          label: t(translationKey as any, language) || type.label,
                        };
                      })}
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
                      required
                      data={menus.map((menu) => ({
                        value: menu.menuType,
                        label: menu.name || menu.menuType,
                      }))}
                      {...form.getInputProps('menuTypes')}
                      searchable
                      error={form.errors.menuTypes}
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
              label={t('auth.stepTwo', language)}
              description={t('menu.variations', language)}
              icon={<IconCheck size={18} />}
            >
              <Stack gap="md" mt="xl">
                <MultiSelect
                  label={t('menu.variationGroups', language) || t('menu.variations', language)}
                  placeholder={
                    variationGroups.length === 0
                        ? t('menu.noVariationGroupsAvailable', language)
                        : t('menu.selectVariationGroups', language)
                  }
                  description={t('menu.variationGroupsDescription', language)}
                  data={variationGroups.map((group) => ({
                    value: group.id,
                    label: group.name || '',
                  }))}
                  disabled={variationGroups.length === 0}
                  value={form.values.variationGroupIds}
                  onChange={handleVariationGroupChange}
                  searchable
                />
                {variationGroups.length === 0 && (
                  <Text size="sm" c="dimmed">
                    {t('menu.noVariationGroups', language) || 'Please create variation groups first'}
                  </Text>
                )}
                
                {/* Display and edit selected variations */}
                {form.values.variations.length > 0 && (
                  <Stack gap="xs">
                    <Text fw={500} size="sm">
                      {t('menu.variations', language)} ({form.values.variations.length})
                    </Text>
                    {Array.from(new Set(form.values.variations.map((v) => v.variationGroup))).map((groupName) => {
                      const groupVariationIndices = form.values.variations
                        .map((v, idx) => ({ v, idx }))
                        .filter(({ v }) => v.variationGroup === groupName)
                        .map(({ idx }) => idx);
                      
                      // Resolve group name in case it's still a UUID
                      const resolvedGroupName = resolveVariationGroupName(groupName);
                      
                      return (
                        <Paper key={groupName} p="md" withBorder>
                          <Stack gap="md">
                            <Text fw={500} size="sm">
                              {resolvedGroupName}
                            </Text>
                            <Table>
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th>{t('menu.variationName', language)}</Table.Th>
                                  <Table.Th>{t('menu.priceAdjustment', language)}</Table.Th>
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {groupVariationIndices.map((variationIndex) => {
                                  const variation = form.values.variations[variationIndex];
                                  return (
                                    <Table.Tr key={variationIndex}>
                                      <Table.Td>
                                        <Text>{variation.variationName}</Text>
                                      </Table.Td>
                                      <Table.Td>
                                        <NumberInput
                                          value={variation.priceAdjustment || 0}
                                          onChange={(value) => {
                                            form.setFieldValue(
                                              `variations.${variationIndex}.priceAdjustment`,
                                              typeof value === 'number' ? value : 0
                                            );
                                          }}
                                          placeholder="0"
                                          min={-999999}
                                          max={999999}
                                          decimalScale={2}
                                          style={{ width: 150 }}
                                        />
                                      </Table.Td>
                                    </Table.Tr>
                                  );
                                })}
                              </Table.Tbody>
                            </Table>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}

                <MultiSelect
                  label={t('menu.labels', language)}
                  data={labelOptions}
                  {...form.getInputProps('labels')}
                />
              </Stack>
            </Stepper.Step>

            <Stepper.Step
              label={t('auth.stepThree', language)}
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
                          data={DISCOUNT_TYPES.map(type => ({
                            value: type.value,
                            label: t(`menu.${type.value}` as any, language) || type.label,
                          }))}
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
              <Button type="button" variant="default" onClick={prevStep} disabled={submitting}>
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
                disabled={submitting}
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
                loading={submitting}
                disabled={submitting}
              >
                {t('common.save' as any, language) || 'Save'}
              </Button>
            )}
          </Group>
        </form>
      </Modal>

      <BulkImportModal
        opened={bulkImportOpened}
        onClose={() => setBulkImportOpened(false)}
        onSuccess={() => {
          loadData();
          notifyMenuDataUpdate('food-items-updated');
        }}
        entityType="foodItem"
        entityName={t('menu.foodItems', language) || 'Food Items'}
        downloadSample={async () => {
          return await menuApi.downloadBulkImportSample('foodItem', language);
        }}
        uploadFile={async (file: File) => {
          return await menuApi.bulkImportFoodItems(file, selectedBranchId || undefined);
        }}
      />
    </Stack>
  );
}

