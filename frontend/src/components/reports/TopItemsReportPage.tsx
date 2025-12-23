'use client';

import { useState, useEffect, useCallback } from 'react';
import { Stack, Paper, Text, Grid, Card, Skeleton, Box, Table } from '@mantine/core';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { reportsApi, TopItemsReport, ReportQueryParams } from '@/lib/api/reports';
import { ReportFilters } from './ReportFilters';
import { restaurantApi } from '@/lib/api/restaurant';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor } from '@/lib/utils/theme';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import { useChartTooltip } from '@/lib/hooks/use-chart-tooltip';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { notifications } from '@mantine/notifications';
import { db } from '@/lib/indexeddb/database';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';

export default function TopItemsReportPage() {
  const language = useLanguageStore((state) => state.language);
  const currency = useCurrency();
  const themeColor = useThemeColor();
  const { isOnline } = useSyncStatus();
  const tooltipStyle = useChartTooltip();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<TopItemsReport | null>(null);
  const [branches, setBranches] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState<ReportQueryParams>({ limit: 10 });

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
      let data: TopItemsReport;
      if (isOnline) {
        data = await reportsApi.getTopItemsReport(filtersToUse);
        await db.reports.put({ id: 'top-items', type: 'top-items', data: JSON.stringify(data), filters: JSON.stringify(filtersToUse), updatedAt: new Date().toISOString() });
      } else {
        const cached = await db.reports.get('top-items');
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
      const url = await reportsApi.exportReport('/reports/top-items', {
        ...filters,
        export: format,
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = `top-items-report.${format === 'csv' ? 'csv' : 'xlsx'}`;
      link.click();
      window.URL.revokeObjectURL(url);
      notifications.show({ title: t('common.success' as any, language), message: t('reports.exportSuccess' as any, language) || 'Report exported successfully', color: getSuccessColor() });
    } catch (error: any) {
      notifications.show({ title: t('common.error' as any, language), message: error?.message || 'Failed to export report', color: getErrorColor() });
    }
  };
  const handlePrint = () => window.print();

  // Generate chart colors - reactive to theme changes
  // Must be called before early returns (React rules)
  const topItemsChartColors = useChartColors(2); // 2 series: quantity and revenue

  if (loading) return <Stack gap="md"><Skeleton height={200} /><Skeleton height={400} /></Stack>;
  if (!report) return <Paper p="md" withBorder><Text c="dimmed">{t('reports.noData' as any, language) || 'No data available'}</Text></Paper>;

  return (
    <Stack gap="md">
      <ReportFilters branches={branches} onFilterChange={handleFilterChange} onExport={handleExport} onPrint={handlePrint} onRefresh={() => loadReport(filters)} loading={loading} currentFilters={filters} showGroupBy={false} />
      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">{t('reports.topSellingItems' as any, language) || 'Top Selling Items'}</Text>
        <Box h={400}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.items.map(item => ({
              ...item,
              name: item.name
            }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
              <Legend />
              <Bar dataKey="quantity" fill={topItemsChartColors[0]} name={t('reports.quantity' as any, language)} />
              <Bar dataKey="revenue" fill={topItemsChartColors[1]} name={t('reports.revenue' as any, language)} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
      <Paper p="md" withBorder>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('reports.item' as any, language)}</Table.Th>
              <Table.Th>{t('reports.quantity' as any, language)}</Table.Th>
              <Table.Th>{t('reports.revenue' as any, language)}</Table.Th>
              <Table.Th>{t('reports.orderCount' as any, language)}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {report.items.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>{item.name}</Table.Td>
                <Table.Td>{item.quantity}</Table.Td>
                <Table.Td>{formatCurrency(item.revenue, currency)}</Table.Td>
                <Table.Td>{item.orderCount}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}

