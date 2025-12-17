'use client';

import { useState } from 'react';
import { Title, Button, Group } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { EmployeesPage } from '@/components/employees/EmployeesPage';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

export default function Employees() {
  const { language } = useLanguageStore();
  const [addTrigger, setAddTrigger] = useState(0);

  return (
    <>
      <div className="page-title-bar">
        <Group justify="space-between" align="center" style={{ width: '100%', height: '100%', paddingRight: 'var(--mantine-spacing-md)' }}>
          <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
            {t('navigation.employees', language)}
          </Title>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setAddTrigger(prev => prev + 1)}>
            {t('employees.addEmployee', language)}
          </Button>
        </Group>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <EmployeesPage addTrigger={addTrigger} />
      </div>
    </>
  );
}
