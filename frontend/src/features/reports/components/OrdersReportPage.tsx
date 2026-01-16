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
  Table,
} from '@mantine/core';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { t } from '@/lib/utils/translations';
import { reportsApi, OrderReport, ReportQueryParams } from '@/lib/api/reports';
import { ReportFilters } from './ReportFilters';
import { authApi } from '@/lib/api/auth';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getThemeColorShade, getSuccessColor, getInfoColor, getWarningColor, getErrorColor } from '@/lib/utils/theme';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import { useChartTooltip } from '@/lib/hooks/use-chart-tooltip';
import { useCurrency } from '@/lib/hooks/use-currency';
import { notifications } from '@mantine/notifications';

export default function OrdersReportPage() {
  const language = useLanguageStore((state) => state.language);
  const { user } = useAuthStore();
  const currency = useCurrency();
  const themeColor = useThemeColor();
  const tooltipStyle = useChartTooltip();
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [report, setReport] = useState<OrderReport | null>(null);
  const [branches, setBranches] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState<ReportQueryParams>({});

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
      const data = await reportsApi.getOrdersReport(filtersToUse);
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

  const handleFilterChange = (newFilters: ReportQueryParams) => {
    setFilters(newFilters);
  };

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      setExportLoading(true);
      const url = await reportsApi.exportReport('/reports/orders', {
        ...filters,
        export: format,
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = `orders-report.${format === 'csv' ? 'csv' : 'xlsx'}`;
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

  // Generate chart colors dynamically - pie chart has multiple order types
  const chartColors = useChartColors(3); // dine-in, takeaway, delivery

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

  // Helper function to translate order status
  const translateOrderStatus = (status: string): string => {
    const statusKey = status.toLowerCase().replace(/\s+/g, '_');
    const translation = t(`reports.orderStatus.${statusKey}` as any, language);
    // If translation exists and is not the key itself, return it
    if (translation && translation !== `reports.orderStatus.${statusKey}`) {
      return translation;
    }
    // Fallback: capitalize first letter of each word
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  // Helper function to translate order type
  const translateOrderType = (type: string): string => {
    const typeKey = type.toLowerCase().replace(/\s+/g, '_');
    const translation = t(`reports.orderType.${typeKey}` as any, language);
    // If translation exists and is not the key itself, return it
    if (translation && translation !== `reports.orderType.${typeKey}`) {
      return translation;
    }
    // Fallback: capitalize first letter of each word
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  const statusData = Object.entries(report.statusBreakdown).map(([key, value]) => ({
    name: translateOrderStatus(key),
    count: value.count,
    revenue: value.revenue,
  }));

  const typeData = Object.entries(report.typeBreakdown).map(([key, value]) => ({
    name: translateOrderType(key),
    count: value.count,
    revenue: value.revenue,
  }));

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
        showGroupBy={false}
      />

      <Grid>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
          <Card withBorder p="md">
            <Text size="sm" c="dimmed" mb="xs">
              {t('reports.totalOrders' as any, language)}
            </Text>
            <Text size="xl" fw={700} style={{ color: themeColor }}>
              {report.totalOrders}
            </Text>
          </Card>
        </Grid.Col>
      </Grid>

      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">
          {t('reports.statusBreakdown' as any, language)}
        </Text>
        <Box h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} />
              <Legend />
              <Bar dataKey="count" fill={themeColor} name={t('reports.totalOrders' as any, language)} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      <Paper p="md" withBorder>
        <Text fw={600} mb="md" size="lg">
          {t('reports.typeBreakdown' as any, language)}
        </Text>
        <Box h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={typeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill={chartColors[0]}
                dataKey="count"
              >
                {typeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
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

