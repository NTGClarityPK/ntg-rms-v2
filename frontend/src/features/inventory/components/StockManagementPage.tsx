'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from '@mantine/form';
import {
  Title,
  Button,
  Stack,
  Modal,
  TextInput,
  Select,
  NumberInput,
  Table,
  Group,
  ActionIcon,
  Badge,
  Text,
  Paper,
  Skeleton,
  Alert,
  Grid,
  Tabs,
  Textarea,
  Loader,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconPlus,
  IconMinus,
  IconAdjustments,
  IconAlertCircle,
  IconSearch,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  inventoryApi,
  Ingredient,
  StockTransaction,
  AddStockDto,
  DeductStockDto,
  AdjustStockDto,
} from '@/lib/api/inventory';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useInventoryRefresh } from '@/lib/contexts/inventory-refresh-context';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getBadgeColorForText } from '@/lib/utils/theme';
import { restaurantApi, Branch } from '@/lib/api/restaurant';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';
import { isPaginatedResponse } from '@/lib/types/pagination.types';

// Transaction types for adding stock
const ADD_STOCK_REASONS = [
  { value: 'purchase', label: 'Purchase' },
];

// Transaction types for deducting stock (usage, waste, damaged, expired)
const DEDUCT_STOCK_REASONS = [
  { value: 'usage', label: 'Usage' },
  { value: 'waste', label: 'Waste' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
];

export function StockManagementPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const { refreshKey, triggerRefresh } = useInventoryRefresh();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const transactionsPagination = usePagination<StockTransaction>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Helper function to get deduplicated ingredient options for Select dropdowns
  const getIngredientOptions = useCallback(() => {
    // Deduplicate by ID first
    const byId = new Map(ingredients.map(ing => [ing.id, ing]));
    const uniqueIngredients = Array.from(byId.values());
    
    return uniqueIngredients
      .filter((ing) => ing.name)
      .map((ing) => ({
        value: ing.id,
        label: `${ing.name || ''}${ing.unitOfMeasurement ? ` (${ing.unitOfMeasurement})` : ''}`,
      }));
  }, [ingredients]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [opened, setOpened] = useState(false);
  const [transactionType, setTransactionType] = useState<'add' | 'deduct' | 'adjust'>('add');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [submittingDeduct, setSubmittingDeduct] = useState(false);
  const [submittingAdjust, setSubmittingAdjust] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<Partial<StockTransaction> | null>(null);

  const addStockForm = useForm<AddStockDto>({
    initialValues: {
      ingredientId: '',
      quantity: 0,
      unitCost: 0,
      branchId: selectedBranchId || undefined,
      supplierName: '',
      invoiceNumber: '',
      reason: '',
      transactionDate: new Date().toISOString(),
    },
    validate: {
      ingredientId: (value) => (!value ? t('inventory.ingredient', language) + ' is required' : null),
      quantity: (value) => (value <= 0 ? t('inventory.quantity', language) + ' must be greater than 0' : null),
      unitCost: (value) => (value < 0 ? t('inventory.unitCost', language) + ' cannot be negative' : null),
    },
  });

  const deductStockForm = useForm<DeductStockDto>({
    initialValues: {
      ingredientId: '',
      quantity: 0,
      branchId: selectedBranchId || undefined,
      reason: '',
      referenceId: '',
      transactionDate: new Date().toISOString(),
    },
    validate: {
      ingredientId: (value) => (!value ? t('inventory.ingredient', language) + ' is required' : null),
      quantity: (value) => (value <= 0 ? t('inventory.quantity', language) + ' must be greater than 0' : null),
      reason: (value) => (!value ? t('inventory.reason', language) + ' is required' : null),
    },
  });

  const adjustStockForm = useForm<AdjustStockDto>({
    initialValues: {
      ingredientId: '',
      newQuantity: 0,
      branchId: selectedBranchId || undefined,
      reason: '',
      transactionDate: new Date().toISOString(),
    },
    validate: {
      ingredientId: (value) => (!value ? t('inventory.ingredient', language) + ' is required' : null),
      newQuantity: (value) => (value < 0 ? t('inventory.newQuantity', language) + ' cannot be negative' : null),
      reason: (value) => (!value ? t('inventory.reason', language) + ' is required' : null),
    },
  });

  const loadIngredients = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      // Fetch all pages of ingredients (filtered by branch if selected)
      let allServerIngredients: Ingredient[] = [];
      let page = 1;
      const limit = 100; // Fetch 100 items per page
      let hasMore = true;

      while (hasMore) {
        const serverIngredientsResponse = await inventoryApi.getIngredients(
          { isActive: true },
          { page, limit },
          selectedBranchId || undefined
        );

        if (isPaginatedResponse(serverIngredientsResponse)) {
          // Handle paginated response
          allServerIngredients = [...allServerIngredients, ...serverIngredientsResponse.data];
          hasMore = serverIngredientsResponse.pagination.hasNext;
          page++;
        } else {
          // Handle non-paginated response (array)
          allServerIngredients = serverIngredientsResponse;
          hasMore = false;
        }
      }
      
      setIngredients(allServerIngredients);
    } catch (err: any) {
      console.error('Failed to load ingredients:', err);
    }
  }, [user?.tenantId, selectedBranchId]);

  const loadBranches = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      const serverBranches = await restaurantApi.getBranches();
      setBranches(serverBranches as any);
    } catch (err: any) {
      console.error('Failed to load branches:', err);
    }
  }, [user?.tenantId]);

  const loadTransactions = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setTransactionsLoading(true);

      const filters: any = {};
      if (ingredientFilter) filters.ingredientId = ingredientFilter;
      if (selectedBranchId) filters.branchId = selectedBranchId;
      if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
      if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

      const serverTransactionsResponse = await inventoryApi.getStockTransactions(filters, transactionsPagination.paginationParams);
      const serverTransactions = transactionsPagination.extractData(serverTransactionsResponse);
      transactionsPagination.extractPagination(serverTransactionsResponse);
      
      setTransactions(serverTransactions);
    } catch (err: any) {
      console.error('Failed to load transactions:', err);
    } finally {
      setTransactionsLoading(false);
    }
  }, [user?.tenantId, ingredientFilter, selectedBranchId, startDate, endDate, transactionsPagination]);

  useEffect(() => {
    loadIngredients();
    loadBranches();
    setLoading(false);
  }, [loadIngredients, loadBranches, refreshKey]);

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredientFilter, selectedBranchId, startDate, endDate, transactionsPagination.page, transactionsPagination.limit, refreshKey]);

  const handleOpenModal = (type: 'add' | 'deduct' | 'adjust') => {
    setTransactionType(type);
    setOpened(true);
    
    // Reset forms
    addStockForm.reset();
    deductStockForm.reset();
    adjustStockForm.reset();
    
    // Set current branch automatically
    if (selectedBranchId) {
      addStockForm.setFieldValue('branchId', selectedBranchId);
      deductStockForm.setFieldValue('branchId', selectedBranchId);
      adjustStockForm.setFieldValue('branchId', selectedBranchId);
    }
  };

  const handleCloseModal = () => {
    setOpened(false);
    addStockForm.reset();
    deductStockForm.reset();
    adjustStockForm.reset();
  };

  const handleAddStock = async (values: AddStockDto) => {
    if (!user?.tenantId || submittingAdd) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmittingAdd(true);
    });

    // Ensure branchId is set to current branch
    const stockData = {
      ...values,
      branchId: selectedBranchId || values.branchId,
    };

    // Get ingredient name for skeleton
    const ingredient = ingredients.find(ing => ing.id === stockData.ingredientId);
    const ingredientName = ingredient?.name || '';

    // Close modal immediately
    handleCloseModal();

    // Add pending transaction skeleton
    setPendingTransaction({
      id: `pending-${Date.now()}`,
      transactionType: 'purchase',
      quantity: stockData.quantity,
      unitCost: stockData.unitCost,
      totalCost: stockData.quantity * stockData.unitCost,
      reason: stockData.reason || 'Purchase',
      transactionDate: stockData.transactionDate || new Date().toISOString(),
      ingredient: ingredient ? { id: ingredient.id, name: ingredientName } as Ingredient : undefined,
    });

    try {
      setError(null);

      await inventoryApi.addStock(stockData);

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('inventory.stockAdded', language),
        color: successColor,
      });

      // Remove pending transaction skeleton
      setPendingTransaction(null);

      loadIngredients();
      loadTransactions();
      triggerRefresh(); // Trigger refresh for all tabs
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || t('inventory.addStockError', language);
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
      
      // Remove pending transaction skeleton on error
      setPendingTransaction(null);
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleDeductStock = async (values: DeductStockDto) => {
    if (!user?.tenantId || submittingDeduct) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmittingDeduct(true);
    });

    // Ensure branchId is set to current branch
    const deductData = {
      ...values,
      branchId: selectedBranchId || values.branchId,
    };

    // Get ingredient name for skeleton
    const ingredient = ingredients.find(ing => ing.id === deductData.ingredientId);
    const ingredientName = ingredient?.name || '';

    // Close modal immediately
    handleCloseModal();

    // Add pending transaction skeleton
    setPendingTransaction({
      id: `pending-${Date.now()}`,
      transactionType: deductData.reason || 'usage',
      quantity: -deductData.quantity,
      unitCost: undefined,
      totalCost: undefined,
      reason: deductData.reason || 'Usage',
      transactionDate: deductData.transactionDate || new Date().toISOString(),
      ingredient: ingredient ? { id: ingredient.id, name: ingredientName } as Ingredient : undefined,
    });

    try {
      setError(null);

      // Check stock availability
      const ingredientData = await inventoryApi.getIngredientById(deductData.ingredientId);
      if (!ingredientData) {
        throw new Error('Ingredient not found');
      }

      if (ingredientData.currentStock < deductData.quantity) {
        throw new Error(t('inventory.insufficientStock', language));
      }

      await inventoryApi.deductStock(deductData);

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('inventory.stockDeducted', language),
        color: successColor,
      });

      // Remove pending transaction skeleton
      setPendingTransaction(null);

      loadIngredients();
      loadTransactions();
      triggerRefresh(); // Trigger refresh for all tabs
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || t('inventory.deductStockError', language);
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
      
      // Remove pending transaction skeleton on error
      setPendingTransaction(null);
    } finally {
      setSubmittingDeduct(false);
    }
  };

  const handleAdjustStock = async (values: AdjustStockDto) => {
    if (!user?.tenantId || submittingAdjust) return;

    // Set loading state immediately to show loader on button - use flushSync to ensure immediate update
    flushSync(() => {
      setSubmittingAdjust(true);
    });

    // Ensure branchId is set to current branch
    const adjustData = {
      ...values,
      branchId: selectedBranchId || values.branchId,
    };

    // Get ingredient name and current stock for skeleton
    const ingredient = ingredients.find(ing => ing.id === adjustData.ingredientId);
    const ingredientName = ingredient?.name || '';
    const currentStock = ingredient?.currentStock || 0;
    const quantityChange = adjustData.newQuantity - currentStock;

    // Close modal immediately
    handleCloseModal();

    // Add pending transaction skeleton
    setPendingTransaction({
      id: `pending-${Date.now()}`,
      transactionType: 'adjustment',
      quantity: quantityChange,
      unitCost: undefined,
      totalCost: undefined,
      reason: adjustData.reason || 'Adjustment',
      transactionDate: adjustData.transactionDate || new Date().toISOString(),
      ingredient: ingredient ? { id: ingredient.id, name: ingredientName } as Ingredient : undefined,
    });

    try {
      setError(null);

      await inventoryApi.adjustStock(adjustData);

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('inventory.stockAdjusted', language),
        color: successColor,
      });

      // Remove pending transaction skeleton
      setPendingTransaction(null);

      loadIngredients();
      loadTransactions();
      triggerRefresh(); // Trigger refresh for all tabs
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || t('inventory.adjustStockError', language);
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
      
      // Remove pending transaction skeleton on error
      setPendingTransaction(null);
    } finally {
      setSubmittingAdjust(false);
    }
  };


  // Filter transactions
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = searchQuery === '' || 
      (tx.ingredient && (
        tx.ingredient.name?.toLowerCase().includes(searchQuery.toLowerCase())
      ));
    return matchesSearch;
  });

  const getTransactionTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      purchase: t('inventory.purchase', language),
      usage: t('inventory.usage', language),
      adjustment: t('inventory.adjustment', language),
      transfer_in: t('inventory.transferIn', language),
      transfer_out: t('inventory.transferOut', language),
      waste: t('inventory.waste', language),
      damaged: t('inventory.damaged', language),
      expired: t('inventory.expired', language),
    };
    return typeMap[type] || type;
  };

  return (
    <Stack gap="md" pt="sm">
      <Group justify="flex-end">
        <Group gap="xs">
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => handleOpenModal('add')}
            style={{ backgroundColor: successColor }}
          >
            {t('inventory.addStock', language)}
          </Button>
          <Button
            leftSection={<IconMinus size={16} />}
            onClick={() => handleOpenModal('deduct')}
            variant="light"
            color={errorColor}
          >
            {t('inventory.deductStock', language)}
          </Button>
          <Button
            leftSection={<IconAdjustments size={16} />}
            onClick={() => handleOpenModal('adjust')}
            variant="light"
            color={primaryColor}
          >
            {t('inventory.adjustStock', language)}
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color={errorColor} mb="md">
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper p="md" withBorder mb="md">
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput
              placeholder={t('common.search' as any, language) || 'Search'}
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              placeholder={t('inventory.ingredient', language)}
              data={getIngredientOptions()}
              value={ingredientFilter || ''}
              onChange={(value) => setIngredientFilter(value || null)}
              clearable
              searchable
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 2 }}>
            <DateInput
              placeholder={t('inventory.startDate', language)}
              value={startDate}
              onChange={setStartDate}
              clearable
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 2 }}>
            <DateInput
              placeholder={t('inventory.endDate', language)}
              value={endDate}
              onChange={setEndDate}
              clearable
            />
          </Grid.Col>
        </Grid>
      </Paper>

      {/* Transactions Table */}
      {transactionsLoading ? (
        <Stack gap="md">
          {[1, 2, 3, 4, 5].map((i) => (
            <Paper key={i} p="md" withBorder>
              <Skeleton height={20} width="100%" mb="xs" />
              <Skeleton height={16} width="60%" />
            </Paper>
          ))}
        </Stack>
      ) : filteredTransactions.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text ta="center" c="dimmed">
            {t('inventory.noTransactions', language)}
          </Text>
        </Paper>
      ) : (
        <Fragment>
          <Table.ScrollContainer minWidth={1000}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('inventory.transactionDate', language)}</Table.Th>
                  <Table.Th>{t('inventory.ingredient', language)}</Table.Th>
                  <Table.Th>{t('inventory.transactionType', language)}</Table.Th>
                  <Table.Th>{t('inventory.quantity', language)}</Table.Th>
                  <Table.Th>{t('inventory.unitCost', language)}</Table.Th>
                  <Table.Th>{t('inventory.totalCost', language)}</Table.Th>
                  <Table.Th>{t('inventory.reason', language)}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {/* Show pending transaction skeleton when creating */}
                {pendingTransaction && (
                  <Table.Tr key={pendingTransaction.id} style={{ opacity: 0.7, position: 'relative' }}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Skeleton height={16} width={100} />
                        <Loader size={16} style={{ flexShrink: 0 }} />
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={150} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={24} width={80} radius="xl" />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={60} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={60} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={60} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={16} width={120} />
                    </Table.Td>
                  </Table.Tr>
                )}
                {filteredTransactions.map((tx) => (
                  <Table.Tr key={tx.id}>
                    <Table.Td>
                      <Text size="sm">
                        {new Date(tx.transactionDate).toLocaleDateString(language === 'ar' ? 'ar' : 'en')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {tx.ingredient ? (
                        <Text fw={500}>
                          {tx.ingredient.name}
                        </Text>
                      ) : (
                        <Text size="sm" c="dimmed">-</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={getBadgeColorForText(getTransactionTypeLabel(tx.transactionType))}
                      >
                        {getTransactionTypeLabel(tx.transactionType)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={tx.quantity > 0 ? 500 : undefined} c={tx.quantity < 0 ? errorColor : undefined}>
                        {tx.quantity > 0 ? '+' : ''}{tx.quantity}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {tx.unitCost ? (
                        <Text>{tx.unitCost.toFixed(2)}</Text>
                      ) : (
                        <Text size="sm" c="dimmed">-</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {tx.totalCost ? (
                        <Text fw={500}>{tx.totalCost.toFixed(2)}</Text>
                      ) : (
                        <Text size="sm" c="dimmed">-</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{tx.reason || '-'}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          
          {/* Pagination Controls */}
          {transactionsPagination.total > 0 && (
            <PaginationControls
              page={transactionsPagination.page}
              totalPages={transactionsPagination.totalPages}
              limit={transactionsPagination.limit}
              total={transactionsPagination.total}
              onPageChange={(page) => {
                transactionsPagination.setPage(page);
              }}
              onLimitChange={(newLimit) => {
                transactionsPagination.setLimit(newLimit);
                transactionsPagination.setPage(1);
              }}
            />
          )}
        </Fragment>
      )}

      {/* Add Stock Modal */}
      <Modal
        opened={opened && transactionType === 'add'}
        onClose={() => {
          if (!submittingAdd) {
            handleCloseModal();
          }
        }}
        title={t('inventory.addStock', language)}
        size="lg"
        closeOnClickOutside={!submittingAdd}
        closeOnEscape={!submittingAdd}
      >
        <form onSubmit={addStockForm.onSubmit(handleAddStock)}>
          <Stack gap="md">
            <Select
              label={t('inventory.ingredient', language)}
              placeholder={t('inventory.selectIngredient', language)}
              required
              data={getIngredientOptions()}
              searchable
              {...addStockForm.getInputProps('ingredientId')}
            />
            <Grid>
              <Grid.Col span={6}>
                <NumberInput
                  label={t('inventory.quantity', language)}
                  required
                  min={0.001}
                  decimalScale={3}
                  {...addStockForm.getInputProps('quantity')}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label={t('inventory.unitCost', language)}
                  required
                  min={0}
                  decimalScale={2}
                  {...addStockForm.getInputProps('unitCost')}
                />
              </Grid.Col>
            </Grid>
            {addStockForm.values.quantity > 0 && addStockForm.values.unitCost > 0 && (
              <Text size="sm" c="dimmed">
                {t('inventory.totalCost', language)}: {(addStockForm.values.quantity * addStockForm.values.unitCost).toFixed(2)}
              </Text>
            )}
            <TextInput
              label={t('inventory.supplierName', language)}
              {...addStockForm.getInputProps('supplierName')}
            />
            <TextInput
              label={t('inventory.invoiceNumber', language)}
              {...addStockForm.getInputProps('invoiceNumber')}
            />
            <Textarea
              label={t('inventory.reason', language)}
              {...addStockForm.getInputProps('reason')}
            />
            <DateInput
              label={t('inventory.transactionDate', language)}
              value={addStockForm.values.transactionDate ? new Date(addStockForm.values.transactionDate) : null}
              onChange={(date) => addStockForm.setFieldValue('transactionDate', date?.toISOString() || new Date().toISOString())}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseModal}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button 
                type="submit" 
                style={{ backgroundColor: successColor }}
                loading={submittingAdd}
                disabled={submittingAdd}
              >
                {t('inventory.addStock', language)}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Deduct Stock Modal */}
      <Modal
        opened={opened && transactionType === 'deduct'}
        onClose={() => {
          if (!submittingDeduct) {
            handleCloseModal();
          }
        }}
        title={t('inventory.deductStock', language)}
        size="lg"
        closeOnClickOutside={!submittingDeduct}
        closeOnEscape={!submittingDeduct}
      >
        <form onSubmit={deductStockForm.onSubmit(handleDeductStock)}>
          <Stack gap="md">
            <Select
              label={t('inventory.ingredient', language)}
              placeholder={t('inventory.selectIngredient', language)}
              required
              data={getIngredientOptions()}
              searchable
              {...deductStockForm.getInputProps('ingredientId')}
            />
            <NumberInput
              label={t('inventory.quantity', language)}
              required
              min={0.001}
              decimalScale={3}
              {...deductStockForm.getInputProps('quantity')}
            />
            <Select
              label={t('inventory.reason', language)}
              required
              data={DEDUCT_STOCK_REASONS.map((type) => ({
                value: type.value,
                label: t(`inventory.${type.value}` as any, language) || type.label,
              }))}
              {...deductStockForm.getInputProps('reason')}
            />
            <TextInput
              label={t('inventory.referenceId', language) || 'Reference ID'}
              {...deductStockForm.getInputProps('referenceId')}
            />
            <DateInput
              label={t('inventory.transactionDate', language)}
              value={deductStockForm.values.transactionDate ? new Date(deductStockForm.values.transactionDate) : null}
              onChange={(date) => deductStockForm.setFieldValue('transactionDate', date?.toISOString() || new Date().toISOString())}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseModal}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button 
                type="submit" 
                color={errorColor}
                loading={submittingDeduct}
                disabled={submittingDeduct}
              >
                {t('inventory.deductStock', language)}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal
        opened={opened && transactionType === 'adjust'}
        onClose={() => {
          if (!submittingAdjust) {
            handleCloseModal();
          }
        }}
        title={t('inventory.adjustStock', language)}
        size="lg"
        closeOnClickOutside={!submittingAdjust}
        closeOnEscape={!submittingAdjust}
      >
        <form onSubmit={adjustStockForm.onSubmit(handleAdjustStock)}>
          <Stack gap="md">
            <Select
              label={t('inventory.ingredient', language)}
              placeholder={t('inventory.selectIngredient', language)}
              required
              data={getIngredientOptions()}
              searchable
              {...adjustStockForm.getInputProps('ingredientId')}
            />
            {adjustStockForm.values.ingredientId && (
              <Text size="sm" c="dimmed">
                {t('inventory.currentStock', language)}: {
                  ingredients.find((ing) => ing.id === adjustStockForm.values.ingredientId)?.currentStock || 0
                } {
                  ingredients.find((ing) => ing.id === adjustStockForm.values.ingredientId)?.unitOfMeasurement || ''
                }
              </Text>
            )}
            <NumberInput
              label={t('inventory.newQuantity', language)}
              required
              min={0}
              decimalScale={3}
              {...adjustStockForm.getInputProps('newQuantity')}
            />
            <Textarea
              label={t('inventory.reason', language)}
              required
              placeholder={t('inventory.reason', language)}
              {...adjustStockForm.getInputProps('reason')}
            />
            <DateInput
              label={t('inventory.transactionDate', language)}
              value={adjustStockForm.values.transactionDate ? new Date(adjustStockForm.values.transactionDate) : null}
              onChange={(date) => adjustStockForm.setFieldValue('transactionDate', date?.toISOString() || new Date().toISOString())}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseModal}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button 
                type="submit" 
                style={{ backgroundColor: primaryColor }}
                loading={submittingAdjust}
                disabled={submittingAdjust}
              >
                {t('inventory.adjustStock', language)}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

    </Stack>
  );
}

