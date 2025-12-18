'use client';

import { Menu, Avatar, Button, Group, Text, ActionIcon } from '@mantine/core';
import { IconLogout, IconUser, IconChevronDown } from '@tabler/icons-react';
import { useMantineTheme } from '@mantine/core';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { useErrorColor } from '@/lib/hooks/use-theme-colors';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useRouter } from 'next/navigation';
import type { ThemeConfig } from '@/lib/theme/themeConfig';

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
  
  // Get avatar config from theme
  const themeConfig = (theme.other as any) as ThemeConfig | undefined;
  const avatarBgColor = themeConfig?.components.avatar.backgroundColor || primary;
  const avatarTextColor = themeConfig?.components.avatar.textColor || '#ffffff';

  // Get initials from first and last name
  const getInitials = (name?: string, email?: string): string => {
    if (name) {
      const nameParts = name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        // First letter of first name + first letter of last name
        return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
      } else if (nameParts.length === 1 && nameParts[0].length >= 2) {
        // If only one name, take first two characters
        return nameParts[0].substring(0, 2).toUpperCase();
      } else if (nameParts[0].length === 1) {
        // Single character name
        return nameParts[0].toUpperCase();
      }
    }
    // Fallback to email
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    // Final fallback
    return 'U';
  };

  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <Button
          variant="subtle"
          leftSection={
            <Avatar 
              size={24} 
              radius="xl"
              style={{
                backgroundColor: avatarBgColor,
                color: avatarTextColor,
              }}
            >
              {getInitials(user?.name, user?.email)}
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

