'use client';

import { Title } from '@mantine/core';
import { EmployeesPage } from '@/components/employees/EmployeesPage';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

export default function Employees() {
  const { language } = useLanguageStore();

  return (
    <>
      <div className="page-title-bar">
        <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
          {t('navigation.employees', language)}
        </Title>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <EmployeesPage />
      </div>
    </>
  );
}
