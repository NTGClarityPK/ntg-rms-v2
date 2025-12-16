'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Stack,
  Text,
  ScrollArea,
  Group,
  Button,
  SegmentedControl,
  Select,
  NumberInput,
  Divider,
  Badge,
  ActionIcon,
  Paper,
  Modal,
  TextInput,
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
  IconCheck,
} from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { db, Order, OrderItem } from '@/lib/indexeddb/database';
import { CartItem, RestaurantTable } from '@/lib/indexeddb/database';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { getSuccessColor, getErrorColor } from '@/lib/utils/theme';
import { useCurrency } from '@/lib/hooks/use-currency';
import { ItemSelectionModal } from './ItemSelectionModal';
import { useAuthStore } from '@/lib/store/auth-store';
import { syncService } from '@/lib/sync/sync-service';
import { notifications } from '@mantine/notifications';
import apiClient from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/constants/api';
import { ordersApi } from '@/lib/api/orders';
import { customersApi } from '@/lib/api/customers';
import { useSettings } from '@/lib/hooks/use-settings';
import { InvoiceGenerator } from '@/lib/utils/invoice-generator';
import { restaurantApi } from '@/lib/api/restaurant';
import { taxesApi, Tax } from '@/lib/api/taxes';

interface POSCartProps {
  cartItems: CartItem[];
  onRemoveItem: (index: number) => void;
  onUpdateItem: (index: number, item: CartItem) => void;
  onClearCart: () => void;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  onOrderTypeChange: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
  selectedTableId: string | null;
  onTableChange: (tableId: string | null) => void;
  selectedCustomerId: string | null;
  onCustomerChange: (customerId: string | null) => void;
  numberOfPersons: number;
  onNumberOfPersonsChange: (count: number) => void;
  tenantId: string;
  branchId: string;
  editingOrderId?: string | null;
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
  selectedCustomerId,
  onCustomerChange,
  numberOfPersons,
  onNumberOfPersonsChange,
  tenantId,
  branchId,
  editingOrderId,
}: POSCartProps) {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { settings } = useSettings();
  const primaryColor = useThemeColor();
  const primaryShade = useThemeColorShade(6);
  const currency = useCurrency();
  const warningColor = useThemeColor();
  
  // Get settings flags
  const enableTableManagement = settings?.general?.enableTableManagement ?? true;
  const enableDeliveryManagement = settings?.general?.enableDeliveryManagement ?? true;
  const autoPrintInvoices = settings?.general?.autoPrintInvoices ?? false;
  const minimumDeliveryOrderAmount = settings?.general?.minimumDeliveryOrderAmount ?? 0;
  
  // Get payment method settings - only show methods that are explicitly enabled
  // Note: We check for explicit true values, not just truthy values
  const paymentMethods = settings?.paymentMethods;
  
  // Build enabled payment methods array - only include methods that are explicitly set to true
  const enabledPaymentMethods: Array<{ label: string; value: string }> = [];
  
  if (paymentMethods?.enableCash === true) {
    enabledPaymentMethods.push({ label: t('pos.cash', language), value: 'cash' });
  }
  if (paymentMethods?.enableCard === true) {
    enabledPaymentMethods.push({ label: t('pos.card', language), value: 'card' });
  }
  if (paymentMethods?.enableZainCash === true) {
    enabledPaymentMethods.push({ label: t('pos.zainCash' as any, language) || 'ZainCash', value: 'zainCash' });
  }
  if (paymentMethods?.enableAsiaHawala === true) {
    enabledPaymentMethods.push({ label: t('pos.asiaHawala' as any, language) || 'Asia Hawala', value: 'asiaHawala' });
  }
  if (paymentMethods?.enableBankTransfer === true) {
    enabledPaymentMethods.push({ label: t('pos.bankTransfer' as any, language) || 'Bank Transfer', value: 'bankTransfer' });
  }
  
  // If no payment methods are enabled, default to cash to prevent empty state
  if (enabledPaymentMethods.length === 0) {
    enabledPaymentMethods.push({ label: t('pos.cash', language), value: 'cash' });
  }
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerData, setSelectedCustomerData] = useState<any>(null);
  const [customerModalOpened, setCustomerModalOpened] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
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
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [placedOrderItems, setPlacedOrderItems] = useState<CartItem[]>([]);
  // Address handling for delivery orders
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [newAddressEn, setNewAddressEn] = useState<string>('');
  const [newAddressAr, setNewAddressAr] = useState<string>('');
  const [newAddressCity, setNewAddressCity] = useState<string>('');
  const [newAddressState, setNewAddressState] = useState<string>('');
  const [newAddressCountry, setNewAddressCountry] = useState<string>('');

  useEffect(() => {
    if (tenantId) {
      loadCustomers();
      loadActiveTaxes();
    }
    if (branchId) {
      loadTables();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, branchId]);

  const loadActiveTaxes = async () => {
    try {
      const allTaxes = await taxesApi.getTaxes();
      const active = allTaxes.filter((tax) => tax.isActive);
      setActiveTaxes(active);
    } catch (error) {
      console.error('Failed to load taxes:', error);
      // Try to load from IndexedDB if online fails
      try {
        const cachedTaxes = await db.taxes.toArray();
        const active = cachedTaxes.filter((tax) => tax.isActive);
        setActiveTaxes(active as Tax[]);
      } catch (dbError) {
        console.error('Failed to load taxes from IndexedDB:', dbError);
      }
    }
  };

  // Load customer data when selected customer changes
  useEffect(() => {
    const loadSelectedCustomer = async () => {
      if (!selectedCustomerId) {
        setSelectedCustomerData(null);
        setSelectedAddressId(null);
        setNewAddressEn('');
        setNewAddressAr('');
        setNewAddressCity('');
        setNewAddressState('');
        return;
      }

      try {
        // Try to get from IndexedDB first
        const customer = await db.customers.get(selectedCustomerId);
        if (customer) {
          setSelectedCustomerData(customer);
          
          // If online, fetch latest data to ensure loyalty tier and addresses are up to date
          if (navigator.onLine) {
            try {
              const latestCustomer = await customersApi.getCustomerById(selectedCustomerId);
              setSelectedCustomerData(latestCustomer);
              // Update IndexedDB with latest data
              await db.customers.put({
                ...latestCustomer,
                lastSynced: new Date().toISOString(),
                syncStatus: 'synced',
              } as any);
              
              // If customer has addresses and order type is delivery, prefill address fields
              if (orderType === 'delivery' && latestCustomer.addresses && latestCustomer.addresses.length > 0) {
                const defaultAddress = latestCustomer.addresses.find((addr) => addr.isDefault) || latestCustomer.addresses[0];
                if (defaultAddress) {
                  // Prefill address input fields with existing address
                  setNewAddressEn(defaultAddress.addressEn || '');
                  setNewAddressAr(defaultAddress.addressAr || '');
                  setNewAddressCity(defaultAddress.city || '');
                  setNewAddressState(defaultAddress.state || '');
                  setNewAddressCountry(defaultAddress.country || '');
                  // Store the address ID so we can use it if address hasn't changed
                  setSelectedAddressId(defaultAddress.id);
                }
              } else if (orderType === 'delivery') {
                // No addresses - clear fields
                setNewAddressEn('');
                setNewAddressAr('');
                setNewAddressCity('');
                setNewAddressState('');
                setSelectedAddressId(null);
              }
            } catch (error) {
              console.error('Failed to fetch latest customer data:', error);
              // Use IndexedDB data if API fails
            }
          } else if (customer && orderType === 'delivery') {
            // Offline: check if customer has addresses in IndexedDB
            // Note: IndexedDB customer might not have addresses, so we'll show input fields
            // Try to prefill from IndexedDB customer data if available
            if ((customer as any).addresses && (customer as any).addresses.length > 0) {
              const defaultAddress = (customer as any).addresses.find((addr: any) => addr.isDefault) || (customer as any).addresses[0];
              if (defaultAddress) {
                setNewAddressEn(defaultAddress.addressEn || '');
                setNewAddressAr(defaultAddress.addressAr || '');
                setNewAddressCity(defaultAddress.city || '');
                setNewAddressState(defaultAddress.state || '');
                setNewAddressCountry(defaultAddress.country || '');
                setSelectedAddressId(defaultAddress.id);
              }
            } else {
              setSelectedAddressId(null);
            }
          }
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
      setNewAddressEn('');
      setNewAddressAr('');
      setNewAddressCity('');
      setNewAddressState('');
    }
  }, [orderType]);

  const loadTables = async () => {
    if (!branchId) return;
    try {
      const allTables = (await db.restaurantTables
        .where('branchId')
        .equals(branchId)
        .toArray()) as unknown as RestaurantTable[];
      
      const branchTables = allTables.filter((table) => !table.deletedAt);
      branchTables.sort((a, b) => {
        const aTableNum = (a as any).tableNumber || (a as any).table_number || '';
        const bTableNum = (b as any).tableNumber || (b as any).table_number || '';
        if (aTableNum && bTableNum) {
          return aTableNum.localeCompare(bTableNum, undefined, { numeric: true, sensitivity: 'base' });
        }
        return 0;
      });

      setTables(branchTables);
    } catch (error) {
      console.error('Failed to load tables:', error);
    }
  };

  const loadCustomers = async () => {
    try {
      const allCustomers = await db.customers
        .where('tenantId')
        .equals(tenantId)
        .filter((customer) => !customer.deletedAt)
        .sortBy('nameEn');

      setCustomers(allCustomers);
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
  };

  const handleEditItem = async (index: number, item: CartItem) => {
    // Load food item details
    const foodItem = await db.foodItems.get(item.foodItemId);
    if (foodItem) {
      setEditingItem({ ...foodItem, cartItemIndex: index });
      setEditingItemIndex(index);
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
    try {
      // If online, create customer via API first
      if (navigator.onLine) {
        try {
          const createdCustomer = await customersApi.createCustomer({
            nameEn: newCustomerName,
            nameAr: newCustomerName,
            phone: newCustomerPhone,
            email: newCustomerEmail || undefined,
          });

          // Save to IndexedDB with API response
          await db.customers.put({
            ...createdCustomer,
            lastSynced: new Date().toISOString(),
            syncStatus: 'synced',
          } as any);

          // Refresh customers list
          await loadCustomers();
          
          // Select the newly created customer
          onCustomerChange(createdCustomer.id);
          
          // Close modal and clear fields
          setCustomerModalOpened(false);
          setNewCustomerName('');
          setNewCustomerPhone('');
          setNewCustomerEmail('');

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
          return;
        }
      } else {
        // Offline: create customer in IndexedDB and queue for sync
        const customerId = `customer-${Date.now()}`;
        const newCustomer = {
          id: customerId,
          tenantId,
          nameEn: newCustomerName,
          nameAr: newCustomerName,
          phone: newCustomerPhone,
          email: newCustomerEmail || undefined,
          totalOrders: 0,
          totalSpent: 0,
          averageOrderValue: 0,
          loyaltyTier: 'regular' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending' as const,
        };

        await db.customers.add(newCustomer);
        
        // Queue for sync
        await syncService.queueChange('customers', 'CREATE', customerId, newCustomer);
        
        await loadCustomers();
        onCustomerChange(customerId);
        setCustomerModalOpened(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setNewCustomerEmail('');

        // Show warning notification
        notifications.show({
          title: t('customers.createSuccess' as any, language) || 'Customer Created',
          message: (t('customers.createSuccess' as any, language) || 'Customer created successfully') + ' (Will sync when online)',
          color: warningColor,
          icon: <IconCheck size={16} />,
        });
      }
    } catch (error) {
      console.error('Failed to create customer:', error);
      notifications.show({
        title: t('pos.orderPlacedError', language),
        message: error instanceof Error ? error.message : 'Failed to create customer',
        color: getErrorColor(),
      });
    }
  };

  const calculateSubtotal = useCallback(() => {
    return cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  }, [cartItems]);

  const getLoyaltyTierDiscount = useCallback(() => {
    if (!selectedCustomerData?.loyaltyTier) return 0;
    
    const tierDiscounts: Record<string, number> = {
      regular: 0,
      silver: 5,
      gold: 10,
      platinum: 15,
    };
    
    const discountPercent = tierDiscounts[selectedCustomerData.loyaltyTier] || 0;
    if (discountPercent === 0) return 0;
    
    const subtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
    return (subtotal * discountPercent) / 100;
  }, [selectedCustomerData?.loyaltyTier, cartItems]);

  const calculateDiscount = useCallback(() => {
    const loyaltyDiscount = getLoyaltyTierDiscount();
    return manualDiscount + appliedCouponDiscount + loyaltyDiscount;
  }, [manualDiscount, appliedCouponDiscount, getLoyaltyTierDiscount]);

  const calculateDeliveryCharge = useCallback(() => {
    return orderType === 'delivery' ? deliveryCharge : 0;
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

      const subtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
      const loyaltyDiscount = getLoyaltyTierDiscount();
      const discount = manualDiscount + appliedCouponDiscount + loyaltyDiscount;
      const taxableAmount = subtotal - discount;
      const delivery = orderType === 'delivery' ? deliveryCharge : 0;
      const serviceCharge = 0; // Not implemented yet

      // Prepare order items for tax calculation with categoryId
      const orderItemsForTax = await Promise.all(
        cartItems.map(async (item) => {
          // Fetch food item to get categoryId
          const foodItem = await db.foodItems.get(item.foodItemId);
          return {
            foodItemId: item.foodItemId,
            categoryId: foodItem?.categoryId,
            subtotal: item.subtotal,
          };
        })
      );

      let totalTax = 0;
      const breakdown: Array<{ name: string; rate: number; amount: number }> = [];

      for (const tax of activeTaxes) {
        let taxBaseAmount = 0;

        // Determine taxable amount based on appliesTo
        if (tax.appliesTo === 'order') {
          // Apply to entire order subtotal
          taxBaseAmount = taxableAmount;
        } else if (tax.appliesTo === 'category') {
          // Apply only to items in specified categories
          const categoryIds = tax.categoryIds || [];
          taxBaseAmount = orderItemsForTax
            .filter((item) => item.categoryId && categoryIds.includes(item.categoryId))
            .reduce((sum, item) => sum + item.subtotal, 0);
        } else if (tax.appliesTo === 'item') {
          // Apply only to specified items
          const foodItemIds = tax.foodItemIds || [];
          taxBaseAmount = orderItemsForTax
            .filter((item) => foodItemIds.includes(item.foodItemId))
            .reduce((sum, item) => sum + item.subtotal, 0);
        }

        // Add delivery charge if applicable
        if (tax.appliesToDelivery && delivery > 0) {
          taxBaseAmount += delivery;
        }

        // Add service charge if applicable
        if (tax.appliesToServiceCharge && serviceCharge > 0) {
          taxBaseAmount += serviceCharge;
        }

        if (taxBaseAmount > 0) {
          const taxAmount = (taxBaseAmount * tax.rate) / 100;
          totalTax += taxAmount;
          breakdown.push({
            name: tax.name,
            rate: tax.rate,
            amount: Math.round(taxAmount * 100) / 100,
          });
        }
      }

      setTaxBreakdown(breakdown);
      setCalculatedTax(Math.round(totalTax * 100) / 100);
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
      const subtotal = calculateSubtotal();
      const response = await apiClient.post(API_ENDPOINTS.COUPONS.VALIDATE, {
        code: couponCode.trim().toUpperCase(),
        subtotal,
        customerId: selectedCustomerId || undefined,
      });

      if (response.data) {
        setAppliedCouponDiscount(response.data.discount);
        setAppliedCouponId(response.data.couponId);
        notifications.show({
          title: t('pos.couponApplied', language) || 'Coupon Applied',
          message: `${t('pos.discount', language)}: ${response.data.discount.toFixed(2)} ${currency}`,
          color: getSuccessColor(),
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || t('pos.invalidCoupon', language);
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
        if (!selectedAddressId && !newAddressEn.trim()) {
          return t('delivery.addressRequired' as any, language) || 'Customer address is required for delivery orders';
        }
      } else {
        // Walk-in customer - must have address entered
        if (!newAddressEn.trim()) {
          return t('delivery.addressRequired' as any, language) || 'Delivery address is required for delivery orders';
        }
      }
      
      // Validate minimum delivery order amount
      const subtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
      if (minimumDeliveryOrderAmount > 0 && subtotal < minimumDeliveryOrderAmount) {
        return t('pos.minimumDeliveryAmount' as any, language) || 
               `Minimum delivery order amount is ${minimumDeliveryOrderAmount.toFixed(2)} ${currency}`;
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
      // Prepare order data
      const subtotal = calculateSubtotal();
      const discount = calculateDiscount();
      const tax = calculatedTax;
      const delivery = calculateDeliveryCharge();
      const total = calculateGrandTotal();

      // Handle address for delivery orders
      let finalAddressId: string | undefined = undefined;
      if (orderType === 'delivery') {
        // Check if address fields match an existing address (for existing customers)
        if (selectedAddressId && selectedCustomerId && selectedCustomerData?.addresses) {
          const existingAddress = selectedCustomerData.addresses.find((addr: any) => addr.id === selectedAddressId);
          if (existingAddress && 
              existingAddress.addressEn === newAddressEn.trim() &&
              (existingAddress.addressAr || '') === (newAddressAr.trim() || '') &&
              (existingAddress.city || '') === (newAddressCity.trim() || '') &&
              (existingAddress.state || '') === (newAddressState.trim() || '')) {
            // Address hasn't changed, use existing address ID
            finalAddressId = selectedAddressId;
          } else if (newAddressEn.trim() && selectedCustomerId) {
            // Address was modified or is new - create/update address
            // Create new address for existing customer
            try {
              const newAddress = await customersApi.createCustomerAddress(selectedCustomerId, {
                addressEn: newAddressEn.trim(),
                addressAr: newAddressAr.trim() || undefined,
                city: newAddressCity.trim() || undefined,
                state: newAddressState.trim() || undefined,
                country: newAddressCountry || undefined,
              });
              
              finalAddressId = newAddress.id;
              
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
        } else if (newAddressEn.trim() && selectedCustomerId) {
          // Create new address for existing customer
          try {
            const newAddress = await customersApi.createCustomerAddress(selectedCustomerId, {
              addressEn: newAddressEn.trim(),
              addressAr: newAddressAr.trim() || undefined,
              city: newAddressCity.trim() || undefined,
              state: newAddressState.trim() || undefined,
              country: newAddressCountry || undefined,
            });
            
            finalAddressId = newAddress.id;
            
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
        } else if (newAddressEn.trim() && !selectedCustomerId) {
          // Walk-in customer with address - allow order to proceed
          // The address will be stored in the delivery record, not as a customer address
          // finalAddressId remains undefined for walk-in customers
          finalAddressId = undefined;
        }
      }

      // Create order items for API
      const orderItemsForApi = cartItems.map((item) => ({
        foodItemId: item.foodItemId,
        quantity: item.quantity,
        variationId: item.variationId,
        addOns: item.addOns?.map((addOn) => ({
          addOnId: addOn.addOnId,
          quantity: addOn.quantity || 1,
        })),
        specialInstructions: item.specialInstructions,
      }));

      // Prepare order DTO for API
      const createOrderDto = {
        branchId,
        tableId: orderType === 'dine_in' ? selectedTableId || undefined : undefined,
        customerId: selectedCustomerId || undefined,
        orderType,
        items: orderItemsForApi,
        tokenNumber: orderType === 'dine_in' ? generateTokenNumber() : undefined,
        extraDiscountAmount: discount,
        couponCode: appliedCouponId ? couponCode : undefined,
        specialInstructions: undefined, // Can be added later if needed
        paymentTiming: 'pay_first' as const,
        // Map payment methods: zainCash, asiaHawala, bankTransfer -> card (electronic payments)
        paymentMethod: paymentMethod === 'zainCash' || paymentMethod === 'asiaHawala' || paymentMethod === 'bankTransfer' 
          ? 'card' 
          : (paymentMethod || 'cash') as 'cash' | 'card',
        customerAddressId: finalAddressId,
        // For walk-in customers, send address fields directly
        deliveryAddressEn: orderType === 'delivery' && !finalAddressId ? newAddressEn : undefined,
        deliveryAddressAr: orderType === 'delivery' && !finalAddressId ? newAddressAr : undefined,
        deliveryAddressCity: orderType === 'delivery' && !finalAddressId ? newAddressCity : undefined,
        deliveryAddressState: orderType === 'delivery' && !finalAddressId ? newAddressState : undefined,
        deliveryAddressCountry: orderType === 'delivery' && !finalAddressId ? newAddressCountry : undefined,
        numberOfPersons: orderType === 'dine_in' ? numberOfPersons : undefined,
      };

      let createdOrder: Order | null = null;

      // If online, try to create or update order via API first (validates inventory)
      if (navigator.onLine) {
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
              deliveryAddressEn: createOrderDto.deliveryAddressEn,
              deliveryAddressAr: createOrderDto.deliveryAddressAr,
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
          const orderNumber = createdOrder.orderNumber;
          const tokenNumber = createdOrder.tokenNumber;

          // Create order object for IndexedDB (using API response data)
          const order: Order = {
            id: orderId,
            tenantId: createdOrder.tenantId,
            branchId: createdOrder.branchId,
            tableId: createdOrder.tableId,
            customerId: createdOrder.customerId,
            orderNumber,
            tokenNumber,
            orderType: createdOrder.orderType,
            status: createdOrder.status,
            paymentStatus: createdOrder.paymentStatus,
            subtotal: createdOrder.subtotal,
            discountAmount: createdOrder.discountAmount,
            taxAmount: createdOrder.taxAmount,
            deliveryCharge: createdOrder.deliveryCharge,
            totalAmount: createdOrder.totalAmount,
            orderDate: createdOrder.orderDate,
            createdAt: createdOrder.createdAt,
            updatedAt: createdOrder.updatedAt,
            syncStatus: 'synced',
          };

          // Create order items for IndexedDB (using API response data)
          // Note: API Order has items, but IndexedDB Order doesn't, so we need to fetch items separately
          // For now, we'll create order items from cart items since we have that data
          const orderItems: OrderItem[] = cartItems.map((item, index) => ({
            id: `order-item-${Date.now()}-${index}`,
            orderId,
            foodItemId: item.foodItemId,
            variationId: item.variationId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: 0,
            taxAmount: 0,
            subtotal: item.subtotal,
            specialInstructions: item.specialInstructions,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            syncStatus: 'synced',
          }));

          // Save to IndexedDB (update if editing, add if new)
          if (editingOrderId) {
            // Update existing order
            await db.orders.update(editingOrderId, order);
            // Delete old order items and add new ones
            await db.orderItems.where('orderId').equals(editingOrderId).delete();
            await db.orderItems.bulkAdd(orderItems);
          } else {
            // Add new order
            await db.orders.add(order);
            await db.orderItems.bulkAdd(orderItems);
          }

          // Update table status if dine-in
          if (orderType === 'dine_in' && selectedTableId) {
            const table = await db.restaurantTables.get(selectedTableId);
            if (table) {
              await db.restaurantTables.update(selectedTableId, {
                status: 'occupied',
                updatedAt: new Date().toISOString(),
              });
            }
          }

          // Set placed order and items for invoice (before clearing cart)
          setPlacedOrder(order);
          setPlacedOrderItems([...cartItems]);

          // Clear cart
          onClearCart();
          setManualDiscount(0);
          setCouponCode('');
          setAppliedCouponDiscount(0);
          setAppliedCouponId(null);
          setPaymentMethod(null);

          // Notify other components about the new order
          const { notifyOrderUpdate } = await import('@/lib/utils/order-events');
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
              
              const invoiceData = {
                order: {
                  ...orderWithDetails,
                  items: orderWithDetails.items?.map((item: any) => ({
                    ...item,
                    foodItemNameEn: item.foodItem?.nameEn || '',
                    foodItemNameAr: item.foodItem?.nameAr || '',
                    variationName: item.variation?.variationName || '',
                    addOns: item.addOns?.map((a: any) => ({
                      addOnNameEn: a.addOn?.nameEn || '',
                      addOnNameAr: a.addOn?.nameAr || '',
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
                  ? (language === 'ar' && orderWithDetails.customer.nameAr
                      ? orderWithDetails.customer.nameAr
                      : orderWithDetails.customer.nameEn || '')
                  : undefined,
                customerPhone: orderWithDetails.customer?.phone,
                customerAddress: undefined,
              };

              const template = settings?.invoice?.receiptTemplate === 'a4' ? 'a4' : 'thermal';
              const html = template === 'a4' 
                ? InvoiceGenerator.generateA4(invoiceData, language)
                : InvoiceGenerator.generateThermal(invoiceData, language);
              InvoiceGenerator.printInvoice(html);
            } catch (error) {
              console.error('Failed to auto-print invoice:', error);
            }
          }

          // Open invoice modal
          setInvoiceModalOpened(true);
          return;
        } catch (apiError: any) {
          // If API call fails (e.g., insufficient inventory), show error and stop
          const errorMessage = apiError?.response?.data?.error?.message || 
                              apiError?.message || 
                              'Failed to create order';
          
          // Check if it's an inventory error
          const isInventoryError = errorMessage.toLowerCase().includes('insufficient') || 
                                  errorMessage.toLowerCase().includes('inventory') ||
                                  errorMessage.toLowerCase().includes('stock');
          
          notifications.show({
            title: t('pos.orderPlacedError', language),
            message: isInventoryError 
              ? errorMessage 
              : `${t('pos.orderPlacedError', language)}: ${errorMessage}`,
            color: getErrorColor(),
          });
          
          setIsPlacingOrder(false);
          return;
        }
      }

      // If offline, queue the order (but warn that inventory can't be validated)
      const orderId = `order-${Date.now()}`;
      const orderNumber = generateOrderNumber();
      const tokenNumber = orderType === 'dine_in' ? generateTokenNumber() : undefined;

      // Create order object for offline queue
      const order: Order = {
        id: orderId,
        tenantId,
        branchId,
        tableId: orderType === 'dine_in' ? selectedTableId || undefined : undefined,
        customerId: selectedCustomerId || undefined,
        orderNumber,
        tokenNumber,
        orderType,
        status: 'pending',
        paymentStatus: 'pending',
        subtotal,
        discountAmount: discount,
        taxAmount: tax,
        deliveryCharge: delivery,
        totalAmount: total,
        orderDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      };

      // Create order items for offline queue
      const orderItems: OrderItem[] = cartItems.map((item, index) => ({
        id: `order-item-${Date.now()}-${index}`,
        orderId,
        foodItemId: item.foodItemId,
        variationId: item.variationId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: 0,
        taxAmount: 0,
        subtotal: item.subtotal,
        specialInstructions: item.specialInstructions,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      }));

      // Save to IndexedDB
      await db.orders.add(order);
      await db.orderItems.bulkAdd(orderItems);

      // Update table status if dine-in
      if (orderType === 'dine_in' && selectedTableId) {
        const table = await db.restaurantTables.get(selectedTableId);
        if (table) {
          await db.restaurantTables.update(selectedTableId, {
            status: 'occupied',
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // Add to sync queue
      await syncService.queueChange('orders', 'CREATE', orderId, order);
      for (const item of orderItems) {
        await syncService.queueChange('orderItems', 'CREATE', item.id!, item);
      }

      // Set placed order and items for invoice (before clearing cart)
      setPlacedOrder(order);
      setPlacedOrderItems([...cartItems]);

      // Clear cart
      onClearCart();
      setManualDiscount(0);
      setCouponCode('');
      setAppliedCouponDiscount(0);
      setAppliedCouponId(null);
      setPaymentMethod(null);

      // Notify other components about the new order
      const { notifyOrderUpdate } = await import('@/lib/utils/order-events');
      notifyOrderUpdate('order-created', orderId);

      // Show warning notification for offline orders
      notifications.show({
        title: t('pos.orderQueuedMessage', language),
        message: t('pos.orderQueuedMessage', language) + ' ' + (t('pos.inventoryNotValidated' as any, language) || 'Inventory will be validated when online.'),
        color: warningColor,
        icon: <IconCheck size={16} />,
      });

      // Open invoice modal
      setInvoiceModalOpened(true);
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

  const handlePrintInvoice = () => {
    if (!placedOrder) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${placedOrder.orderNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .order-info { margin-bottom: 20px; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .items-table th { background-color: #f2f2f2; }
            .summary { margin-top: 20px; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .total { font-size: 18px; font-weight: bold; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${t('pos.invoice', language)}</h1>
          </div>
          <div class="order-info">
            <p><strong>${t('pos.orderNumber', language)}:</strong> ${placedOrder.orderNumber}</p>
            ${placedOrder.tokenNumber ? `<p><strong>${t('pos.tokenNumber', language)}:</strong> ${placedOrder.tokenNumber}</p>` : ''}
            <p><strong>${t('pos.orderDate', language)}:</strong> ${new Date(placedOrder.orderDate).toLocaleString()}</p>
          </div>
            <table class="items-table">
            <thead>
              <tr>
                <th>${t('pos.item', language)}</th>
                <th>${t('pos.quantity', language)}</th>
                <th>${t('pos.price', language)}</th>
                <th>${t('pos.subtotal', language)}</th>
              </tr>
            </thead>
            <tbody>
              ${placedOrderItems.map(item => `
                <tr>
                  <td>${language === 'ar' && item.foodItemNameAr ? item.foodItemNameAr : item.foodItemNameEn}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unitPrice.toFixed(2)} ${currency}</td>
                  <td>${item.subtotal.toFixed(2)} ${currency}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="summary">
            <div class="summary-row">
              <span>${t('pos.subtotal', language)}:</span>
              <span>${placedOrder.subtotal.toFixed(2)} ${currency}</span>
            </div>
            ${placedOrder.discountAmount > 0 ? `
              <div class="summary-row">
                <span>${t('pos.discount', language)}:</span>
                <span>-${placedOrder.discountAmount.toFixed(2)} ${currency}</span>
              </div>
            ` : ''}
            ${placedOrder.taxAmount > 0 ? `
              <div class="summary-row">
                <span>${t('pos.tax', language)}:</span>
                <span>${placedOrder.taxAmount.toFixed(2)} ${currency}</span>
              </div>
            ` : ''}
            ${placedOrder.deliveryCharge > 0 ? `
              <div class="summary-row">
                <span>${t('pos.deliveryCharge', language)}:</span>
                <span>${placedOrder.deliveryCharge.toFixed(2)} ${currency}</span>
              </div>
            ` : ''}
            <div class="summary-row total">
              <span>${t('pos.grandTotal', language)}:</span>
              <span>${placedOrder.totalAmount.toFixed(2)} ${currency}</span>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    printWindow.print();
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column', borderLeft: `1px solid var(--mantine-color-gray-3)`, overflow: 'hidden' }}>
      <Box
        style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
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
              data={[
                { label: t('pos.dineIn', language), value: 'dine_in' },
                { label: t('pos.takeaway', language), value: 'takeaway' },
                ...(enableDeliveryManagement ? [{ label: t('pos.delivery', language), value: 'delivery' }] : []),
              ]}
            />
          </Box>

          {/* Customer Selection */}
          <Box>
            <Text fw={500} size="sm" mb="xs">
              {t('pos.customerInformation', language)}
            </Text>
            <Group gap="xs">
              <Select
                placeholder={t('pos.selectCustomer', language)}
                data={[
                  { value: 'walk-in', label: String(t('pos.walkInCustomer', language) || 'Walk-in Customer') },
                  ...customers.map((c) => {
                    const name = c.nameEn || '';
                    const phone = c.phone || '';
                    return {
                      value: c.id,
                      label: String(`${name} (${phone})`),
                    };
                  }),
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
              <Button
                variant="light"
                size="sm"
                onClick={() => setCustomerModalOpened(true)}
                style={{ color: primaryShade }}
              >
                <IconUser size={16} />
              </Button>
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
                  label={t('customers.addressEn' as any, language) || 'Address (English)'}
                  placeholder={t('customers.addressEn' as any, language) || 'Enter delivery address'}
                  value={newAddressEn}
                  onChange={(e) => {
                    setNewAddressEn(e.target.value);
                    // Clear selected address ID if user modifies the address
                    setSelectedAddressId(null);
                  }}
                  required
                />
                <TextInput
                  label={t('customers.addressAr' as any, language) || 'Address (Arabic)'}
                  placeholder={t('customers.addressAr' as any, language) || 'Enter delivery address in Arabic'}
                  value={newAddressAr}
                  onChange={(e) => {
                    setNewAddressAr(e.target.value);
                    setSelectedAddressId(null);
                  }}
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
            <Stack gap="xs">
              <Text fw={500} size="sm">
                {t('pos.tableSelection', language)}
              </Text>
              <Group gap="xs" align="flex-end">
                <Box style={{ flex: 1 }}>
                  <Text fw={500} size="xs" mb={4}>
                    {t('pos.tableNo', language) || 'Table No'}
                  </Text>
                  <NumberInput
                    placeholder={t('pos.selectTable', language)}
                    value={
                      selectedTableId
                        ? (() => {
                            const table = tables.find((t) => t.id === selectedTableId);
                            if (table) {
                              const tableNum = (table as any).tableNumber || (table as any).table_number;
                              if (tableNum) {
                                const num = parseInt(tableNum, 10);
                                return isNaN(num) ? undefined : num;
                              }
                            }
                            return undefined;
                          })()
                        : undefined
                    }
                    onChange={async (value) => {
                      if (typeof value === 'number' && value > 0) {
                        const tableValue = value.toString();
                        // Try to find existing table
                        let table = tables.find((t) => {
                          const tableNum = (t as any).tableNumber || (t as any).table_number;
                          return tableNum && tableNum.toString() === tableValue;
                        });
                        
                        if (!table) {
                          // Create a temporary table entry if it doesn't exist
                          // Generate a UUID v4-like ID
                          const generateUUID = () => {
                            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                              const r = (Math.random() * 16) | 0;
                              const v = c === 'x' ? r : (r & 0x3) | 0x8;
                              return v.toString(16);
                            });
                          };
                          
                          const tempTableId = generateUUID();
                          const tempTable: RestaurantTable = {
                            id: tempTableId,
                            tenantId,
                            branchId,
                            tableNumber: tableValue,
                            name: `Table ${tableValue}`,
                            capacity: numberOfPersons || 4,
                            status: 'available',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            syncStatus: 'pending',
                          };
                          
                          try {
                            await db.restaurantTables.add(tempTable);
                            setTables([...tables, tempTable]);
                            table = tempTable;
                          } catch (error) {
                            console.error('Failed to create temporary table:', error);
                            // Still allow the order to proceed with the temp ID
                            onTableChange(tempTableId);
                            return;
                          }
                        }
                        
                        onTableChange(table.id);
                      } else {
                        onTableChange(null);
                      }
                    }}
                    leftSection={<IconTable size={16} />}
                    min={1}
                    allowDecimal={false}
                    allowNegative={false}
                  />
                </Box>
                <Box style={{ width: 120 }}>
                  <Text fw={500} size="xs" mb={4}>
                    {t('pos.numberOfPersons', language)}
                  </Text>
                  <NumberInput
                    placeholder={t('pos.numberOfPersons', language)}
                    value={numberOfPersons}
                    onChange={(value) => onNumberOfPersonsChange(typeof value === 'number' ? value : 1)}
                    min={1}
                    max={20}
                  />
                </Box>
              </Group>
            </Stack>
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
                          {language === 'ar' && item.foodItemNameAr
                            ? item.foodItemNameAr
                            : item.foodItemNameEn}
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
                          {item.variationGroup}: {item.variationName}
                        </Text>
                      )}

                      {item.addOns && item.addOns.length > 0 && (
                        <Text size="xs" c="dimmed">
                          {t('pos.addOns', language)}:{' '}
                          {item.addOns.map((a) => language === 'ar' && a.addOnNameAr ? a.addOnNameAr : a.addOnNameEn).join(', ')}
                        </Text>
                      )}

                      {item.specialInstructions && (
                        <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
                          {item.specialInstructions}
                        </Text>
                      )}

                      <Group justify="space-between">
                        <Group gap="xs">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={() => {
                              if (item.quantity > 1) {
                                onUpdateItem(index, { ...item, quantity: item.quantity - 1, subtotal: item.unitPrice * (item.quantity - 1) });
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
                              onUpdateItem(index, { ...item, quantity: item.quantity + 1, subtotal: item.unitPrice * (item.quantity + 1) });
                            }}
                          >
                            <IconPlus size={14} />
                          </ActionIcon>
                        </Group>

                        <Group gap="xs">
                          <Text size="sm" fw={600} c={primaryColor}>
                            {item.subtotal.toFixed(2)} {currency}
                          </Text>
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => handleEditItem(index, item)}
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
                  {calculateSubtotal().toFixed(2)} {currency}
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
                      max={calculateSubtotal()}
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
                            -{loyaltyDiscount.toFixed(2)} {currency}
                          </Text>
                        </Group>
                      )}
                      {totalDiscount > 0 && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">
                            {t('pos.discount', language)}:
                          </Text>
                          <Text size="sm" fw={500} c={getSuccessColor()}>
                            -{totalDiscount.toFixed(2)} {currency}
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
                              {taxItem.amount.toFixed(2)} {currency}
                            </Text>
                          </Group>
                        ))
                      ) : (
                        <Group justify="space-between">
                          <Text size="sm">{t('pos.tax', language)}:</Text>
                          <Text size="sm" fw={500}>
                            {tax.toFixed(2)} {currency}
                          </Text>
                        </Group>
                      )}
                      {taxBreakdown.length > 1 && (
                        <Group justify="space-between" pt="xs" style={{ borderTop: '1px solid #e0e0e0' }}>
                          <Text size="sm" fw={600}>{t('pos.totalTax' as any, language) || 'Total Tax'}:</Text>
                          <Text size="sm" fw={600}>
                            {tax.toFixed(2)} {currency}
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
                  {calculateGrandTotal().toFixed(2)} {currency}
                </Text>
              </Group>

              {/* Payment Method */}
              <Box>
                <Text fw={500} size="sm" mb="xs">
                  {t('pos.paymentMethod', language)}
                </Text>
                <SegmentedControl
                  fullWidth
                  value={paymentMethod || ''}
                  onChange={(value) => setPaymentMethod(value as any)}
                  data={enabledPaymentMethods}
                  style={{
                    '--sc-color': primaryShade,
                  } as any}
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
          setCustomerModalOpened(false);
          setNewCustomerName('');
          setNewCustomerPhone('');
          setNewCustomerEmail('');
        }}
        title={t('pos.newCustomer', language)}
        centered
      >
        <Stack gap="md">
          <TextInput
            label={t('pos.customerName', language)}
            placeholder={t('pos.customerName', language)}
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            required
          />
          <TextInput
            label={t('pos.customerPhone', language)}
            placeholder={t('pos.customerPhone', language)}
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            required
          />
          <TextInput
            label={t('pos.customerEmail', language)}
            placeholder={t('pos.customerEmail', language)}
            value={newCustomerEmail}
            onChange={(e) => setNewCustomerEmail(e.target.value)}
            type="email"
          />
          <Button
            fullWidth
            onClick={handleCreateCustomer}
            disabled={!newCustomerName || !newCustomerPhone}
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
                <Text size="sm">{placedOrder.subtotal.toFixed(2)} {currency}</Text>
              </Group>
              {placedOrder.discountAmount > 0 && (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">{t('pos.discount', language)}:</Text>
                  <Text size="sm" c={getSuccessColor()}>-{placedOrder.discountAmount.toFixed(2)} {currency}</Text>
                </Group>
              )}
              {placedOrder.taxAmount > 0 && (
                <Group justify="space-between">
                  <Text size="sm">{t('pos.tax', language)}:</Text>
                  <Text size="sm">{placedOrder.taxAmount.toFixed(2)} {currency}</Text>
                </Group>
              )}
              {placedOrder.deliveryCharge > 0 && (
                <Group justify="space-between">
                  <Text size="sm">{t('pos.deliveryCharge', language)}:</Text>
                  <Text size="sm">{placedOrder.deliveryCharge.toFixed(2)} {currency}</Text>
                </Group>
              )}
              <Divider />
              <Group justify="space-between">
                <Text fw={700} size="lg">{t('pos.grandTotal', language)}:</Text>
                <Text fw={700} size="xl" c={primaryColor}>
                  {placedOrder.totalAmount.toFixed(2)} {currency}
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

