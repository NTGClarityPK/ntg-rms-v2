'use client';

import { Container, Title, Paper, Stack, Text, Badge, Group } from '@mantine/core';
import { IconTag } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';

export function LabelsPage() {
  const { language } = useLanguageStore();
  const primaryColor = useThemeColor();

  const labels = [
    { value: 'spicy', label: t('menu.spicy', language) },
    { value: 'vegetarian', label: t('menu.vegetarian', language) },
    { value: 'vegan', label: t('menu.vegan', language) },
    { value: 'gluten_free', label: t('menu.glutenFree', language) },
    { value: 'halal', label: t('menu.halal', language) },
    { value: 'new', label: t('menu.new', language) },
    { value: 'popular', label: t('menu.popular', language) },
    { value: 'chefs_special', label: t('menu.chefsSpecial', language) },
  ];

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl">
        {t('menu.labels', language)}
      </Title>

      <Paper p="md" withBorder>
        <Text size="sm" c="dimmed" mb="md">
          {language === 'ar'
            ? 'العلامات متاحة للاستخدام عند إنشاء أو تعديل الأصناف. يمكنك تعيين عدة علامات لكل صنف.'
            : 'Labels are available to use when creating or editing food items. You can assign multiple labels to each item.'}
        </Text>

        <Stack gap="sm">
          {labels.map((label) => (
            <Group key={label.value} justify="space-between" p="sm" style={{ border: `1px solid ${primaryColor}20`, borderRadius: '8px' }}>
              <Group>
                <IconTag size={20} color={primaryColor} />
                <Text fw={500}>{label.label}</Text>
              </Group>
              <Badge variant="light" color={getBadgeColorForText(label.label)}>
                {label.value}
              </Badge>
            </Group>
          ))}
        </Stack>
      </Paper>
    </Container>
  );
}


