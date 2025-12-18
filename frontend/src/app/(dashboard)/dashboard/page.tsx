'use client';

import { useState, useEffect, useCallback } from 'react';
import { Stack, SimpleGrid, Paper, Text, Title, Card, Group, Grid, Skeleton, Badge, Table, Box } from '@mantine/core';
import {
  IconCash,
  IconShoppingCart,
  IconTable,
  IconClock,
  IconAlertTriangle,
  IconTrendingUp,
} from '@tabler/icons-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { useCurrency } from '@/lib/hooks/use-currency';
import { dashboardApi, DashboardData } from '@/lib/api/dashboard';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { notifications } from '@mantine/notifications';
import { getErrorColor, getBadgeColorForText } from '@/lib/utils/theme';
import { IconX } from '@tabler/icons-react';

export default function DashboardPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const primary = useThemeColor();
  const currency = useCurrency();
  const { isOnline } = useSyncStatus();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      if (isOnline) {
        const data = await dashboardApi.getDashboard();
        setDashboardData(data);
      }
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('dashboard.loadError' as any, language) || 'Failed to load dashboard',
        color: getErrorColor(),
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  }, [isOnline, language]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = dashboardData ? [
    { 
      title: t('dashboard.todaySales' as any, language) || 'Today\'s Sales', 
      value: `${dashboardData.todaySales.toFixed(2)} ${currency}`,
      icon: IconCash,
    },
    { 
      title: t('dashboard.todayOrders' as any, language) || 'Today\'s Orders', 
      value: dashboardData.todayOrders.total.toString(),
      icon: IconShoppingCart,
    },
    { 
      title: t('dashboard.activeTables' as any, language) || 'Active Tables', 
      value: dashboardData.activeTables.toString(),
      icon: IconTable,
    },
    { 
      title: t('dashboard.pendingOrders' as any, language) || 'Pending Orders', 
      value: dashboardData.pendingOrders.toString(),
      icon: IconClock,
    },
  ] : [];

  const chartColors = [
    primary,
    `var(--mantine-color-blue-6)`,
    `var(--mantine-color-green-6)`,
    `var(--mantine-color-yellow-6)`,
    `var(--mantine-color-red-6)`,
  ];

  // Format role in a user-friendly way
  const formatRole = (role: string | undefined): string => {
    if (!role) return 'N/A';
    
    // Try to get translation from employees.role
    const roleKey = `employees.role.${role}` as any;
    const translated = t(roleKey, language);
    
    // If translation exists and is different from the key, use it
    if (translated && translated !== roleKey) {
      return translated;
    }
    
    // Otherwise, format the role string: replace underscores with spaces and capitalize
    return role
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <>
      <div className="page-title-bar">
        <Title order={1} style={{ margin: 0, textAlign: 'left' }}>
          {t('dashboard.title' as any, language) || 'Dashboard'}
        </Title>
      </div>

      <div className="page-sub-title-bar"></div>

      <div style={{ marginTop: '60px', paddingLeft: 'var(--mantine-spacing-md)', paddingRight: 'var(--mantine-spacing-md)', paddingTop: 'var(--mantine-spacing-sm)', paddingBottom: 'var(--mantine-spacing-xl)' }}>
        <Stack gap="md">
          {/* Welcome Card */}
          <Paper p="md" withBorder>
        <Stack gap="sm">
          <Text size="lg" fw={600}>
            {t('dashboard.welcomeMessage' as any, language)?.replace('{name}', user?.name || user?.email || 'User') || `Welcome, ${user?.name || user?.email || 'User'}`}
          </Text>
          <Text c="dimmed">
            {t('common.role' as any, language) || 'Role'}: {formatRole(user?.role)}
          </Text>
        </Stack>
      </Paper>

      {/* Metrics Cards */}
      {loading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={120} />
          ))}
        </SimpleGrid>
      ) : (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {stats.map((stat) => (
            <Card key={stat.title} withBorder padding="lg" radius="md">
              <Group justify="space-between">
                <div>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {stat.title}
            </Text>
                  <Text fw={700} size="xl">
              {stat.value}
            </Text>
                </div>
                <stat.icon size={32} stroke={1.5} color={primary} />
              </Group>
            </Card>
        ))}
      </SimpleGrid>
      )}

      <Grid>
        {/* Revenue Chart */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper p="md" withBorder>
            <Stack gap="md">
              <Group>
                <IconTrendingUp size={24} color={primary} />
                <Title order={3}>{t('dashboard.revenueChart' as any, language) || 'Revenue Trend (Last 7 Days)'}</Title>
              </Group>
              {loading ? (
                <Skeleton height={300} />
              ) : dashboardData ? (
                <Box h={300}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboardData.revenueChart}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => `${value.toFixed(2)} ${currency}`} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke={primary} strokeWidth={2} name={t('dashboard.revenue' as any, language) || 'Revenue'} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              ) : null}
            </Stack>
          </Paper>
        </Grid.Col>

        {/* Low Stock Alerts */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" withBorder h={'100%'}>
            <Stack gap="md">
              <Group>
                <IconAlertTriangle size={24} color="red" />
                <Title order={3}>{t('dashboard.lowStockAlerts' as any, language) || 'Low Stock Alerts'}</Title>
              </Group>
              {loading ? (
                <Skeleton height={300} />
              ) : dashboardData && dashboardData.lowStockAlerts.length > 0 ? (
                <Stack gap="xs">
                  {dashboardData.lowStockAlerts.slice(0, 5).map((alert) => (
                    <Card key={alert.id} p="sm" withBorder>
                      <Text fw={500} size="sm">
                        {(alert as any).name || (alert as any).nameEn || (alert as any).nameAr || 'Unknown'}
                      </Text>
                      <Group gap="xs" mt="xs">
                        <Badge color={getBadgeColorForText(`${t('dashboard.stock' as any, language) || 'Stock'}: ${alert.currentStock}`)} variant="light">
                          {t('dashboard.stock' as any, language) || 'Stock'}: {alert.currentStock}
                        </Badge>
                        <Badge color={getBadgeColorForText(`${t('dashboard.threshold' as any, language) || 'Threshold'}: ${alert.minimumThreshold}`)} variant="light">
                          {t('dashboard.threshold' as any, language) || 'Threshold'}: {alert.minimumThreshold}
                        </Badge>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed" ta="center" py="xl">
                  {t('dashboard.noLowStock' as any, language) || 'No low stock alerts'}
                </Text>
              )}
            </Stack>
          </Paper>
        </Grid.Col>

        {/* Popular Items */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper p="md" withBorder>
            <Stack gap="md">
              <Title order={3}>{t('dashboard.popularItems' as any, language) || 'Popular Items (Today)'}</Title>
              {loading ? (
                <Skeleton height={300} />
              ) : dashboardData && dashboardData.popularItems.length > 0 ? (
                <Box h={300}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardData.popularItems.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="quantity" fill={primary} name={t('dashboard.quantity' as any, language) || 'Quantity'} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Text c="dimmed" ta="center" py="xl">
                  {t('dashboard.noPopularItems' as any, language) || 'No popular items today'}
                </Text>
              )}
            </Stack>
          </Paper>
        </Grid.Col>

        {/* Orders by Type */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper p="md" withBorder>
            <Stack gap="md">
              <Title order={3}>{t('dashboard.ordersByType' as any, language) || 'Orders by Type (Today)'}</Title>
              {loading ? (
                <Skeleton height={300} />
              ) : dashboardData ? (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('dashboard.orderType' as any, language) || 'Order Type'}</Table.Th>
                      <Table.Th>{t('dashboard.count' as any, language) || 'Count'}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {Object.entries(dashboardData.todayOrders.byType).map(([type, count]) => (
                      <Table.Tr key={type}>
                        <Table.Td>
                          {type === 'dine_in' 
                            ? (t('orders.dineIn' as any, language) || 'Dine-in')
                            : type === 'takeaway'
                            ? (t('orders.takeaway' as any, language) || 'Takeaway')
                            : type === 'delivery'
                            ? (t('orders.delivery' as any, language) || 'Delivery')
                            : type}
                        </Table.Td>
                        <Table.Td>
                          <Badge color={getBadgeColorForText(String(count))} variant="light">{count}</Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : null}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
        </Stack>
      </div>
    </>
  );
}

