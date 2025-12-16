'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Container,
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
} from '@mantine/core';
import { IconMenu2, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { menuApi, FoodItem } from '@/lib/api/menu';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
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
  const [selectedMenuType, setSelectedMenuType] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      // Load menus
      const menuList = await menuApi.getMenus();
      setMenus(menuList);

      // Load food items
      const items = await menuApi.getFoodItems();
      setFoodItems(items.filter((item) => item.isActive));
    } catch (err: any) {
      setError(err.message || 'Failed to load menus');
    } finally {
      setLoading(false);
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
    try {
      await menuApi.activateMenu(menuType, isActive);
      
      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: isActive
          ? t('menu.activate', language) + ' ' + (t('common.success' as any, language) || 'Success')
          : t('menu.deactivate', language) + ' ' + (t('common.success' as any, language) || 'Success'),
        color: successColor,
      });

      loadData();
      // Notify other tabs that menus have been updated
      notifyMenuDataUpdate('menus-updated');
    } catch (err: any) {
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: err.message || 'Failed to update menu',
        color: errorColor,
      });
    }
  };


  const menuTypeLabels: Record<string, string> = {
    all_day: t('menu.allDay', language),
    breakfast: t('menu.breakfast', language),
    lunch: t('menu.lunch', language),
    dinner: t('menu.dinner', language),
    kids_special: t('menu.kidsSpecial', language),
  };

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl">
        {t('menu.menuManagement', language)}
      </Title>

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
                  <Text fw={500}>{menuTypeLabels[menu.menuType] || menu.menuType}</Text>
                  <Text size="sm" c="dimmed">
                    {menu.itemCount} {t('menu.foodItems', language)}
                  </Text>
                </div>
                <Badge color={menu.isActive ? successColor : 'gray'}>
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
    </Container>
  );
}

