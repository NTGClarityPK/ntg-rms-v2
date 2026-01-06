'use client';

import { useState, useEffect, useCallback } from 'react';
import { Stack, Paper, Text, Grid, Card, Skeleton, Box } from '@mantine/core';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { reportsApi, FinancialReport, ReportQueryParams } from '@/lib/api/reports';
import { ReportFilters } from './ReportFilters';
import { authApi } from '@/lib/api/auth';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor } from '@/lib/utils/theme';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import { useChartTooltip } from '@/lib/hooks/use-chart-tooltip';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { notifications } from '@mantine/notifications';
import { handleApiError } from '@/shared/utils/error-handler';

export default function FinancialReportPage() {
  const language = useLanguageStore((state) => state.language);
  const { user } = useAuthStore();
  const currency = useCurrency();
  const themeColor = useThemeColor();
  const tooltipStyle = useChartTooltip();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [branches, setBranches] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState<ReportQueryParams>({});

  const loadBranches = useCallback(async () => {
    try {
      const data = await authApi.getAssignedBranches();
      const branchOptions = data.map((b) => ({
        value: b.id,
        label: `${b.name} (${b.code})`,
      }));
      
      if (user?.role === 'tenant_owner') {
        branchOptions.unshift({
          value: 'all',
          label: language === 'ar' ? 'جميع الفروع' : 'All Branches',
        });
      }
      
      setBranches(branchOptions);
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  }, [user?.role, language]);

  const loadReport = useCallback(async (reportFilters?: ReportQueryParams, silent = false) => {
    const filtersToUse = reportFilters || filters;
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await reportsApi.getFinancialReport(filtersToUse);
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
  }, [language]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    // On initial load, show loading. On filter changes, update silently
    const isInitialLoad = !report;
    loadReport(filters, !isInitialLoad);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const handleFilterChange = (newFilters: ReportQueryParams) => setFilters(newFilters);
  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const url = await reportsApi.exportReport('/reports/financial', {
        ...filters,
        export: format,
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = `financial-report.${format === 'csv' ? 'csv' : 'xlsx'}`;
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
  const paymentChartColors = useChartColors(report?.paymentMethods ? Object.keys(report.paymentMethods).length : 1);

  if (loading) return <Stack gap="md"><Skeleton height={200} /><Skeleton height={400} /></Stack>;
  if (!report) return <Paper p="md" withBorder><Text c="dimmed">{t('reports.noData' as any, language) || 'No data available'}</Text></Paper>;

  // Helper function to translate payment method
  const translatePaymentMethod = (method: string): string => {
    let methodKey = method.toLowerCase();
    // Normalize credit_card/debit_card to card
    if (methodKey === 'credit_card' || methodKey === 'debit_card') {
      methodKey = 'card';
    }
    const translation = t(`reports.paymentMethod.${methodKey}` as any, language);
    // If translation exists and is not the key itself, return it
    if (translation && translation !== `reports.paymentMethod.${methodKey}`) {
      return translation;
    }
    // Fallback: capitalize first letter
    return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  };

  // Ensure paymentMethods exists and has data
  const paymentMethods = report.paymentMethods || {};
  // Show all payment methods, even if they have 0 values (so card and cash always appear)
  const paymentData = Object.entries(paymentMethods)
    .map(([key, value]) => ({ 
      name: translatePaymentMethod(key), 
      amount: value?.amount || 0, 
      count: value?.count || 0 
    }))
    .filter((entry) => entry.name); // Only filter out entries with no name

  return (
    <Stack gap="md">
      <ReportFilters branches={branches} onFilterChange={handleFilterChange} onExport={handleExport} onPrint={handlePrint} onRefresh={() => loadReport(filters)} loading={loading} currentFilters={filters} showGroupBy={false} />
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.totalRevenue' as any, language)}</Text><Text size="xl" fw={700} style={{ color: themeColor }}>{formatCurrency(report.revenue.total, currency)}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.costOfGoods' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getErrorColor() }}>{formatCurrency(report.costs.costOfGoods, currency)}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.grossProfit' as any, language)}</Text><Text size="xl" fw={700} style={{ color: getSuccessColor() }}>{formatCurrency(report.profit.gross, currency)}</Text></Card></Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><Card withBorder p="md"><Text size="sm" c="dimmed" mb="xs">{t('reports.profitMargin' as any, language)}</Text><Text size="xl" fw={700} style={{ color: report.profit.margin >= 0 ? getSuccessColor() : getErrorColor() }}>{report.profit.margin.toFixed(2)}%</Text></Card></Grid.Col>
      </Grid>
      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">{t('reports.paymentMethods' as any, language)}</Text>
        {paymentData.length > 0 ? (
          <Box h={300}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={paymentData} 
                  cx="50%" 
                  cy="50%" 
                  labelLine={false} 
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`} 
                  outerRadius={80} 
                  fill={paymentChartColors[0] || themeColor}
                  dataKey="amount"
                  minAngle={0}
                >
                  {paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={paymentChartColors[index % paymentChartColors.length] || themeColor} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value.toFixed(2)} ${currency}`} contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Box h={300} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">{t('reports.noPaymentData' as any, language) || 'No payment data available for the selected period'}</Text>
          </Box>
        )}
      </Paper>
    </Stack>
  );
}

