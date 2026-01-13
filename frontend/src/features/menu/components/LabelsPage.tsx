'use client';

import { Container, Title, Paper, Stack, Text, Badge, Group } from '@mantine/core';
import { IconTag } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { FOOD_ITEM_LABELS } from '@/shared/constants/menu.constants';

export function LabelsPage() {
  const { language } = useLanguageStore();
  const primaryColor = useThemeColor();

  // Convert snake_case to camelCase for translation keys
  const getTranslationKey = (value: string): string => {
    return value.split('_').map((word, index) => 
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
  };

  const labels = FOOD_ITEM_LABELS.map(label => ({
    value: label.value,
    label: t(`menu.${getTranslationKey(label.value)}` as any, language) || label.label,
  }));

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


