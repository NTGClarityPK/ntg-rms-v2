'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Title,
  Stack,
  Table,
  Group,
  Badge,
  Text,
  Paper,
  Skeleton,
  Alert,
  Grid,
  Select,
  Card,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconAlertCircle, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import {
  inventoryApi,
  Ingredient,
  StockTransaction,
} from '@/lib/api/inventory';
import { db } from '@/lib/indexeddb/database';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useInventoryRefresh } from '@/lib/contexts/inventory-refresh-context';
import { useErrorColor, useSuccessColor, useWarningColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getWarningColor, getBadgeColorForText } from '@/lib/utils/theme';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { INGREDIENT_CATEGORIES } from '@/shared/constants/ingredients.constants';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  ...INGREDIENT_CATEGORIES,
];

export function InventoryReportsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const { refreshKey } = useInventoryRefresh();
  const currency = useCurrency();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const warningColor = useWarningColor();
  const primaryColor = useThemeColor();
  const [currentStock, setCurrentStock] = useState<any[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<Ingredient[]>([]);
  const [stockMovement, setStockMovement] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<string>('current-stock');

  const loadCurrentStock = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      // Load from IndexedDB first
      const localIngredients = await db.ingredients
        .where('tenantId')
        .equals(user.tenantId)
        .filter((ing) => !ing.deletedAt)
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

      let filtered = uniqueIngredients.map((ing) => {
        const stockValue = ing.currentStock * ing.costPerUnit;
        const isLowStock = ing.currentStock <= ing.minimumThreshold;
        return {
          ...ing,
          stockValue,
          isLowStock,
        };
      });

      // Apply filters
      if (categoryFilter) {
        filtered = filtered.filter((ing) => ing.category === categoryFilter);
      }
      if (lowStockOnly) {
        filtered = filtered.filter((ing) => ing.isLowStock);
      }

      setCurrentStock(filtered);

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const filters: any = {};
          if (categoryFilter) filters.category = categoryFilter;
          if (lowStockOnly) filters.lowStockOnly = true;

          const serverData = await inventoryApi.getCurrentStockReport(filters);
          
          // Deduplicate server data
          const serverById = new Map(serverData.map((item: any) => [item.id, item]));
          const serverByName = new Map<string, any>();
          
          for (const item of Array.from(serverById.values())) {
            const key = item.name?.toLowerCase().trim() || '';
            if (key) {
              const existing = serverByName.get(key);
              if (!existing || new Date(item.updatedAt) > new Date(existing.updatedAt)) {
                serverByName.set(key, item);
              }
            }
          }
          
          const uniqueServerData = serverByName.size < serverById.size 
            ? Array.from(serverByName.values())
            : Array.from(serverById.values());
          
          setCurrentStock(uniqueServerData);

          // Update IndexedDB using bulkPut
          const ingredientsToStore = uniqueServerData.map((item: any) => ({
            id: item.id,
            tenantId: user.tenantId,
            name: item.name,
            category: item.category,
            unitOfMeasurement: item.unitOfMeasurement,
            currentStock: item.currentStock,
            minimumThreshold: item.minimumThreshold,
            costPerUnit: item.costPerUnit,
            storageLocation: item.storageLocation,
            isActive: item.isActive,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced' as const,
          }));
          
          if (ingredientsToStore.length > 0) {
            await db.ingredients.bulkPut(ingredientsToStore as any);
          }
        } catch (err: any) {
          console.warn('Failed to sync current stock from server:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load current stock:', err);
    }
  }, [user?.tenantId, categoryFilter, lowStockOnly]);

  const loadLowStockAlerts = useCallback(async () => {
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

      const lowStock = uniqueIngredients
        .filter((ing) => ing.currentStock <= ing.minimumThreshold)
        .map((ing) => {
          const deficit = ing.minimumThreshold - ing.currentStock;
          return {
            ...ing,
            stockDeficit: deficit,
          };
        })
        .sort((a, b) => a.currentStock - b.currentStock);

      setLowStockAlerts(lowStock.map(ing => ({
        ...ing,
        name: (ing as any).name || (ing as any).nameEn || (ing as any).nameAr || '',
      })));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const serverData = await inventoryApi.getLowStockAlerts();
          
          // Deduplicate server data
          const serverById = new Map(serverData.map((item: any) => [item.id, item]));
          const serverByName = new Map<string, any>();
          
          for (const item of Array.from(serverById.values())) {
            const key = item.name?.toLowerCase().trim() || '';
            if (key) {
              const existing = serverByName.get(key);
              if (!existing || new Date(item.updatedAt) > new Date(existing.updatedAt)) {
                serverByName.set(key, item);
              }
            }
          }
          
          const uniqueServerData = serverByName.size < serverById.size 
            ? Array.from(serverByName.values())
            : Array.from(serverById.values());
          
          setLowStockAlerts(uniqueServerData);
        } catch (err: any) {
          console.warn('Failed to sync low stock alerts from server:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load low stock alerts:', err);
    }
  }, [user?.tenantId]);

  const loadStockMovement = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      // Load from IndexedDB first
      const localTransactions = await db.stockTransactions
        .where('tenantId')
        .equals(user.tenantId)
        .toArray();

      let filtered = localTransactions;

      // Apply date filters
      if (startDate) {
        filtered = filtered.filter(
          (tx) => new Date(tx.transactionDate) >= startDate
        );
      }
      if (endDate) {
        filtered = filtered.filter(
          (tx) => new Date(tx.transactionDate) <= endDate
        );
      }

      setStockMovement(filtered.sort((a, b) => 
        new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      ));

      // Sync from server if online
      if (navigator.onLine) {
        try {
          const filters: any = {};
          if (selectedBranchId) filters.branchId = selectedBranchId;
          if (startDate) filters.startDate = startDate.toISOString().split('T')[0];
          if (endDate) filters.endDate = endDate.toISOString().split('T')[0];

          const serverData = await inventoryApi.getStockMovementReport(filters);
          setStockMovement(serverData);
        } catch (err: any) {
          console.warn('Failed to sync stock movement from server:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load stock movement:', err);
    }
  }, [user?.tenantId, selectedBranchId, startDate, endDate]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadCurrentStock(), loadLowStockAlerts(), loadStockMovement()]);
      setLoading(false);
    };
    loadData();
  }, [loadCurrentStock, loadLowStockAlerts, loadStockMovement, refreshKey]);

  // Calculate summary statistics
  const totalStockValue = currentStock.reduce((sum, item) => sum + (item.stockValue || 0), 0);
  const totalLowStockItems = lowStockAlerts.length;
  const totalIngredients = currentStock.length;

  const getTransactionTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      purchase: t('inventory.purchase', language),
      usage: t('inventory.usage', language),
      adjustment: t('inventory.adjustment', language),
      transfer_in: t('inventory.transferIn', language),
      transfer_out: t('inventory.transferOut', language),
      waste: t('inventory.waste', language),
    };
    return typeMap[type] || type;
  };

  return (
    <Stack gap="md">

      {/* Summary Cards */}
      <Grid mb="xl">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Stack gap="xs">
              <Text size="sm" c="dimmed">{t('inventory.totalIngredients', language) || 'Total Ingredients'}</Text>
              <Text size="xl" fw={700} style={{ color: primaryColor }}>
                {totalIngredients}
              </Text>
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Stack gap="xs">
              <Text size="sm" c="dimmed">{t('inventory.totalStockValue', language) || 'Total Stock Value'}</Text>
              <Text size="xl" fw={700} style={{ color: successColor }}>
                {formatCurrency(totalStockValue, currency)}
              </Text>
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Stack gap="xs">
              <Text size="sm" c="dimmed">{t('inventory.lowStockItems', language) || 'Low Stock Items'}</Text>
              <Text size="xl" fw={700} style={{ color: totalLowStockItems > 0 ? warningColor : successColor }}>
                {totalLowStockItems}
              </Text>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Low Stock Alerts */}
      {lowStockAlerts.length > 0 && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          color={warningColor}
          mb="xl"
          title={t('inventory.lowStockAlerts', language)}
        >
          <Stack gap="xs">
            {lowStockAlerts.slice(0, 5).map((ingredient) => {
              const deficit = ingredient.minimumThreshold - ingredient.currentStock;
              return (
                <Text key={ingredient.id} size="sm">
                  • {ingredient.name}: {ingredient.currentStock} {ingredient.unitOfMeasurement} 
                  ({t('inventory.stockDeficit', language)}: {deficit} {ingredient.unitOfMeasurement})
                </Text>
              );
            })}
            {lowStockAlerts.length > 5 && (
              <Text size="sm" c="dimmed">
                + {lowStockAlerts.length - 5} {t('inventory.moreItems', language) || 'more items'}
              </Text>
            )}
          </Stack>
        </Alert>
      )}

      {/* Filters */}
      <Paper p="md" withBorder mb="md">
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              label={t('inventory.category', language)}
              data={CATEGORIES.map(cat => ({
                value: cat.value,
                label: cat.value ? (t(`inventory.${cat.value}` as any, language) || cat.label) : t('inventory.allCategories', language)
              }))}
              value={categoryFilter}
              onChange={(value) => setCategoryFilter(value || '')}
              clearable
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 2 }}>
            <DateInput
              label={t('inventory.startDate', language)}
              value={startDate}
              onChange={setStartDate}
              clearable
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 2 }}>
            <DateInput
              label={t('inventory.endDate', language)}
              value={endDate}
              onChange={setEndDate}
              clearable
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              label={(t('common.filter' as any, language) || 'Filter')}
              data={[
                { value: 'all', label: t('inventory.allItems', language) || 'All Items' },
                { value: 'lowStock', label: t('inventory.lowStockOnly' as any, language) || 'Low Stock Only' },
              ]}
              value={lowStockOnly ? 'lowStock' : 'all'}
              onChange={(value) => setLowStockOnly(value === 'lowStock')}
            />
          </Grid.Col>
        </Grid>
      </Paper>

      {/* Current Stock Report */}
      {loading ? (
        <Stack gap="md">
          {[1, 2, 3, 4, 5].map((i) => (
            <Paper key={i} p="md" withBorder>
              <Skeleton height={20} width="100%" mb="xs" />
              <Skeleton height={16} width="60%" />
            </Paper>
          ))}
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={1000}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('inventory.ingredientName', language)}</Table.Th>
                <Table.Th>{t('inventory.category', language)}</Table.Th>
                <Table.Th>{t('inventory.currentStock', language)}</Table.Th>
                <Table.Th>{t('inventory.minimumThreshold', language)}</Table.Th>
                <Table.Th>{t('inventory.costPerUnit', language)}</Table.Th>
                <Table.Th>{t('inventory.stockValue', language)}</Table.Th>
                <Table.Th>{(t('common.status' as any, language) || 'Status')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {currentStock.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text fw={500}>
                      {item.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {item.category ? (
                      <Badge variant="light" color={getBadgeColorForText(t(`inventory.${item.category}` as any, language) || item.category)}>
                        {t(`inventory.${item.category}` as any, language) || item.category}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Text>{item.currentStock} {item.unitOfMeasurement}</Text>
                      {item.isLowStock && (
                        <Badge variant="light" color={getBadgeColorForText(t('inventory.isLowStock', language))} size="sm">
                          {t('inventory.isLowStock', language)}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text>{item.minimumThreshold} {item.unitOfMeasurement}</Text>
                  </Table.Td>
                  <Table.Td>
                    {formatCurrency(item.costPerUnit || 0, currency)}
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500}>
                      {formatCurrency(item.stockValue || 0, currency)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={getBadgeColorForText(item.isLowStock ? t('inventory.isLowStock', language) : (t('common.active' as any, language) || 'Active'))}>
                      {item.isLowStock ? t('inventory.isLowStock', language) : (t('common.active' as any, language) || 'Active')}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {/* Stock Movement Report Section */}
      <Title order={3} mt="xl" mb="md">{t('inventory.stockMovementReport', language)}</Title>

      {loading ? (
        <Stack gap="md">
          {[1, 2, 3].map((i) => (
            <Paper key={i} p="md" withBorder>
              <Skeleton height={20} width="100%" mb="xs" />
              <Skeleton height={16} width="60%" />
            </Paper>
          ))}
        </Stack>
      ) : stockMovement.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text ta="center" c="dimmed">
            {t('inventory.noTransactions', language)}
          </Text>
        </Paper>
      ) : (
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
              {stockMovement.map((tx) => (
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
                    <Group gap="xs">
                      {tx.quantity > 0 ? (
                        <IconTrendingUp size={14} color={primaryColor} />
                      ) : (
                        <IconTrendingDown size={14} color={primaryColor} />
                      )}
                      <Text fw={tx.quantity > 0 ? 500 : undefined} c={tx.quantity < 0 ? errorColor : undefined}>
                        {tx.quantity > 0 ? '+' : ''}{tx.quantity}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {tx.unitCost ? (
                      <Text>{formatCurrency(tx.unitCost, currency)}</Text>
                    ) : (
                      <Text size="sm" c="dimmed">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {tx.totalCost ? (
                      <Text fw={500}>
                        {formatCurrency(tx.totalCost, currency)}
                      </Text>
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
      )}
    </Stack>
  );
}

