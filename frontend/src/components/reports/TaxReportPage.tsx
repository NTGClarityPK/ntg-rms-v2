'use client';

import { useState, useEffect, useCallback } from 'react';
import { Stack, Paper, Text, Grid, Card, Skeleton, Box, Group } from '@mantine/core';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { reportsApi, TaxReport, ReportQueryParams } from '@/lib/api/reports';
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
import { handleApiError } from '@/shared/utils/error-handler';

export default function TaxReportPage() {
  const language = useLanguageStore((state) => state.language);
  const currency = useCurrency();
  const themeColor = useThemeColor();
  const { isOnline } = useSyncStatus();
  const tooltipStyle = useChartTooltip();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<TaxReport | null>(null);
  const [branches, setBranches] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState<ReportQueryParams>({ groupBy: 'day' });

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
      let data: TaxReport;
      if (isOnline) {
        data = await reportsApi.getTaxReport(filtersToUse);
        await db.reports.put({ id: 'tax', type: 'tax', data: JSON.stringify(data), filters: JSON.stringify(filtersToUse), updatedAt: new Date().toISOString() });
      } else {
        const cached = await db.reports.get('tax');
        if (cached) data = JSON.parse(cached.data);
        else throw new Error('No cached data available');
      }
      setReport(data);
    } catch (error: any) {
      handleApiError(error, {
        defaultMessage: t('reports.error' as any, language) || 'Failed to load report',
        language,
      });
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
      const url = await reportsApi.exportReport('/reports/tax', {
        ...filters,
        export: format,
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = `tax-report.${format === 'csv' ? 'csv' : 'xlsx'}`;
      link.click();
      window.URL.revokeObjectURL(url);
      notifications.show({ title: t('common.success' as any, language), message: t('reports.exportSuccess' as any, language) || 'Report exported successfully', color: getSuccessColor() });
    } catch (error: any) {
      handleApiError(error, {
        defaultMessage: 'Failed to export report',
        language,
      });
    }
  };
  const handlePrint = () => window.print();

  // Generate chart colors - reactive to theme changes
  // Must be called before early returns (React rules)
  const taxChartColors = useChartColors(report?.taxByType?.length || 1);

  if (loading) return <Stack gap="md"><Skeleton height={200} /><Skeleton height={400} /></Stack>;
  if (!report) return <Paper p="md" withBorder><Text c="dimmed">{t('reports.noData' as any, language) || 'No data available'}</Text></Paper>;

  return (
    <Stack gap="md">
      <ReportFilters branches={branches} onFilterChange={handleFilterChange} onExport={handleExport} onPrint={handlePrint} onRefresh={() => loadReport(filters)} loading={loading} currentFilters={filters} showGroupBy={true} />
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.totalTax' as any, language)}</Text><Text size="xl" fw={700} style={{ color: themeColor }}>{formatCurrency(report.summary.totalTax, currency)}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.taxableAmount' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getSuccessColor() }}>{formatCurrency(report.summary.taxableAmount, currency)}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.taxRate' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getErrorColor() }}>{report.summary.taxRate.toFixed(2)}%</Text></Card></Grid.Col>
      </Grid>
      {report.taxByType && report.taxByType.length > 0 && (
        <Paper p="md" withBorder>
          <Text fw={600} mb="md" size="lg">{t('reports.taxByType' as any, language) || 'Tax by Type'}</Text>
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Box h={300}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={report.taxByType.map(t => ({ name: t.name, value: t.estimatedAmount }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill={taxChartColors[0] || themeColor}
                      dataKey="value"
                    >
                      {report.taxByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={taxChartColors[index % taxChartColors.length] || themeColor} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `${value.toFixed(2)} ${currency}`} contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                {report.taxByType.map((tax, index) => (
                  <Card key={index} withBorder p="sm">
                    <Group justify="space-between">
                      <Box>
                        <Text fw={600} size="sm">{tax.name}</Text>
                        <Text size="xs" c="dimmed">
                          {tax.rate}% {tax.code ? `(${tax.code})` : ''}
                        </Text>
                      </Box>
                      <Text fw={600} size="sm" style={{ color: themeColor }}>
                        {formatCurrency(tax.estimatedAmount, currency)}
                      </Text>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Grid.Col>
          </Grid>
        </Paper>
      )}
      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">{t('reports.breakdown' as any, language) || 'Tax Breakdown Over Time'}</Text>
        <Box h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={report.taxBreakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip formatter={(value: number) => `${value.toFixed(2)} ${currency}`} contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
              <Legend />
              <Line type="monotone" dataKey="tax" stroke={themeColor} strokeWidth={2} name={t('reports.totalTax' as any, language)} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Stack>
  );
}

