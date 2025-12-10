'use client';

import { ReactNode } from 'react';
import { Box, Title, Text, Card, useMantineTheme, Button, Group } from '@mantine/core';
import { IconToolsKitchen2, IconLanguage } from '@tabler/icons-react';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const theme = useMantineTheme();
  const primary = useThemeColor();
  const primaryShade = useThemeColorShade(8);
  const { language, toggleLanguage } = useLanguageStore();

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${primary} 0%, ${primaryShade} 100%)`,
        padding: '20px',
      }}
    >
      {/* Left Side - Decorative (Hidden on Mobile) */}
      <Box
        style={{
          position: 'relative',
          overflow: 'hidden',
          minHeight: '100vh',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        visibleFrom="md"
      >
        <Box
          style={{
            textAlign: 'center',
            color: 'white',
            zIndex: 10,
          }}
        >
          <Box
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.15)',
              border: '3px solid rgba(255, 255, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            }}
          >
            <IconToolsKitchen2 size={60} stroke={2} />
          </Box>
          <Title order={1} size="2.5rem" fw={800} mb="md" c="white">
            {t('navigation.restaurantManagement', language)}
          </Title>
          <Text size="lg" c="white" opacity={0.9}>
            {language === 'ar' ? 'قم بتبسيط عمليات مطعمك' : 'Streamline your restaurant operations'}
          </Text>
        </Box>
      </Box>

      {/* Right Side - Form Container */}
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          minHeight: '100vh',
          width: '100%',
          flex: 1,
        }}
      >
        <Card
          shadow="xl"
          radius="xl"
          padding="xl"
          withBorder
          style={{
            backdropFilter: 'blur(20px)',
            maxWidth: '650px',
            width: '100%',
            minHeight: '500px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {/* App Name Header */}
          <Box ta="center" mb="xl">
            <Title
              order={1}
              size="2.2rem"
              fw={800}
              style={{
                color: primary,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
  
                marginBottom: '8px',
              }}
            >
              RMS
            </Title>
            <Text c="dimmed" size="sm" fw={500}>
              {language === 'ar' ? 'نظام إدارة المطاعم' : 'Restaurant Management System'}
            </Text>
          </Box>

          {/* Language Switcher */}
          <Group justify="flex-end" mb="md">
            <Button
              variant="subtle"
              leftSection={<IconLanguage size={16} />}
              onClick={toggleLanguage}
              size="sm"
            >
              {language === 'en' ? 'العربية' : 'English'}
            </Button>
          </Group>

      {children}
        </Card>
      </Box>
    </Box>
  );
}

