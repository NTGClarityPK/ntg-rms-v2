'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Paper,
  Group,
  Text,
  Grid,
  Card,
  Skeleton,
  Box,
} from '@mantine/core';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { reportsApi, SalesReport, ReportQueryParams } from '@/lib/api/reports';
import { ReportFilters } from './ReportFilters';
import { authApi } from '@/lib/api/auth';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getThemeColorShade, getSuccessColor, getInfoColor, getWarningColor } from '@/lib/utils/theme';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import { useChartTooltip } from '@/lib/hooks/use-chart-tooltip';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { notifications } from '@mantine/notifications';
import { getErrorColor } from '@/lib/utils/theme';

export default function SalesReportPage() {
  const language = useLanguageStore((state) => state.language);
  const { user } = useAuthStore();
  const currency = useCurrency();
  const themeColor = useThemeColor();
  const tooltipStyle = useChartTooltip();
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [branches, setBranches] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState<ReportQueryParams>({
    groupBy: 'day',
  });

  const loadBranches = useCallback(async () => {
    try {
      const data = await authApi.getAssignedBranches();
      // Fetch branches with current language to get translated names
      const { restaurantApi } = await import('@/lib/api/restaurant');
      const branchesWithLang = await restaurantApi.getBranches(language);
      
      // Create a map of branch IDs to translated names
      const branchNameMap = new Map<string, string>();
      branchesWithLang.forEach(b => {
        branchNameMap.set(b.id, b.name);
      });
      
      const branchOptions = data.map((b) => ({
        value: b.id,
        label: `${branchNameMap.get(b.id) || b.name} (${b.code})`,
      }));
      
      // If tenant owner, add "all branches" option
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
      // Load from API
      const data = await reportsApi.getSalesReport(filtersToUse);
      setReport(data);
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || t('reports.error' as any, language) || 'Failed to load report',
        color: getErrorColor(),
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

  const handleFilterChange = useCallback((newFilters: ReportQueryParams) => {
    setFilters(newFilters);
  }, []);

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      setExportLoading(true);
      const url = await reportsApi.exportReport('/reports/sales', {
        ...filters,
        export: format,
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales-report.${format === 'csv' ? 'csv' : 'xlsx'}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || 'Failed to export report',
        color: getErrorColor(),
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate chart colors dynamically based on series count
  // For pie charts with 3 series (dine-in, takeaway, delivery)
  const pieChartColors = useChartColors(3);

  if (loading) {
    return (
      <Stack gap="md">
        <Skeleton height={200} />
        <Skeleton height={400} />
        <Skeleton height={300} />
      </Stack>
    );
  }

  if (!report) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed">{t('reports.noData' as any, language) || 'No data available'}</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <ReportFilters
        branches={branches}
        onFilterChange={handleFilterChange}
        onExport={handleExport}
        onPrint={handlePrint}
        onRefresh={() => loadReport(filters)}
        loading={loading}
        exportLoading={exportLoading}
        currentFilters={filters}
        showGroupBy={true}
      />

      {/* Summary Cards */}
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card withBorder p="md">
            <Text size="sm" c="dimmed" mb="xs">
              {t('reports.totalRevenue' as any, language)}
            </Text>
            <Text size="xl" fw={700} style={{ color: themeColor }}>
              {formatCurrency(report.summary.totalRevenue, currency)}
            </Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card withBorder p="md">
            <Text size="sm" c="dimmed" mb="xs">
              {t('reports.totalOrders' as any, language)}
            </Text>
            <Text size="xl" fw={700} style={{ color: getSuccessColor() }}>
              {report.summary.totalOrders}
            </Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card withBorder p="md">
            <Text size="sm" c="dimmed" mb="xs">
              {t('reports.avgOrderValue' as any, language)}
            </Text>
            <Text size="xl" fw={700} style={{ color: getInfoColor() }}>
              {formatCurrency(report.summary.avgOrderValue, currency)}
            </Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card withBorder p="md">
            <Text size="sm" c="dimmed" mb="xs">
              {t('reports.totalTax' as any, language)}
            </Text>
            <Text size="xl" fw={700} style={{ color: getWarningColor() }}>
              {formatCurrency(report.summary.totalTax, currency)}
            </Text>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Revenue Trend Chart */}
      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">
          {t('reports.totalRevenue' as any, language)} - {t('reports.breakdown' as any, language)}
        </Text>
        <Box h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={report.breakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
              <Legend />
              <Line
                type="monotone"
                dataKey="totalRevenue"
                stroke={themeColor}
                strokeWidth={2}
                name={t('reports.totalRevenue' as any, language)}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Orders Trend Chart */}
      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">
          {t('reports.totalOrders' as any, language)} - {t('reports.breakdown' as any, language)}
        </Text>
        <Box h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.breakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
              <Legend />
              <Bar dataKey="totalOrders" fill={themeColor} name={t('reports.totalOrders' as any, language)} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Order Type Breakdown */}
      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">
          {t('reports.typeBreakdown' as any, language)}
        </Text>
        <Box h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  {
                    name: t('reports.dineInOrders' as any, language),
                    value: report.summary.dineInOrders,
                  },
                  {
                    name: t('reports.takeawayOrders' as any, language),
                    value: report.summary.takeawayOrders,
                  },
                  {
                    name: t('reports.deliveryOrders' as any, language),
                    value: report.summary.deliveryOrders,
                  },
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill={pieChartColors[0]}
                dataKey="value"
              >
                {pieChartColors.map((color, index) => (
                  <Cell key={`cell-${index}`} fill={color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Stack>
  );
}

