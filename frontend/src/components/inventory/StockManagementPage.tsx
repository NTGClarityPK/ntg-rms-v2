'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useForm } from '@mantine/form';
import {
  Container,
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
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconPlus,
  IconMinus,
  IconAdjustments,
  IconArrowsExchange,
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
  TransferStockDto,
} from '@/lib/api/inventory';
import { db } from '@/lib/indexeddb/database';
import { syncService } from '@/lib/sync/sync-service';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useInventoryRefresh } from '@/lib/contexts/inventory-refresh-context';
import { useNotificationColors, useErrorColor, useSuccessColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { restaurantApi } from '@/lib/api/restaurant';
import { Branch } from '@/lib/indexeddb/database';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
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
  const transactionsPagination = usePagination<StockTransaction>({ initialPage: 1, initialLimit: 10 });
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
        label: ing.name || '',
      }));
  }, [ingredients]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [opened, setOpened] = useState(false);
  const [transactionType, setTransactionType] = useState<'add' | 'deduct' | 'adjust' | 'transfer'>('add');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

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

  const transferStockForm = useForm<TransferStockDto>({
    initialValues: {
      ingredientId: '',
      fromBranchId: selectedBranchId || '',
      toBranchId: '',
      quantity: 0,
      reason: '',
      transactionDate: new Date().toISOString(),
    },
    validate: {
      ingredientId: (value) => (!value ? t('inventory.ingredient', language) + ' is required' : null),
      fromBranchId: (value) => (!value ? t('inventory.fromBranch', language) + ' is required' : null),
      toBranchId: (value) => (!value ? t('inventory.toBranch', language) + ' is required' : null),
      quantity: (value) => (value <= 0 ? t('inventory.quantity', language) + ' must be greater than 0' : null),
    },
  });

  const loadIngredients = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      // Load from IndexedDB first
      const localIngredients = await db.ingredients
        .where('tenantId')
        .equals(user.tenantId)
        .filter((ing) => !ing.deletedAt && ing.isActive)
        .toArray();

      // Deduplicate by ID first, then by nameEn
      const byId = new Map(localIngredients.map(ing => [ing.id, ing]));
      const byName = new Map<string, typeof localIngredients[0]>();
      
      for (const ing of Array.from(byId.values())) {
        const key = ((ing as any).name || (ing as any).nameEn || (ing as any).nameAr || '').toLowerCase().trim();
        if (key) {
          const existing = byName.get(key);
          if (!existing || new Date(ing.updatedAt || ing.createdAt || '') > new Date(existing.updatedAt || existing.createdAt || '')) {
            byName.set(key, ing);
          }
        }
      }
      
      const uniqueIngredients = byName.size < byId.size 
        ? Array.from(byName.values())
        : Array.from(byId.values());

      setIngredients(uniqueIngredients.map((ing) => ({
        id: ing.id,
        tenantId: ing.tenantId,
        name: (ing as any).name || (ing as any).nameEn || (ing as any).nameAr || '',
        category: ing.category,
        unitOfMeasurement: ing.unitOfMeasurement,
        currentStock: ing.currentStock,
        minimumThreshold: ing.minimumThreshold,
        costPerUnit: ing.costPerUnit,
        storageLocation: ing.storageLocation,
        isActive: ing.isActive,
        createdAt: ing.createdAt,
        updatedAt: ing.updatedAt,
      })));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverIngredientsResponse = await inventoryApi.getIngredients({ isActive: true });
          // Handle both paginated and non-paginated responses
          const serverIngredients: Ingredient[] = Array.isArray(serverIngredientsResponse) 
            ? serverIngredientsResponse 
            : (serverIngredientsResponse?.data || []);
          
          // Deduplicate server ingredients
          const serverById = new Map(serverIngredients.map((ing: Ingredient) => [ing.id, ing]));
          const serverByName = new Map<string, Ingredient>();
          
          for (const ing of Array.from(serverById.values())) {
            const key = ((ing as any).name || (ing as any).nameEn || (ing as any).nameAr || '').toLowerCase().trim();
            if (key) {
              const existing = serverByName.get(key);
              if (!existing || new Date(ing.updatedAt) > new Date(existing.updatedAt)) {
                serverByName.set(key, ing);
              }
            }
          }
          
          const uniqueServerIngredients = serverByName.size < serverById.size 
            ? Array.from(serverByName.values())
            : Array.from(serverById.values());
          
          setIngredients(uniqueServerIngredients);

          // Update IndexedDB using bulkPut
          const ingredientsToStore = uniqueServerIngredients.map(ing => ({
            id: ing.id,
            tenantId: user.tenantId,
            name: ing.name,
            category: ing.category,
            unitOfMeasurement: ing.unitOfMeasurement,
            currentStock: ing.currentStock,
            minimumThreshold: ing.minimumThreshold,
            costPerUnit: ing.costPerUnit,
            storageLocation: ing.storageLocation,
            isActive: ing.isActive,
            createdAt: ing.createdAt,
            updatedAt: ing.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced' as const,
          }));
          
          if (ingredientsToStore.length > 0) {
            await db.ingredients.bulkPut(ingredientsToStore as any);
          }
        } catch (err: any) {
          console.warn('Failed to sync ingredients from server:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load ingredients:', err);
    }
  }, [user?.tenantId]);

  const loadBranches = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      const localBranches = await db.branches
        .where('tenantId')
        .equals(user.tenantId)
        .filter((b) => !b.deletedAt && b.isActive)
        .toArray();

      setBranches(localBranches);

      if (navigator.onLine) {
        try {
          const serverBranches = await restaurantApi.getBranches();
          setBranches(serverBranches as any);
        } catch (err: any) {
          console.warn('Failed to sync branches from server:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load branches:', err);
    }
  }, [user?.tenantId]);

  const loadTransactions = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setTransactionsLoading(true);

      // Load from IndexedDB first
      const localTransactions = await db.stockTransactions
        .where('tenantId')
        .equals(user.tenantId)
        .toArray();

      // Load ingredients to populate transaction ingredient data
      const allIngredients = await db.ingredients
        .where('tenantId')
        .equals(user.tenantId)
        .toArray();

      const ingredientMap = new Map(allIngredients.map(ing => [ing.id, ing]));

      // Apply filters to local transactions
      let filteredTransactions = localTransactions;
      if (ingredientFilter) {
        filteredTransactions = filteredTransactions.filter(tx => tx.ingredientId === ingredientFilter);
      }
      if (selectedBranchId) {
        filteredTransactions = filteredTransactions.filter(tx => tx.branchId === selectedBranchId);
      }
      if (startDate) {
        filteredTransactions = filteredTransactions.filter(tx => {
          const txDate = new Date(tx.transactionDate);
          return txDate >= startDate;
        });
      }
      if (endDate) {
        filteredTransactions = filteredTransactions.filter(tx => {
          const txDate = new Date(tx.transactionDate);
          return txDate <= endDate;
        });
      }

      // Apply local pagination
      const totalItems = filteredTransactions.length;
      const startIndex = (transactionsPagination.page - 1) * transactionsPagination.limit;
      const endIndex = startIndex + transactionsPagination.limit;
      const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

      setTransactions(paginatedTransactions.map((tx) => {
        const ingredient = ingredientMap.get(tx.ingredientId);
        return {
          id: tx.id,
          tenantId: tx.tenantId,
          branchId: tx.branchId,
          ingredientId: tx.ingredientId,
          transactionType: tx.transactionType,
          quantity: tx.quantity,
          unitCost: tx.unitCost,
          totalCost: tx.totalCost,
          reason: tx.reason,
          supplierName: tx.supplierName,
          invoiceNumber: tx.invoiceNumber,
          referenceId: tx.referenceId,
          transactionDate: tx.transactionDate,
          createdAt: tx.createdAt,
          createdBy: tx.createdBy,
          ingredient: ingredient as Ingredient | undefined,
        };
      }));
      
      // Update pagination info for local pagination (as fallback, will be updated from server if online)
      transactionsPagination.setTotal(totalItems);
      transactionsPagination.setTotalPages(Math.ceil(totalItems / transactionsPagination.limit));
      transactionsPagination.setHasNext(endIndex < totalItems);
      transactionsPagination.setHasPrev(transactionsPagination.page > 1);

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const filters: any = {};
          if (ingredientFilter) filters.ingredientId = ingredientFilter;
          if (selectedBranchId) filters.branchId = selectedBranchId;
          if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
          if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

          const serverTransactionsResponse = await inventoryApi.getStockTransactions(filters, transactionsPagination.paginationParams);
          // Handle both paginated and non-paginated responses
          const serverTransactions = transactionsPagination.extractData(serverTransactionsResponse);
          const paginationInfo = transactionsPagination.extractPagination(serverTransactionsResponse);
          
          // If response is not paginated, set total from array length
          if (!paginationInfo) {
            transactionsPagination.setTotal(serverTransactions.length);
            transactionsPagination.setTotalPages(Math.ceil(serverTransactions.length / transactionsPagination.limit));
            transactionsPagination.setHasNext(false);
            transactionsPagination.setHasPrev(false);
          }
          
          setTransactions(serverTransactions);

          // Update IndexedDB
          for (const tx of serverTransactions) {
            await db.stockTransactions.put({
              id: tx.id,
              tenantId: user.tenantId,
              branchId: tx.branchId,
              ingredientId: tx.ingredientId,
              transactionType: tx.transactionType,
              quantity: tx.quantity,
              unitCost: tx.unitCost,
              totalCost: tx.totalCost,
              reason: tx.reason,
              supplierName: tx.supplierName,
              invoiceNumber: tx.invoiceNumber,
              referenceId: tx.referenceId,
              transactionDate: tx.transactionDate,
              createdAt: tx.createdAt,
              createdBy: tx.createdBy,
              lastSynced: new Date().toISOString(),
              syncStatus: 'synced',
            });
          }
        } catch (err: any) {
          console.warn('Failed to sync transactions from server:', err);
        }
      }
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

  const handleOpenModal = (type: 'add' | 'deduct' | 'adjust' | 'transfer') => {
    setTransactionType(type);
    setOpened(true);
    
    // Reset forms
    addStockForm.reset();
    deductStockForm.reset();
    adjustStockForm.reset();
    transferStockForm.reset();
    
    // Set default branch
    if (selectedBranchId) {
      addStockForm.setFieldValue('branchId', selectedBranchId);
      deductStockForm.setFieldValue('branchId', selectedBranchId);
      adjustStockForm.setFieldValue('branchId', selectedBranchId);
      transferStockForm.setFieldValue('fromBranchId', selectedBranchId);
    }
  };

  const handleCloseModal = () => {
    setOpened(false);
    addStockForm.reset();
    deductStockForm.reset();
    adjustStockForm.reset();
    transferStockForm.reset();
  };

  const handleAddStock = async (values: AddStockDto) => {
    if (!user?.tenantId) return;

    try {
      setError(null);

      // Save to IndexedDB first (offline-first)
      const tempId = `temp_${Date.now()}`;
      const transactionData: any = {
        id: tempId,
        tenantId: user.tenantId,
        branchId: values.branchId,
        ingredientId: values.ingredientId,
        transactionType: 'purchase',
        quantity: values.quantity,
        unitCost: values.unitCost,
        totalCost: values.quantity * values.unitCost,
        reason: values.reason || 'Stock purchase',
        supplierName: values.supplierName,
        invoiceNumber: values.invoiceNumber,
        transactionDate: values.transactionDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        syncStatus: 'pending' as const,
      };

      await db.stockTransactions.add(transactionData);

      // Update ingredient stock locally
      const ingredient = await db.ingredients.get(values.ingredientId);
      if (ingredient) {
        await db.ingredients.update(values.ingredientId, {
          currentStock: ingredient.currentStock + values.quantity,
          updatedAt: new Date().toISOString(),
        });
      }

      // Try to sync if online
      if (navigator.onLine) {
        try {
          const result = await inventoryApi.addStock(values);
          
          // Update transaction with server ID
          await db.stockTransactions.update(tempId, {
            id: result.id,
            syncStatus: 'synced',
            lastSynced: new Date().toISOString(),
          });

          // Update ingredient from server
          const updatedIngredient = await inventoryApi.getIngredientById(values.ingredientId);
          await db.ingredients.update(values.ingredientId, {
            currentStock: updatedIngredient.currentStock,
            updatedAt: updatedIngredient.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          // Queue sync
          // Note: Stock transactions are synced directly via API, no need to queue for sync
        } catch (err: any) {
          // Keep as pending, will sync later
          console.warn('Failed to sync stock addition:', err);
        }
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('inventory.stockAdded', language),
        color: successColor,
      });

      handleCloseModal();
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
    }
  };

  const handleDeductStock = async (values: DeductStockDto) => {
    if (!user?.tenantId) return;

    try {
      setError(null);

      // Check stock availability
      const ingredient = await db.ingredients.get(values.ingredientId);
      if (!ingredient) {
        throw new Error('Ingredient not found');
      }

      if (ingredient.currentStock < values.quantity) {
        throw new Error(t('inventory.insufficientStock', language));
      }

      // Save to IndexedDB first (offline-first)
      const tempId = `temp_${Date.now()}`;
      const transactionData: any = {
        id: tempId,
        tenantId: user.tenantId,
        branchId: values.branchId,
        ingredientId: values.ingredientId,
        transactionType: values.reason || 'usage', // Use reason as transaction type
        quantity: -values.quantity,
        reason: values.reason,
        referenceId: values.referenceId,
        transactionDate: values.transactionDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        syncStatus: 'pending' as const,
      };

      await db.stockTransactions.add(transactionData);

      // Update ingredient stock locally
      await db.ingredients.update(values.ingredientId, {
        currentStock: Math.max(0, ingredient.currentStock - values.quantity),
        updatedAt: new Date().toISOString(),
      });

      // Try to sync if online
      if (navigator.onLine) {
        try {
          const result = await inventoryApi.deductStock(values);
          
          // Update transaction with server ID and full data
          await db.stockTransactions.update(tempId, {
            id: result.id,
            tenantId: result.tenantId,
            branchId: result.branchId,
            ingredientId: result.ingredientId,
            transactionType: result.transactionType,
            quantity: result.quantity,
            unitCost: result.unitCost,
            totalCost: result.totalCost,
            reason: result.reason,
            supplierName: result.supplierName,
            invoiceNumber: result.invoiceNumber,
            referenceId: result.referenceId,
            transactionDate: result.transactionDate,
            createdAt: result.createdAt,
            createdBy: result.createdBy,
            syncStatus: 'synced',
            lastSynced: new Date().toISOString(),
          });

          // Update ingredient from server
          const updatedIngredient = await inventoryApi.getIngredientById(values.ingredientId);
          await db.ingredients.update(values.ingredientId, {
            currentStock: updatedIngredient.currentStock,
            updatedAt: updatedIngredient.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          // Queue sync
          // Note: Stock transactions are synced directly via API, no need to queue for sync
        } catch (err: any) {
          // Keep as pending, will sync later
          console.warn('Failed to sync stock deduction:', err);
        }
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('inventory.stockDeducted', language),
        color: successColor,
      });

      handleCloseModal();
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
    }
  };

  const handleAdjustStock = async (values: AdjustStockDto) => {
    if (!user?.tenantId) return;

    try {
      setError(null);

      // Get current stock
      const ingredient = await db.ingredients.get(values.ingredientId);
      if (!ingredient) {
        throw new Error('Ingredient not found');
      }

      const difference = values.newQuantity - ingredient.currentStock;

      // Save to IndexedDB first (offline-first)
      const tempId = `temp_${Date.now()}`;
      const transactionData: any = {
        id: tempId,
        tenantId: user.tenantId,
        branchId: values.branchId,
        ingredientId: values.ingredientId,
        transactionType: 'adjustment',
        quantity: difference,
        reason: values.reason,
        transactionDate: values.transactionDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        syncStatus: 'pending' as const,
      };

      await db.stockTransactions.add(transactionData);

      // Update ingredient stock locally
      await db.ingredients.update(values.ingredientId, {
        currentStock: values.newQuantity,
        updatedAt: new Date().toISOString(),
      });

      // Try to sync if online
      if (navigator.onLine) {
        try {
          const result = await inventoryApi.adjustStock(values);
          
          // Update transaction with server ID
          await db.stockTransactions.update(tempId, {
            id: result.id,
            syncStatus: 'synced',
            lastSynced: new Date().toISOString(),
          });

          // Update ingredient from server
          const updatedIngredient = await inventoryApi.getIngredientById(values.ingredientId);
          await db.ingredients.update(values.ingredientId, {
            currentStock: updatedIngredient.currentStock,
            updatedAt: updatedIngredient.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          });

          // Queue sync
          // Note: Stock transactions are synced directly via API, no need to queue for sync
        } catch (err: any) {
          // Keep as pending, will sync later
          console.warn('Failed to sync stock adjustment:', err);
        }
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('inventory.stockAdjusted', language),
        color: successColor,
      });

      handleCloseModal();
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
    }
  };

  const handleTransferStock = async (values: TransferStockDto) => {
    if (!user?.tenantId) return;

    try {
      setError(null);

      // Check stock availability
      const ingredient = await db.ingredients.get(values.ingredientId);
      if (!ingredient) {
        throw new Error('Ingredient not found');
      }

      if (ingredient.currentStock < values.quantity) {
        throw new Error(t('inventory.insufficientStock', language));
      }

      // Save to IndexedDB first (offline-first)
      const tempIdOut = `temp_out_${Date.now()}`;
      const tempIdIn = `temp_in_${Date.now()}`;

      const transferOutData: any = {
        id: tempIdOut,
        tenantId: user.tenantId,
        branchId: values.fromBranchId,
        ingredientId: values.ingredientId,
        transactionType: 'transfer_out',
        quantity: -values.quantity,
        reason: values.reason || `Transfer to branch`,
        transactionDate: values.transactionDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        syncStatus: 'pending' as const,
      };

      const transferInData: any = {
        id: tempIdIn,
        tenantId: user.tenantId,
        branchId: values.toBranchId,
        ingredientId: values.ingredientId,
        transactionType: 'transfer_in',
        quantity: values.quantity,
        reason: values.reason || `Transfer from branch`,
        transactionDate: values.transactionDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        syncStatus: 'pending' as const,
      };

      await db.stockTransactions.bulkAdd([transferOutData, transferInData]);

      // Try to sync if online
      if (navigator.onLine) {
        try {
          const result = await inventoryApi.transferStock(values);
          
          // Update transactions with server IDs
          await db.stockTransactions.update(tempIdOut, {
            id: result.transferOut.id,
            syncStatus: 'synced',
            lastSynced: new Date().toISOString(),
          });

          await db.stockTransactions.update(tempIdIn, {
            id: result.transferIn.id,
            syncStatus: 'synced',
            lastSynced: new Date().toISOString(),
          });

          // Queue sync
          // Note: Stock transactions are synced directly via API, no need to queue for sync
        } catch (err: any) {
          // Keep as pending, will sync later
          console.warn('Failed to sync stock transfer:', err);
        }
      }

      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('inventory.stockTransferred', language),
        color: successColor,
      });

      handleCloseModal();
      loadTransactions();
      triggerRefresh(); // Trigger refresh for all tabs
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || t('inventory.transferStockError', language);
      setError(errorMsg);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: errorMsg,
        color: errorColor,
      });
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
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>{t('inventory.stockManagement', language)}</Title>
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
          <Button
            leftSection={<IconArrowsExchange size={16} />}
            onClick={() => handleOpenModal('transfer')}
            variant="light"
            color={primaryColor}
          >
            {t('inventory.transferStock', language)}
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
                        color={
                          tx.transactionType === 'purchase' || tx.transactionType === 'transfer_in'
                            ? successColor
                            : tx.transactionType === 'usage' || tx.transactionType === 'transfer_out' || tx.transactionType === 'waste' || tx.transactionType === 'damaged' || tx.transactionType === 'expired'
                            ? errorColor
                            : primaryColor
                        }
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
        onClose={handleCloseModal}
        title={t('inventory.addStock', language)}
        size="lg"
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
            {branches.length > 0 && (
              <Select
                label={t('restaurant.branch', language) || 'Branch'}
                data={branches.map((b) => ({
                  value: b.id,
                  label: (b as any).name || (b as any).nameEn || (b as any).nameAr || '',
                }))}
                {...addStockForm.getInputProps('branchId')}
              />
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
              <Button type="submit" style={{ backgroundColor: successColor }}>
                {t('inventory.addStock', language)}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Deduct Stock Modal */}
      <Modal
        opened={opened && transactionType === 'deduct'}
        onClose={handleCloseModal}
        title={t('inventory.deductStock', language)}
        size="lg"
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
            {branches.length > 0 && (
              <Select
                label={t('restaurant.branch', language) || 'Branch'}
                data={branches.map((b) => ({
                  value: b.id,
                  label: (b as any).name || (b as any).nameEn || (b as any).nameAr || '',
                }))}
                {...deductStockForm.getInputProps('branchId')}
              />
            )}
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
              <Button type="submit" color={errorColor}>
                {t('inventory.deductStock', language)}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal
        opened={opened && transactionType === 'adjust'}
        onClose={handleCloseModal}
        title={t('inventory.adjustStock', language)}
        size="lg"
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
            {branches.length > 0 && (
              <Select
                label={t('restaurant.branch', language) || 'Branch'}
                data={branches.map((b) => ({
                  value: b.id,
                  label: (b as any).name || (b as any).nameEn || (b as any).nameAr || '',
                }))}
                {...adjustStockForm.getInputProps('branchId')}
              />
            )}
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
              <Button type="submit" style={{ backgroundColor: primaryColor }}>
                {t('inventory.adjustStock', language)}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Transfer Stock Modal */}
      <Modal
        opened={opened && transactionType === 'transfer'}
        onClose={handleCloseModal}
        title={t('inventory.transferStock', language)}
        size="lg"
      >
        <form onSubmit={transferStockForm.onSubmit(handleTransferStock)}>
          <Stack gap="md">
            <Select
              label={t('inventory.ingredient', language)}
              placeholder={t('inventory.selectIngredient', language)}
              required
              data={getIngredientOptions()}
              searchable
              {...transferStockForm.getInputProps('ingredientId')}
            />
            {transferStockForm.values.ingredientId && (
              <Text size="sm" c="dimmed">
                {t('inventory.currentStock', language)}: {
                  ingredients.find((ing) => ing.id === transferStockForm.values.ingredientId)?.currentStock || 0
                } {
                  ingredients.find((ing) => ing.id === transferStockForm.values.ingredientId)?.unitOfMeasurement || ''
                }
              </Text>
            )}
            {branches.length > 0 && (
              <>
                <Select
                  label={t('inventory.fromBranch', language)}
                  required
                  data={branches.map((b) => ({
                    value: b.id,
                    label: (b as any).name || (b as any).nameEn || (b as any).nameAr || '',
                  }))}
                  {...transferStockForm.getInputProps('fromBranchId')}
                />
                <Select
                  label={t('inventory.toBranch', language)}
                  required
                  data={branches
                    .filter((b) => b.id !== transferStockForm.values.fromBranchId)
                    .map((b) => ({
                      value: b.id,
                      label: (b as any).name || (b as any).nameEn || (b as any).nameAr || '',
                    }))}
                  {...transferStockForm.getInputProps('toBranchId')}
                />
              </>
            )}
            <NumberInput
              label={t('inventory.quantity', language)}
              required
              min={0.001}
              decimalScale={3}
              {...transferStockForm.getInputProps('quantity')}
            />
            <Textarea
              label={t('inventory.reason', language)}
              {...transferStockForm.getInputProps('reason')}
            />
            <DateInput
              label={t('inventory.transactionDate', language)}
              value={transferStockForm.values.transactionDate ? new Date(transferStockForm.values.transactionDate) : null}
              onChange={(date) => transferStockForm.setFieldValue('transactionDate', date?.toISOString() || new Date().toISOString())}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseModal}>
                {t('common.cancel' as any, language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }}>
                {t('inventory.transferStock', language)}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}

