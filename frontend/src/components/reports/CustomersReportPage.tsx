'use client';

import { useState, useEffect, useCallback } from 'react';
import { Stack, Paper, Text, Grid, Card, Skeleton, Box, Table } from '@mantine/core';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { reportsApi, CustomerReport, ReportQueryParams } from '@/lib/api/reports';
import { ReportFilters } from './ReportFilters';
import { restaurantApi } from '@/lib/api/restaurant';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getThemeColorShade, getSuccessColor, getInfoColor, getWarningColor, getErrorColor } from '@/lib/utils/theme';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import { useChartTooltip } from '@/lib/hooks/use-chart-tooltip';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { notifications } from '@mantine/notifications';
import { db } from '@/lib/indexeddb/database';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';

export default function CustomersReportPage() {
  const language = useLanguageStore((state) => state.language);
  const currency = useCurrency();
  const themeColor = useThemeColor();
  const { isOnline } = useSyncStatus();
  const tooltipStyle = useChartTooltip();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<CustomerReport | null>(null);
  const [branches, setBranches] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState<ReportQueryParams>({});

  const loadBranches = useCallback(async () => {
    try {
      const data = await restaurantApi.getBranches();
      setBranches(data.map((b) => ({ value: b.id, label: b.name })));
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  }, []);

  const loadReport = useCallback(async (reportFilters?: ReportQueryParams, silent = false) => {
    const filtersToUse = reportFilters || filters;
    if (!silent) {
      setLoading(true);
    }
    try {
      let data: CustomerReport;
      if (isOnline) {
        data = await reportsApi.getCustomersReport(filtersToUse);
        await db.reports.put({ id: 'customers', type: 'customers', data: JSON.stringify(data), filters: JSON.stringify(filtersToUse), updatedAt: new Date().toISOString() });
      } else {
        const cached = await db.reports.get('customers');
        if (cached) data = JSON.parse(cached.data);
        else throw new Error('No cached data available');
      }
      setReport(data);
    } catch (error: any) {
      notifications.show({ title: t('common.error' as any, language), message: error?.message || t('reports.error' as any, language) || 'Failed to load report', color: getErrorColor() });
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, language]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    // On initial load, show loading. On filter changes, update silently
    const isInitialLoad = !report;
    loadReport(filters, !isInitialLoad);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), isOnline]);

  const handleFilterChange = (newFilters: ReportQueryParams) => setFilters(newFilters);
  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const url = await reportsApi.exportReport('/reports/customers', {
        ...filters,
        export: format,
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = `customers-report.${format === 'csv' ? 'csv' : 'xlsx'}`;
      link.click();
      window.URL.revokeObjectURL(url);
      notifications.show({ title: t('common.success' as any, language), message: t('reports.exportSuccess' as any, language) || 'Report exported successfully', color: getSuccessColor() });
    } catch (error: any) {
      notifications.show({ title: t('common.error' as any, language), message: error?.message || 'Failed to export report', color: getErrorColor() });
    }
  };
  const handlePrint = () => window.print();

  // Generate chart colors dynamically - pie chart has 4 loyalty tiers
  const chartColors = useChartColors(4); // regular, silver, gold, platinum

  if (loading) return <Stack gap="md"><Skeleton height={200} /><Skeleton height={400} /></Stack>;
  if (!report) return <Paper p="md" withBorder><Text c="dimmed">{t('reports.noData' as any, language) || 'No data available'}</Text></Paper>;

  const loyaltyData = [
    { name: t('reports.regular' as any, language), value: report.summary.loyaltyTierBreakdown.regular },
    { name: t('reports.silver' as any, language), value: report.summary.loyaltyTierBreakdown.silver },
    { name: t('reports.gold' as any, language), value: report.summary.loyaltyTierBreakdown.gold },
    { name: t('reports.platinum' as any, language), value: report.summary.loyaltyTierBreakdown.platinum },
  ];

  return (
    <Stack gap="md">
      <ReportFilters branches={branches} onFilterChange={handleFilterChange} onExport={handleExport} onPrint={handlePrint} onRefresh={() => loadReport(filters)} loading={loading} currentFilters={filters} showGroupBy={false} />
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.totalCustomers' as any, language)}</Text><Text size="xl" fw={700} style={{ color: themeColor }}>{report.summary.totalCustomers}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.activeCustomers' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getSuccessColor() }}>{report.summary.activeCustomers}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.totalRevenue' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getInfoColor() }}>{formatCurrency(report.summary.totalRevenue, currency)}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.avgCustomerValue' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getWarningColor() }}>{formatCurrency(report.summary.avgCustomerValue, currency)}</Text></Card></Grid.Col>
      </Grid>
      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">{t('reports.loyaltyTierBreakdown' as any, language)}</Text>
        <Box h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={loyaltyData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`} outerRadius={80} fill={chartColors[0]} dataKey="value">
                {loyaltyData.map((entry, index) => <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Stack>
  );
}

