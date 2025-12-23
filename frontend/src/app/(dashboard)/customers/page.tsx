'use client';

import { useState } from 'react';
import { Title, Button, Group } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { CustomersPage } from '@/components/customers/CustomersPage';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

export default function Customers() {
  const { language } = useLanguageStore();
  const [addTrigger, setAddTrigger] = useState(0);

  return (
    <>
      <div className="page-title-bar">
        <Group justify="space-between" align="center" style={{ width: '100%', height: '100%' }}>
          <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
            {t('navigation.customers', language)}
          </Title>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setAddTrigger(prev => prev + 1)}>
            {t('customers.addCustomer', language)}
          </Button>
        </Group>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <CustomersPage addTrigger={addTrigger} />
      </div>
    </>
  );
}
