'use client';

import { Badge, Text } from '@mantine/core';
import { IconLanguage } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';

interface LanguageIndicatorProps {
  variant?: 'badge' | 'text';
  size?: string;
}

export function LanguageIndicator({ variant = 'badge', size = 'sm' }: LanguageIndicatorProps) {
  const { getLanguageInfo } = useLanguageStore();
  const languageInfo = getLanguageInfo();

  if (variant === 'text') {
    return (
      <Text size={size as any} c="dimmed" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconLanguage size={14} />
        Editing in: <strong>{languageInfo.nativeName}</strong>
      </Text>
    );
  }

  return (
    <Badge
      variant="light"
      color="blue"
      size={size as any}
      leftSection={<IconLanguage size={12} />}
    >
      Editing in: {languageInfo.nativeName}
    </Badge>
  );
}

