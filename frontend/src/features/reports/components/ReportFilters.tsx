'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Paper,
  Group,
  Button,
  Select,
  Stack,
  Text,
  ActionIcon,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import '@mantine/dates/styles.css';
import { IconCalendar, IconDownload, IconPrinter, IconRefresh, IconCheck } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { ReportQueryParams } from '@/lib/api/reports';
import dayjs from 'dayjs';

interface ReportFiltersProps {
  branches: Array<{ value: string; label: string }>;
  onFilterChange: (filters: ReportQueryParams) => void;
  onExport: (format: 'csv' | 'excel') => void;
  onPrint: () => void;
  onRefresh: () => void;
  loading?: boolean;
  defaultDateRange?: { start: Date | null; end: Date | null };
  currentFilters?: ReportQueryParams;
  showGroupBy?: boolean;
}

export function ReportFilters({
  branches,
  onFilterChange,
  onExport,
  onPrint,
  onRefresh,
  loading = false,
  defaultDateRange,
  currentFilters,
  showGroupBy = false,
}: ReportFiltersProps) {
  const language = useLanguageStore((state) => state.language);
  const themeColor = useThemeColor();

  // Parse dates from currentFilters or use defaults
  const parseDate = (dateString: string | undefined): Date | null => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  };

  const [startDate, setStartDate] = useState<Date | null>(
    currentFilters?.startDate ? parseDate(currentFilters.startDate) : (defaultDateRange?.start || null)
  );
  const [endDate, setEndDate] = useState<Date | null>(
    currentFilters?.endDate ? parseDate(currentFilters.endDate) : (defaultDateRange?.end || null)
  );
  const [selectedBranch, setSelectedBranch] = useState<string>(
    currentFilters?.branchId || ''
  );
  const [groupBy, setGroupBy] = useState<string>(
    currentFilters?.groupBy || 'day'
  );
  const [selectedDateRange, setSelectedDateRange] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  // Sync with currentFilters when they change externally (only if different from current state)
  // This ensures the filter inputs stay in sync with the parent's filter state
  useEffect(() => {
    if (currentFilters) {
      const newStartDate = currentFilters.startDate ? parseDate(currentFilters.startDate) : null;
      const newEndDate = currentFilters.endDate ? parseDate(currentFilters.endDate) : null;
      const newBranch = currentFilters.branchId || '';
      const newGroupBy = currentFilters.groupBy || 'day';

      // Only update if values are actually different to prevent unnecessary re-renders
      // Compare dates by timestamp to avoid unnecessary updates
      const startDateTime = startDate?.getTime() ?? null;
      const newStartDateTime = newStartDate?.getTime() ?? null;
      if (startDateTime !== newStartDateTime) {
        setStartDate(newStartDate);
      }
      
      const endDateTime = endDate?.getTime() ?? null;
      const newEndDateTime = newEndDate?.getTime() ?? null;
      if (endDateTime !== newEndDateTime) {
        setEndDate(newEndDate);
      }
      
      if (newBranch !== selectedBranch) {
        setSelectedBranch(newBranch);
      }
      if (newGroupBy !== groupBy) {
        setGroupBy(newGroupBy);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilters?.startDate, currentFilters?.endDate, currentFilters?.branchId, currentFilters?.groupBy]);

  const handleQuickDateRange = (range: string) => {
    // Toggle: if clicking the same range again, deselect it
    if (selectedDateRange === range) {
      setSelectedDateRange(null);
      setStartDate(null);
      setEndDate(null);
      const branchId = selectedBranch === 'all' || selectedBranch === '' ? undefined : selectedBranch;
      applyFilters(null, null, branchId, groupBy);
      return;
    }

    setSelectedDateRange(range); // Track selected range
    const now = dayjs();
    let start: Date | null = null;
    let end: Date | null = now.toDate();

    switch (range) {
      case 'last7Days':
        start = now.subtract(7, 'days').toDate();
        break;
      case 'last30Days':
        start = now.subtract(30, 'days').toDate();
        break;
      case 'last90Days':
        start = now.subtract(90, 'days').toDate();
        break;
      case 'thisMonth':
        start = now.startOf('month').toDate();
        break;
      case 'lastMonth':
        start = now.subtract(1, 'month').startOf('month').toDate();
        end = now.subtract(1, 'month').endOf('month').toDate();
        break;
      case 'thisYear':
        start = now.startOf('year').toDate();
        break;
      default:
        return;
    }

    setStartDate(start);
    setEndDate(end);
    const branchId = selectedBranch === 'all' || selectedBranch === '' ? undefined : selectedBranch;
    applyFilters(start, end, branchId, groupBy);
  };

  const applyFilters = (
    start: Date | null,
    end: Date | null,
    branch: string | undefined,
    group: string
  ) => {
    // Format dates as YYYY-MM-DD for API
    const formatDate = (date: Date | null): string | undefined => {
      if (!date) return undefined;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const filters: ReportQueryParams = {
      startDate: formatDate(start),
      endDate: formatDate(end),
      branchId: branch && branch !== 'all' ? branch : undefined,
    };

    // Only include groupBy if showGroupBy is true
    if (showGroupBy) {
      filters.groupBy = group as 'day' | 'week' | 'month' | 'year';
    }

    onFilterChange(filters);
  };

  const handleDateChange = () => {
    setSelectedDateRange(null); // Clear selected range when custom dates are used
    const branchId = selectedBranch === 'all' || selectedBranch === '' ? undefined : selectedBranch;
    applyFilters(startDate, endDate, branchId, groupBy);
  };

  const handleBranchChange = (value: string | null) => {
    const branch = value || '';
    setSelectedBranch(branch);
    // If "all" is selected, pass undefined to API (which means all branches)
    const branchId = branch === 'all' || branch === '' ? undefined : branch;
    applyFilters(startDate, endDate, branchId, groupBy);
  };

  const handleGroupByChange = (value: string | null) => {
    const group = value || 'day';
    setGroupBy(group);
    applyFilters(startDate, endDate, selectedBranch, group);
  };

  // Apply initial filters on mount (only once) - only if no currentFilters provided
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      // Only apply initial filters if currentFilters is not provided
      // If currentFilters is provided, the parent is managing the state
      if (!currentFilters) {
        const branchId = selectedBranch === 'all' || selectedBranch === '' ? undefined : selectedBranch;
        applyFilters(null, null, branchId, groupBy);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  return (
    <Paper p="md" withBorder className="report-filters">
      <Stack gap="md">
        {/* Quick Date Range Buttons */}
        <Group gap="xs" className="filter-button-group">
          <Text size="sm" fw={500}>
            {t('reports.selectDateRange' as any, language)}:
          </Text>
          <Button
            size="xs"
            onClick={() => handleQuickDateRange('last7Days')}
            data-selected={selectedDateRange === 'last7Days' ? "true" : "false"}
            leftSection={selectedDateRange === 'last7Days' ? <IconCheck size={12} /> : undefined}
          >
            {t('reports.last7Days' as any, language)}
          </Button>
          <Button
            size="xs"
            onClick={() => handleQuickDateRange('last30Days')}
            data-selected={selectedDateRange === 'last30Days' ? "true" : "false"}
            leftSection={selectedDateRange === 'last30Days' ? <IconCheck size={12} /> : undefined}
          >
            {t('reports.last30Days' as any, language)}
          </Button>
          <Button
            size="xs"
            onClick={() => handleQuickDateRange('last90Days')}
            data-selected={selectedDateRange === 'last90Days' ? "true" : "false"}
            leftSection={selectedDateRange === 'last90Days' ? <IconCheck size={12} /> : undefined}
          >
            {t('reports.last90Days' as any, language)}
          </Button>
          <Button
            size="xs"
            onClick={() => handleQuickDateRange('thisMonth')}
            data-selected={selectedDateRange === 'thisMonth' ? "true" : "false"}
            leftSection={selectedDateRange === 'thisMonth' ? <IconCheck size={12} /> : undefined}
          >
            {t('reports.thisMonth' as any, language)}
          </Button>
          <Button
            size="xs"
            onClick={() => handleQuickDateRange('lastMonth')}
            data-selected={selectedDateRange === 'lastMonth' ? "true" : "false"}
            leftSection={selectedDateRange === 'lastMonth' ? <IconCheck size={12} /> : undefined}
          >
            {t('reports.lastMonth' as any, language)}
          </Button>
          <Button
            size="xs"
            onClick={() => handleQuickDateRange('thisYear')}
            data-selected={selectedDateRange === 'thisYear' ? "true" : "false"}
            leftSection={selectedDateRange === 'thisYear' ? <IconCheck size={12} /> : undefined}
          >
            {t('reports.thisYear' as any, language)}
          </Button>
        </Group>

        {/* Date Pickers and Filters */}
        <Group gap="md" align="flex-end">
          <DatePickerInput
            label={t('reports.startDate' as any, language)}
            value={startDate}
            onChange={(date) => {
              setStartDate(date);
              setSelectedDateRange(null); // Clear selected range when custom dates are used
              // Always apply filters when date changes
              const branchId = selectedBranch === 'all' || selectedBranch === '' ? undefined : selectedBranch;
              applyFilters(date, endDate, branchId, groupBy);
            }}
            leftSection={<IconCalendar size={16} />}
            style={{ flex: 1 }}
            maxDate={endDate || undefined}
          />
          <DatePickerInput
            label={t('reports.endDate' as any, language)}
            value={endDate}
            onChange={(date) => {
              setEndDate(date);
              setSelectedDateRange(null); // Clear selected range when custom dates are used
              // Always apply filters when date changes
              const branchId = selectedBranch === 'all' || selectedBranch === '' ? undefined : selectedBranch;
              applyFilters(startDate, date, branchId, groupBy);
            }}
            leftSection={<IconCalendar size={16} />}
            style={{ flex: 1 }}
            minDate={startDate || undefined}
          />
          <Select
            label={t('reports.filterByBranch' as any, language)}
            data={branches.map((b) => ({
              value: b.value || '',
              label: String(b.label || ''),
            }))}
            value={selectedBranch}
            onChange={handleBranchChange}
            clearable
            style={{ flex: 1 }}
          />
          {showGroupBy && (
            <Select
              label={t('reports.groupBy' as any, language)}
              data={[
                { value: 'day', label: String(t('reports.day' as any, language) || 'Day') },
                { value: 'week', label: String(t('reports.week' as any, language) || 'Week') },
                { value: 'month', label: String(t('reports.month' as any, language) || 'Month') },
                { value: 'year', label: String(t('reports.year' as any, language) || 'Year') },
              ]}
              value={groupBy}
              onChange={handleGroupByChange}
              style={{ flex: 1 }}
            />
          )}
        </Group>

        {/* Action Buttons */}
        <Group justify="flex-end">
          <ActionIcon
            variant="light"
            onClick={onRefresh}
            loading={loading}
            style={{ color: themeColor }}
          >
            <IconRefresh size={18} />
          </ActionIcon>
          <Button
            leftSection={<IconDownload size={16} />}
            variant="light"
            onClick={() => onExport('csv')}
            style={{ color: themeColor }}
          >
            {t('reports.exportCSV' as any, language)}
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            variant="light"
            onClick={() => onExport('excel')}
            style={{ color: themeColor }}
          >
            {t('reports.exportExcel' as any, language)}
          </Button>
          <Button
            leftSection={<IconPrinter size={16} />}
            variant="light"
            onClick={onPrint}
            style={{ color: themeColor }}
          >
            {t('reports.print' as any, language)}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

