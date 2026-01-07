'use client';

import { useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from '@mantine/form';
import {
  Title,
  Button,
  Stack,
  Modal,
  TextInput,
  Select,
  Switch,
  Table,
  Group,
  ActionIcon,
  Badge,
  Text,
  Paper,
  Skeleton,
  Alert,
  NumberInput,
  Loader,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import '@mantine/dates/styles.css';
import { IconPlus, IconEdit, IconTrash, IconAlertCircle, IconSearch, IconDiscount } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { couponsApi, Coupon, CreateCouponDto, UpdateCouponDto } from '@/lib/api/coupons';
import { useLanguageStore } from '@/lib/store/language-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBranchStore } from '@/lib/store/branch-store';
import { t } from '@/lib/utils/translations';
import { useNotificationColors, useErrorColor, useSuccessColor, useWarningColor } from '@/lib/hooks/use-theme-colors';
import { useThemeColor } from '@/lib/hooks/use-theme-color';
import { getWarningColor, getBadgeColorForText } from '@/lib/utils/theme';
import { usePagination } from '@/lib/hooks/use-pagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { useCurrency } from '@/lib/hooks/use-currency';
import { DEFAULT_PAGINATION } from '@/shared/constants/app.constants';
import { handleApiError } from '@/shared/utils/error-handler';
import { DISCOUNT_TYPES, type DiscountType } from '@/shared/constants/menu.constants';

export function CouponsPage() {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchStore();
  const notificationColors = useNotificationColors();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const warningColor = useWarningColor();
  const primaryColor = useThemeColor();
  const currency = useCurrency();
  const pagination = usePagination<Coupon>({ 
    initialPage: DEFAULT_PAGINATION.page, 
    initialLimit: DEFAULT_PAGINATION.limit 
  });
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingCoupon, setPendingCoupon] = useState<Coupon | null>(null);
  const [updatingCouponId, setUpdatingCouponId] = useState<string | null>(null);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      code: '',
      discountType: 'fixed' as 'fixed' | 'percentage',
      discountValue: 0,
      minOrderAmount: 0,
      maxDiscountAmount: undefined as number | undefined,
      usageLimit: undefined as number | undefined,
      isActive: true,
      validFrom: new Date().toISOString(),
      validUntil: undefined as string | undefined,
    },
    validate: {
      code: (value) => (!value ? (t('coupons.codeRequired', language) || 'Coupon code is required') : null),
      discountValue: (value) => (value <= 0 ? (t('coupons.discountValueRequired', language) || 'Discount value must be greater than 0') : null),
    },
  });

  const loadCoupons = useCallback(async () => {
    if (!user?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      if (navigator.onLine) {
        try {
          const response = await couponsApi.getCoupons({}, pagination.paginationParams, selectedBranchId || undefined);
          const serverCoupons = pagination.extractData(response);
          pagination.extractPagination(response);
          
          setCoupons(serverCoupons);
        } catch (err: any) {
          setError(err.message || t('coupons.loadError', language) || 'Failed to load coupons');
        }
      } else {
        // Offline: show message
        setError(t('coupons.offlineMessage', language) || 'You are offline. Please connect to the internet to manage coupons.');
      }
    } catch (err: any) {
      setError(err.message || t('coupons.loadError', language) || 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, language, pagination.page, pagination.limit]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleOpenModal = (coupon?: Coupon) => {
    if (coupon) {
      setEditingCoupon(coupon);
      form.setValues({
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderAmount: coupon.minOrderAmount || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || undefined,
        usageLimit: coupon.usageLimit || undefined,
        isActive: coupon.isActive,
        validFrom: coupon.validFrom || new Date().toISOString(),
        validUntil: coupon.validUntil || undefined,
      });
    } else {
      setEditingCoupon(null);
      form.reset();
      form.setFieldValue('validFrom', new Date().toISOString());
    }
    setOpened(true);
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setOpened(false);
    setEditingCoupon(null);
    form.reset();
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (!user?.tenantId) return;

    flushSync(() => {
      setSubmitting(true);
    });

    try {
      setError(null);

      if (editingCoupon) {
        // Update
        const updateData: UpdateCouponDto = {
          code: values.code.trim().toUpperCase(),
          discountType: values.discountType,
          discountValue: values.discountValue,
          minOrderAmount: values.minOrderAmount > 0 ? values.minOrderAmount : undefined,
          maxDiscountAmount: values.maxDiscountAmount && values.maxDiscountAmount > 0 ? values.maxDiscountAmount : undefined,
          usageLimit: values.usageLimit && values.usageLimit > 0 ? values.usageLimit : undefined,
          isActive: values.isActive,
          validFrom: values.validFrom,
          validUntil: values.validUntil || undefined,
        };

        setUpdatingCouponId(editingCoupon.id);
        setOpened(false);
        setEditingCoupon(null);

        await couponsApi.updateCoupon(editingCoupon.id, updateData);

        notifications.show({
          title: t('common.success', language) || 'Success',
          message: t('coupons.couponUpdated', language) || 'Coupon updated successfully',
          color: successColor,
        });
      } else {
        // Create
        const createData: CreateCouponDto = {
          code: values.code.trim().toUpperCase(),
          discountType: values.discountType,
          discountValue: values.discountValue,
          minOrderAmount: values.minOrderAmount > 0 ? values.minOrderAmount : undefined,
          maxDiscountAmount: values.maxDiscountAmount && values.maxDiscountAmount > 0 ? values.maxDiscountAmount : undefined,
          usageLimit: values.usageLimit && values.usageLimit > 0 ? values.usageLimit : undefined,
          isActive: values.isActive,
          validFrom: values.validFrom,
          validUntil: values.validUntil || undefined,
        };

        const tempCoupon: Coupon = {
          id: 'pending',
          code: values.code.trim().toUpperCase(),
          discountType: values.discountType,
          discountValue: values.discountValue,
          minOrderAmount: values.minOrderAmount > 0 ? values.minOrderAmount : undefined,
          maxDiscountAmount: values.maxDiscountAmount && values.maxDiscountAmount > 0 ? values.maxDiscountAmount : undefined,
          usageLimit: values.usageLimit && values.usageLimit > 0 ? values.usageLimit : undefined,
          isActive: values.isActive,
          validFrom: values.validFrom,
          validUntil: values.validUntil || undefined,
          usedCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setPendingCoupon(tempCoupon);
        setOpened(false);
        setEditingCoupon(null);
        form.reset();

        await couponsApi.createCoupon(createData, selectedBranchId || undefined);

        notifications.show({
          title: t('common.success', language) || 'Success',
          message: t('coupons.couponCreated', language) || 'Coupon created successfully',
          color: successColor,
        });
      }

      loadCoupons();
    } catch (err: any) {
      const errorMsg = handleApiError(err, {
        defaultMessage: t('coupons.createError', language) || 'Failed to save coupon',
        language,
        errorColor,
      });
      setError(errorMsg);
      // Reopen modal on error
      if (editingCoupon) {
        setOpened(true);
        setEditingCoupon(editingCoupon);
      } else {
        setOpened(true);
      }
    } finally {
      setSubmitting(false);
      setPendingCoupon(null);
      setUpdatingCouponId(null);
    }
  };

  const handleDelete = (coupon: Coupon) => {
    modals.openConfirmModal({
      title: t('coupons.deleteCoupon', language) || 'Delete Coupon',
      children: (
        <Text size="sm">
          {t('coupons.deleteConfirm', language) || 'Are you sure you want to delete this coupon?'} <strong>{coupon.code}</strong>
        </Text>
      ),
      labels: {
        confirm: t('common.delete', language) || 'Delete',
        cancel: t('common.cancel', language) || 'Cancel',
      },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setDeletingCouponId(coupon.id);
        try {
          await couponsApi.deleteCoupon(coupon.id);
          notifications.show({
            title: t('common.success', language) || 'Success',
            message: t('coupons.couponDeleted', language) || 'Coupon deleted successfully',
            color: successColor,
          });
          await loadCoupons();
        } catch (err: any) {
          handleApiError(err, {
            defaultMessage: t('coupons.deleteError', language) || 'Failed to delete coupon',
            language,
            errorColor,
          });
        } finally {
          setDeletingCouponId(null);
        }
      },
    });
  };

  const filteredCoupons = coupons.filter((coupon) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      coupon.code.toLowerCase().includes(query) ||
      coupon.discountType.toLowerCase().includes(query)
    );
  });

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.discountType === 'fixed') {
      return formatCurrency(coupon.discountValue, currency);
    } else {
      return `${coupon.discountValue}%`;
    }
  };

  const isExpired = (coupon: Coupon) => {
    if (!coupon.validUntil) return false;
    return new Date(coupon.validUntil) < new Date();
  };

  const isNotYetValid = (coupon: Coupon) => {
    if (!coupon.validFrom) return false;
    return new Date(coupon.validFrom) > new Date();
  };

  if (loading && coupons.length === 0) {
    return (
      <Stack gap="md">
        <Skeleton height={50} />
        <Skeleton height={400} />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title={t('common.error', language) || 'Error'} color="red">
          {error}
        </Alert>
      )}

      <Group justify="space-between">
        <Title order={2}>{t('coupons.title', language) || 'Coupons'}</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => handleOpenModal()}
          style={{ backgroundColor: primaryColor }}
        >
          {t('coupons.createCoupon', language) || 'Create Coupon'}
        </Button>
      </Group>

      <Group>
        <TextInput
          placeholder={t('coupons.search', language) || 'Search coupons...'}
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1 }}
        />
      </Group>

      <Paper withBorder radius="md">
        <Table.ScrollContainer minWidth={800}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('coupons.code', language) || 'Code'}</Table.Th>
                <Table.Th>{t('coupons.discountType', language) || 'Type'}</Table.Th>
                <Table.Th>{t('coupons.discountValue', language) || 'Discount'}</Table.Th>
                <Table.Th>{t('coupons.minOrderAmount', language) || 'Min Order'}</Table.Th>
                <Table.Th>{t('coupons.usage', language) || 'Usage'}</Table.Th>
                <Table.Th>{t('coupons.validity', language) || 'Validity'}</Table.Th>
                <Table.Th>{t('coupons.status', language) || 'Status'}</Table.Th>
                <Table.Th>{t('common.actions', language) || 'Actions'}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pendingCoupon && (
                <Table.Tr>
                  <Table.Td>
                    <Group gap="xs">
                      <Loader size="sm" />
                      <Skeleton height={20} width={100} />
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={24} width={80} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={80} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={80} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={60} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={40} width={120} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={40} width={100} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={32} width={80} />
                  </Table.Td>
                </Table.Tr>
              )}
              {filteredCoupons.length === 0 && !pendingCoupon ? (
                <Table.Tr>
                  <Table.Td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                    <Text c="dimmed">{t('coupons.noCoupons', language) || 'No coupons found'}</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredCoupons.map((coupon) => {
                  const isUpdating = updatingCouponId === coupon.id;
                  
                  if (isUpdating) {
                    return (
                      <Table.Tr key={coupon.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <Loader size="sm" />
                            <Skeleton height={20} width={100} />
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={24} width={80} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={20} width={80} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={20} width={80} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={20} width={60} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={40} width={120} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={40} width={100} />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={32} width={80} />
                        </Table.Td>
                      </Table.Tr>
                    );
                  }
                  
                  return (
                    <Table.Tr key={coupon.id}>
                      <Table.Td>
                        <Text fw={500}>{coupon.code}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={coupon.discountType === 'fixed' ? primaryColor : successColor}>
                          {coupon.discountType === 'fixed' 
                            ? (t('coupons.fixed', language) || 'Fixed')
                            : (t('coupons.percentage', language) || 'Percentage')}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={500} c={primaryColor}>
                          {formatDiscount(coupon)}
                          {coupon.discountType === 'percentage' && coupon.maxDiscountAmount && (
                            <Text size="xs" c="dimmed">
                              {' '}(max: {formatCurrency(coupon.maxDiscountAmount, currency)})
                            </Text>
                          )}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {coupon.minOrderAmount ? (
                          <Text size="sm">{formatCurrency(coupon.minOrderAmount, currency)}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">-</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {coupon.usedCount} / {coupon.usageLimit || '∞'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          {coupon.validFrom && (
                            <Text size="xs" c="dimmed">
                              {t('coupons.from', language) || 'From'}: {new Date(coupon.validFrom).toLocaleDateString()}
                            </Text>
                          )}
                          {coupon.validUntil && (
                            <Text size="xs" c="dimmed">
                              {t('coupons.until', language) || 'Until'}: {new Date(coupon.validUntil).toLocaleDateString()}
                            </Text>
                          )}
                          {!coupon.validFrom && !coupon.validUntil && (
                            <Text size="xs" c="dimmed">-</Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Badge 
                            color={coupon.isActive ? successColor : getBadgeColorForText(t('coupons.inactive', language) || 'Inactive')} 
                            size="sm"
                          >
                            {coupon.isActive 
                              ? (t('coupons.active', language) || 'Active')
                              : (t('coupons.inactive', language) || 'Inactive')}
                          </Badge>
                          {isExpired(coupon) && (
                            <Badge color={errorColor} size="xs">
                              {t('coupons.expired', language) || 'Expired'}
                            </Badge>
                          )}
                          {isNotYetValid(coupon) && (
                            <Badge color={warningColor} size="xs">
                              {t('coupons.notYetValid', language) || 'Not Yet Valid'}
                            </Badge>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => handleOpenModal(coupon)}
                            disabled={submitting || updatingCouponId === coupon.id || deletingCouponId === coupon.id}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDelete(coupon)}
                            disabled={submitting || updatingCouponId === coupon.id || deletingCouponId === coupon.id}
                            loading={deletingCouponId === coupon.id}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {pagination.total > 0 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          limit={pagination.limit}
          total={pagination.total}
          onPageChange={(page) => {
            pagination.setPage(page);
          }}
          onLimitChange={(limit) => {
            pagination.setLimit(limit);
            pagination.setPage(1);
          }}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        opened={opened}
        onClose={handleCloseModal}
        title={editingCoupon 
          ? (t('coupons.editCoupon', language) || 'Edit Coupon')
          : (t('coupons.createCoupon', language) || 'Create Coupon')}
        size="lg"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label={t('coupons.code', language) || 'Coupon Code'}
              placeholder="SAVE10"
              required
              {...form.getInputProps('code')}
            />

            <Select
              label={t('coupons.discountType', language) || 'Discount Type'}
              data={DISCOUNT_TYPES.map((type) => ({
                value: type.value,
                label: t(`coupons.${type.value}` as any, language) || type.label,
              }))}
              required
              {...form.getInputProps('discountType')}
            />

            <NumberInput
              label={t('coupons.discountValue', language) || 'Discount Value'}
              placeholder={form.values.discountType === 'fixed' ? '10.00' : '10'}
              required
              min={0.01}
              decimalScale={form.values.discountType === 'fixed' ? 2 : 0}
              allowDecimal={form.values.discountType === 'fixed'}
              {...form.getInputProps('discountValue')}
            />

            {form.values.discountType === 'percentage' && (
              <NumberInput
                label={t('coupons.maxDiscountAmount', language) || 'Maximum Discount Amount (Optional)'}
                placeholder="100.00"
                min={0}
                decimalScale={2}
                {...form.getInputProps('maxDiscountAmount')}
              />
            )}

            <NumberInput
              label={t('coupons.minOrderAmount', language) || 'Minimum Order Amount (Optional)'}
              placeholder="50.00"
              min={0}
              decimalScale={2}
              {...form.getInputProps('minOrderAmount')}
            />

            <NumberInput
              label={t('coupons.usageLimit', language) || 'Usage Limit (Optional)'}
              placeholder="100"
              min={1}
              {...form.getInputProps('usageLimit')}
            />

            <DatePickerInput
              label={t('coupons.validFrom', language) || 'Valid From (Optional)'}
              placeholder={t('coupons.validFromPlaceholder', language) || 'Select start date'}
              value={form.values.validFrom ? new Date(form.values.validFrom) : null}
              onChange={(date) => {
                if (date) {
                  form.setFieldValue('validFrom', date.toISOString());
                } else {
                  form.setFieldValue('validFrom', new Date().toISOString());
                }
              }}
            />

            <DatePickerInput
              label={t('coupons.validUntil', language) || 'Valid Until (Optional)'}
              placeholder={t('coupons.validUntilPlaceholder', language) || 'Select end date'}
              value={form.values.validUntil ? new Date(form.values.validUntil) : null}
              onChange={(date) => {
                if (date) {
                  form.setFieldValue('validUntil', date.toISOString());
                } else {
                  form.setFieldValue('validUntil', undefined);
                }
              }}
            />

            <Switch
              label={t('coupons.isActive', language) || 'Active'}
              {...form.getInputProps('isActive', { type: 'checkbox' })}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleCloseModal} disabled={submitting}>
                {t('common.cancel', language) || 'Cancel'}
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }} loading={submitting} disabled={submitting}>
                {editingCoupon 
                  ? (t('common.saveChanges', language) || 'Update')
                  : (t('common.create', language) || 'Create')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

