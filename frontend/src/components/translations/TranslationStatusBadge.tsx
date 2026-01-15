'use client';

import { Badge, Tooltip } from '@mantine/core';
import { IconCheck, IconClock, IconLanguage } from '@tabler/icons-react';
import { SupportedLanguage } from '@/lib/api/translations';

interface TranslationStatusBadgeProps {
  translations: { [languageCode: string]: string };
  supportedLanguages: SupportedLanguage[];
  fieldName?: string;
}

export function TranslationStatusBadge({
  translations,
  supportedLanguages,
  fieldName,
}: TranslationStatusBadgeProps) {
  const activeLanguages = supportedLanguages.filter((lang) => lang.isActive);
  const translatedCount = activeLanguages.filter((lang) => translations[lang.code]).length;
  const totalCount = activeLanguages.length;
  const isComplete = translatedCount === totalCount;

  const tooltipText = fieldName
    ? `${translatedCount}/${totalCount} languages translated for ${fieldName}`
    : `${translatedCount}/${totalCount} languages translated`;

  return (
    <Tooltip label={tooltipText} withArrow>
      <Badge
        color={isComplete ? 'green' : 'yellow'}
        variant="light"
        leftSection={isComplete ? <IconCheck size={12} /> : <IconClock size={12} />}
      >
        {isComplete ? 'Translated' : `${translatedCount}/${totalCount}`}
      </Badge>
    </Tooltip>
  );
}






