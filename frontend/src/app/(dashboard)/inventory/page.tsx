'use client';

import { useState } from 'react';
import { Title, Tabs } from '@mantine/core';
import { IconBox, IconArrowsExchange } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { InventoryRefreshProvider } from '@/lib/contexts/inventory-refresh-context';
import { StockManagementPage } from '@/components/inventory/StockManagementPage';
import { IngredientsPage } from '@/components/inventory/IngredientsPage';

export default function InventoryPage() {
  const { language } = useLanguageStore();
  const [activeTab, setActiveTab] = useState<string>('stock');

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value);
    }
  };

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
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="stock" leftSection={<IconArrowsExchange size={16} />}>
                {t('inventory.stockManagement', language) || 'Stock Management'}
              </Tabs.Tab>
              <Tabs.Tab value="ingredients" leftSection={<IconBox size={16} />}>
                {t('inventory.ingredients', language)}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="stock" pt="md" px="md" pb="md">
              <StockManagementPage />
            </Tabs.Panel>

            <Tabs.Panel value="ingredients" pt="md" px="md" pb="md">
              <IngredientsPage />
            </Tabs.Panel>
          </Tabs>
        </div>
      </>
    </InventoryRefreshProvider>
  );
}
