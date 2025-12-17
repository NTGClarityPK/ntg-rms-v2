'use client';

import { Menu, Avatar, Button, Group, Text, ActionIcon } from '@mantine/core';
import { IconLogout, IconUser, IconChevronDown } from '@tabler/icons-react';
import { useMantineTheme } from '@mantine/core';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { useErrorColor } from '@/lib/hooks/use-theme-colors';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useRouter } from 'next/navigation';

interface UserMenuProps {
  user?: {
    email?: string;
    name?: string;
  } | null;
  onLogout: () => void;
}

export function UserMenu({ user, onLogout }: UserMenuProps) {
  const theme = useMantineTheme();
  const primary = useThemeColor();
  const errorColor = useErrorColor();
  const { language } = useLanguageStore();
  const router = useRouter();

  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <Button
          variant="subtle"
          leftSection={
            <Avatar size={24} radius="xl" color={primary}>
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </Avatar>
          }
          rightSection={<IconChevronDown size={16} />}
          size="sm"
        >
          {user?.name || 'User'}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>
          <Text size="sm" fw={500}>
            {user?.name || 'User'}
          </Text>
          <Text size="xs" c="dimmed">
            {user?.email}
          </Text>
        </Menu.Label>
        <Menu.Divider />
        <Menu.Item 
          leftSection={<IconUser size={16} />}
          onClick={() => router.push('/profile')}
        >
          {t('common.profile' as any, language) || 'Profile'}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          style={{ color: errorColor }}
          leftSection={<IconLogout size={16} />}
          onClick={onLogout}
        >
          {t('common.logout' as any, language) || 'Logout'}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

