'use client';

import { Pagination, Select, Group, Text } from '@mantine/core';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  showLimitSelector?: boolean;
  limitOptions?: number[];
}

export function PaginationControls({
  page,
  totalPages,
  limit,
  total,
  onPageChange,
  onLimitChange,
  showLimitSelector = true,
  limitOptions = [10, 20, 50, 100],
}: PaginationControlsProps) {
  const language = useLanguageStore((state) => state.language);

  // Don't show if no items
  if (total === 0) {
    return null;
  }

  return (
    <Group justify="space-between" align="center" mt="md">
      <Text size="sm" c="dimmed">
        {t('pagination.showing' as any, language) || 'Showing'} {(page - 1) * limit + 1} - {Math.min(page * limit, total)} {t('pagination.of' as any, language) || 'of'} {total}
      </Text>
      <Group gap="md">
        {showLimitSelector && onLimitChange && (
          <Group gap="xs">
            <Text size="sm">{t('pagination.itemsPerPage' as any, language) || 'Items per page'}:</Text>
            <Select
              value={limit.toString()}
              onChange={(value) => value && onLimitChange(Number(value))}
              data={limitOptions.map((opt) => ({ value: opt.toString(), label: opt.toString() }))}
              style={{ width: 80 }}
              size="sm"
            />
          </Group>
        )}
        {(() => {
          // Calculate totalPages if not set, or use the provided value
          const calculatedTotalPages = totalPages || Math.ceil(total / limit);
          // Show pagination if there's more than one page
          return calculatedTotalPages > 1 ? (
            <Pagination
              value={page}
              onChange={onPageChange}
              total={calculatedTotalPages}
            />
          ) : null;
        })()}
      </Group>
    </Group>
  );
}

