'use client';

import { useState, useEffect, useCallback } from 'react';
import { Stack, Paper, Text, Grid, Card, Skeleton, Box } from '@mantine/core';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { reportsApi, InventoryReport, ReportQueryParams } from '@/lib/api/reports';
import { ReportFilters } from './ReportFilters';
import { restaurantApi } from '@/lib/api/restaurant';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getWarningColor, getErrorColor } from '@/lib/utils/theme';
import { useCurrency } from '@/lib/hooks/use-currency';
import { notifications } from '@mantine/notifications';
import { db } from '@/lib/indexeddb/database';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';

export default function InventoryReportPage() {
  const language = useLanguageStore((state) => state.language);
  const currency = useCurrency();
  const themeColor = useThemeColor();
  const { isOnline } = useSyncStatus();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<InventoryReport | null>(null);
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
      let data: InventoryReport;
      if (isOnline) {
        data = await reportsApi.getInventoryReport(filtersToUse);
        await db.reports.put({ id: 'inventory', type: 'inventory', data: JSON.stringify(data), filters: JSON.stringify(filtersToUse), updatedAt: new Date().toISOString() });
      } else {
        const cached = await db.reports.get('inventory');
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
      const url = await reportsApi.exportReport('/reports/inventory', {
        ...filters,
        export: format,
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-report.${format === 'csv' ? 'csv' : 'xlsx'}`;
      link.click();
      window.URL.revokeObjectURL(url);
      notifications.show({ title: t('common.success' as any, language), message: t('reports.exportSuccess' as any, language) || 'Report exported successfully', color: getSuccessColor() });
    } catch (error: any) {
      notifications.show({ title: t('common.error' as any, language), message: error?.message || 'Failed to export report', color: getErrorColor() });
    }
  };
  const handlePrint = () => window.print();

  if (loading) return <Stack gap="md"><Skeleton height={200} /><Skeleton height={400} /></Stack>;
  if (!report) return <Paper p="md" withBorder><Text c="dimmed">{t('reports.noData' as any, language) || 'No data available'}</Text></Paper>;

  // Deduplicate ingredients by name to fix duplicate "Milk" issue
  const uniqueIngredients = report.ingredients.reduce((acc, ing) => {
    const existing = acc.find((item) => item.name === ing.name);
    if (!existing) {
      acc.push(ing);
    }
    return acc;
  }, [] as typeof report.ingredients);

  const stockData = uniqueIngredients.slice(0, 10).map((ing) => ({ 
    name: ing.name, 
    stock: ing.currentStock || 0, 
    threshold: ing.minimumThreshold || 0 
  }));

  return (
    <Stack gap="md">
      <ReportFilters branches={branches} onFilterChange={handleFilterChange} onExport={handleExport} onPrint={handlePrint} onRefresh={() => loadReport(filters)} loading={loading} currentFilters={filters} showGroupBy={false} />
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.totalIngredients' as any, language)}</Text><Text size="xl" fw={700} style={{ color: themeColor }}>{report.summary.totalIngredients}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.lowStockItems' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getErrorColor() }}>{report.summary.lowStockItems}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.warningStockItems' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getWarningColor() }}>{report.summary.warningStockItems}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.totalInventoryValue' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getSuccessColor() }}>{report.summary.totalInventoryValue.toFixed(2)} {currency}</Text></Card></Grid.Col>
      </Grid>
      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">{t('reports.stockLevels' as any, language) || 'Stock Levels'}</Text>
        <Box h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stockData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="stock" fill={themeColor} name={t('reports.currentStock' as any, language)} />
              <Bar dataKey="threshold" fill={getWarningColor()} name={t('reports.minimumThreshold' as any, language)} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Stack>
  );
}

