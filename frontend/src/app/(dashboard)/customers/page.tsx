'use client';

import { Title } from '@mantine/core';
import { CustomersPage } from '@/components/customers/CustomersPage';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

export default function Customers() {
  const { language } = useLanguageStore();

  return (
    <>
      <div className="page-title-bar">
        <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
          {t('navigation.customers', language)}
        </Title>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <CustomersPage />
      </div>
    </>
  );
}
