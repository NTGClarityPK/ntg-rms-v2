'use client';

import { Menu, Button, Group, Text, Stack } from '@mantine/core';
import { IconLanguage, IconCheck } from '@tabler/icons-react';
import { useLanguageStore, SUPPORTED_LANGUAGES } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

interface LanguageSelectorProps {
  variant?: 'button' | 'menu-item';
  size?: string;
}

export function LanguageSelector({ variant = 'button', size = 'sm' }: LanguageSelectorProps) {
  const { language, setLanguage, getLanguageInfo } = useLanguageStore();
  const currentLanguage = getLanguageInfo();

  const handleLanguageChange = (langCode: string) => {
    setLanguage(langCode as any);
    // Optionally refresh the page to update all translations
    // window.location.reload();
  };

  if (variant === 'menu-item') {
    return (
      <Menu.Item
        style={{
          zIndex: 2000,
        }}
        leftSection={<IconLanguage size={16} />}
        rightSection={
          <Group gap={4}>
            {SUPPORTED_LANGUAGES.map((lang) => (
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
        {SUPPORTED_LANGUAGES.map((lang) => (
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

