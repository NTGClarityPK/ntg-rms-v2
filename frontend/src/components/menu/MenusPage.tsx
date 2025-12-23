'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@mantine/core';
import { IconMenu2, IconAlertCircle, IconCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { menuApi, FoodItem } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { onMenuDataUpdate, notifyMenuDataUpdate } from '@/lib/utils/menu-events';

export function MenusPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
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
      const menuListResponse = await menuApi.getMenus();
      const menuList = Array.isArray(menuListResponse) ? menuListResponse : (menuListResponse?.data || []);
      setMenus(menuList);

      // Load food items
      const itemsResponse = await menuApi.getFoodItems();
      const items = Array.isArray(itemsResponse) ? itemsResponse : (itemsResponse?.data || []);
      setFoodItems(items.filter((item) => item.isActive));
    } catch (err: any) {
      setError(err.message || 'Failed to load menus');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [user?.tenantId]);

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
      const currentItems = await menuApi.getMenuItems(menuType);
      setSelectedItemIds(currentItems);
      setSelectedMenuType(menuType);
      setAssignModalOpened(true);
    } catch (err: any) {
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: err.message || 'Failed to load menu items',
        color: errorColor,
      });
    }
  };

  const handleSaveAssignment = async () => {
    // Close modal immediately
    const currentMenuType = selectedMenuType;
    const currentItemIds = selectedItemIds;
    setAssignModalOpened(false);

    // Run API calls in background
    (async () => {
      try {
        await menuApi.assignItemsToMenu(currentMenuType, currentItemIds);
        
        notifications.show({
          title: t('common.success' as any, language) || 'Success',
          message: t('menu.saveSuccess', language),
          color: successColor,
        });

        loadData();
        // Notify other tabs that menus have been updated
        notifyMenuDataUpdate('menus-updated');
      } catch (err: any) {
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
      
      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: isActive
          ? t('menu.activate', language) + ' ' + (t('common.success' as any, language) || 'Success')
          : t('menu.deactivate', language) + ' ' + (t('common.success' as any, language) || 'Success'),
        color: successColor,
      });

      // Reload data to ensure consistency with server (without showing loading state)
      loadData(false);
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
    try {
      // Generate unique menu type from name
      const menuType = generateMenuType(values.name, menus);

      await menuApi.createMenu({
        menuType,
        name: values.name.trim(),
        foodItemIds: values.foodItemIds.length > 0 ? values.foodItemIds : undefined,
        isActive: values.isActive,
      });

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('menu.saveSuccess', language),
        color: successColor,
      });

      handleCloseCreateModal();
      loadData();
      notifyMenuDataUpdate('menus-updated');
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to create menu';
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
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
        try {
          await menuApi.deleteMenu(menu.menuType);
          
          notifications.show({
            title: t('common.success' as any, language) || 'Success',
            message: t('menu.deleteSuccess', language),
            color: successColor,
          });

          loadData();
          notifyMenuDataUpdate('menus-updated');
        } catch (err: any) {
          const errorMsg = err.response?.data?.message || err.message || 'Failed to delete menu';
          notifications.show({
            title: t('common.error' as any, language) || 'Error',
            message: errorMsg,
            color: errorColor,
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
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleOpenCreateModal}
          style={{ backgroundColor: primaryColor }}
        >
          {t('menu.createMenu', language) || 'Create Menu'}
        </Button>
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
        {menus.map((menu) => (
          <Paper key={menu.menuType} p="md" withBorder>
            <Group justify="space-between">
              <Group>
                <IconMenu2 size={24} color={primaryColor} />
                <div>
                  <Text fw={500}>{menuTypeLabels[menu.menuType] || menu.name || menu.menuType}</Text>
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
                >
                  {t('menu.assignItems', language)}
                </Button>
                <Switch
                  checked={menu.isActive}
                  onChange={(e) => handleToggleMenu(menu.menuType, e.currentTarget.checked)}
                  label={menu.isActive ? t('menu.active', language) : t('menu.inactive', language)}
                />
                {!defaultMenuTypes.includes(menu.menuType) && (
                  <ActionIcon
                    variant="light"
                    color={errorColor}
                    onClick={() => handleDeleteMenu(menu)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
            </Group>
          </Paper>
        ))}
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
              label: item.name || '',
            }))}
            value={selectedItemIds}
            onChange={(value) => setSelectedItemIds(value)}
            searchable
            clearable
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
    </Stack>
  );
}

