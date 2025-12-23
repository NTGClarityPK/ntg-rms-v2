'use client';

import { Title } from '@mantine/core';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { InventoryRefreshProvider } from '@/lib/contexts/inventory-refresh-context';
import { StockManagementPage } from '@/components/inventory/StockManagementPage';

export default function InventoryPage() {
  const { language } = useLanguageStore();

  return (
    <InventoryRefreshProvider>
      <>
        <div className="page-title-bar">
          <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
            {t('navigation.inventory', language)}
          </Title>
        </div>

        <div className="page-sub-title-bar"></div>

        <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
          <StockManagementPage />
        </div>
      </>
    </InventoryRefreshProvider>
  );
}
