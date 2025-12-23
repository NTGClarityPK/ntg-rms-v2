'use client';

import { useState, useEffect } from 'react';
import { Title, Button, Group, Center, Paper, Stack, Text } from '@mantine/core';
import { IconPlus, IconWifiOff } from '@tabler/icons-react';
import { EmployeesPage } from '@/components/employees/EmployeesPage';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { useRouter } from 'next/navigation';
import { getErrorColor } from '@/lib/utils/theme';

export default function Employees() {
  const { language } = useLanguageStore();
  const { isOnline } = useSyncStatus();
  const router = useRouter();
  const [addTrigger, setAddTrigger] = useState(0);

  // Redirect if offline
  useEffect(() => {
    if (!isOnline) {
      router.push('/orders');
    }
  }, [isOnline, router]);

  if (!isOnline) {
    return (
      <Center h="100vh">
        <Paper p="xl" radius="md" withBorder>
          <Stack align="center" gap="md">
            <IconWifiOff size={48} color={getErrorColor()} />
            <Text size="lg" fw={500}>
              {t('navigation.offlineDisabled' as any, language) || 'Employees section is not available offline'}
            </Text>
            <Text size="sm" c="dimmed">
              {t('navigation.offlineRedirect' as any, language) || 'Redirecting to Orders...'}
            </Text>
          </Stack>
        </Paper>
      </Center>
    );
  }

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
