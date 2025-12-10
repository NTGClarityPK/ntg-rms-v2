'use client';

import { Container, Title, Paper, Stack, Text, Badge, Group } from '@mantine/core';
import { IconMenu2 } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';

export function MenuTypesPage() {
  const { language } = useLanguageStore();
  const primaryColor = useThemeColor();

  const menuTypes = [
    { value: 'all_day', label: t('menu.allDay', language) },
    { value: 'breakfast', label: t('menu.breakfast', language) },
    { value: 'lunch', label: t('menu.lunch', language) },
    { value: 'dinner', label: t('menu.dinner', language) },
    { value: 'kids_special', label: t('menu.kidsSpecial', language) },
  ];

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl">
        {t('menu.menuTypes', language)}
      </Title>

      <Paper p="md" withBorder>
        <Text size="sm" c="dimmed" mb="md">
          {language === 'ar'
            ? 'أنواع القوائم متاحة للاستخدام عند إنشاء أو تعديل الأصناف. يمكنك تعيين نوع قائمة واحد لكل صنف.'
            : 'Menu types are available to use when creating or editing food items. You can assign one menu type to each item.'}
        </Text>

        <Stack gap="sm">
          {menuTypes.map((type) => (
            <Group key={type.value} justify="space-between" p="sm" style={{ border: `1px solid ${primaryColor}20`, borderRadius: '8px' }}>
              <Group>
                <IconMenu2 size={20} color={primaryColor} />
                <Text fw={500}>{type.label}</Text>
              </Group>
              <Badge variant="light" style={{ color: primaryColor }}>
                {type.value}
              </Badge>
            </Group>
          ))}
        </Stack>
      </Paper>
    </Container>
  );
}


