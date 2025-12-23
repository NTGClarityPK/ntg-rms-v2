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
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMantineTheme } from '@mantine/core';
import { t } from '@/lib/utils/translations';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { useState, useEffect } from 'react';

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
  const syncStatus = useSyncStatus();
  const [, forceUpdate] = useState(0);
  
  // Check navigator.onLine directly in render (always up-to-date)
  const navigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  
  // Use both navigator and syncStatus - if either says offline, we're offline
  // Also check if navigator.onLine is explicitly false (most reliable)
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
    
    // Also poll navigator.onLine every second as a fallback (in case events don't fire)
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
    // Force re-check online status in render
    const renderTimeOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const finalIsOnline = renderTimeOnline && syncStatus.isOnline;
    
    return items.map((item) => {
      const label = t(`navigation.${item.key}` as any, language);
      const isDisabled = !finalIsOnline && offlineDisabledItems.includes(item.href);
      
      // Debug log for disabled items
      if (isDisabled) {
        console.log('🚫 Sidebar: Disabling item:', item.href, 'finalIsOnline:', finalIsOnline, 'renderTimeOnline:', renderTimeOnline, 'syncStatus.isOnline:', syncStatus.isOnline);
      }
      
      const handleClick = (e: React.MouseEvent) => {
        if (isDisabled) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        onMobileClose?.();
      };

      const navLink = (
        <Box
          style={{
            opacity: isDisabled ? 0.3 : 1,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            pointerEvents: isDisabled ? 'none' : 'auto',
            backgroundColor: isDisabled ? theme.colors.gray[2] : 'transparent',
            filter: isDisabled ? 'grayscale(100%) brightness(0.8)' : 'none',
            borderRadius: '4px',
            position: 'relative',
          }}
        >
          {isDisabled && (
            <Box
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />
          )}
          {isDisabled ? (
            <NavLink
              key={item.href}
              component="div"
              label={collapsed ? undefined : label}
              leftSection={<item.icon size={20} />}
              active={isActive(item.href)}
              onClick={handleClick}
              style={{
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '0.5rem' : undefined,
                position: 'relative',
                zIndex: 0,
              }}
            />
          ) : (
            <NavLink
              key={item.href}
              component={Link}
              href={item.href}
              label={collapsed ? undefined : label}
              leftSection={<item.icon size={20} />}
              active={isActive(item.href)}
              onClick={handleClick}
              style={{
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '0.5rem' : undefined,
                position: 'relative',
                zIndex: 1,
              }}
            />
          )}
        </Box>
      );

      const tooltipLabel = isDisabled 
        ? (t('navigation.offlineDisabled' as any, language) || 'This section is not available offline')
        : label;

      if (collapsed) {
        return (
          <Tooltip key={item.href} label={tooltipLabel} position="right" withArrow>
            <Box style={{ display: 'inline-block', width: '100%' }}>{navLink}</Box>
          </Tooltip>
        );
      }

      // For non-collapsed, wrap disabled items in tooltip too
      if (isDisabled) {
        return (
          <Tooltip key={item.href} label={tooltipLabel} position="right" withArrow>
            <Box style={{ display: 'inline-block', width: '100%' }}>{navLink}</Box>
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

