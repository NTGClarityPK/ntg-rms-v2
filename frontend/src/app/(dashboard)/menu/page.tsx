'use client';

import { useState } from 'react';
import { Tabs, Title } from '@mantine/core';
import { IconCategory, IconToolsKitchen2, IconPlus, IconMenu2, IconChefHat, IconShoppingBag } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { CategoriesPage } from '@/components/menu/CategoriesPage';
import { FoodItemsPage } from '@/components/menu/FoodItemsPage';
import { AddOnGroupsPage } from '@/components/menu/AddOnGroupsPage';
import { MenusPage } from '@/components/menu/MenusPage';
import { BuffetPage } from '@/components/menu/BuffetPage';
import { ComboMealPage } from '@/components/menu/ComboMealPage';

export default function MenuPage() {
  const { language } = useLanguageStore();
  const [activeTab, setActiveTab] = useState<string>('categories');

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value);
    }
  };

  return (
    <>
      <div className="page-title-bar">
        <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
          {t('navigation.menu', language)}
        </Title>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tabs.List>
            <Tabs.Tab value="categories" leftSection={<IconCategory size={16} />}>
              {t('menu.categories', language)}
            </Tabs.Tab>
            <Tabs.Tab value="food-items" leftSection={<IconToolsKitchen2 size={16} />}>
              {t('menu.foodItems', language)}
            </Tabs.Tab>
            <Tabs.Tab value="add-ons" leftSection={<IconPlus size={16} />}>
              {t('menu.addOns', language)}
            </Tabs.Tab>
            <Tabs.Tab value="menus" leftSection={<IconMenu2 size={16} />}>
              {t('menu.menus', language)}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="categories" pt="md" px="md" pb="md">
            <CategoriesPage />
          </Tabs.Panel>

          <Tabs.Panel value="food-items" pt="md" px="md" pb="md">
            <FoodItemsPage />
          </Tabs.Panel>

          <Tabs.Panel value="add-ons" pt="md" px="md" pb="md">
            <AddOnGroupsPage />
          </Tabs.Panel>

      <Tabs.Panel value="menus" pt="md">
        <MenusPage />
      </Tabs.Panel>

      <Tabs.Panel value="buffets" pt="md" >
        <BuffetPage />
      </Tabs.Panel>

      <Tabs.Panel value="combo-meals" pt="md">
        <ComboMealPage />
      </Tabs.Panel>
        </Tabs>
      </div>
    </>
  );
}
