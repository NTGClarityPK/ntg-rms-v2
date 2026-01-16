'use client';

import { useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from '@mantine/form';
import {
  Title,
  Button,
  Stack,
  Paper,
  Text,
  Group,
  Badge,
  Switch,
  Skeleton,
  Alert,
  MultiSelect,
  Modal,
  TextInput,
  ActionIcon,
  Grid,
  Loader,
} from '@mantine/core';
import { IconMenu2, IconAlertCircle, IconCheck, IconPlus, IconTrash, IconFileSpreadsheet } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, FoodItem } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { API_BASE_URL } from '@/lib/constants/api';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';
import { isPaginatedResponse } from '@/lib/types/pagination.types';
import { handleApiError } from '@/shared/utils/error-handler';
import { BulkImportModal } from '@/components/common/BulkImportModal';

export function MenusPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const [menus, setMenus] = useState<any[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [selectedMenuType, setSelectedMenuType] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingMenu, setPendingMenu] = useState<Partial<any> | null>(null);
  const [updatingMenuType, setUpdatingMenuType] = useState<string | null>(null);
  const [deletingMenuType, setDeletingMenuType] = useState<string | null>(null);
  const [bulkImportOpened, setBulkImportOpened] = useState(false);

  const form = useForm({
    initialValues: {
      name: '',
      foodItemIds: [] as string[],
      isActive: true,
    },
    validate: {
      name: (value) => {
        if (!value) return (t('menu.menuName', language) || 'Menu Name') + ' is required';
        if (value.trim().length < 2) {
          return 'Menu name must be at least 2 characters';
        }
        return null;
      },
    },
  });

  // Generate a unique menu type from the menu name
  const generateMenuType = (name: string, existingMenus: any[]): string => {
    // Convert to lowercase, replace spaces and special chars with underscores
    let baseType = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

    // If empty after cleaning, use a default
    if (!baseType) {
      baseType = 'menu';
    }

    // Get existing menu types
    const existingTypes = existingMenus.map((m) => m.menuType);
    const defaultMenuTypes = ['all_day', 'breakfast', 'lunch', 'dinner', 'kids_special'];
    const allExistingTypes = [...defaultMenuTypes, ...existingTypes];

    // Check if base type is unique
    if (!allExistingTypes.includes(baseType)) {
      return baseType;
    }

    // If not unique, append a number
    let counter = 1;
    let uniqueType = `${baseType}_${counter}`;
    while (allExistingTypes.includes(uniqueType)) {
      counter++;
      uniqueType = `${baseType}_${counter}`;
    }

    return uniqueType;
  };

  const loadData = useCallback(async (showLoading: boolean = true) => {
    if (!user?.tenantId) return;

    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);

      // Load menus
      const menuListResponse = await menuApi.getMenus(undefined, selectedBranchId || undefined, language);
      const menuList = Array.isArray(menuListResponse) ? menuListResponse : (menuListResponse?.data || []);
      setMenus(menuList);

      // Load food items (all items, not just active, for menu assignment)
      const itemsResponse = await menuApi.getFoodItems(undefined, undefined, undefined, false, selectedBranchId || undefined, language);
      const items = Array.isArray(itemsResponse) ? itemsResponse : (itemsResponse?.data || []);
      // Filter out items without names, but keep all items (active and inactive) for menu assignment
      setFoodItems(items.filter((item) => item.name && item.name.trim()));
    } catch (err: any) {
      setError(err.message || 'Failed to load menus');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, selectedBranchId, language]);

  useEffect(() => {
    loadData();
    
    // Listen for data updates from other tabs
    const unsubscribe1 = onMenuDataUpdate('menus-updated', () => {
      loadData();
    });
    
    // Also listen for food items updates since menus depend on food items
    const unsubscribe2 = onMenuDataUpdate('food-items-updated', () => {
      loadData();
    });
    
    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [loadData]);

  const handleAssignItems = async (menuType: string) => {
    try {
      // Proactively refresh token if it's expiring soon (before long pagination loop)
      const accessToken = localStorage.getItem('rms_access_token');
      if (accessToken) {
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]));
          const now = Math.floor(Date.now() / 1000);
          const exp = payload.exp;
          const timeUntilExpiry = exp - now;
          
          // If token expires within 5 minutes, refresh it proactively
          if (timeUntilExpiry < 300) {
            const refreshToken = localStorage.getItem('rms_refresh_token');
            if (refreshToken) {
              try {
                const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refreshToken }),
                });
                
                if (response.ok) {
                  const data = await response.json();
                  const responseData = data?.data || data;
                  if (responseData.accessToken) {
                    localStorage.setItem('rms_access_token', responseData.accessToken);
                    if (responseData.refreshToken) {
                      localStorage.setItem('rms_refresh_token', responseData.refreshToken);
                    }
                    console.log('Token proactively refreshed before pagination');
                  }
                }
              } catch (refreshErr) {
                console.warn('Proactive token refresh failed, continuing anyway:', refreshErr);
              }
            }
          }
        } catch (decodeErr) {
          // If we can't decode token, continue anyway
          console.warn('Could not decode token for proactive refresh check');
        }
      }
      
      // Always load fresh food items when opening modal to ensure we have all items
      // Fetch all items by making multiple paginated requests (backend limit is 100)
      const allItems: FoodItem[] = [];
      let page = 1;
      let hasMore = true;
      const limit = 100; // Backend max limit
      
      while (hasMore) {
        const itemsResponse = await menuApi.getFoodItems(undefined, { page, limit }, undefined, false, selectedBranchId || undefined, language);
        const items = Array.isArray(itemsResponse) ? itemsResponse : (itemsResponse?.data || []);
        allItems.push(...items);
        
        // Check if there are more pages
        if (isPaginatedResponse(itemsResponse)) {
          hasMore = itemsResponse.pagination?.hasNext || false;
        } else {
          // If not paginated, check if we got a full page (might indicate more)
          hasMore = items.length === limit;
        }
        page++;
      }
      
      const itemsWithNames = allItems.filter((item) => item.name && item.name.trim());
      setFoodItems(itemsWithNames);
      
      const currentItems = await menuApi.getMenuItems(menuType);
      // Set all selected items - they should all have names and be in itemsWithNames
      setSelectedItemIds(currentItems);
      setSelectedMenuType(menuType);
      setAssignModalOpened(true);
    } catch (err: any) {
      handleApiError(err, {
        defaultMessage: 'Failed to load menu items',
        language,
        errorColor,
      });
    }
  };

  const handleSaveAssignment = async () => {
    // Close modal immediately
    const currentMenuType = selectedMenuType;
    const currentItemIds = selectedItemIds;
    setAssignModalOpened(false);

    // Track updating state for this menu
    setUpdatingMenuType(currentMenuType);

    // Run API calls in background
    (async () => {
      try {
        await menuApi.assignItemsToMenu(currentMenuType, currentItemIds);
        
        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.saveSuccess', language),
          color: successColor,
        });

        setUpdatingMenuType(null);
        loadData();
        // Notify other tabs that menus have been updated
        notifyMenuDataUpdate('menus-updated');
      } catch (err: any) {
        setUpdatingMenuType(null);
        notifications.show({
          title: t('common.error' as any, language) || 'Error',
          message: err.message || 'Failed to assign items',
          color: errorColor,
        });
      }
    })();
  };

  const handleToggleMenu = async (menuType: string, isActive: boolean) => {
    // Optimistically update the UI immediately
    setMenus((prevMenus) =>
      prevMenus.map((menu) =>
        menu.menuType === menuType ? { ...menu, isActive } : menu
      )
    );

    try {
      await menuApi.activateMenu(menuType, isActive);
      
      // Reload data to ensure consistency with server (without showing loading state)
      await loadData(false);
      
      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: isActive
          ? t('menu.activate', language) + ' ' + (t('common.success' as any, language) || 'Success')
          : t('menu.deactivate', language) + ' ' + (t('common.success' as any, language) || 'Success'),
        color: successColor,
      });
      
      // Notify other tabs that menus have been updated
      notifyMenuDataUpdate('menus-updated');
    } catch (err: any) {
      // Revert the optimistic update on error
      setMenus((prevMenus) =>
        prevMenus.map((menu) =>
          menu.menuType === menuType ? { ...menu, isActive: !isActive } : menu
        )
      );
      
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: err.message || 'Failed to update menu',
        color: errorColor,
      });
    }
  };

  const handleOpenCreateModal = () => {
    form.reset();
    setCreateModalOpened(true);
  };

  const handleCloseCreateModal = () => {
    setCreateModalOpened(false);
    form.reset();
  };

  const handleCreateMenu = async (values: typeof form.values) => {
    if (!user?.tenantId || submitting) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmitting(true);
    });

    // Generate unique menu type from name
    const menuType = generateMenuType(values.name, menus);

    // Close modal immediately
    handleCloseCreateModal();

    // Add pending menu skeleton
    setPendingMenu({
      menuType,
      name: values.name.trim(),
      itemCount: values.foodItemIds.length,
      isActive: values.isActive,
    });

    try {
      await menuApi.createMenu(
        {
          menuType,
          name: values.name.trim(),
          foodItemIds: values.foodItemIds.length > 0 ? values.foodItemIds : undefined,
          isActive: values.isActive,
        },
        selectedBranchId || undefined
      );

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('menu.saveSuccess', language),
        color: successColor,
      });

      // Remove pending menu skeleton
      setPendingMenu(null);

      loadData();
      notifyMenuDataUpdate('menus-updated');
    } catch (err: any) {
      handleApiError(err, {
        defaultMessage: 'Failed to create menu',
        language,
        errorColor,
        showNotification: true,
      });
      
      // Remove pending menu skeleton on error
      setPendingMenu(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMenu = (menu: any) => {
    modals.openConfirmModal({
      title: t('common.delete' as any, language) || 'Delete',
      children: (
        <Text size="sm">
          {t('menu.deleteMenuConfirm', language) || `Are you sure you want to delete the menu "${menu.name}"? This will remove all items from this menu.`}
        </Text>
      ),
      labels: { 
        confirm: t('common.delete' as any, language) || 'Delete', 
        cancel: t('common.cancel' as any, language) || 'Cancel' 
      },
      confirmProps: { color: errorColor },
      onConfirm: async () => {
        setDeletingMenuType(menu.menuType);
        try {
          await menuApi.deleteMenu(menu.menuType);
          
          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          setDeletingMenuType(null);
          loadData();
          notifyMenuDataUpdate('menus-updated');
        } catch (err: any) {
          setDeletingMenuType(null);
          handleApiError(err, {
            defaultMessage: 'Failed to delete menu',
            language,
            errorColor,
            showNotification: true,
          });
        }
      },
    });
  };


  const menuTypeLabels: Record<string, string> = {
    all_day: t('menu.allDay', language),
    breakfast: t('menu.breakfast', language),
    lunch: t('menu.lunch', language),
    dinner: t('menu.dinner', language),
    kids_special: t('menu.kidsSpecial', language),
  };

  const defaultMenuTypes = ['all_day', 'breakfast', 'lunch', 'dinner', 'kids_special'];


  return (
    <Stack gap="md">
      <Group justify="space-between" mb="xl">
        <Title order={2}>
          {t('menu.menuManagement', language)}
        </Title>
        <Group gap="xs">
          <Button
            leftSection={<IconFileSpreadsheet size={16} />}
            onClick={() => setBulkImportOpened(true)}
            variant="light"
          >
            {t('bulkImport.bulkImport', language) || 'Bulk Import'}
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={handleOpenCreateModal}
            style={{ backgroundColor: primaryColor }}
          >
            {t('menu.createMenu', language) || 'Create Menu'}
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack gap="md">
          {[1, 2, 3, 4, 5].map((i) => (
            <Paper key={i} p="md" withBorder>
              <Group justify="space-between">
                <Group>
                  <Skeleton height={24} width={24} radius="md" />
                  <div>
                    <Skeleton height={20} width={150} mb="xs" />
                    <Skeleton height={16} width={100} />
                  </div>
                  <Skeleton height={24} width={60} radius="xl" />
                </Group>
                <Group>
                  <Skeleton height={36} width={120} radius="md" />
                  <Skeleton height={20} width={60} />
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Stack gap="md">
        {/* Show pending menu skeleton when creating */}
        {pendingMenu && (
          <Paper p="md" withBorder style={{ opacity: 0.7, position: 'relative' }}>
            <Group justify="space-between">
              <Group>
                <Skeleton height={24} width={24} radius="md" />
                <div>
                  <Group gap="xs" wrap="nowrap">
                    <Skeleton height={20} width={150} />
                    <Loader size={16} style={{ flexShrink: 0 }} />
                  </Group>
                  <Skeleton height={16} width={100} mt={4} />
                </div>
                <Skeleton height={24} width={60} radius="xl" />
              </Group>
              <Group>
                <Skeleton height={36} width={120} radius="md" />
                <Skeleton height={20} width={60} />
              </Group>
            </Group>
          </Paper>
        )}
        {menus.map((menu) => {
          const isUpdating = updatingMenuType === menu.menuType;
          return (
            <Paper key={menu.menuType} p="md" withBorder style={{ opacity: isUpdating ? 0.7 : 1, position: 'relative' }}>
              {isUpdating ? (
                <Group justify="space-between">
                  <Group>
                    <Skeleton height={24} width={24} radius="md" />
                    <div>
                      <Group gap="xs" wrap="nowrap">
                        <Skeleton height={20} width={150} />
                        <Loader size={16} style={{ flexShrink: 0 }} />
                      </Group>
                      <Skeleton height={16} width={100} mt={4} />
                    </div>
                    <Skeleton height={24} width={60} radius="xl" />
                  </Group>
                  <Group>
                    <Skeleton height={36} width={120} radius="md" />
                    <Skeleton height={20} width={60} />
                  </Group>
                </Group>
              ) : (
                <Group justify="space-between">
                  <Group>
                    <IconMenu2 size={24} color={primaryColor} />
                    <div>
                      <Text fw={500}>{menu.name || menu.menuType}</Text>
                      <Text size="sm" c="dimmed">
                        {menu.itemCount} {t('menu.foodItems', language)}
                      </Text>
                    </div>
                    <Badge variant="light" color={getBadgeColorForText(menu.isActive ? t('menu.active', language) : t('menu.inactive', language))}>
                      {menu.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                    </Badge>
                  </Group>
                  <Group>
                    <Button
                      variant="light"
                      onClick={() => handleAssignItems(menu.menuType)}
                      style={{ color: primaryColor }}
                      disabled={deletingMenuType === menu.menuType || updatingMenuType === menu.menuType}
                    >
                      {t('menu.assignItems', language)}
                    </Button>
                    <Switch
                      checked={menu.isActive}
                      onChange={(e) => handleToggleMenu(menu.menuType, e.currentTarget.checked)}
                      label={menu.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                      disabled={deletingMenuType === menu.menuType || updatingMenuType === menu.menuType}
                    />
                    {!defaultMenuTypes.includes(menu.menuType) && (
                      <ActionIcon
                        variant="light"
                        color={errorColor}
                        onClick={() => handleDeleteMenu(menu)}
                        disabled={deletingMenuType === menu.menuType || updatingMenuType === menu.menuType}
                      >
                        {deletingMenuType === menu.menuType ? (
                          <Loader size={16} />
                        ) : (
                          <IconTrash size={16} />
                        )}
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
              )}
            </Paper>
          );
        })}
      </Stack>
      )}

      <Modal
        opened={assignModalOpened}
        onClose={() => setAssignModalOpened(false)}
        title={t('menu.assignItems', language)}
        size="lg"
      >
        <Stack gap="md">
          <MultiSelect
            label={t('menu.foodItems', language)}
            data={foodItems.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            value={selectedItemIds}
            onChange={(value) => setSelectedItemIds(value)}
            searchable
            clearable
            size="md"
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setAssignModalOpened(false)}>
              {t('common.cancel' as any, language) || 'Cancel'}
            </Button>
            <Button
              onClick={handleSaveAssignment}
              style={{ backgroundColor: primaryColor }}
            >
              {t('common.save' as any, language) || 'Save'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={createModalOpened}
        onClose={() => {
          if (!submitting) {
            handleCloseCreateModal();
          }
        }}
        title={t('menu.createMenu', language) || 'Create Menu'}
        size="lg"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
      >
        <form onSubmit={form.onSubmit(handleCreateMenu)}>
          <Stack gap="md">
            <TextInput
              label={t('menu.menuName', language) || 'Menu Name'}
              placeholder={t('menu.menuNamePlaceholder' as any, language) || 'Enter menu name'}
              required
              {...form.getInputProps('name')}
            />

            <MultiSelect
              label={t('menu.foodItems', language)}
              placeholder={t('menu.selectFoodItems' as any, language) || 'Select food items (optional)'}
              data={foodItems.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              {...form.getInputProps('foodItemIds')}
              searchable
              clearable
              size="md"
            />

            <Switch
              label={t('menu.isActive' as any, language) || 'Active'}
              {...form.getInputProps('isActive', { type: 'checkbox' })}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseCreateModal}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button
                type="submit"
                style={{ backgroundColor: primaryColor }}
                loading={submitting}
                disabled={submitting}
              >
                {t('common.create' as any, language) || 'Create'}
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
          notifyMenuDataUpdate('menus-updated');
        }}
        entityType="menu"
        entityName={t('menu.menus', language) || 'Menus'}
        downloadSample={async () => {
          return await menuApi.downloadBulkImportSample('menu');
        }}
        uploadFile={async (file: File) => {
          return await menuApi.bulkImportMenus(file, selectedBranchId || undefined);
        }}
      />
    </Stack>
  );
}

