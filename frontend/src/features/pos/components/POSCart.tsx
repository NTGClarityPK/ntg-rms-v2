'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import {
  Box,
  Stack,
  Text,
  ScrollArea,
  Group,
  Button,
  SegmentedControl,
  Select,
  MultiSelect,
  NumberInput,
  Divider,
  Badge,
  ActionIcon,
  Paper,
  Modal,
  TextInput,
  Textarea,
  useMantineTheme,
  Tooltip,
  Flex,
  Loader,
} from '@mantine/core';
import {
  IconTrash,
  IconPlus,
  IconMinus,
  IconUser,
  IconTable,
  IconShoppingCart,
  IconDiscount,
  IconPrinter,
  IconX,
  IconCheck,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { CartItem, RestaurantTable } from '@/shared/types/cart.types';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor } from '@/lib/utils/theme';
import { useTheme } from '@/lib/hooks/use-theme';
import { generateThemeColors } from '@/lib/utils/themeColors';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { ItemSelectionModal } from './ItemSelectionModal';
import { useAuthStore } from '@/lib/store/auth-store';
import { notifications } from '@mantine/notifications';
import apiClient from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/constants/api';
import { ordersApi, OrderItem } from '@/lib/api/orders';
import { couponsApi } from '@/lib/api/coupons';
import { customersApi } from '@/lib/api/customers';
import { useSettings } from '@/lib/hooks/use-settings';
import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { InvoiceGenerator } from '@/lib/utils/invoice-generator';
import { restaurantApi } from '@/lib/api/restaurant';
import { taxesApi, Tax } from '@/lib/api/taxes';
import { menuApi } from '@/lib/api/menu';
import type { ThemeConfig } from '@/lib/theme/themeConfig';
import { notifyOrderUpdate } from '@/lib/utils/order-events';
import { orderCalculatorService } from '@/features/orders/domain';

interface POSCartProps {
  cartItems: CartItem[];
  onRemoveItem: (index: number) => void;
  onUpdateItem: (index: number, item: CartItem) => void;
  onClearCart: () => void;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  onOrderTypeChange: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
  selectedTableId: string | null; // Deprecated: use selectedTableIds instead
  onTableChange: (tableId: string | null) => void; // Deprecated: use onTableIdsChange instead
  selectedTableIds: string[];
  onTableIdsChange: (tableIds: string[]) => void;
  selectedCustomerId: string | null;
  onCustomerChange: (customerId: string | null) => void;
  numberOfPersons: number;
  onNumberOfPersonsChange: (count: number) => void;
  tenantId: string;
  branchId: string;
  editingOrderId?: string | null;
  isBuffetMode?: boolean; // When true, only show dine-in option
}

export function POSCart({
  cartItems,
  onRemoveItem,
  onUpdateItem,
  onClearCart,
  orderType,
  onOrderTypeChange,
  selectedTableId,
  onTableChange,
  selectedTableIds = [],
  onTableIdsChange,
  selectedCustomerId,
  onCustomerChange,
  numberOfPersons,
  onNumberOfPersonsChange,
  tenantId,
  branchId,
  editingOrderId,
  isBuffetMode = false,
}: POSCartProps) {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { settings } = useSettings();
  const { isOnline } = useSyncStatus();
  const theme = useMantineTheme();
  const themeConfig = (theme.other as any) as ThemeConfig | undefined;
  const primaryColor = useThemeColor();
  const primaryShade = useThemeColorShade(6);
  const currency = useCurrency();
  const warningColor = useThemeColor();
  const { isDark } = useTheme();
  const themeColors = generateThemeColors(primaryColor, isDark);
  
  // Get settings flags
  const enableTableManagement = settings?.general?.enableTableManagement ?? true;
  const enableDeliveryManagement = settings?.general?.enableDeliveryManagement ?? true;
  const autoPrintInvoices = settings?.general?.autoPrintInvoices ?? false;
  const minimumDeliveryOrderAmount = settings?.general?.minimumDeliveryOrderAmount ?? 0;
  
  // Get payment method settings - only show methods that are explicitly enabled
  // Note: We check for explicit true values, not just truthy values
  const paymentMethods = settings?.paymentMethods;
  
  // Build enabled payment methods array - only include methods that are explicitly set to true
  const enabledPaymentMethods: Array<{ label: string; value: string }> = useMemo(() => {
    const methods: Array<{ label: string; value: string }> = [];
    
    if (paymentMethods?.enableCash === true) {
      methods.push({ label: t('pos.cash', language), value: 'cash' });
    }
    if (paymentMethods?.enableCard === true) {
      methods.push({ label: t('pos.card', language), value: 'card' });
    }
    if (paymentMethods?.enableZainCash === true) {
      methods.push({ label: t('pos.zainCash' as any, language) || 'ZainCash', value: 'zainCash' });
    }
    if (paymentMethods?.enableAsiaHawala === true) {
      methods.push({ label: t('pos.asiaHawala' as any, language) || 'Asia Hawala', value: 'asiaHawala' });
    }
    if (paymentMethods?.enableBankTransfer === true) {
      methods.push({ label: t('pos.bankTransfer' as any, language) || 'Bank Transfer', value: 'bankTransfer' });
    }
    
    // If no payment methods are enabled, default to cash to prevent empty state
    if (methods.length === 0) {
      methods.push({ label: t('pos.cash', language), value: 'cash' });
    }
    
    return methods;
  }, [paymentMethods, language]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerData, setSelectedCustomerData] = useState<any>(null);
  const [customerModalOpened, setCustomerModalOpened] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [submittingCustomer, setSubmittingCustomer] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingItemLoadingIndex, setEditingItemLoadingIndex] = useState<number | null>(null);
  const [manualDiscount, setManualDiscount] = useState<number>(0);
  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedCouponDiscount, setAppliedCouponDiscount] = useState<number>(0);
  const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null);
  const [activeTaxes, setActiveTaxes] = useState<Tax[]>([]);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'zainCash' | 'asiaHawala' | 'bankTransfer' | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [invoiceModalOpened, setInvoiceModalOpened] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<any | null>(null);
  const [placedOrderItems, setPlacedOrderItems] = useState<CartItem[]>([]);
  const [placedOrderPaymentMethod, setPlacedOrderPaymentMethod] = useState<string | null>(null);
  const [placedOrderCustomerName, setPlacedOrderCustomerName] = useState<string | undefined>(undefined);
  const [placedOrderCustomerPhone, setPlacedOrderCustomerPhone] = useState<string | undefined>(undefined);
  // Address handling for delivery orders
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState<string>('');
  const [newAddressCity, setNewAddressCity] = useState<string>('');
  const [newAddressState, setNewAddressState] = useState<string>('');
  const [newAddressCountry, setNewAddressCountry] = useState<string>('');
  const [variationGroupsMap, setVariationGroupsMap] = useState<Map<string, string>>(new Map());
  const [orderSpecialInstructions, setOrderSpecialInstructions] = useState<string>('');

  // Helper function to resolve variation group name from UUID
  const resolveVariationGroupName = (variationGroup: string | undefined): string => {
    if (!variationGroup) return '';
    // Check if it's a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variationGroup);
    if (isUUID) {
      return variationGroupsMap.get(variationGroup) || variationGroup;
    }
    return variationGroup;
  };

  // Load variation groups to resolve UUIDs to names
  useEffect(() => {
    const loadVariationGroups = async () => {
      try {
        const groupsResponse = await menuApi.getVariationGroups();
        const groups = Array.isArray(groupsResponse) ? groupsResponse : (groupsResponse?.data || []);
        const map = new Map<string, string>();
        groups.forEach((group: any) => {
          map.set(group.id, group.name);
        });
        setVariationGroupsMap(map);
      } catch (error) {
        console.error('Failed to load variation groups:', error);
      }
    };
    loadVariationGroups();
  }, []);

  const loadActiveTaxes = useCallback(async () => {
    if (!branchId) {
      setActiveTaxes([]);
      return;
    }
    try {
      const allTaxes = await taxesApi.getTaxes(branchId);
      const active = allTaxes.filter((tax) => tax.isActive);
      setActiveTaxes(active);
    } catch (error) {
      console.error('Failed to load taxes:', error);
      setActiveTaxes([]);
    }
  }, [branchId]);

  const loadTables = useCallback(async (skipCreation = false) => {
    if (!branchId) return;
    try {
      const totalTables = settings?.general?.totalTables || 0;
      
      // If totalTables is set, use available tables API and filter by range
      if (totalTables > 0) {
        try {
          // Get available tables for this branch
          // Note: We don't auto-create tables on load - tables should be created manually in settings
          const availableTables = await restaurantApi.getAvailableTables(branchId);
          
          // Filter tables to only include those within 1 to totalTables range
          const filteredTables = availableTables.filter((table) => {
            const tableNum = parseInt(table.tableNumber, 10);
            return !isNaN(tableNum) && tableNum >= 1 && tableNum <= totalTables;
          });
          
          // Sort by table number
          filteredTables.sort((a, b) => {
            const aNum = parseInt(a.tableNumber, 10);
            const bNum = parseInt(b.tableNumber, 10);
            return aNum - bNum;
          });
          
          // Convert to RestaurantTable format
          const tablesToStore = filteredTables.map((table) => ({
            id: table.id,
            tenantId,
            branchId: table.branchId,
            tableNumber: table.tableNumber,
            name: `Table ${table.tableNumber}`,
            capacity: table.seatingCapacity || 4,
            status: table.status || 'available',
            createdAt: table.createdAt || new Date().toISOString(),
            updatedAt: table.updatedAt || new Date().toISOString(),
            syncStatus: 'synced' as const,
            lastSynced: new Date().toISOString(),
          }));
          
          setTables(tablesToStore as any);
        } catch (error) {
          console.error('Failed to load available tables from API:', error);
          setTables([]);
        }
      } else {
        setTables([]);
      }
    } catch (error) {
      console.error('Failed to load tables:', error);
    }
  }, [branchId, settings?.general?.totalTables, tenantId]);

  useEffect(() => {
    if (tenantId) {
      loadCustomers();
      loadActiveTaxes();
    }
    if (branchId) {
      loadTables();
    }
  }, [tenantId, branchId, loadActiveTaxes, loadTables]);

  // Load customer data when selected customer changes
  useEffect(() => {
    const loadSelectedCustomer = async () => {
      if (!selectedCustomerId) {
        setSelectedCustomerData(null);
        setSelectedAddressId(null);
        setNewAddress('');
        setNewAddressCity('');
        setNewAddressState('');
        return;
      }

      try {
        const latestCustomer = await customersApi.getCustomerById(selectedCustomerId);
        setSelectedCustomerData(latestCustomer);
        
        // If customer has addresses and order type is delivery, prefill address fields
        if (orderType === 'delivery' && latestCustomer.addresses && latestCustomer.addresses.length > 0) {
          const defaultAddress = latestCustomer.addresses.find((addr) => addr.isDefault) || latestCustomer.addresses[0];
          if (defaultAddress) {
            // Prefill address input fields with existing address
            setNewAddress(defaultAddress.address || '');
            setNewAddressCity(defaultAddress.city || '');
            setNewAddressState(defaultAddress.state || '');
            setNewAddressCountry(defaultAddress.country || '');
            // Store the address ID so we can use it if address hasn't changed
            setSelectedAddressId(defaultAddress.id);
          }
        } else if (orderType === 'delivery') {
          // No addresses - clear fields
          setNewAddress('');
          setNewAddressCity('');
          setNewAddressState('');
          setSelectedAddressId(null);
        }
      } catch (error) {
        console.error('Failed to load customer data:', error);
        setSelectedCustomerData(null);
        setSelectedAddressId(null);
      }
    };

    loadSelectedCustomer();
  }, [selectedCustomerId, orderType]);

  // Clear address fields when order type changes away from delivery
  useEffect(() => {
    if (orderType !== 'delivery') {
      setSelectedAddressId(null);
      setNewAddress('');
      setNewAddressCity('');
      setNewAddressState('');
    }
  }, [orderType]);

  const loadCustomers = async () => {
    try {
      const allCustomersResponse = await customersApi.getCustomers();
      const allCustomers = Array.isArray(allCustomersResponse) ? allCustomersResponse : (allCustomersResponse?.data || []);
      setCustomers(allCustomers);
    } catch (error) {
      console.error('Failed to load customers:', error);
      setCustomers([]);
    }
  };

  const handleEditItem = async (index: number, item: CartItem) => {
    setEditingItemLoadingIndex(index);
    
    try {
      // Check if item is a buffet or combo meal (these typically can't be edited in the same way)
      if (item.buffetId || item.comboMealId) {
        // For buffets and combo meals, we can still allow editing quantity and special instructions
        setEditingItem({ 
          ...item, 
          cartItemIndex: index,
          isBuffet: !!item.buffetId,
          isComboMeal: !!item.comboMealId,
        });
        setEditingItemIndex(index);
        setEditingItemLoadingIndex(null);
        return;
      }
      
      // Load food item details only if it's a food item
      if (item.foodItemId) {
        try {
          const foodItem = await menuApi.getFoodItemById(item.foodItemId);
          if (foodItem) {
            setEditingItem({ ...foodItem, cartItemIndex: index });
            setEditingItemIndex(index);
          }
        } catch (error) {
          console.error('Failed to load food item:', error);
        }
      }
    } finally {
      setEditingItemLoadingIndex(null);
    }
  };

  const handleItemUpdated = (updatedCartItem: any) => {
    if (editingItemIndex !== null) {
      onUpdateItem(editingItemIndex, updatedCartItem);
      setEditingItemIndex(null);
      setEditingItem(null);
    }
  };

  const handleCreateCustomer = async () => {
    // Validate required fields
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      return;
    }

    // Save form values before clearing
    const customerName = newCustomerName.trim();
    const customerPhone = newCustomerPhone.trim();
    const customerEmail = newCustomerEmail.trim();

    flushSync(() => {
      setSubmittingCustomer(true);
    });

    try {
      // Close modal immediately after validation
      setCustomerModalOpened(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');

      const createdCustomer = await customersApi.createCustomer({
        name: customerName,
        phone: customerPhone,
        email: customerEmail || undefined,
      });

      // Refresh customers list
      await loadCustomers();
      
      // Select the newly created customer
      onCustomerChange(createdCustomer.id);

      // Show success notification
      notifications.show({
        title: t('customers.createSuccess' as any, language) || 'Customer Created',
        message: t('customers.createSuccess' as any, language) || 'Customer created successfully',
        color: getSuccessColor(),
        icon: <IconCheck size={16} />,
      });
    } catch (apiError: any) {
      const errorMessage = apiError?.response?.data?.error?.message || 
                          apiError?.message || 
                          'Failed to create customer';
      
      notifications.show({
        title: t('pos.orderPlacedError', language),
        message: errorMessage,
        color: getErrorColor(),
      });
      
      // Reopen modal on error
      setCustomerModalOpened(true);
      setNewCustomerName(customerName);
      setNewCustomerPhone(customerPhone);
      setNewCustomerEmail(customerEmail);
    } finally {
      setSubmittingCustomer(false);
    }
  };

  // Use OrderCalculatorService for calculations
  const calculateSubtotal = useCallback(() => {
    return orderCalculatorService.calculateSubtotal(cartItems);
  }, [cartItems]);

  const getLoyaltyTierDiscount = useCallback(() => {
    const subtotal = orderCalculatorService.calculateSubtotal(cartItems);
    return orderCalculatorService.calculateLoyaltyTierDiscount(
      subtotal,
      selectedCustomerData?.loyaltyTier
    );
  }, [selectedCustomerData?.loyaltyTier, cartItems]);

  const calculateDiscount = useCallback(() => {
    const subtotal = orderCalculatorService.calculateSubtotal(cartItems);
    return orderCalculatorService.calculateDiscount(
      subtotal,
      {
        manualDiscount,
        couponDiscount: appliedCouponDiscount,
        loyaltyDiscount: 0, // Will be calculated inside
      },
      selectedCustomerData?.loyaltyTier
    );
  }, [manualDiscount, appliedCouponDiscount, selectedCustomerData?.loyaltyTier, cartItems]);

  const calculateDeliveryCharge = useCallback(() => {
    return orderCalculatorService.calculateDeliveryCharge(orderType, deliveryCharge);
  }, [orderType, deliveryCharge]);

  const [calculatedTax, setCalculatedTax] = useState<number>(0);
  const [taxBreakdown, setTaxBreakdown] = useState<Array<{ name: string; rate: number; amount: number }>>([]);

  // Recalculate tax whenever relevant values change
  useEffect(() => {
    const recalculateTax = async () => {
      // Check if tax system is enabled
      if (!settings?.tax?.enableTaxSystem || activeTaxes.length === 0) {
        setTaxBreakdown([]);
        setCalculatedTax(0);
        return;
      }

      const subtotal = orderCalculatorService.calculateSubtotal(cartItems);
      const loyaltyDiscount = getLoyaltyTierDiscount();
      const discount = manualDiscount + appliedCouponDiscount + loyaltyDiscount;
      const taxableAmount = subtotal - discount;
      const delivery = orderCalculatorService.calculateDeliveryCharge(orderType, deliveryCharge);
      const serviceCharge = 0; // Not implemented yet

      // Prepare order items for tax calculation with categoryId
      // Only include food items (exclude buffets and combo meals)
      const foodItemsOnly = cartItems.filter((item) => item.foodItemId && !item.buffetId && !item.comboMealId);
      const validOrderItemsForTax = await Promise.all(
        foodItemsOnly.map(async (item) => {
          // Fetch food item to get categoryId
          let categoryId: string | undefined;
          if (item.foodItemId) {
            try {
              const foodItem = await menuApi.getFoodItemById(item.foodItemId);
              categoryId = foodItem?.categoryId;
            } catch (error) {
              console.error('Failed to fetch food item for tax calculation:', error);
            }
          }
          return {
            foodItemId: item.foodItemId!,
            categoryId,
            subtotal: item.subtotal ?? (item.unitPrice ?? 0) * (item.quantity ?? 1),
          };
        })
      );

      // Use OrderCalculatorService for tax calculation
      const taxResult = orderCalculatorService.calculateTax(
        taxableAmount,
        activeTaxes,
        validOrderItemsForTax,
        delivery,
        serviceCharge
      );

      setTaxBreakdown(taxResult.breakdown);
      setCalculatedTax(taxResult.total);
    };

    recalculateTax();
  }, [
    activeTaxes,
    cartItems,
    settings?.tax?.enableTaxSystem,
    manualDiscount,
    appliedCouponDiscount,
    getLoyaltyTierDiscount,
    orderType,
    deliveryCharge,
  ]);

  const calculateGrandTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    const delivery = calculateDeliveryCharge();
    return subtotal - discount + calculatedTax + delivery;
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      return;
    }

    setIsValidatingCoupon(true);
    try {
      const subtotal = orderCalculatorService.calculateSubtotal(cartItems);
      const response = await couponsApi.validateCoupon({
        code: couponCode.trim().toUpperCase(),
        subtotal,
        customerId: selectedCustomerId || undefined,
      }, branchId || undefined);

      if (response) {
        setAppliedCouponDiscount(response.discount);
        setAppliedCouponId(response.couponId);
        notifications.show({
          title: t('pos.couponApplied', language) || 'Coupon Applied',
          message: `${t('pos.discount', language)}: ${formatCurrency(response.discount, currency)}`,
          color: getSuccessColor(),
        });
      }
    } catch (error: any) {
      // Extract error message from nested error structure
      const errorMessage = 
        error.response?.data?.error?.message || 
        error.response?.data?.message || 
        error.message || 
        t('pos.invalidCoupon', language);
      
      notifications.show({
        title: t('pos.invalidCoupon', language),
        message: errorMessage,
        color: getErrorColor(),
      });
      setAppliedCouponDiscount(0);
      setAppliedCouponId(null);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const generateOrderNumber = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `ORD-${timestamp}-${random}`;
  };

  const generateTokenNumber = () => {
    const random = Math.floor(Math.random() * 10000);
    return random.toString().padStart(4, '0');
  };

  const validateCart = (): string | null => {
    if (cartItems.length === 0) {
      return t('pos.cartEmpty', language);
    }
    // Removed table validation - any table number is valid
    if (!paymentMethod) {
      return t('pos.selectPaymentMethod', language) || 'Please select a payment method';
    }
    // Validate address for delivery orders
    if (orderType === 'delivery') {
      if (selectedCustomerId) {
        // Customer selected - must have address selected or new address entered
        if (!selectedAddressId && !newAddress.trim()) {
          return t('delivery.addressRequired' as any, language) || 'Customer address is required for delivery orders';
        }
      } else {
        // Walk-in customer - must have address entered
        if (!newAddress.trim()) {
          return t('delivery.addressRequired' as any, language) || 'Delivery address is required for delivery orders';
        }
      }
      
      // Validate minimum delivery order amount
      const subtotal = orderCalculatorService.calculateSubtotal(cartItems);
      if (minimumDeliveryOrderAmount > 0 && subtotal < minimumDeliveryOrderAmount) {
        return t('pos.minimumDeliveryAmount' as any, language) || 
               `Minimum delivery order amount is ${formatCurrency(minimumDeliveryOrderAmount, currency)}`;
      }
    }
    return null;
  };

  const handlePlaceOrder = async () => {
    const validationError = validateCart();
    if (validationError) {
      notifications.show({
        title: t('pos.orderPlacedError', language),
        message: validationError,
        color: getErrorColor(),
      });
      return;
    }

    setIsPlacingOrder(true);

    try {
      // Prepare order data using OrderCalculatorService
      const subtotal = orderCalculatorService.calculateSubtotal(cartItems);
      const discount = calculateDiscount();
      const tax = calculatedTax;
      const delivery = orderCalculatorService.calculateDeliveryCharge(orderType, deliveryCharge);
      const total = calculateGrandTotal();

      // Handle address for delivery orders
      let finalAddressId: string | undefined = undefined;
      if (orderType === 'delivery') {
        // Check if address fields match an existing address (for existing customers)
        if (selectedAddressId && selectedCustomerId && selectedCustomerData?.addresses) {
          const existingAddress = selectedCustomerData.addresses.find((addr: any) => addr.id === selectedAddressId);
          if (existingAddress && 
              existingAddress.address === newAddress.trim() &&
              (existingAddress.city || '') === (newAddressCity.trim() || '') &&
              (existingAddress.state || '') === (newAddressState.trim() || '')) {
            // Address hasn't changed, use existing address ID
            finalAddressId = selectedAddressId;
          } else if (newAddress.trim() && selectedCustomerId) {
            // Address was modified or is new - create/update address
            // Create new address for existing customer
            try {
              const createdAddress = await customersApi.createCustomerAddress(selectedCustomerId, {
                address: newAddress.trim(),
                city: newAddressCity.trim() || undefined,
                state: newAddressState.trim() || undefined,
                country: newAddressCountry || undefined,
              });
              
              finalAddressId = createdAddress.id;
              
              // Refresh customer data to include new address
              const updatedCustomer = await customersApi.getCustomerById(selectedCustomerId);
              setSelectedCustomerData(updatedCustomer);
            } catch (addressError: any) {
              notifications.show({
                title: t('pos.orderPlacedError', language),
                message: addressError?.response?.data?.error?.message || addressError?.message || 'Failed to create delivery address',
                color: getErrorColor(),
              });
              setIsPlacingOrder(false);
              return;
            }
          }
        } else if (newAddress.trim() && selectedCustomerId) {
          // Create new address for existing customer
          try {
            const createdAddress = await customersApi.createCustomerAddress(selectedCustomerId, {
              address: newAddress.trim(),
              city: newAddressCity.trim() || undefined,
              state: newAddressState.trim() || undefined,
              country: newAddressCountry || undefined,
            });
            
            finalAddressId = createdAddress.id;
            
            // Refresh customer data to include new address
            const updatedCustomer = await customersApi.getCustomerById(selectedCustomerId);
            setSelectedCustomerData(updatedCustomer);
          } catch (addressError: any) {
            notifications.show({
              title: t('pos.orderPlacedError', language),
              message: addressError?.response?.data?.error?.message || addressError?.message || 'Failed to create delivery address',
              color: getErrorColor(),
            });
            setIsPlacingOrder(false);
            return;
          }
        } else if (newAddress.trim() && !selectedCustomerId) {
          // Walk-in customer with address - allow order to proceed
          // The address will be stored in the delivery record, not as a customer address
          // finalAddressId remains undefined for walk-in customers
          finalAddressId = undefined;
        }
      }

      // Create order items for API
      const orderItemsForApi = cartItems.map((item) => {
        const isBuffet = !!item.buffetId;
        const isComboMeal = !!item.comboMealId;
        
        return {
          ...(isBuffet ? { buffetId: item.buffetId } : {}),
          ...(isComboMeal ? { comboMealId: item.comboMealId } : {}),
          ...(!isBuffet && !isComboMeal ? { foodItemId: item.foodItemId } : {}),
          quantity: item.quantity,
          variationId: item.variationId,
          addOns: item.addOns?.map((addOn) => ({
            addOnId: addOn.addOnId,
            quantity: addOn.quantity || 1,
          })),
        };
      });

      // Prepare order DTO for API
      const createOrderDto = {
        branchId,
        // Use tableIds if available, otherwise fallback to tableId for backward compatibility
        tableId: orderType === 'dine_in' && selectedTableIds.length === 0 ? (selectedTableId || undefined) : undefined,
        tableIds: orderType === 'dine_in' && selectedTableIds.length > 0 ? selectedTableIds : undefined,
        customerId: selectedCustomerId || undefined,
        orderType,
        items: orderItemsForApi,
        tokenNumber: orderType === 'dine_in' ? generateTokenNumber() : undefined,
        extraDiscountAmount: discount,
        couponCode: appliedCouponId ? couponCode : undefined,
        specialInstructions: orderSpecialInstructions.trim() || undefined,
        paymentTiming: 'pay_first' as const,
        // Map payment methods: zainCash, asiaHawala, bankTransfer -> card (electronic payments)
        paymentMethod: paymentMethod === 'zainCash' || paymentMethod === 'asiaHawala' || paymentMethod === 'bankTransfer' 
          ? 'card' 
          : (paymentMethod || 'cash') as 'cash' | 'card',
        customerAddressId: finalAddressId,
        // For walk-in customers, send address fields directly
        deliveryAddress: orderType === 'delivery' && !finalAddressId ? newAddress : undefined,
        deliveryAddressCity: orderType === 'delivery' && !finalAddressId ? newAddressCity : undefined,
        deliveryAddressState: orderType === 'delivery' && !finalAddressId ? newAddressState : undefined,
        deliveryAddressCountry: orderType === 'delivery' && !finalAddressId ? newAddressCountry : undefined,
        numberOfPersons: orderType === 'dine_in' ? numberOfPersons : undefined,
      };

      let createdOrder: any | null = null;

      try {
        if (editingOrderId) {
          // Update existing order
          createdOrder = await ordersApi.updateOrder(editingOrderId, {
            tableId: createOrderDto.tableId,
            customerId: createOrderDto.customerId,
            orderType: createOrderDto.orderType,
            items: createOrderDto.items,
            extraDiscountAmount: createOrderDto.extraDiscountAmount,
            couponCode: createOrderDto.couponCode,
            specialInstructions: createOrderDto.specialInstructions,
            customerAddressId: createOrderDto.customerAddressId,
            deliveryAddress: createOrderDto.deliveryAddress,
            deliveryAddressCity: createOrderDto.deliveryAddressCity,
            deliveryAddressState: createOrderDto.deliveryAddressState,
            deliveryAddressCountry: createOrderDto.deliveryAddressCountry,
            numberOfPersons: createOrderDto.numberOfPersons,
          });
        } else {
          // Create new order
          createdOrder = await ordersApi.createOrder(createOrderDto);
        }
        
        // Use the order ID and details from the API response
        const orderId = createdOrder.id;

          // Create order items
          // For now, we'll create order items from cart items since we have that data
          const orderItems: OrderItem[] = cartItems.map((item, index) => ({
            id: `order-item-${Date.now()}-${index}`,
            orderId,
            foodItemId: item.foodItemId,
            buffetId: item.buffetId,
            comboMealId: item.comboMealId,
            variationId: item.variationId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: 0,
            taxAmount: 0,
            subtotal: item.subtotal ?? (item.unitPrice ?? 0) * (item.quantity ?? 1),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            syncStatus: 'synced',
          }));

          // Update table status if dine-in
          if (orderType === 'dine_in' && selectedTableId) {
            try {
              await restaurantApi.updateTable(selectedTableId, { status: 'occupied' });
            } catch (error) {
              console.error('Failed to update table status:', error);
            }
          }

          // Store payment method and customer info before clearing (needed for invoice generation)
          const savedPaymentMethod = paymentMethod;
          const customerName = selectedCustomerData?.name;
          const customerPhone = selectedCustomerData?.phone;
          
          // Set placed order and items for invoice (before clearing cart)
          setPlacedOrder(createdOrder);
          setPlacedOrderItems([...cartItems]);
          setPlacedOrderPaymentMethod(savedPaymentMethod);
          setPlacedOrderCustomerName(customerName);
          setPlacedOrderCustomerPhone(customerPhone);

          // Open invoice modal immediately - show receipt popup instantly
          setInvoiceModalOpened(true);

          // Clear cart
          onClearCart();
          setManualDiscount(0);
          setCouponCode('');
          setAppliedCouponDiscount(0);
          setAppliedCouponId(null);
          setPaymentMethod(null);
          
          // Reset tables and persons
          if (onTableIdsChange) {
            onTableIdsChange([]);
          }
          if (onTableChange) {
            onTableChange(null);
          }
          if (onNumberOfPersonsChange) {
            onNumberOfPersonsChange(1);
          }

          // Run async operations after modal is opened (non-blocking)
          (async () => {
            // Reload tables to update available list (skip creation to avoid conflicts)
            await loadTables(true);

            // Notify other components about the new order
            notifyOrderUpdate('order-created', orderId);

            // Show success notification
            notifications.show({
              title: t('pos.orderPlacedSuccess', language),
              message: t('pos.orderPlacedSuccess', language),
              color: getSuccessColor(),
              icon: <IconCheck size={16} />,
            });

            // Auto print invoice if enabled
            if (autoPrintInvoices && createdOrder) {
              try {
                const tenant = await restaurantApi.getInfo();
                const branches = await restaurantApi.getBranches();
                const branch = branches.find(b => b.id === createdOrder!.branchId);
                
                // Fetch full order details with customer info if needed
                let orderWithDetails: any = createdOrder;
                if (createdOrder.customerId && !(createdOrder as any).customer) {
                  try {
                    orderWithDetails = await ordersApi.getOrderById(createdOrder.id);
                  } catch (error) {
                    console.error('Failed to fetch order details:', error);
                  }
                }
                
                // Get payment method from the order or use the saved one (before it was cleared)
                const orderPaymentMethod = orderWithDetails.paymentMethod || savedPaymentMethod;
                
                const invoiceData = {
                  order: {
                    ...orderWithDetails,
                    orderType: orderWithDetails.orderType || orderType,
                    paymentMethod: orderPaymentMethod,
                    items: orderWithDetails.items?.map((item: any) => ({
                      ...item,
                      foodItemName: item.foodItem?.name || '',
                      variationName: item.variation?.variationName || '',
                      addOns: item.addOns?.map((a: any) => ({
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
                  customerName: orderWithDetails.customer
                    ? (orderWithDetails.customer.name || '')
                    : undefined,
                  customerPhone: orderWithDetails.customer?.phone,
                  customerAddress: undefined,
                };

                const template = settings?.invoice?.receiptTemplate === 'a4' ? 'a4' : 'thermal';
                const html = template === 'a4' 
                  ? InvoiceGenerator.generateA4(invoiceData, language, themeConfig)
                  : InvoiceGenerator.generateThermal(invoiceData, language, themeConfig);
                InvoiceGenerator.printInvoice(html);
              } catch (error) {
                console.error('Failed to auto-print invoice:', error);
              }
            }
          })();
        } catch (apiError: any) {
          // If API call fails (e.g., insufficient inventory), show error and stop
          const errorMessage = apiError?.response?.data?.error?.message || 
                              apiError?.message || 
                              'Failed to create order';
          
          // Check if it's an inventory error
          const isInventoryError = errorMessage.toLowerCase().includes('insufficient') || 
                                  errorMessage.toLowerCase().includes('inventory') || 
                                  errorMessage.toLowerCase().includes('stock');
          
          // Check if it's a customer-related error (duplicate phone, etc.)
          const isCustomerError = errorMessage.toLowerCase().includes('customer') || 
                                 errorMessage.toLowerCase().includes('phone number') ||
                                 errorMessage.toLowerCase().includes('already exists');
          
          // For customer errors and inventory errors, show the message directly without prefix
          // For other errors, show with prefix
          const displayMessage = (isInventoryError || isCustomerError)
            ? errorMessage 
            : `${t('pos.orderPlacedError', language)}: ${errorMessage}`;
          
          notifications.show({
            title: t('pos.orderPlacedError', language),
            message: displayMessage,
            color: getErrorColor(),
          });
          
          setIsPlacingOrder(false);
          return;
        }
    } catch (error) {
      console.error('Failed to place order:', error);
      notifications.show({
        title: t('pos.orderPlacedError', language),
        message: error instanceof Error ? error.message : 'Unknown error',
        color: getErrorColor(),
      });
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handlePrintInvoice = async () => {
    if (!placedOrder) return;

    try {
      // Fetch tenant and branch info for invoice
      const primaryFont = themeConfig?.typography.fontFamily.primary || 'var(--font-geist-sans), Arial, Helvetica, sans-serif';

      const tenant = await restaurantApi.getInfo();
      const branches = await restaurantApi.getBranches();
      const branch = branches.find(b => b.id === placedOrder.branchId);
      
      // Fetch full order details with customer info if needed
      let orderWithDetails: any = placedOrder;
      if (placedOrder.customerId && !(placedOrder as any).customer) {
        try {
          orderWithDetails = await ordersApi.getOrderById(placedOrder.id);
        } catch (error) {
          console.error('Failed to fetch order details:', error);
        }
      }
      
      // Prepare invoice data with all necessary information
      const invoiceData = {
        order: {
          ...orderWithDetails,
          orderType: orderWithDetails.orderType || placedOrder.orderType,
          paymentMethod: orderWithDetails.paymentMethod || placedOrderPaymentMethod,
          items: placedOrderItems.map((item: any) => ({
            ...item,
            foodItemName: item.foodItemName || (item as any).foodItemNameEn || (item as any).foodItemNameAr || '',
            variationName: item.variationName,
            addOns: item.addOns?.map((a: any) => ({
              addOnName: a.addOnName || a.addOn?.name || '',
            })) || [],
            quantity: item.quantity,
            subtotal: item.subtotal ?? (item.unitPrice ?? 0) * (item.quantity ?? 1),
          })),
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
        customerName: orderWithDetails.customer?.name || placedOrderCustomerName,
        customerPhone: orderWithDetails.customer?.phone || placedOrderCustomerPhone,
        customerAddress: undefined,
      };

      const template = settings?.invoice?.receiptTemplate === 'a4' ? 'a4' : 'thermal';
      const html = template === 'a4' 
        ? InvoiceGenerator.generateA4(invoiceData, language)
        : InvoiceGenerator.generateThermal(invoiceData, language);
      InvoiceGenerator.printInvoice(html);
    } catch (error) {
      console.error('Failed to print invoice:', error);
      notifications.show({
        title: t('common.error' as any, language) || 'Error',
        message: 'Failed to generate invoice',
        color: getErrorColor(),
      });
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column', borderLeft: `1px solid var(--mantine-color-gray-3)`, overflow: 'hidden', minHeight: 0 }}>
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'thin', // Firefox
          msOverflowStyle: 'auto', // IE/Edge
        }}
        className="custom-scrollbar"
      >
        <Box p="md" pb="xl">
          <Stack gap="md">
          {/* Order Type Selection */}
          <Box>
            <Text fw={500} size="sm" mb="xs">
              {t('pos.orderType', language)}
            </Text>
            <SegmentedControl
              className="order-type-selector"
              fullWidth
              value={orderType}
              onChange={(value) => onOrderTypeChange(value as 'dine_in' | 'takeaway' | 'delivery')}
              data={useMemo(() => {
                const options = [
                  { label: t('pos.dineIn', language), value: 'dine_in' },
                ];
                // Hide takeaway and delivery when in buffet mode
                if (!isBuffetMode) {
                  options.push({ label: t('pos.takeaway', language), value: 'takeaway' });
                  if (enableDeliveryManagement) {
                    options.push({ label: t('pos.delivery', language), value: 'delivery' });
                  }
                }
                return options;
              }, [isBuffetMode, enableDeliveryManagement, language])}
            />
          </Box>

          {/* Customer Selection */}
          <Box>
            <Text fw={500} size="sm" mb="xs">
              {t('pos.customerInformation', language)}
            </Text>
            <Group gap="xs">
              {submittingCustomer ? (
                <Group gap="xs" style={{ flex: 1 }}>
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    {t('pos.creatingCustomer' as any, language) || 'Creating customer...'}
                  </Text>
                </Group>
              ) : (
                <Select
                  placeholder={t('pos.selectCustomer', language)}
                  data={[
                    { value: 'walk-in', label: t('pos.walkInCustomer', language) },
                    ...customers.map((c) => ({
                      value: c.id,
                      label: `${c.name} (${c.phone})`,
                    })),
                  ]}
                  value={selectedCustomerId || 'walk-in'}
                  onChange={(value) => {
                    if (value === 'walk-in') {
                      onCustomerChange(null);
                    } else if (value) {
                      onCustomerChange(value);
                    }
                  }}
                  style={{ flex: 1 }}
                />
              )}
              <Tooltip
                label={!isOnline ? (t('pos.customerOfflineDisabled' as any, language) || 'Customer creation is not available offline') : ''}
                disabled={isOnline}
              >
                <Button
                  variant="light"
                  size="sm"
                  onClick={() => setCustomerModalOpened(true)}
                  disabled={!isOnline || submittingCustomer}
                  style={{ 
                    color: primaryShade,
                    opacity: !isOnline || submittingCustomer ? 0.5 : 1,
                    cursor: !isOnline || submittingCustomer ? 'not-allowed' : 'pointer',
                  }}
                >
                  <IconUser size={16} />
                </Button>
              </Tooltip>
            </Group>
          </Box>

          {/* Address Input (for delivery) */}
          {orderType === 'delivery' && (
            <Stack gap="xs">
              <Text fw={500} size="sm">
                {t('delivery.address' as any, language) || 'Delivery Address'}
              </Text>
              <Stack gap="xs">
                <TextInput
                  label={t('customers.address' as any, language) || 'Address'}
                  placeholder={t('customers.address' as any, language) || 'Enter delivery address'}
                  value={newAddress}
                  onChange={(e) => {
                    setNewAddress(e.target.value);
                    // Clear selected address ID if user modifies the address
                    setSelectedAddressId(null);
                  }}
                  required
                />
                <Group grow>
                  <TextInput
                    label={t('customers.city' as any, language) || 'City'}
                    placeholder={t('customers.city' as any, language) || 'City'}
                    value={newAddressCity}
                    onChange={(e) => {
                      setNewAddressCity(e.target.value);
                      setSelectedAddressId(null);
                    }}
                  />
                  <TextInput
                    label={t('customers.state' as any, language) || 'State'}
                    placeholder={t('customers.state' as any, language) || 'State'}
                    value={newAddressState}
                    onChange={(e) => {
                      setNewAddressState(e.target.value);
                      setSelectedAddressId(null);
                    }}
                  />
                </Group>
                <TextInput
                  label={t('customers.country' as any, language) || 'Country'}
                  placeholder={t('customers.country' as any, language) || 'Country'}
                  value={newAddressCountry}
                  onChange={(e) => {
                    setNewAddressCountry(e.target.value);
                    setSelectedAddressId(null);
                  }}
                />
              </Stack>
            </Stack>
          )}

          {/* Table Selection (for dine-in) */}
          {orderType === 'dine_in' && enableTableManagement && (
            <Paper withBorder p="md" radius="md" style={{ backgroundColor: themeColors.colorCard }}>
              <Stack gap="md">
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <IconTable size={18} color={primaryColor} />
                    <Text fw={600} size="sm">
                {t('pos.tableSelection', language)}
              </Text>
                    {selectedTableIds.length > 0 && (
                      <Badge
                        size="sm"
                        variant="filled"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {selectedTableIds.length} {selectedTableIds.length === 1 ? (t('pos.table', language) || 'table') : (t('pos.tables', language) || 'tables')}
                      </Badge>
                    )}
                  </Group>
                </Group>

                <Group gap="md" align="flex-start" grow>
                <Box style={{ flex: 1 }}>
                    <Text fw={500} size="xs" mb={6} c="dimmed">
                    {t('pos.tableNo', language) || 'Table No'}
                  </Text>
                    {onTableIdsChange ? (
                      <MultiSelect
                        placeholder={t('pos.selectTables', language) || t('pos.selectTable', language) || 'Select Tables'}
                        value={selectedTableIds}
                        onChange={(values) => {
                          onTableIdsChange(values);
                        }}
                        data={tables.map((table) => {
                          const tableNum = (table as any).tableNumber || (table as any).table_number || '';
                          const tableLabelText = t('pos.tableLabel' as any, language) || 'Table';
                          return {
                            value: table.id,
                            label: `${tableLabelText} ${tableNum}`,
                          };
                        })}
                        leftSection={<IconTable size={16} color={primaryColor} />}
                        searchable
                        clearable
                        disabled={tables.length === 0}
                        maxDropdownHeight={200}
                        styles={{
                          input: {
                            borderColor: selectedTableIds.length > 0 ? primaryColor : undefined,
                            borderWidth: selectedTableIds.length > 0 ? 2 : undefined,
                            '&:focus': {
                              borderColor: primaryColor,
                              borderWidth: 2,
                            },
                          },
                          section: {
                            color: `${primaryColor} !important`,
                            '& svg': {
                              color: `${primaryColor} !important`,
                            },
                          },
                          option: {
                            '&[dataSelected="true"]': {
                              backgroundColor: `${primaryColor}20`,
                              color: primaryColor,
                              fontWeight: 600,
                            },
                            '&:hover': {
                              backgroundColor: `${primaryColor}10`,
                            },
                          },
                        }}
                      />
                    ) : (
                      <Select
                        placeholder={t('pos.selectTable', language) || 'Select Table'}
                        value={selectedTableId}
                        onChange={(value) => onTableChange(value)}
                        data={tables.map((table) => {
                          const tableNum = (table as any).tableNumber || (table as any).table_number || '';
                          const tableLabelText = t('pos.tableLabel' as any, language) || 'Table';
                          return {
                            value: table.id,
                            label: `${tableLabelText} ${tableNum}`,
                          };
                        })}
                        leftSection={<IconTable size={16} color={primaryColor} />}
                        searchable
                        clearable
                        disabled={tables.length === 0}
                        styles={{
                          input: {
                            '&:focus': {
                              borderColor: primaryColor,
                              borderWidth: 2,
                            },
                          },
                          section: {
                            color: `${primaryColor} !important`,
                            '& svg': {
                              color: `${primaryColor} !important`,
                            },
                          },
                          option: {
                            '&[dataSelected="true"]': {
                              backgroundColor: `${primaryColor}20`,
                              color: primaryColor,
                              fontWeight: 600,
                            },
                            '&:hover': {
                              backgroundColor: `${primaryColor}10`,
                            },
                          },
                        }}
                      />
                    )}

                    {/* Selected Tables Display */}
                    {selectedTableIds.length > 0 && (
                      <Flex gap="xs" mt={8} wrap="wrap">
                        {selectedTableIds.map((tableId) => {
                          const table = tables.find((t) => t.id === tableId);
                          const tableNum = table ? ((table as any).tableNumber || (table as any).table_number || '') : '';
                          return (
                            <Tooltip key={tableId} label={t('pos.removeTable', language) || 'Remove table'} withArrow>
                              <Badge
                                size="lg"
                                variant="light"
                                color={primaryColor}
                                rightSection={
                                  <ActionIcon
                                    size="xs"
                                    color={primaryColor}
                                    radius="xl"
                                    variant="subtle"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onTableIdsChange) {
                                        onTableIdsChange(selectedTableIds.filter((id) => id !== tableId));
                                      }
                                    }}
                                    style={{ 
                                      marginLeft: 4,
                                      color: primaryColor,
                                    }}
                                  >
                                    <IconX size={12} color={primaryColor} />
                                  </ActionIcon>
                                }
                                style={{
                                  cursor: 'pointer',
                                  paddingRight: 4,
                                  border: `1px solid ${primaryColor}40`,
                                  backgroundColor: `${primaryColor}15`,
                                  color: primaryColor,
                                  transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = `${primaryColor}25`;
                                  e.currentTarget.style.borderColor = primaryColor;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = `${primaryColor}15`;
                                  e.currentTarget.style.borderColor = `${primaryColor}40`;
                                }}
                              >
                                <Group gap={4}>
                                  <IconTable size={14} color={primaryColor} />
                                  <Text fw={600} size="xs" c={primaryColor}>
                                    {tableNum}
                                  </Text>
                                </Group>
                              </Badge>
                            </Tooltip>
                          );
                        })}
                      </Flex>
                    )}

                    {tables.length === 0 && (
                      <Text size="xs" c="dimmed" mt={6} style={{ fontStyle: 'italic' }}>
                        {settings?.general?.totalTables 
                          ? (t('pos.noAvailableTables', language) || 'No available tables. All tables are currently occupied.')
                          : (t('pos.noTablesConfigured', language) || 'No tables configured. Please set total number of tables in settings.')}
                      </Text>
                    )}
                </Box>

                  <Box style={{ width: 140 }}>
                    <Text fw={500} size="xs" mb={6} c="dimmed">
                    {t('pos.numberOfPersons', language)}
                  </Text>
                  <NumberInput
                    placeholder={t('pos.numberOfPersons', language)}
                    value={numberOfPersons}
                    onChange={(value) => onNumberOfPersonsChange(typeof value === 'number' ? value : 1)}
                    min={1}
                      max={50}
                      leftSection={<IconUser size={16} color={primaryColor} />}
                      styles={{
                        input: {
                          borderColor: numberOfPersons > 0 ? primaryColor : undefined,
                          '&:focus': {
                            borderColor: primaryColor,
                            borderWidth: 2,
                          },
                        },
                        section: {
                          color: `${primaryColor} !important`,
                          '& svg': {
                            color: `${primaryColor} !important`,
                          },
                        },
                        control: {
                          '&:hover': {
                            backgroundColor: `${primaryColor}10`,
                            borderColor: primaryColor,
                          },
                        },
                      }}
                  />
                </Box>
              </Group>
            </Stack>
            </Paper>
          )}

          <Divider />

          {/* Cart Items */}
          <Box>
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="lg">
                {t('pos.cart', language)} ({cartItems.length} {cartItems.length === 1 ? t('pos.item', language) : t('pos.items', language)})
              </Text>
              {cartItems.length > 0 && (
                <Button
                  variant="subtle"
                  color={getErrorColor()}
                  size="xs"
                  onClick={onClearCart}
                >
                  {t('pos.clearCart', language)}
                </Button>
              )}
            </Group>

            {cartItems.length === 0 ? (
              <Box style={{ textAlign: 'center', padding: '2rem' }}>
                <IconShoppingCart size={48} style={{ opacity: 0.3, margin: '0 auto' }} />
                <Text c="dimmed" mt="md">
                  {t('pos.cartEmpty', language)}
                </Text>
              </Box>
            ) : (
              <Stack gap="xs">
                {cartItems.map((item, index) => (
                  <Paper key={index} p="sm" withBorder radius="md">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={500} size="sm" lineClamp={1}>
                          {(item as any).foodItemName || (item as any).foodItemNameEn || (item as any).foodItemNameAr || ''}
                        </Text>
                        <ActionIcon
                          color={getErrorColor()}
                          variant="subtle"
                          size="sm"
                          onClick={() => onRemoveItem(index)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>

                      {item.variationName && (
                        <Text size="xs" c="dimmed">
                          {resolveVariationGroupName(item.variationGroup)}: {item.variationName}
                        </Text>
                      )}

                      {item.addOns && item.addOns.length > 0 && (
                        <Text size="xs" c="dimmed">
                          {t('pos.addOns', language)}:{' '}
                          {item.addOns.map((a) => (a as any).addOnName || (a as any).addOn?.name || '').join(', ')}
                        </Text>
                      )}

                      <Group justify="space-between">
                        <Group gap="xs">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={() => {
                              if (item.quantity > 1) {
                                const unitPrice = item.unitPrice ?? 0;
                                const newQuantity = item.quantity - 1;
                                onUpdateItem(index, { ...item, quantity: newQuantity, subtotal: unitPrice * newQuantity });
                              }
                            }}
                          >
                            <IconMinus size={14} />
                          </ActionIcon>
                          <Text size="sm" fw={500}>
                            {item.quantity}
                          </Text>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={() => {
                              const unitPrice = item.unitPrice ?? 0;
                              const newQuantity = item.quantity + 1;
                              onUpdateItem(index, { ...item, quantity: newQuantity, subtotal: unitPrice * newQuantity });
                            }}
                          >
                            <IconPlus size={14} />
                          </ActionIcon>
                        </Group>

                        <Group gap="xs">
                          <Text size="sm" fw={600} c={primaryColor}>
                            {formatCurrency(item.subtotal, currency)}
                          </Text>
                          <Button
                            variant={editingItemLoadingIndex === index ? "filled" : "subtle"}
                            size="xs"
                            color={primaryColor}
                            onClick={() => handleEditItem(index, item)}
                            loading={editingItemLoadingIndex === index}
                            disabled={editingItemLoadingIndex === index}
                            loaderProps={{ size: 14 }}
                            style={{ minWidth: '60px' }}
                          >
                            {t('common.edit' as any, language) || 'Edit'}
                          </Button>
                        </Group>
                      </Group>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>

          {/* Billing Summary */}
          {cartItems.length > 0 && (
            <>
              <Divider />
              <Stack gap="md">
              <Text fw={600} size="sm">
                {t('pos.billingSummary', language)}
              </Text>

              {/* Subtotal */}
              <Group justify="space-between">
                <Text size="sm">{t('pos.subtotal', language)}:</Text>
                <Text size="sm" fw={500}>
                  {formatCurrency(calculateSubtotal(), currency)}
                </Text>
              </Group>

              {/* Discount Section */}
              <Stack gap="xs">
                <Group gap="xs" align="flex-end">
                  <Box style={{ flex: 1 }}>
                    <Text fw={500} size="xs" mb={4}>
                      {t('pos.manualDiscount', language)}
                    </Text>
                    <NumberInput
                      placeholder={t('pos.enterDiscount', language)}
                      value={manualDiscount}
                      onChange={(value) => setManualDiscount(typeof value === 'number' ? value : 0)}
                      min={0}
                      max={orderCalculatorService.calculateSubtotal(cartItems)}
                      leftSection={<IconDiscount size={16} />}
                      allowDecimal={true}
                      allowNegative={false}
                    />
                  </Box>
                  <Box style={{ flex: 1 }}>
                    <Text fw={500} size="xs" mb={4}>
                      {t('pos.couponCode', language)}
                    </Text>
                    <TextInput
                      placeholder={t('pos.enterCoupon', language)}
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value);
                        // Clear applied discount if coupon code is removed
                        if (!e.target.value) {
                          setAppliedCouponDiscount(0);
                          setAppliedCouponId(null);
                        }
                      }}
                      disabled={isValidatingCoupon}
                    />
                  </Box>
                  <Button
                    size="xs"
                    onClick={handleApplyCoupon}
                    disabled={!couponCode || isValidatingCoupon}
                    loading={isValidatingCoupon}
                    style={{ marginTop: '20px' }}
                  >
                    {t('pos.applyCoupon', language)}
                  </Button>
                </Group>
                {(() => {
                  const loyaltyDiscount = getLoyaltyTierDiscount();
                  const totalDiscount = calculateDiscount();
                  
                  return (
                    <>
                      {loyaltyDiscount > 0 && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">
                            {t('pos.loyaltyDiscount', language) || 'Loyalty Discount'} ({selectedCustomerData?.loyaltyTier ? t(`customers.loyaltyTier.${selectedCustomerData.loyaltyTier}` as any, language) || selectedCustomerData.loyaltyTier : ''}):
                          </Text>
                          <Text size="sm" fw={500} c={getSuccessColor()}>
                            -{formatCurrency(loyaltyDiscount, currency)}
                          </Text>
                        </Group>
                      )}
                      {totalDiscount > 0 && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">
                            {t('pos.discount', language)}:
                          </Text>
                          <Text size="sm" fw={500} c={getSuccessColor()}>
                            -{formatCurrency(totalDiscount, currency)}
                          </Text>
                        </Group>
                      )}
                    </>
                  );
                })()}
              </Stack>

              {/* Tax */}
              {(() => {
                const tax = calculatedTax;
                if (tax > 0 && settings?.tax?.enableTaxSystem) {
                  return (
                    <Stack gap="xs">
                      {taxBreakdown.length > 0 ? (
                        taxBreakdown.map((taxItem, index) => (
                          <Group key={index} justify="space-between">
                            <Text size="sm">
                              {taxItem.name} ({taxItem.rate}%):
                            </Text>
                            <Text size="sm" fw={500}>
                              {formatCurrency(taxItem.amount, currency)}
                            </Text>
                          </Group>
                        ))
                      ) : (
                        <Group justify="space-between">
                          <Text size="sm">{t('pos.tax', language)}:</Text>
                          <Text size="sm" fw={500}>
                            {formatCurrency(tax, currency)}
                          </Text>
                        </Group>
                      )}
                      {taxBreakdown.length > 1 && (
                        <Group justify="space-between" pt="xs" style={{ borderTop: '1px solid #e0e0e0' }}>
                          <Text size="sm" fw={600}>{t('pos.totalTax' as any, language) || 'Total Tax'}:</Text>
                          <Text size="sm" fw={600}>
                            {formatCurrency(tax, currency)}
                          </Text>
                        </Group>
                      )}
                    </Stack>
                  );
                }
                return null;
              })()}

              {/* Delivery Charge */}
              {orderType === 'delivery' && (
                <Group gap="xs" align="flex-end">
                  <Box style={{ flex: 1 }}>
                    <Text size="xs" mb={4}>
                      {t('pos.deliveryCharge', language)}:
                    </Text>
                    <NumberInput
                      value={deliveryCharge}
                      onChange={(value) => setDeliveryCharge(typeof value === 'number' ? value : 0)}
                      min={0}
                      allowDecimal={true}
                      allowNegative={false}
                    />
                  </Box>
                </Group>
              )}

              {/* Grand Total */}
              <Divider />
              <Group justify="space-between">
                <Text fw={700} size="lg">
                  {t('pos.grandTotal', language)}:
                </Text>
                <Text fw={700} size="xl" c={primaryColor}>
                  {formatCurrency(calculateGrandTotal(), currency)}
                </Text>
              </Group>

              {/* Order Special Instructions */}
              <Box>
                <Textarea
                  label={t('pos.specialInstructions', language)}
                  placeholder={t('pos.specialInstructions', language)}
                  value={orderSpecialInstructions}
                  onChange={(e) => setOrderSpecialInstructions(e.target.value)}
                  rows={3}
                />
              </Box>

              {/* Payment Method */}
              <Box>
                <Text fw={500} size="sm" mb="xs">
                  {t('pos.paymentMethod', language)}
                </Text>
                <SegmentedControl
                  className="order-type-selector"
                  fullWidth
                  value={paymentMethod || ''}
                  onChange={(value) => setPaymentMethod(value as any)}
                  data={enabledPaymentMethods}
                />
              </Box>

              {/* Place Order Button */}
              <Button
                fullWidth
                size="lg"
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || !paymentMethod}
                loading={isPlacingOrder}
                style={{ backgroundColor: primaryShade }}
              >
                {isPlacingOrder 
                  ? t('pos.processing', language) 
                  : editingOrderId 
                    ? (t('pos.updateOrder', language) || 'Update Order')
                    : t('pos.placeOrder', language)}
              </Button>
              </Stack>
            </>
          )}
          </Stack>
        </Box>
      </Box>

      {/* New Customer Modal */}
      <Modal
        opened={customerModalOpened}
        onClose={() => {
          if (submittingCustomer) return;
          setCustomerModalOpened(false);
          setNewCustomerName('');
          setNewCustomerPhone('');
          setNewCustomerEmail('');
        }}
        title={t('pos.newCustomer', language)}
        centered
        closeOnClickOutside={!submittingCustomer}
        closeOnEscape={!submittingCustomer}
      >
        <Stack gap="md">
          <TextInput
            label={t('pos.customerName', language)}
            placeholder={t('pos.customerName', language)}
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            required
            disabled={submittingCustomer}
          />
          <TextInput
            label={t('pos.customerPhone', language)}
            placeholder={t('pos.customerPhone', language)}
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            required
            disabled={submittingCustomer}
          />
          <TextInput
            label={t('pos.customerEmail', language)}
            placeholder={t('pos.customerEmail', language)}
            value={newCustomerEmail}
            onChange={(e) => setNewCustomerEmail(e.target.value)}
            type="email"
            disabled={submittingCustomer}
          />
          <Button
            fullWidth
            onClick={handleCreateCustomer}
            disabled={!newCustomerName || !newCustomerPhone || submittingCustomer}
            loading={submittingCustomer}
            style={{ backgroundColor: primaryShade }}
          >
            {t('common.save' as any, language) || 'Save'}
          </Button>
        </Stack>
      </Modal>

      {/* Edit Item Modal */}
      {editingItem && editingItemIndex !== null && (
        <ItemSelectionModal
          opened={!!editingItem}
          onClose={() => {
            setEditingItem(null);
            setEditingItemIndex(null);
          }}
          foodItem={editingItem}
          existingCartItem={cartItems[editingItemIndex]}
          onItemSelected={(updatedItem) => {
            handleItemUpdated(updatedItem);
          }}
        />
      )}

      {/* Invoice Modal */}
      <Modal
        opened={invoiceModalOpened}
        onClose={() => {
          setInvoiceModalOpened(false);
          setPlacedOrder(null);
          setPlacedOrderItems([]);
          setPlacedOrderPaymentMethod(null);
          setPlacedOrderCustomerName(undefined);
          setPlacedOrderCustomerPhone(undefined);
        }}
        title={t('pos.invoice', language)}
        size="lg"
        centered
      >
        {placedOrder && (
          <Stack gap="md">
            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={500}>{t('pos.orderNumber', language)}:</Text>
                  <Text>{placedOrder.orderNumber}</Text>
                </Group>
                {placedOrder.tokenNumber && (
                  <Group justify="space-between">
                    <Text fw={500}>{t('pos.tokenNumber', language)}:</Text>
                    <Text fw={600} size="lg" c={primaryColor}>
                      {placedOrder.tokenNumber}
                    </Text>
                  </Group>
                )}
                <Group justify="space-between">
                  <Text fw={500}>{t('pos.orderDate', language)}:</Text>
                  <Text>{new Date(placedOrder.orderDate).toLocaleString()}</Text>
                </Group>
              </Stack>
            </Paper>

            <Divider />

            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm">{t('pos.subtotal', language)}:</Text>
                <Text size="sm">{formatCurrency(placedOrder.subtotal, currency)}</Text>
              </Group>
              {placedOrder.discountAmount > 0 && (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">{t('pos.discount', language)}:</Text>
                  <Text size="sm" c={getSuccessColor()}>-{formatCurrency(placedOrder.discountAmount, currency)}</Text>
                </Group>
              )}
              {placedOrder.taxAmount > 0 && (
                <Group justify="space-between">
                  <Text size="sm">{t('pos.tax', language)}:</Text>
                  <Text size="sm">{formatCurrency(placedOrder.taxAmount, currency)}</Text>
                </Group>
              )}
              {placedOrder.deliveryCharge > 0 && (
                <Group justify="space-between">
                  <Text size="sm">{t('pos.deliveryCharge', language)}:</Text>
                  <Text size="sm">{formatCurrency(placedOrder.deliveryCharge, currency)}</Text>
                </Group>
              )}
              <Divider />
              <Group justify="space-between">
                <Text fw={700} size="lg">{t('pos.grandTotal', language)}:</Text>
                <Text fw={700} size="xl" c={primaryColor}>
                  {formatCurrency(
                    placedOrder.totalAmount || 
                    (placedOrder.subtotal - (placedOrder.discountAmount || 0) + (placedOrder.taxAmount || 0) + (placedOrder.deliveryCharge || 0)),
                    currency
                  )}
                </Text>
              </Group>
            </Stack>

            <Group>
              <Button
                fullWidth
                leftSection={<IconPrinter size={16} />}
                onClick={handlePrintInvoice}
                style={{ backgroundColor: primaryShade }}
              >
                {t('pos.printInvoice', language)}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}

