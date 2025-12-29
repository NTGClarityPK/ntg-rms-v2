'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, FoodItem, FoodItemVariation, FoodItemDiscount, VariationGroup } from '@/lib/api/menu';
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
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { isPaginatedResponse } from '@/lib/types/pagination.types';

export function FoodItemsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<FoodItem>({ initialPage: 1, initialLimit: 10 });
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

      // Load categories (only active ones for selection)
      const catsResponse = await menuApi.getCategories();
      const cats = Array.isArray(catsResponse) ? catsResponse : (catsResponse?.data || []);
      setCategories(cats.filter((cat) => cat.isActive));

      // Load add-on groups (only active ones for selection)
      const groupsResponse = await menuApi.getAddOnGroups();
      const groups = Array.isArray(groupsResponse) ? groupsResponse : (groupsResponse?.data || []);
      setAddOnGroups(groups.filter((group) => group.isActive));

      // Load menus for menu type selection
      const menuListResponse = await menuApi.getMenus();
      const menuList = Array.isArray(menuListResponse) ? menuListResponse : (menuListResponse?.data || []);
      setMenus(menuList);

      // Load variation groups with their variations
      const variationGroupsResponse = await menuApi.getVariationGroups();
      const variationGroupsList = Array.isArray(variationGroupsResponse) 
        ? variationGroupsResponse 
        : (variationGroupsResponse?.data || []);
      
      // Load variations for each group
      const groupsWithVariations = await Promise.all(
        variationGroupsList.map(async (group) => {
          try {
            const groupWithVariations = await menuApi.getVariationGroupById(group.id);
            return groupWithVariations;
          } catch (err) {
            return group;
          }
        })
      );
      setVariationGroups(groupsWithVariations);

      // Load food items - use server pagination if online, otherwise load from IndexedDB
      // Use refs to get the latest values to avoid stale closures
      const currentSearch = debouncedSearchRef.current;
      const currentPage = paginationPageRef.current;
      const currentLimit = paginationLimitRef.current;
      if (navigator.onLine) {
        try {
          const serverItemsResponse = await menuApi.getFoodItems(undefined, {
            page: currentPage,
            limit: currentLimit,
          }, currentSearch);
          const serverItems = pagination.extractData(serverItemsResponse);
          
          // Debug: log the response to see what we're getting
          console.log('Food items response:', {
            isPaginated: isPaginatedResponse(serverItemsResponse),
            response: serverItemsResponse,
            itemsCount: serverItems.length,
            currentTotal: pagination.total,
            currentTotalPages: pagination.totalPages,
          });
          
          // Extract pagination info from server response - this should set total/totalPages correctly
          const paginationInfo = pagination.extractPagination(serverItemsResponse);
          
          // Debug: log after extraction
          console.log('After extractPagination:', {
            paginationInfo,
            total: pagination.total,
            totalPages: pagination.totalPages,
            hasNext: pagination.hasNext,
            hasPrev: pagination.hasPrev,
          });
          
          // If response is not paginated but we have items, this means backend isn't returning pagination
          // In this case, we can't know the true total, so we'll show what we have
          if (!paginationInfo && Array.isArray(serverItemsResponse)) {
            console.warn('Server returned plain array instead of paginated response. Cannot determine total count.');
            // Only set pagination if we got exactly the limit (suggesting there might be more)
            if (serverItemsResponse.length === currentLimit) {
              // We got a full page, so there might be more - but we don't know the total
              // Set a minimum total to show pagination
              pagination.setTotal(serverItemsResponse.length);
              pagination.setTotalPages(1);
              pagination.setHasNext(true); // Assume there might be more
              pagination.setHasPrev(currentPage > 1);
            } else {
              // We got less than a full page, so this is likely all items
              pagination.setTotal(serverItemsResponse.length);
              pagination.setTotalPages(1);
              pagination.setHasNext(false);
              pagination.setHasPrev(false);
            }
          }
          
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
              menuType: item.menuType, // Legacy field, no default - show "-" if not set
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
          // Fallback to IndexedDB on error
          const localItems = await db.foodItems
            .where('tenantId')
            .equals(user.tenantId)
            .filter((item) => !item.deletedAt)
            .toArray();
          
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
                menuType: item.menuType, // No default - show "-" if not set
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
          
          // Apply search filter if provided
          let filteredItems = itemsWithRelations;
          if (currentSearch && currentSearch.trim()) {
            const searchLower = currentSearch.toLowerCase();
            filteredItems = itemsWithRelations.filter((item) => {
              const name = (item.name || '').toLowerCase();
              const description = (item.description || '').toLowerCase();
              return name.includes(searchLower) || description.includes(searchLower);
            });
          }
          
          // Apply local pagination
          const startIndex = (currentPage - 1) * currentLimit;
          const endIndex = startIndex + currentLimit;
          const paginatedItems = filteredItems.slice(startIndex, endIndex);
          
          setFoodItems(paginatedItems);
          // Set pagination info for offline mode
          pagination.setTotal(filteredItems.length);
          pagination.setTotalPages(Math.ceil(filteredItems.length / currentLimit));
          pagination.setHasNext(endIndex < filteredItems.length);
          pagination.setHasPrev(currentPage > 1);
        }
      } else {
        // Offline mode - load from IndexedDB with local pagination
        const localItems = await db.foodItems
          .where('tenantId')
          .equals(user.tenantId)
          .filter((item) => !item.deletedAt)
          .toArray();
        
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
              menuType: item.menuType, // No default - show "-" if not set
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
        
          // Apply search filter if provided
          let filteredItems = itemsWithRelations;
          if (currentSearch && currentSearch.trim()) {
            const searchLower = currentSearch.toLowerCase();
          filteredItems = itemsWithRelations.filter((item) => {
            const name = (item.name || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            return name.includes(searchLower) || description.includes(searchLower);
          });
        }
        
        // Apply local pagination
        const startIndex = (currentPage - 1) * currentLimit;
        const endIndex = startIndex + currentLimit;
        const paginatedItems = filteredItems.slice(startIndex, endIndex);
        
        setFoodItems(paginatedItems);
        // Set pagination info for offline mode
        pagination.setTotal(filteredItems.length);
        pagination.setTotalPages(Math.ceil(filteredItems.length / currentLimit));
        pagination.setHasNext(endIndex < filteredItems.length);
        pagination.setHasPrev(currentPage > 1);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit]);

  // Helper function to get menu name from menu type
  const getMenuName = (menuType: string): string => {
    const menu = menus.find((m) => m.menuType === menuType);
    if (menu) {
      return menu.name || menu.menuType;
    }
    
    // Fallback to translations for default menu types
    const menuTypeLabels: Record<string, string> = {
      all_day: t('menu.allDay', language),
      breakfast: t('menu.breakfast', language),
      lunch: t('menu.lunch', language),
      dinner: t('menu.dinner', language),
      kids_special: t('menu.kidsSpecial', language),
    };
    
    return menuTypeLabels[menuType] || menuType;
  };

  const handleOpenModal = async (item?: FoodItem) => {
    // Ensure add-on groups are loaded
    if (addOnGroups.length === 0) {
      try {
        const groupsResponse = await menuApi.getAddOnGroups();
        const groups = Array.isArray(groupsResponse) ? groupsResponse : (groupsResponse?.data || []);
        setAddOnGroups(groups.filter((group) => group.isActive));
      } catch (err) {
        console.error('Failed to load add-on groups:', err);
      }
    }

    // Ensure menus are loaded
    if (menus.length === 0) {
      try {
        const menuListResponse = await menuApi.getMenus();
        const menuList = Array.isArray(menuListResponse) ? menuListResponse : (menuListResponse?.data || []);
        setMenus(menuList);
      } catch (err) {
        console.error('Failed to load menus:', err);
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
        variationGroupIds: variationGroupIds,
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
    // Don't clear pendingItem here - it should only be cleared after API call completes
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
    let updatedVariations = currentVariations.filter(
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
            menuType: savedItem.menuType, // Legacy field, no default
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

      // Remove pending item skeleton
      setPendingItem(null);

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
      
      // Remove pending item skeleton on error
      setPendingItem(null);
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
      <Group justify="space-between">
        <TextInput
          placeholder={t('common.search', language) || 'Search food items...'}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, maxWidth: 400 }}
        />
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
              label={t('menu.step2', language)}
              description={t('menu.variations', language)}
              icon={<IconCheck size={18} />}
            >
              <Stack gap="md" mt="xl">
                <MultiSelect
                  label={t('menu.variationGroups', language) || t('menu.variations', language)}
                  placeholder={
                    variationGroups.length === 0
                      ? 'No variation groups available'
                      : 'Select variation groups'
                  }
                  description="All variations from selected groups will be automatically applied"
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
                      
                      return (
                        <Paper key={groupName} p="md" withBorder>
                          <Stack gap="md">
                            <Text fw={500} size="sm">
                              {groupName}
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

