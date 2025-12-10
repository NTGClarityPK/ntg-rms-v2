'use client';

import { useState } from 'react';
import { Tabs } from '@mantine/core';
import { IconBox, IconArrowsExchange, IconBook, IconChartBar } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { InventoryRefreshProvider } from '@/lib/contexts/inventory-refresh-context';
import { IngredientsPage } from '@/components/inventory/IngredientsPage';
import { StockManagementPage } from '@/components/inventory/StockManagementPage';
import { RecipesPage } from '@/components/inventory/RecipesPage';
import { InventoryReportsPage } from '@/components/inventory/InventoryReportsPage';

export default function InventoryPage() {
  const { language } = useLanguageStore();
  const [activeTab, setActiveTab] = useState<string>('ingredients');

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value);
    }
  };

  return (
    <InventoryRefreshProvider>
      <Tabs value={activeTab} onChange={handleTabChange}>
      <Tabs.List>
        <Tabs.Tab value="ingredients" leftSection={<IconBox size={16} />}>
          {t('inventory.ingredients', language)}
        </Tabs.Tab>
        <Tabs.Tab value="stock" leftSection={<IconArrowsExchange size={16} />}>
          {t('inventory.stockManagement', language)}
        </Tabs.Tab>
        <Tabs.Tab value="recipes" leftSection={<IconBook size={16} />}>
          {t('inventory.recipes', language)}
        </Tabs.Tab>
        <Tabs.Tab value="reports" leftSection={<IconChartBar size={16} />}>
          {t('inventory.reports', language)}
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="ingredients" pt="md">
        <IngredientsPage />
      </Tabs.Panel>

      <Tabs.Panel value="stock" pt="md">
        <StockManagementPage />
      </Tabs.Panel>

      <Tabs.Panel value="recipes" pt="md">
        <RecipesPage />
      </Tabs.Panel>

      <Tabs.Panel value="reports" pt="md">
        <InventoryReportsPage />
      </Tabs.Panel>
      </Tabs>
    </InventoryRefreshProvider>
  );
}
