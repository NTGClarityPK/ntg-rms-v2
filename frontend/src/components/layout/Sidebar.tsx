'use client';

import {
  NavLink,
  Stack,
  Text,
  Divider,
  ScrollArea,
  ActionIcon,
  Tooltip,
  Box,
} from '@mantine/core';
import {
  IconDashboard,
  IconBuildingStore,
  IconMenu2,
  IconShoppingCart,
  IconClipboardList,
  IconPackage,
  IconUsers,
  IconUser,
  IconTruck,
  IconChartBar,
  IconSettings,
  IconChevronLeft,
  IconChevronRight,
  IconDiscount,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMantineTheme } from '@mantine/core';
import { t } from '@/lib/utils/translations';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { usePermissions } from '@/lib/hooks/use-permissions';

const navItems = [
  { href: '/dashboard', icon: IconDashboard, key: 'dashboard', permission: null }, // Dashboard always visible
  { href: '/restaurant', icon: IconBuildingStore, key: 'restaurant', permission: { resource: 'restaurant', action: 'view' } },
  { href: '/menu', icon: IconMenu2, key: 'menu', permission: { resource: 'menu', action: 'view' } },
  { href: '/pos', icon: IconShoppingCart, key: 'pos', permission: { resource: 'orders', action: 'create' } },
  { href: '/orders', icon: IconClipboardList, key: 'orders', permission: { resource: 'orders', action: 'view' } },
  { href: '/inventory', icon: IconPackage, key: 'inventory', permission: { resource: 'inventory', action: 'view' } },
  { href: '/employees', icon: IconUsers, key: 'employees', permission: { resource: 'employees', action: 'view' } },
  { href: '/customers', icon: IconUser, key: 'customers', permission: { resource: 'customers', action: 'view' } },
  { href: '/delivery', icon: IconTruck, key: 'delivery', permission: { resource: 'deliveries', action: 'view' } },
  { href: '/coupons', icon: IconDiscount, key: 'coupons', permission: { resource: 'coupons', action: 'view' } },
  { href: '/reports', icon: IconChartBar, key: 'reports', permission: { resource: 'reports', action: 'view' } },
  { href: '/settings', icon: IconSettings, key: 'settings', permission: { resource: 'settings', action: 'view' } },
] as const;

type NavItemKey = typeof navItems[number]['key'];
type NavigationKey = `navigation.${NavItemKey}`;

interface SidebarProps {
  onMobileClose?: () => void;
  collapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function Sidebar({ onMobileClose, collapsed = false, onCollapseChange }: SidebarProps = {}) {
  const { language } = useLanguageStore();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useMantineTheme();
  const primary = useThemeColor();
  const { hasPermission } = usePermissions();

  // Filter items based on permissions
  // If user has no permissions loaded yet, show all items (fallback for owners/managers)
  const visibleItems = navItems.filter((item) => {
    if (!item.permission) return true; // Dashboard always visible
    
    // If permissions aren't loaded yet, show all items (will be filtered once loaded)
    const { user } = useAuthStore.getState();
    if (!user?.permissions || user.permissions.length === 0) {
      // For tenant_owner or manager role, show all items as fallback
      if (user?.role === 'tenant_owner' || user?.role === 'manager') {
        return true;
      }
      return false;
    }
    
    return hasPermission(item.permission.resource, item.permission.action);
  });

  // Group menu items by category
  const mainItems = visibleItems.filter(
    (item) =>
      item.href === '/dashboard' ||
      item.href.startsWith('/pos') ||
      item.href === '/menu' ||
      item.href === '/orders' ||
      item.href === '/delivery'
  );
  const managementItems = visibleItems.filter(
    (item) =>
      item.href === '/restaurant' ||
      item.href === '/customers' ||
      item.href === '/inventory' ||
      item.href === '/employees' ||
      item.href === '/coupons' ||
      item.href === '/reports' ||
      item.href === '/settings'
  );

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname === href || pathname?.startsWith(href + '/');
  };

  const renderNavItems = (items: Array<typeof navItems[number]>) => {
    return items.map((item) => {
      const label = t(`navigation.${item.key}` as any, language);
      const navLink = (
        <NavLink
          key={item.href}
          component={Link}
          href={item.href}
          label={collapsed ? undefined : label}
          leftSection={<item.icon size={20} />}
          active={isActive(item.href)}
          onClick={() => {
            onMobileClose?.();
          }}
          style={{
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0.5rem' : undefined,
          }}
        />
      );

      if (collapsed) {
        return (
          <Tooltip key={item.href} label={label} position="right" withArrow>
            {navLink}
          </Tooltip>
        );
      }

      return navLink;
    });
  };

  return (
    <Stack h="100%" justify="space-between">
      <ScrollArea h="100%" style={{ flex: 1 }}>
        <Stack gap="xs" p={collapsed ? "xs" : "md"}>
          {/* Main Navigation */}
          {!collapsed && (
            <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="xs">
              {t('dashboard.navigation', language)}
            </Text>
          )}
          {renderNavItems(mainItems)}

          {/* Management Section */}
          {managementItems.length > 0 && (
            <>
              {!collapsed && <Divider my="sm" />}
              {!collapsed && (
                <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="xs">
                  {t('dashboard.management', language)}
                </Text>
              )}
              {renderNavItems(managementItems)}
            </>
          )}
        </Stack>
      </ScrollArea>

      {/* Toggle Button */}
      <Box p={collapsed ? "xs" : "md"} style={{ borderTop: `1px solid ${theme.colors.gray[3]}`, display: collapsed ? 'flex' : 'block', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <Tooltip label={collapsed ? (t('navigation.expand', language) || 'Expand') : (t('navigation.collapse', language) || 'Collapse')} position="right" withArrow>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => onCollapseChange?.(!collapsed)}
            style={{ width: collapsed ? 'auto' : '100%' }}
          >
            {(() => {
              const isRTL = language === 'ar';
              if (isRTL) {
                // RTL: reversed logic
                return collapsed ? <IconChevronLeft size={20} /> : <IconChevronRight size={20} />;
              } else {
                // LTR: normal logic
                return collapsed ? <IconChevronRight size={20} /> : <IconChevronLeft size={20} />;
              }
            })()}
          </ActionIcon>
        </Tooltip>
      </Box>
    </Stack>
  );
}

