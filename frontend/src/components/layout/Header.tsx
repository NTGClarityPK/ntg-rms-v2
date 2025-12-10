'use client';

import {
  AppShell,
  Group,
  Text,
  Burger,
  Button,
  Menu,
  Avatar,
  useMantineTheme,
  Box,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { IconToolsKitchen2, IconLanguage, IconLogout, IconUser } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { authApi } from '@/lib/api/auth';
import { UserMenu } from '@/components/layout/UserMenu';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { Image } from '@mantine/core';
import { t } from '@/lib/utils/translations';

interface HeaderProps {
  mobileOpened?: boolean;
  toggleMobile?: () => void;
}

export function Header({ mobileOpened, toggleMobile }: HeaderProps = {}) {
  const router = useRouter();
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const primary = useThemeColor();
  const { language, toggleLanguage } = useLanguageStore();
  const { user, logout } = useAuthStore();
  const { restaurant } = useRestaurantStore();
  
  // Use restaurant name/logo or defaults
  // Show Arabic name if language is Arabic and nameAr exists, otherwise show English
  const restaurantName = language === 'ar' && restaurant?.nameAr 
    ? restaurant.nameAr 
    : (restaurant?.nameEn || 'RMS');
  const restaurantLogo = restaurant?.logoUrl;

  const handleLogout = () => {
    authApi.logout();
    logout();
  };

  return (
    <AppShell.Header>
      <Group h="100%" px="md" justify="space-between">
        {/* Left side - Logo and Brand */}
        <Group>
          {toggleMobile && (
            <Burger
              opened={mobileOpened}
              onClick={toggleMobile}
              hiddenFrom="sm"
              size="sm"
            />
          )}
          <Group
            gap="xs"
            style={{ cursor: 'pointer' }}
            onClick={() => router.push('/dashboard')}
          >
            <Box
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {restaurantLogo ? (
                <Image
                  src={restaurantLogo}
                  alt={restaurantName}
                  width="100%"
                  height="100%"
                  fit="contain"
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <IconToolsKitchen2 size={32} stroke={1.5} color={primary} />
              )}
            </Box>
            {!isMobile && (
              <div>
                <Text fw={700} size="lg" style={{ color: primary, lineHeight: 1 }}>
                  {restaurantName}
                </Text>
                <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>
                  {t('navigation.restaurantManagement', language)}
                </Text>
              </div>
            )}
          </Group>
        </Group>

        {/* Right side - Actions */}
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconLanguage size={16} />}
            onClick={toggleLanguage}
            size="sm"
          >
            {language === 'en' ? 'العربية' : 'English'}
          </Button>

          <UserMenu user={user} onLogout={handleLogout} />
        </Group>
      </Group>
    </AppShell.Header>
  );
}

