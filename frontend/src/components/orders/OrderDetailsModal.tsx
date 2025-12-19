'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Badge,
  Divider,
  Button,
  Select,
  Table,
  Paper,
  Grid,
  Skeleton,
  useMantineTheme,
} from '@mantine/core';
import { IconCheck, IconEdit, IconPrinter } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { ordersApi, Order, OrderStatus, PaymentStatus } from '@/lib/api/orders';
import { notifications } from '@mantine/notifications';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getStatusColor, getPaymentStatusColor, getSuccessColor, getErrorColor } from '@/lib/utils/theme';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { InvoiceGenerator } from '@/lib/utils/invoice-generator';
import { restaurantApi } from '@/lib/api/restaurant';
import { useDateFormat } from '@/lib/hooks/use-date-format';
import { useSettings } from '@/lib/hooks/use-settings';
import { menuApi } from '@/lib/api/menu';
import type { ThemeConfig } from '@/lib/theme/themeConfig';

interface OrderDetailsModalProps {
  opened: boolean;
  onClose: () => void;
  order: Order | null;
  onStatusUpdate?: () => void;
}

const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'served', label: 'Served' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function OrderDetailsModal({
  opened,
  onClose,
  order,
  onStatusUpdate,
}: OrderDetailsModalProps) {
  const { language } = useLanguageStore();
  const theme = useMantineTheme();
  const themeConfig = (theme.other as any) as ThemeConfig | undefined;
  const primary = useThemeColor();
  const currency = useCurrency();
  const { formatDateTime } = useDateFormat();
  const { settings } = useSettings();
  const router = useRouter();
  const [orderDetails, setOrderDetails] = useState<Order | null>(order);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | null>(null);
  const [printing, setPrinting] = useState(false);
  const [tenant, setTenant] = useState<any>(null);
  const [branch, setBranch] = useState<any>(null);

  const handleEditOrder = () => {
    if (orderDetails) {
      router.push(`/pos?editOrder=${orderDetails.id}`);
      onClose();
    }
  };

  const loadOrderDetails = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    try {
      const data = await ordersApi.getOrderById(order.id);
      
      // Fetch missing buffet and combo meal names if needed
      if (data.items) {
        const itemsWithNames = await Promise.all(
          data.items.map(async (item) => {
            // If buffetId exists but buffet object is missing or has no name, fetch it
            if (item.buffetId && (!item.buffet || !item.buffet.name)) {
              try {
                const buffet = await menuApi.getBuffetById(item.buffetId);
                return {
                  ...item,
                  buffet: {
                    id: buffet.id,
                    name: buffet.name,
                    imageUrl: buffet.imageUrl,
                  },
                };
              } catch (error) {
                console.error('Failed to fetch buffet:', error);
                return item;
              }
            }
            // If comboMealId exists but comboMeal object is missing or has no name, fetch it
            if (item.comboMealId && (!item.comboMeal || !item.comboMeal.name)) {
              try {
                const comboMeal = await menuApi.getComboMealById(item.comboMealId);
                return {
                  ...item,
                  comboMeal: {
                    id: comboMeal.id,
                    name: comboMeal.name,
                    imageUrl: comboMeal.imageUrl,
                    foodItemIds: comboMeal.foodItemIds || [],
                  },
                };
              } catch (error) {
                console.error('Failed to fetch combo meal:', error);
                return item;
              }
            }
            return item;
          })
        );
        data.items = itemsWithNames;
      }
      
      setOrderDetails(data);
      setNewStatus(data.status);
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: error?.response?.data?.message || t('orders.loadError', language),
        color: getErrorColor(),
      });
    } finally {
      setLoading(false);
    }
  }, [order, language]);

  const loadInvoiceData = useCallback(async () => {
    try {
      const tenantData = await restaurantApi.getInfo();
      setTenant(tenantData);
      if (orderDetails?.branchId) {
        const branches = await restaurantApi.getBranches();
        const branchData = branches.find(b => b.id === orderDetails.branchId);
        setBranch(branchData);
      }
    } catch (error) {
      console.error('Failed to load invoice data:', error);
    }
  }, [orderDetails?.branchId]);

  useEffect(() => {
    if (opened && order) {
      setOrderDetails(order);
      setNewStatus(order.status);
      // Always reload order details to ensure we have latest data including buffet/combo meal info
      loadOrderDetails();
      // Load tenant and branch info for invoice
      loadInvoiceData();
    }
  }, [opened, order, loadOrderDetails, loadInvoiceData]);

  const handleStatusUpdate = async () => {
    if (!orderDetails || !newStatus || newStatus === orderDetails.status) return;

    setUpdating(true);
    try {
      await ordersApi.updateOrderStatus(orderDetails.id, { status: newStatus });
      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('orders.statusUpdated', language),
        color: getSuccessColor(),
      });
      
      // Notify other screens about the status change
      const { notifyOrderUpdate } = await import('@/lib/utils/order-events');
      notifyOrderUpdate('order-status-changed', orderDetails.id);
      
      if (onStatusUpdate) {
        onStatusUpdate();
      } else {
        // Reload order details
        await loadOrderDetails();
      }
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: error?.response?.data?.message || t('orders.updateError', language),
        color: getErrorColor(),
      });
    } finally {
      setUpdating(false);
    }
  };

  const handlePaymentStatusUpdate = async (paymentStatus: PaymentStatus) => {
    if (!orderDetails) return;

    setUpdatingPayment(true);
    try {
      await ordersApi.updatePaymentStatus(orderDetails.id, {
        paymentStatus,
        amountPaid: paymentStatus === 'paid' ? orderDetails.totalAmount : undefined,
      });
      notifications.show({
        title: t('common.success' as any, language) || 'Success',
        message: t('orders.paymentStatusUpdated', language),
        color: getSuccessColor(),
      });
      if (onStatusUpdate) {
        onStatusUpdate();
      } else {
        // Reload order details
        await loadOrderDetails();
      }
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: error?.response?.data?.message || t('orders.updateError', language),
        color: getErrorColor(),
      });
    } finally {
      setUpdatingPayment(false);
    }
  };

  const getStatusColorForBadge = (status: OrderStatus): string => {
    return getStatusColor(status);
  };

  const getOrderTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      dine_in: t('pos.dineIn', language),
      takeaway: t('pos.takeaway', language),
      delivery: t('pos.delivery', language),
    };
    return labels[type] || type;
  };

  const handlePrintInvoice = async (template: 'thermal' | 'a4' = 'thermal') => {
    if (!orderDetails || !tenant) return;

    setPrinting(true);
    try {
      // Extract payment method from payments array if available
      const payments = (orderDetails as any).payments || [];
      const paymentMethod = (orderDetails as any).paymentMethod || 
        (payments.length > 0 ? payments[payments.length - 1]?.paymentMethod || payments[0]?.payment_method : undefined);
      
      // Prepare invoice data
      const invoiceData = {
        order: {
          ...orderDetails,
          orderType: orderDetails.orderType,
          paymentMethod: paymentMethod,
          items: orderDetails.items?.map(item => ({
            ...item,
            foodItemName: (item.buffetId || item.buffet) 
              ? (item.buffet?.name?.trim() || (item.buffetId ? `Buffet #${item.buffetId.substring(0, 8)}...` : 'Buffet'))
              : (item.comboMealId || item.comboMeal)
              ? (item.comboMeal?.name?.trim() || (item.comboMealId ? `Combo Meal #${item.comboMealId.substring(0, 8)}...` : 'Combo Meal'))
              : (item.foodItem?.name || ''),
            variationName: item.variation?.variationName || '',
            addOns: item.addOns?.map(a => ({
              addOnName: a.addOn?.name || '',
            })) || [],
          })) || [],
        } as any,
        tenant: {
          ...tenant,
          footerText: settings?.invoice?.footerText || '',
          termsAndConditions: settings?.invoice?.termsAndConditions || '',
        },
        branch: branch || undefined,
        invoiceSettings: {
          headerText: settings?.invoice?.headerText,
          footerText: settings?.invoice?.footerText,
          termsAndConditions: settings?.invoice?.termsAndConditions,
          showLogo: settings?.invoice?.showLogo,
          showVatNumber: settings?.invoice?.showVatNumber,
          showQrCode: settings?.invoice?.showQrCode,
        },
        customerName: orderDetails.customer
          ? (orderDetails.customer.name || '')
          : undefined,
        customerPhone: orderDetails.customer?.phone,
        customerAddress: undefined, // Can be added from delivery address if needed
      };

      const html = template === 'thermal'
        ? InvoiceGenerator.generateThermal(invoiceData, language, themeConfig)
        : InvoiceGenerator.generateA4(invoiceData, language, themeConfig);

      InvoiceGenerator.printInvoice(html);
    } catch (error: any) {
      notifications.show({
        title: t('common.error' as any, language),
        message: error?.message || 'Failed to generate invoice',
        color: getErrorColor(),
      });
    } finally {
      setPrinting(false);
    }
  };

  if (!orderDetails) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('orders.orderDetails', language)}
      size="lg"
      centered
    >
      {loading ? (
        <Stack gap="md">
          {/* Order Header Skeleton */}
          <Paper p="md" withBorder>
            <Grid>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={20} width="60%" />
              </Grid.Col>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={24} width="50%" />
              </Grid.Col>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={16} width="50%" />
              </Grid.Col>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={16} width="60%" />
              </Grid.Col>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={16} width="50%" />
              </Grid.Col>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={24} width="40%" />
              </Grid.Col>
            </Grid>
          </Paper>

          {/* Customer Info Skeleton */}
          <Paper p="md" withBorder>
            <Skeleton height={16} width="30%" mb="sm" />
            <Grid>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={16} width="60%" />
              </Grid.Col>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={16} width="50%" />
              </Grid.Col>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={16} width="70%" />
              </Grid.Col>
              <Grid.Col span={6}>
                <Skeleton height={12} width="40%" mb="xs" />
                <Skeleton height={16} width="60%" />
              </Grid.Col>
            </Grid>
          </Paper>

          {/* Order Items Skeleton */}
          <Paper p="md" withBorder>
            <Skeleton height={16} width="30%" mb="sm" />
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th><Skeleton height={14} width="60%" /></Table.Th>
                  <Table.Th><Skeleton height={14} width="40%" /></Table.Th>
                  <Table.Th><Skeleton height={14} width="50%" /></Table.Th>
                  <Table.Th><Skeleton height={14} width="50%" /></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[1, 2, 3].map((i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <Skeleton height={16} width="70%" mb="xs" />
                      <Skeleton height={12} width="50%" />
                    </Table.Td>
                    <Table.Td><Skeleton height={16} width="30%" /></Table.Td>
                    <Table.Td><Skeleton height={16} width="50%" /></Table.Td>
                    <Table.Td><Skeleton height={16} width="50%" /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>

          {/* Billing Summary Skeleton */}
          <Paper p="md" withBorder>
            <Skeleton height={16} width="30%" mb="sm" />
            <Stack gap="xs">
              <Group justify="space-between">
                <Skeleton height={14} width="30%" />
                <Skeleton height={14} width="20%" />
              </Group>
              <Group justify="space-between">
                <Skeleton height={14} width="30%" />
                <Skeleton height={14} width="20%" />
              </Group>
              <Divider />
              <Group justify="space-between">
                <Skeleton height={18} width="40%" />
                <Skeleton height={18} width="25%" />
              </Group>
            </Stack>
          </Paper>

          {/* Status Update Skeleton */}
          <Paper p="md" withBorder>
            <Skeleton height={16} width="30%" mb="sm" />
            <Group>
              <Skeleton height={36} style={{ flex: 1 }} />
              <Skeleton height={36} width={100} />
            </Group>
          </Paper>
        </Stack>
      ) : (
        <Stack gap="md">
          {/* Order Header */}
          <Paper p="md" withBorder>
            <Grid>
              <Grid.Col span={6}>
                <Text size="sm" c="dimmed" mb={4}>
                  {t('pos.orderNumber', language)}
                </Text>
                <Text fw={600} size="lg">
                  {orderDetails.orderNumber}
                </Text>
              </Grid.Col>
              <Grid.Col span={6}>
                <Text size="sm" c="dimmed" mb={4}>
                  {t('orders.status', language)}
                </Text>
                <Badge color={getStatusColorForBadge(orderDetails.status)} size="lg">
                  {t(`orders.status.${orderDetails.status}`, language) || orderDetails.status}
                </Badge>
              </Grid.Col>
              {orderDetails.tokenNumber && (
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed" mb={4}>
                    {t('pos.tokenNumber', language)}
                  </Text>
                  <Text fw={500}>{orderDetails.tokenNumber}</Text>
                </Grid.Col>
              )}
              <Grid.Col span={6}>
                <Text size="sm" c="dimmed" mb={4}>
                  {t('pos.orderDate', language)}
                </Text>
                <Text style={{ lineHeight: '1.5' }}>
                  {formatDateTime(orderDetails.orderDate)}
                </Text>
              </Grid.Col>
              {!orderDetails.tokenNumber && (
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed" mb={4}>
                    {t('pos.orderType', language)}
                  </Text>
                  <Text>{getOrderTypeLabel(orderDetails.orderType)}</Text>
                </Grid.Col>
              )}
              {orderDetails.tokenNumber && (
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed" mb={4}>
                    {t('pos.orderType', language)}
                  </Text>
                  <Text>{getOrderTypeLabel(orderDetails.orderType)}</Text>
                </Grid.Col>
              )}
              <Grid.Col span={6}>
                <Text size="sm" c="dimmed" mb={4}>
                  {t('orders.paymentStatus', language)}
                </Text>
                <Group gap="xs" align="center">
                  <Badge
                    color={getPaymentStatusColor(orderDetails.paymentStatus)}
                    variant="light"
                  >
                    {t(`orders.payment.${orderDetails.paymentStatus}`, language) || orderDetails.paymentStatus}
                  </Badge>
                  {orderDetails.paymentStatus !== 'paid' && (
                    <Button
                      size="xs"
                      variant="light"
                      color={getSuccessColor()}
                      onClick={() => handlePaymentStatusUpdate('paid')}
                      loading={updatingPayment}
                      leftSection={<IconCheck size={14} />}
                    >
                      {t('orders.markAsPaid', language)}
                    </Button>
                  )}
                </Group>
              </Grid.Col>
            </Grid>
          </Paper>

          {/* Customer & Branch Info */}
          {((orderDetails.customer && orderDetails.customer.name) ||
            (orderDetails.branch && orderDetails.branch.name) ||
            (orderDetails.table && orderDetails.table.table_number)) && (
            <Paper p="md" withBorder>
              <Text fw={600} mb="sm">
                {t('orders.customerInfo', language)}
              </Text>
              <Grid>
                {orderDetails.branch && orderDetails.branch.name && (
                  <Grid.Col span={6}>
                    <Text size="sm" c="dimmed">
                      {t('restaurant.branch', language)}
                    </Text>
                    <Text>
                      {orderDetails.branch.name || '-'}
                    </Text>
                  </Grid.Col>
                )}
                {orderDetails.table && orderDetails.table.table_number && (
                  <Grid.Col span={6}>
                    <Text size="sm" c="dimmed">
                      {t('pos.tableNo', language)}
                    </Text>
                    <Text>{orderDetails.table.table_number}</Text>
                  </Grid.Col>
                )}
                {orderDetails.customer && orderDetails.customer.name && (
                  <>
                    <Grid.Col span={6}>
                      <Text size="sm" c="dimmed">
                        {t('pos.customerName', language)}
                      </Text>
                      <Text>
                        {orderDetails.customer.name || '-'}
                      </Text>
                    </Grid.Col>
                    {orderDetails.customer.phone && (
                      <Grid.Col span={6}>
                        <Text size="sm" c="dimmed">
                          {t('pos.customerPhone', language)}
                        </Text>
                        <Text>{orderDetails.customer.phone}</Text>
                      </Grid.Col>
                    )}
                  </>
                )}
              </Grid>
            </Paper>
          )}

          {/* Order Items */}
          {orderDetails.items && orderDetails.items.length > 0 && (
            <Paper p="md" withBorder>
              <Text fw={600} mb="sm">
                {t('pos.cartItems', language)}
              </Text>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('pos.item', language)}</Table.Th>
                    <Table.Th>{t('pos.quantity', language)}</Table.Th>
                    <Table.Th>{t('pos.price', language)}</Table.Th>
                    <Table.Th>{t('pos.subtotal', language)}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {orderDetails.items.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text fw={500}>
                            {(item.buffetId || item.buffet)
                              ? (item.buffet?.name?.trim() || (item.buffetId ? `Buffet #${item.buffetId.substring(0, 8)}...` : 'Buffet'))
                              : (item.comboMealId || item.comboMeal)
                              ? (item.comboMeal?.name?.trim() || (item.comboMealId ? `Combo Meal #${item.comboMealId.substring(0, 8)}...` : 'Combo Meal'))
                              : (item.foodItemId || item.foodItem)
                              ? (item.foodItem?.name || t('pos.item', language))
                              : t('pos.item', language) + ` #${item.foodItemId || item.id}`}
                          </Text>
                          {item.variation && item.variation.variationName && (
                            <Text size="xs" c="dimmed">
                              {item.variation.variationName}
                            </Text>
                          )}
                          {item.addOns && item.addOns.length > 0 && item.addOns.some(a => a.addOn) && (
                            <Text size="xs" c="dimmed">
                              {t('pos.addOns', language)}:{' '}
                              {item.addOns
                                .filter(addOn => addOn.addOn)
                                .map(
                                  (addOn) =>
                                    addOn.addOn?.name || ''
                                )
                                .filter(Boolean)
                                .join(', ') || '-'}
                            </Text>
                          )}
                          {item.specialInstructions && (
                            <Text size="xs" c="dimmed" fs="italic">
                              {item.specialInstructions}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>{item.quantity}</Table.Td>
                      <Table.Td>{formatCurrency(item.unitPrice || 0, currency)}</Table.Td>
                      <Table.Td>{formatCurrency(item.subtotal || 0, currency)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          {/* Billing Summary */}
          <Paper p="md" withBorder>
            <Text fw={600} mb="sm">
              {t('pos.billingSummary', language)}
            </Text>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text>{t('pos.subtotal', language)}</Text>
                <Text>{(orderDetails.subtotal || 0).toFixed(2)} {currency}</Text>
              </Group>
              {(orderDetails.discountAmount || 0) > 0 && (
                <Group justify="space-between">
                  <Text c={getSuccessColor()}>{t('pos.discount', language)}</Text>
                  <Text c={getSuccessColor()}>-{formatCurrency(orderDetails.discountAmount || 0, currency)}</Text>
                </Group>
              )}
              {(orderDetails.taxAmount || 0) > 0 && (
                <Group justify="space-between">
                  <Text>{t('pos.tax', language)}</Text>
                  <Text>{formatCurrency(orderDetails.taxAmount || 0, currency)}</Text>
                </Group>
              )}
              {(orderDetails.deliveryCharge || 0) > 0 && (
                <Group justify="space-between">
                  <Text>{t('pos.deliveryCharge', language)}</Text>
                  <Text>{formatCurrency(orderDetails.deliveryCharge || 0, currency)}</Text>
                </Group>
              )}
              <Divider />
              <Group justify="space-between">
                <Text fw={700} size="lg">
                  {t('pos.grandTotal', language)}
                </Text>
                <Text fw={700} size="lg">
                  {formatCurrency(orderDetails.totalAmount || 0, currency)}
                </Text>
              </Group>
            </Stack>
          </Paper>

          {/* Status Update */}
          <Paper p="md" withBorder>
            <Text fw={600} mb="sm">
              {t('orders.updateStatus', language)}
            </Text>
            <Group>
              <Select
                data={statusOptions.map((opt) => ({
                  value: opt.value,
                  label: t(`orders.status.${opt.value}`, language),
                }))}
                value={newStatus || orderDetails.status}
                onChange={(value) => setNewStatus(value as OrderStatus)}
                style={{ flex: 1 }}
              />
              <Button
                onClick={handleStatusUpdate}
                loading={updating}
                disabled={!newStatus || newStatus === orderDetails.status}
                leftSection={<IconCheck size={16} />}
              >
                {t('common.save' as any, language) || 'Save'}
              </Button>
            </Group>
          </Paper>

          {/* Actions */}
          <Group justify="flex-end">
            <Button
              leftSection={<IconPrinter size={16} />}
              onClick={() => handlePrintInvoice('thermal')}
              loading={printing}
              variant="light"
            >
              {t('orders.printThermal' as any, language) || 'Print (Thermal)'}
            </Button>
            <Button
              leftSection={<IconPrinter size={16} />}
              onClick={() => handlePrintInvoice('a4')}
              loading={printing}
              variant="light"
            >
              {t('orders.printA4' as any, language) || 'Print (A4)'}
            </Button>
            {orderDetails.paymentStatus !== 'paid' && (
              <Button
                leftSection={<IconEdit size={16} />}
                onClick={handleEditOrder}
                variant="light"
              >
                {t('orders.editOrder', language) || 'Edit Order'}
              </Button>
            )}
            <Button variant="subtle" onClick={onClose}>
              {t('common.cancel' as any, language) || 'Cancel'}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

