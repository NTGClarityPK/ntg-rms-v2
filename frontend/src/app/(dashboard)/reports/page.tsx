'use client';

import { useState } from 'react';
import { Tabs, Title } from '@mantine/core';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import SalesReportPage from '@/components/reports/SalesReportPage';
import OrdersReportPage from '@/components/reports/OrdersReportPage';
import CustomersReportPage from '@/components/reports/CustomersReportPage';
import InventoryReportPage from '@/components/reports/InventoryReportPage';
import FinancialReportPage from '@/components/reports/FinancialReportPage';
import TaxReportPage from '@/components/reports/TaxReportPage';
import TopItemsReportPage from '@/components/reports/TopItemsReportPage';

export default function ReportsPage() {
  const language = useLanguageStore((state) => state.language);
  const [activeTab, setActiveTab] = useState<string | null>('sales');

  return (
    <>
      <div className="page-title-bar">
        <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
          {t('reports.title' as any, language) || 'Reports & Analytics'}
        </Title>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <Tabs value={activeTab} onChange={setActiveTab} data-active-tab={activeTab}>
          <Tabs.List>
            <Tabs.Tab value="sales">
              {t('reports.sales' as any, language) || 'Sales Reports'}
            </Tabs.Tab>
            <Tabs.Tab value="orders">
              {t('reports.orders' as any, language) || 'Order Reports'}
            </Tabs.Tab>
            <Tabs.Tab value="customers">
              {t('reports.customers' as any, language) || 'Customer Reports'}
            </Tabs.Tab>
            <Tabs.Tab value="inventory">
              {t('reports.inventory' as any, language) || 'Inventory Reports'}
            </Tabs.Tab>
            <Tabs.Tab value="financial">
              {t('reports.financial' as any, language) || 'Financial Reports'}
            </Tabs.Tab>
            <Tabs.Tab value="tax">
              {t('reports.tax' as any, language) || 'Tax Reports'}
            </Tabs.Tab>
            <Tabs.Tab value="top-items">
              {t('reports.topItems' as any, language) || 'Top Items'}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="sales" pt="md" px="md" pb="md" data-tab-value="sales">
            <SalesReportPage />
          </Tabs.Panel>

          <Tabs.Panel value="orders" pt="md" px="md" pb="md" data-tab-value="orders">
            <OrdersReportPage />
          </Tabs.Panel>

          <Tabs.Panel value="customers" pt="md" px="md" pb="md" data-tab-value="customers">
            <CustomersReportPage />
          </Tabs.Panel>

          <Tabs.Panel value="inventory" pt="md" px="md" pb="md" data-tab-value="inventory">
            <InventoryReportPage />
          </Tabs.Panel>

          <Tabs.Panel value="financial" pt="md" px="md" pb="md" data-tab-value="financial">
            <FinancialReportPage />
          </Tabs.Panel>

          <Tabs.Panel value="tax" pt="md" px="md" pb="md" data-tab-value="tax">
            <TaxReportPage />
          </Tabs.Panel>

          <Tabs.Panel value="top-items" pt="md" px="md" pb="md" data-tab-value="top-items">
            <TopItemsReportPage />
          </Tabs.Panel>
        </Tabs>
      </div>
    </>
  );
}
