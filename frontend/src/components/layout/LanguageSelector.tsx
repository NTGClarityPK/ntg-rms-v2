'use client';

import { Menu, Button, Group, Text, Stack } from '@mantine/core';
import { IconLanguage, IconCheck } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useEffect, useState } from 'react';
import { translationsApi, SupportedLanguage } from '@/lib/api/translations';
import { useAuthStore } from '@/lib/store/auth-store';
import { usePathname } from 'next/navigation';

interface LanguageSelectorProps {
  variant?: 'button' | 'menu-item';
  size?: string;
}

// All supported languages for auth pages
const ALL_SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', isActive: true, isDefault: true, rtl: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', isActive: true, isDefault: false, rtl: true },
  { code: 'ku', name: 'Kurdish', nativeName: 'کوردی', isActive: true, isDefault: false, rtl: true },
  { code: 'fr', name: 'French', nativeName: 'Français', isActive: true, isDefault: false, rtl: false },
];

export function LanguageSelector({ variant = 'button', size = 'sm' }: LanguageSelectorProps) {
  const { language, setLanguage, getLanguageInfo } = useLanguageStore();
  const { isAuthenticated } = useAuthStore();
  const pathname = usePathname();
  const currentLanguage = getLanguageInfo();
  const [tenantLanguages, setTenantLanguages] = useState<SupportedLanguage[]>([]);
  const [loading, setLoading] = useState(true);

  // Check if we're on an auth page
  const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/signup') || pathname?.startsWith('/auth');

  useEffect(() => {
    // On auth pages, show all supported languages
    if (isAuthPage) {
      setTenantLanguages(ALL_SUPPORTED_LANGUAGES);
      setLoading(false);
      return;
    }

    // Only fetch tenant languages if user is authenticated
    if (!isAuthenticated) {
      // When signed out (but not on auth page), use default supported languages (English only)
      setTenantLanguages([
        { code: 'en', name: 'English', nativeName: 'English', isActive: true, isDefault: true, rtl: false },
      ]);
      setLoading(false);
      return;
    }

    // Load tenant-enabled languages for authenticated users on dashboard
    translationsApi
      .getTenantLanguages()
      .then((langs) => {
        setTenantLanguages(langs);
        // If current language is not in tenant languages, switch to first available (usually English)
        if (langs.length > 0 && !langs.find((l) => l.code === language)) {
          setLanguage(langs[0].code as any);
        }
      })
      .catch((error) => {
        console.error('Failed to load tenant languages:', error);
        // Fallback to English only
        setTenantLanguages([
          { code: 'en', name: 'English', nativeName: 'English', isActive: true, isDefault: true, rtl: false },
        ]);
      })
      .finally(() => setLoading(false));
  }, [language, setLanguage, isAuthenticated, isAuthPage]);

  const handleLanguageChange = (langCode: string) => {
    setLanguage(langCode as any);
    // Optionally refresh the page to update all translations
    // window.location.reload();
  };

  // Filter to only show tenant-enabled languages
  const availableLanguages = tenantLanguages.filter((lang) => lang.isActive);

  if (loading) {
    return (
      <Button variant="subtle" leftSection={<IconLanguage size={16} />} size={size as any} disabled>
        {currentLanguage.nativeName}
      </Button>
    );
  }

  if (variant === 'menu-item') {
    return (
      <Menu.Item
        style={{
          zIndex: 2000,
        }}
        leftSection={<IconLanguage size={16} />}
        rightSection={
          <Group gap={4}>
            {availableLanguages.map((lang) => (
              <Button
                key={lang.code}
                variant={language === lang.code ? 'light' : 'subtle'}
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLanguageChange(lang.code);
                }}
                style={{
                  minWidth: 'auto',
                  padding: '2px 8px',
                }}
              >
                {lang.nativeName}
              </Button>
            ))}
          </Group>
        }
      >
        <Text size="sm">Language</Text>
      </Menu.Item>
    );
  }

  return (
    <Menu zIndex={2000} shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <Button
          variant="subtle"
          leftSection={<IconLanguage size={16} />}
          size={size as any}
          style={{
            fontWeight: 500,
          }}
        >
          {currentLanguage.nativeName}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t('common.selectLanguage', language)}</Menu.Label>
        {availableLanguages.map((lang) => (
          <Menu.Item
            key={lang.code}
            leftSection={
              <IconCheck
                size={16}
                style={{
                  visibility: language === lang.code ? 'visible' : 'hidden',
                }}
              />
            }
            onClick={() => handleLanguageChange(lang.code)}
            style={{
              fontWeight: language === lang.code ? 600 : 400,
            }}
          >
            <Stack gap={2}>
              <Text size="sm" fw={language === lang.code ? 600 : 400}>
                {lang.nativeName}
              </Text>
              <Text size="xs" c="dimmed">
                {lang.name}
              </Text>
            </Stack>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

