'use client';

import { useState } from 'react';
import { Tabs, Title } from '@mantine/core';
import { IconBook, IconBox } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { InventoryRefreshProvider } from '@/lib/contexts/inventory-refresh-context';
import { IngredientsPage } from '@/components/inventory/IngredientsPage';
import { RecipesPage as RecipesPageComponent } from '@/components/inventory/RecipesPage';

export default function RecipesPage() {
  const { language } = useLanguageStore();
  const [activeTab, setActiveTab] = useState<string>('ingredients');

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
            {t('navigation.recipes', language) || 'Recipes'}
          </Title>
        </div>

        <div className="page-sub-title-bar"></div>

        <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="ingredients" leftSection={<IconBox size={16} />}>
                {t('inventory.ingredients', language)}
              </Tabs.Tab>
              <Tabs.Tab value="recipes" leftSection={<IconBook size={16} />}>
                {t('inventory.recipes', language)}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="ingredients" pt="md" px="md" pb="md">
              <IngredientsPage />
            </Tabs.Panel>

            <Tabs.Panel value="recipes" pt="md" px="md" pb="md">
              <RecipesPageComponent />
            </Tabs.Panel>
          </Tabs>
        </div>
      </>
    </InventoryRefreshProvider>
  );
}

