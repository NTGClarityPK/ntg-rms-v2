'use client';

import {
  Stack,
  Text,
  Divider,
  ScrollArea,
  ActionIcon,
  Tooltip,
  Box,
  Button,
} from '@mantine/core';
import {
  IconDashboard,
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
  IconBook,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMantineTheme } from '@mantine/core';
import { t } from '@/lib/utils/translations';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { useState, useEffect } from 'react';
import type { ThemeConfig } from '@/lib/theme/themeConfig';

const navItems = [
  { href: '/dashboard', icon: IconDashboard, key: 'dashboard', permission: null }, // Dashboard always visible
  { href: '/menu', icon: IconMenu2, key: 'menu', permission: { resource: 'menu', action: 'view' } },
  { href: '/pos', icon: IconShoppingCart, key: 'pos', permission: { resource: 'orders', action: 'create' } },
  { href: '/orders', icon: IconClipboardList, key: 'orders', permission: { resource: 'orders', action: 'view' } },
  { href: '/inventory', icon: IconPackage, key: 'inventory', permission: { resource: 'inventory', action: 'view' } },
  { href: '/recipes', icon: IconBook, key: 'recipes', permission: { resource: 'inventory', action: 'view' } },
  { href: '/employees', icon: IconUsers, key: 'employees', permission: { resource: 'employees', action: 'view' } },
  { href: '/customers', icon: IconUser, key: 'customers', permission: { resource: 'customers', action: 'view' } },
  { href: '/delivery', icon: IconTruck, key: 'delivery', permission: { resource: 'deliveries', action: 'view' } },
  { href: '/coupons', icon: IconDiscount, key: 'coupons', permission: { resource: 'coupons', action: 'view' } },
  { href: '/reports', icon: IconChartBar, key: 'reports', permission: { resource: 'reports', action: 'view' } },
  { href: '/settings', icon: IconSettings, key: 'settings', permission: { resource: 'settings', action: 'view' } },
] as const;

type NavItemKey = typeof navItems[number]['key'];

interface SidebarProps {
  onMobileClose?: () => void;
  collapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function Sidebar({ onMobileClose, collapsed = false, onCollapseChange }: SidebarProps = {}) {
  const { language } = useLanguageStore();
  const pathname = usePathname();
  const theme = useMantineTheme();
  const themeConfig = (theme.other as any) as ThemeConfig | undefined;
  const { hasPermission } = usePermissions();
  const syncStatus = useSyncStatus();
  const [, forceUpdate] = useState(0);
  
  // Check navigator.onLine directly in render (always up-to-date)
  const navigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  
  // Use both navigator and syncStatus - if either says offline, we're offline
  const isOnline = navigatorOnline && syncStatus.isOnline;
  
  // Force re-render when online/offline events fire
  useEffect(() => {
    const handleOnline = () => {
      console.log('🟢 Sidebar: Online event fired, navigator.onLine:', navigator.onLine);
      forceUpdate(prev => prev + 1);
    };
    const handleOffline = () => {
      console.log('🔴 Sidebar: Offline event fired, navigator.onLine:', navigator.onLine);
      forceUpdate(prev => prev + 1);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Also poll navigator.onLine every second as a fallback
    const pollInterval = setInterval(() => {
      const currentOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (currentOnline !== navigatorOnline) {
        console.log('🔌 Sidebar: Poll detected change - navigator.onLine:', currentOnline);
        forceUpdate(prev => prev + 1);
      }
    }, 1000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(pollInterval);
    };
  }, [navigatorOnline]);
  
  // Debug log
  useEffect(() => {
    console.log('🔌 Sidebar render - isOnline:', isOnline, 'navigatorOnline:', navigatorOnline, 'syncStatus.isOnline:', syncStatus.isOnline);
  }, [isOnline, navigatorOnline, syncStatus.isOnline]);

  // Items that should be disabled when offline
  const offlineDisabledItems = ['/dashboard', '/employees', '/customers', '/reports'];

  // Filter items based on permissions
  const visibleItems = navItems.filter((item) => {
    if (!item.permission) return true; // Dashboard always visible
    
    // If permissions aren't loaded yet, show items based on role as fallback
    const { user } = useAuthStore.getState();
    if (!user?.permissions || user.permissions.length === 0) {
      const roleFallbacks: Record<string, string[]> = {
        // Super Admin: Full access to everything (legacy role, treat as manager)
        super_admin: ['/menu', '/pos', '/orders', '/inventory', '/recipes', '/employees', '/customers', '/delivery', '/coupons', '/reports', '/settings'],
        // Manager: Full access to everything
        manager: ['/menu', '/pos', '/orders', '/inventory', '/recipes', '/employees', '/customers', '/delivery', '/coupons', '/reports', '/settings'],
        // Tenant Owner: Full access to everything
        tenant_owner: ['/menu', '/pos', '/orders', '/inventory', '/recipes', '/employees', '/customers', '/delivery', '/coupons', '/reports', '/settings'],
        // Cashier: Orders (full), Menu (view), Customers (view/create/update), Reports (view)
        // Permissions: orders (view/create/update/delete), menu (view), customers (view/create/update), reports (view)
        cashier: ['/pos', '/orders', '/menu', '/customers', '/reports'],
        kitchen_staff: ['/orders', '/menu', '/inventory'],
        waiter: ['/pos', '/orders', '/menu', '/customers'],
        delivery: ['/orders', '/delivery', '/customers'],
      };
      
      const userRole = user?.role;
      if (userRole && roleFallbacks[userRole]) {
        return roleFallbacks[userRole].includes(item.href);
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
      item.href === '/orders' ||
      item.href === '/delivery'
  );
  const managementItems = visibleItems.filter(
    (item) =>
      item.href === '/menu' ||
      item.href === '/customers' ||
      item.href === '/inventory' ||
      item.href === '/recipes' ||
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

  const navbarConfig = themeConfig?.components?.navbar;
  const navButtonConfig = themeConfig?.components?.navButton;

  const renderNavItems = (items: Array<typeof navItems[number]>) => {
    // Force re-check online status in render
    const renderTimeOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const finalIsOnline = renderTimeOnline && syncStatus.isOnline;
    
    return items.map((item) => {
      const label = t(`navigation.${item.key}` as any, language);
      const isDisabled = !finalIsOnline && offlineDisabledItems.includes(item.href);
      const active = isActive(item.href);
      
      const handleClick = (e: React.MouseEvent) => {
        if (isDisabled) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        onMobileClose?.();
      };

      const buttonContent = (
        <Button
          component={isDisabled ? 'div' : Link}
          href={isDisabled ? undefined : item.href}
          variant="subtle"
          size="md"
          fullWidth={!collapsed}
          leftSection={collapsed ? undefined : <item.icon size={24} />}
          className="nav-item-button"
          data-active={active}
          data-collapsed={collapsed}
          onClick={handleClick}
          disabled={isDisabled}
          style={{
            backgroundColor: active 
              ? navbarConfig?.activeBackground 
              : navButtonConfig?.backgroundColor || 'transparent',
            color: active 
              ? navbarConfig?.activeTextColor 
              : navButtonConfig?.textColor || navbarConfig?.textColor,
            opacity: isDisabled ? 0.3 : 1,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
          }}
          styles={{
            root: {
              '&:hover:not(:disabled)': {
                backgroundColor: active 
                  ? navbarConfig?.activeBackground 
                  : navbarConfig?.hoverBackground,
                color: active 
                  ? navbarConfig?.activeTextColor 
                  : navbarConfig?.hoverTextColor,
              },
            },
          }}
        >
          {collapsed ? <item.icon size={24} /> : label}
        </Button>
      );

      const tooltipLabel = isDisabled 
        ? (t('navigation.offlineDisabled' as any, language) || 'This section is not available offline')
        : label;

      if (collapsed) {
        return (
          <Tooltip key={item.href} label={tooltipLabel} position="right" withArrow>
            <Box style={{ display: 'inline-block', width: '100%' }}>{buttonContent}</Box>
          </Tooltip>
        );
      }

      // For non-collapsed, wrap disabled items in tooltip too
      if (isDisabled) {
        return (
          <Tooltip key={item.href} label={tooltipLabel} position="right" withArrow>
            <Box style={{ display: 'inline-block', width: '100%' }}>{buttonContent}</Box>
          </Tooltip>
        );
      }

      return <Box key={item.href}>{buttonContent}</Box>;
    });
  };

  const isRTL = language === 'ar';

  return (
    <Stack h="100%" justify="space-between" gap={0}>
      <ScrollArea h="100%" style={{ flex: 1 }}>
        <Stack gap="xs" p={collapsed ? "xs" : "md"}>
          {/* Main Navigation */}
          {!collapsed && (
            <Text 
              size="xs" 
              tt="uppercase" 
              fw={700} 
              c="dimmed" 
              mb="xs"
              style={{ color: navbarConfig?.textColor }}
            >
              {t('dashboard.navigation', language)}
            </Text>
          )}
          {renderNavItems(mainItems)}

          {/* Management Section */}
          {managementItems.length > 0 && (
            <>
              {!collapsed && <Divider my="sm" />}
              {!collapsed && (
                <Text 
                  size="xs" 
                  tt="uppercase" 
                  fw={700} 
                  c="dimmed" 
                  mb="xs"
                  style={{ color: navbarConfig?.textColor }}
                >
                  {t('dashboard.management', language)}
                </Text>
              )}
              {renderNavItems(managementItems)}
            </>
          )}
        </Stack>
      </ScrollArea>

      {/* Toggle Button */}
      <Box 
        p={collapsed ? "xs" : "md"} 
        style={{ 
          borderTop: `1px solid ${navbarConfig?.borderColor || 'transparent'}`,
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <Tooltip 
          label={collapsed 
            ? (t('navigation.expand', language) || 'Expand') 
            : (t('navigation.collapse', language) || 'Collapse')} 
          position="right" 
          withArrow
        >
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => onCollapseChange?.(!collapsed)}
            className="nav-toggle-button"
            style={{
              width: collapsed ? 'auto' : '100%',
              backgroundColor: 'transparent',
              color: navbarConfig?.textColor,
            }}
            styles={{
              root: {
                '&:hover': {
                  backgroundColor: navbarConfig?.hoverBackground,
                  color: navbarConfig?.hoverTextColor,
                },
              },
            }}
          >
            {isRTL ? (
              // RTL: reversed logic
              collapsed ? <IconChevronLeft size={24} /> : <IconChevronRight size={24} />
            ) : (
              // LTR: normal logic
              collapsed ? <IconChevronRight size={24} /> : <IconChevronLeft size={24} />
            )}
          </ActionIcon>
        </Tooltip>
      </Box>
    </Stack>
  );
}
