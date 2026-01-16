'use client';

import { Button, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { translationsApi } from '@/lib/api/translations';

interface RetranslateButtonProps {
  entityType: string;
  entityId: string;
  targetLanguages?: string[];
  onSuccess?: () => void;
  size?: string;
  variant?: string;
}

export function RetranslateButton({
  entityType,
  entityId,
  targetLanguages,
  onSuccess,
  size = 'sm',
  variant = 'light',
}: RetranslateButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleRetranslate = async () => {
    if (!confirm('Are you sure you want to re-translate this item? This will regenerate all AI translations.')) {
      return;
    }

    setLoading(true);
    try {
      await translationsApi.retranslate({
        entityType,
        entityId,
        targetLanguages,
      });

      notifications.show({
        title: 'Success',
        message: 'Translations regenerated successfully',
        color: 'green',
      });

      onSuccess?.();
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error?.response?.data?.message || 'Failed to re-translate',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip label="Re-translate using AI (regenerates all translations)">
      <Button
        variant={variant as any}
        size={size as any}
        leftSection={<IconRefresh size={16} />}
        onClick={handleRetranslate}
        loading={loading}
        color="blue"
      >
        Re-translate
      </Button>
    </Tooltip>
  );
}








