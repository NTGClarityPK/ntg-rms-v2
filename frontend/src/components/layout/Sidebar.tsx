'use client';

import {
  NavLink,
  Stack,
  Text,
  Divider,
  ScrollArea,
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
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { useMantineTheme } from '@mantine/core';
import { t } from '@/lib/utils/translations';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useThemeColor } from '@/lib/hooks/use-theme-color';

const navItems = [
  { href: '/dashboard', icon: IconDashboard, key: 'dashboard' },
  { href: '/restaurant', icon: IconBuildingStore, key: 'restaurant' },
  { href: '/menu', icon: IconMenu2, key: 'menu' },
  { href: '/pos', icon: IconShoppingCart, key: 'pos' },
  { href: '/orders', icon: IconClipboardList, key: 'orders' },
  { href: '/inventory', icon: IconPackage, key: 'inventory' },
  { href: '/employees', icon: IconUsers, key: 'employees' },
  { href: '/customers', icon: IconUser, key: 'customers' },
  { href: '/delivery', icon: IconTruck, key: 'delivery' },
  { href: '/reports', icon: IconChartBar, key: 'reports' },
  { href: '/settings', icon: IconSettings, key: 'settings' },
] as const;

type NavItemKey = typeof navItems[number]['key'];
type NavigationKey = `navigation.${NavItemKey}`;

interface SidebarProps {
  onMobileClose?: () => void;
}

export function Sidebar({ onMobileClose }: SidebarProps = {}) {
  const { language } = useLanguageStore();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useMantineTheme();
  const primary = useThemeColor();

  // Group menu items by category
  const mainItems = navItems.filter(
    (item) =>
      item.href === '/dashboard' ||
      item.href.startsWith('/pos') ||
      item.href === '/menu' ||
      item.href === '/restaurant'
  );
  const managementItems = navItems.filter(
    (item) =>
      item.href === '/customers' ||
      item.href === '/orders' ||
      item.href === '/inventory' ||
      item.href === '/employees' ||
      item.href === '/delivery' ||
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
    return items.map((item) => (
      <NavLink
        key={item.href}
        component={Link}
        href={item.href}
        label={t(`navigation.${item.key}` as any, language)}
        leftSection={<item.icon size={16} />}
        active={isActive(item.href)}
        onClick={() => {
          onMobileClose?.();
        }}
      />
    ));
  };

  return (
    <ScrollArea h="100%">
      <Stack gap="xs" p="md">
        {/* Main Navigation */}
        <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="xs">
          {t('dashboard.navigation', language)}
        </Text>
        {renderNavItems(mainItems)}

        {/* Management Section */}
        {managementItems.length > 0 && (
          <>
            <Divider my="sm" />
            <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="xs">
              {t('dashboard.management', language)}
            </Text>
            {renderNavItems(managementItems)}
          </>
        )}
      </Stack>
    </ScrollArea>
  );
}

