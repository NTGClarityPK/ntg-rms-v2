import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { CouponsService } from '../coupons/coupons.service';
import { InventoryService } from '../inventory/inventory.service';
import { DeliveryService } from '../delivery/delivery.service';
import { TaxesService } from '../taxes/taxes.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class OrdersService {
  constructor(
    private supabaseService: SupabaseService,
    private couponsService: CouponsService,
    private inventoryService: InventoryService,
    private taxesService: TaxesService,
    private settingsService: SettingsService,
    @Inject(forwardRef(() => DeliveryService))
    private deliveryService: DeliveryService,
  ) {}

  /**
   * Generate unique order number
   */
  private async generateOrderNumber(tenantId: string, branchId: string): Promise<string> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get branch code
    const { data: branch } = await supabase
      .from('branches')
      .select('code')
      .eq('id', branchId)
      .single();

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Get today's date in YYYYMMDD format
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    // Get count of orders today for this branch
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .is('deleted_at', null);

    const sequence = ((count || 0) + 1).toString().padStart(4, '0');
    return `${branch.code}-${dateStr}-${sequence}`;
  }

  /**
   * Generate token number for order
   */
  private async generateTokenNumber(tenantId: string, branchId: string): Promise<string> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get today's orders count for token generation
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .is('deleted_at', null)
      .not('token_number', 'is', null);

    const tokenNum = ((count || 0) + 1).toString().padStart(3, '0');
    return tokenNum;
  }

  /**
   * Calculate order totals including discounts, tax, and delivery charges
   */
  private async calculateOrderTotals(
    tenantId: string,
    items: CreateOrderDto['items'],
    extraDiscountAmount: number = 0,
    couponCode?: string,
    orderType: string = 'dine_in',
    customerId?: string,
  ): Promise<{
    subtotal: number;
    itemDiscounts: number;
    extraDiscount: number;
    couponDiscount: number;
    couponId?: string;
    taxAmount: number;
    deliveryCharge: number;
    totalAmount: number;
  }> {
    const supabase = this.supabaseService.getServiceRoleClient();
    let subtotal = 0;
    let itemDiscounts = 0;

    // Calculate subtotal and item-level discounts
    const orderItemsForTax: Array<{ foodItemId: string; categoryId?: string; subtotal: number }> = [];
    
    for (const item of items) {
      // Get food item details
      const { data: foodItem } = await supabase
        .from('food_items')
        .select('base_price, stock_type, stock_quantity, category_id')
        .eq('id', item.foodItemId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();

      if (!foodItem) {
        throw new NotFoundException(`Food item ${item.foodItemId} not found`);
      }

      // Check stock availability
      if (foodItem.stock_type === 'limited' && foodItem.stock_quantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for food item ${item.foodItemId}. Available: ${foodItem.stock_quantity}, Requested: ${item.quantity}`,
        );
      }

      let unitPrice = foodItem.base_price;

      // Get variation price adjustment if applicable
      if (item.variationId) {
        const { data: variation } = await supabase
          .from('food_item_variations')
          .select('price_adjustment')
          .eq('id', item.variationId)
          .single();

        if (variation) {
          unitPrice += variation.price_adjustment;
        }
      }

      // Get add-on prices
      let addOnTotal = 0;
      if (item.addOns && item.addOns.length > 0) {
        const addOnIds = item.addOns.map((a) => a.addOnId);
        const { data: addOns } = await supabase
          .from('add_ons')
          .select('id, price')
          .in('id', addOnIds)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);

        if (addOns) {
          for (const addOn of item.addOns) {
            const addOnData = addOns.find((a) => a.id === addOn.addOnId);
            if (addOnData) {
              addOnTotal += addOnData.price * (addOn.quantity || 1);
            }
          }
        }
      }

      unitPrice += addOnTotal;
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;
      
      // Store item info for tax calculation
      orderItemsForTax.push({
        foodItemId: item.foodItemId,
        categoryId: foodItem.category_id,
        subtotal: itemSubtotal,
      });

      // Check for active discounts on this food item
      const now = new Date().toISOString();
      const { data: discounts } = await supabase
        .from('food_item_discounts')
        .select('discount_type, discount_value')
        .eq('food_item_id', item.foodItemId)
        .eq('is_active', true)
        .lte('start_date', now)
        .gte('end_date', now);

      if (discounts && discounts.length > 0) {
        // Apply the first active discount (or highest discount - you can customize this logic)
        const discount = discounts[0];
        let discountAmount = 0;
        if (discount.discount_type === 'percentage') {
          discountAmount = (itemSubtotal * discount.discount_value) / 100;
        } else {
          discountAmount = discount.discount_value * item.quantity;
        }
        itemDiscounts += discountAmount;
      }
    }

    // Apply extra discount
    const extraDiscount = Math.min(extraDiscountAmount, subtotal - itemDiscounts);

    // Apply coupon discount
    let couponDiscount = 0;
    let couponId: string | undefined;
    if (couponCode) {
      try {
        const taxableAmount = subtotal - itemDiscounts - extraDiscount;
        const result = await this.couponsService.validateCoupon(tenantId, {
          code: couponCode,
          subtotal: taxableAmount,
          customerId,
        });
        couponDiscount = result.discount;
        couponId = result.couponId;
      } catch (error) {
        // Coupon validation failed, rethrow error
        throw error;
      }
    }

    // Get settings for tax and delivery configuration
    const settings = await this.settingsService.getSettings(tenantId);
    const taxSettings = settings.tax || {};
    const generalSettings = settings.general || {};

    // Calculate delivery charge first (needed for tax calculation)
    let deliveryCharge = 0;
    if (orderType === 'delivery') {
      // Get delivery charge from settings or use default
      const defaultDeliveryCharge = generalSettings.defaultDeliveryCharge || 5.0;
      const freeDeliveryThreshold = generalSettings.freeDeliveryThreshold || 50.0;
      
      const subtotalAfterDiscounts = subtotal - itemDiscounts - extraDiscount - couponDiscount;
      if (subtotalAfterDiscounts >= freeDeliveryThreshold) {
        deliveryCharge = 0;
      } else {
        deliveryCharge = defaultDeliveryCharge;
      }
    }

    // Calculate tax using TaxesService (only if tax system is enabled)
    const taxableAmount = subtotal - itemDiscounts - extraDiscount - couponDiscount;
    let taxAmount = 0;
    
    if (taxSettings.enableTaxSystem) {
      const taxCalculation = await this.taxesService.calculateTaxForOrder(
        tenantId,
        orderItemsForTax,
        taxableAmount,
        deliveryCharge,
        0 // serviceCharge (not implemented yet)
      );
      taxAmount = taxCalculation.taxAmount;
      
      // Handle tax calculation method (included vs excluded)
      // If tax is included, we need to adjust the calculation
      // For now, we calculate tax on top (excluded method)
      // TODO: Implement included tax calculation if needed
    }


    const totalAmount = subtotal - itemDiscounts - extraDiscount - couponDiscount + taxAmount + deliveryCharge;

    return {
      subtotal,
      itemDiscounts,
      extraDiscount,
      couponDiscount,
      couponId,
      taxAmount,
      deliveryCharge,
      totalAmount: Math.max(0, totalAmount), // Ensure total is not negative
    };
  }

  /**
   * Create a new order
   */
  async createOrder(tenantId: string, userId: string, createDto: CreateOrderDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    try {
      // Handle missing or empty branchId: use default branch or create one
      let effectiveBranchId = createDto.branchId;
      
      if (!effectiveBranchId || effectiveBranchId.trim() === '') {
        // Try to get the first active branch for this tenant
        const { data: defaultBranch } = await supabase
          .from('branches')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (defaultBranch) {
          effectiveBranchId = defaultBranch.id;
          console.log(`Using default branch ${effectiveBranchId} for order`);
        } else {
          // No branch exists - create a default branch
          console.log(`No branch found for tenant ${tenantId}. Creating default branch...`);
          const { data: newBranch, error: branchError } = await supabase
            .from('branches')
            .insert({
              tenant_id: tenantId,
              name_en: 'Main Branch',
              name_ar: 'الفرع الرئيسي',
              code: 'MAIN',
              is_active: true,
            })
            .select('id')
            .single();

          if (branchError || !newBranch) {
            throw new InternalServerErrorException(
              `Failed to create default branch: ${branchError?.message || 'Unknown error'}`
            );
          }

          effectiveBranchId = newBranch.id;
          console.log(`Created default branch ${effectiveBranchId} for tenant ${tenantId}`);
        }
      } else {
        // Validate the provided branch exists
        const { data: branch } = await supabase
          .from('branches')
          .select('id')
          .eq('id', effectiveBranchId)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .maybeSingle();

        if (!branch) {
          // Branch doesn't exist - try to get default branch or create one
          console.log(`Branch ${effectiveBranchId} not found. Attempting to use default branch...`);
          const { data: defaultBranch } = await supabase
            .from('branches')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (defaultBranch) {
            effectiveBranchId = defaultBranch.id;
            console.log(`Using default branch ${effectiveBranchId} instead of invalid branch`);
          } else {
            // Create a default branch
            const { data: newBranch, error: branchError } = await supabase
              .from('branches')
              .insert({
                tenant_id: tenantId,
                name_en: 'Main Branch',
                name_ar: 'الفرع الرئيسي',
                code: 'MAIN',
                is_active: true,
              })
              .select('id')
              .single();

            if (branchError || !newBranch) {
              throw new InternalServerErrorException(
                `Invalid branch ID and failed to create default branch: ${branchError?.message || 'Unknown error'}`
              );
            }

            effectiveBranchId = newBranch.id;
            console.log(`Created default branch ${effectiveBranchId} for tenant ${tenantId}`);
          }
        }
      }

      // Update createDto with effective branch ID
      createDto.branchId = effectiveBranchId;

      // Note: Table ID is optional - can be any table number string
      // No validation required as tables can be any number

      // Note: For delivery orders, customerAddressId is optional
      // Walk-in customers can place delivery orders without a customer address ID
      // The address information will be stored in the delivery record

      // Validate items
      if (!createDto.items || createDto.items.length === 0) {
        throw new BadRequestException('Order must contain at least one item');
      }

      // Validate stock availability BEFORE creating the order
      const orderItemsForValidation = createDto.items.map((item) => ({
        foodItemId: item.foodItemId,
        quantity: item.quantity,
      }));
      
      const stockValidation = await this.inventoryService.validateStockForOrder(
        tenantId,
        orderItemsForValidation,
      );

      if (!stockValidation.isValid) {
        const insufficientItemsList = stockValidation.insufficientItems
          .map((item) => `${item.ingredientName} (Available: ${item.available}, Required: ${item.required})`)
          .join(', ');
        throw new BadRequestException(
          `Cannot create order: Insufficient inventory. ${insufficientItemsList}`,
        );
      }

      // Calculate totals
      const totals = await this.calculateOrderTotals(
        tenantId,
        createDto.items,
        createDto.extraDiscountAmount || 0,
        createDto.couponCode,
        createDto.orderType,
        createDto.customerId,
      );

      // Generate order number and token
      const orderNumber = await this.generateOrderNumber(tenantId, createDto.branchId);
      const tokenNumber = createDto.tokenNumber || (await this.generateTokenNumber(tenantId, createDto.branchId));

      // Get counter ID if not provided (use first active counter for branch)
      let counterId = createDto.counterId;
      if (!counterId) {
        const { data: counter } = await supabase
          .from('counters')
          .select('id')
          .eq('branch_id', createDto.branchId)
          .eq('is_active', true)
          .is('deleted_at', null)
          .limit(1)
          .single();

        if (counter) {
          counterId = counter.id;
        }
      }

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenantId,
          branch_id: createDto.branchId,
          counter_id: counterId,
          table_id: createDto.tableId || null,
          customer_id: createDto.customerId || null,
          cashier_id: userId,
          order_number: orderNumber,
          token_number: tokenNumber,
          order_type: createDto.orderType,
          status: 'pending',
          payment_status: 'unpaid',
          payment_timing: createDto.paymentTiming || 'pay_first',
          subtotal: totals.subtotal,
          discount_amount: totals.itemDiscounts + totals.extraDiscount + totals.couponDiscount,
          tax_amount: totals.taxAmount,
          delivery_charge: totals.deliveryCharge,
          total_amount: totals.totalAmount,
          special_instructions: createDto.specialInstructions || null,
          placed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) {
        throw new InternalServerErrorException(`Failed to create order: ${orderError.message}`);
      }

      // Create order items
      const orderItems = [];
      for (const item of createDto.items) {
        // Get food item price
        const { data: foodItem } = await supabase
          .from('food_items')
          .select('base_price')
          .eq('id', item.foodItemId)
          .single();

        let unitPrice = foodItem?.base_price || 0;

        // Get variation price adjustment (if variation exists)
        // Note: variationId can be any value, so we only apply price if variation exists
        if (item.variationId) {
          const { data: variation } = await supabase
            .from('food_item_variations')
            .select('price_adjustment')
            .eq('id', item.variationId)
            .single();

          if (variation) {
            unitPrice += variation.price_adjustment;
          }
          // If variation doesn't exist, that's okay - we allow any variation ID
        }

        // Calculate add-on prices
        let addOnTotal = 0;
        if (item.addOns && item.addOns.length > 0) {
          const addOnIds = item.addOns.map((a) => a.addOnId);
          const { data: addOns } = await supabase
            .from('add_ons')
            .select('id, price')
            .in('id', addOnIds)
            .is('deleted_at', null);

          if (addOns) {
            for (const addOn of item.addOns) {
              const addOnData = addOns.find((a) => a.id === addOn.addOnId);
              if (addOnData) {
                addOnTotal += addOnData.price * (addOn.quantity || 1);
              }
            }
          }
        }

        unitPrice += addOnTotal;

        // Calculate item discount
        const now = new Date().toISOString();
        const { data: discounts } = await supabase
          .from('food_item_discounts')
          .select('discount_type, discount_value')
          .eq('food_item_id', item.foodItemId)
          .eq('is_active', true)
          .lte('start_date', now)
          .gte('end_date', now);

        let itemDiscount = 0;
        if (discounts && discounts.length > 0) {
          const discount = discounts[0];
          const itemSubtotal = unitPrice * item.quantity;
          if (discount.discount_type === 'percentage') {
            itemDiscount = (itemSubtotal * discount.discount_value) / 100;
          } else {
            itemDiscount = discount.discount_value * item.quantity;
          }
        }

        // Calculate tax for this item (proportional)
        const itemSubtotal = unitPrice * item.quantity;
        const itemTaxAmount = totals.taxAmount > 0 
          ? (itemSubtotal / totals.subtotal) * totals.taxAmount 
          : 0;

        const itemTotal = itemSubtotal - itemDiscount + itemTaxAmount;

        // Create order item
        const { data: orderItem, error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            food_item_id: item.foodItemId,
            variation_id: item.variationId || null,
            quantity: item.quantity,
            unit_price: unitPrice,
            discount_amount: itemDiscount,
            tax_amount: itemTaxAmount,
            subtotal: itemTotal,
            special_instructions: item.specialInstructions || null,
          })
          .select()
          .single();

        if (itemError) {
          throw new InternalServerErrorException(`Failed to create order item: ${itemError.message}`);
        }

        // Create order item add-ons
        if (item.addOns && item.addOns.length > 0) {
          const addOnInserts = [];
          for (const addOn of item.addOns) {
            const { data: addOnData } = await supabase
              .from('add_ons')
              .select('price')
              .eq('id', addOn.addOnId)
              .single();

            if (addOnData) {
              addOnInserts.push({
                order_item_id: orderItem.id,
                add_on_id: addOn.addOnId,
                quantity: addOn.quantity || 1,
                unit_price: addOnData.price,
              });
            }
          }

          if (addOnInserts.length > 0) {
            const { error: addOnError } = await supabase
              .from('order_item_add_ons')
              .insert(addOnInserts);

            if (addOnError) {
              throw new InternalServerErrorException(`Failed to create order item add-ons: ${addOnError.message}`);
            }
          }
        }

        orderItems.push(orderItem);
      }

      // Record coupon usage if coupon was applied
      if (totals.couponId && totals.couponDiscount > 0) {
        try {
          await this.couponsService.recordCouponUsage(
            tenantId,
            totals.couponId,
            order.id,
            createDto.customerId,
          );
        } catch (error) {
          // Log error but don't fail the order
          console.error('Failed to record coupon usage:', error);
        }
      }

      // Auto-deduct stock for order items based on recipes
      // Note: Stock was already validated before order creation, so this should not fail
      // But if it does fail (e.g., due to race condition), we need to handle it
      try {
        const orderItemsForDeduction = createDto.items.map((item) => ({
          foodItemId: item.foodItemId,
          quantity: item.quantity,
        }));
        await this.inventoryService.deductStockForOrder(
          tenantId,
          userId,
          order.id,
          orderItemsForDeduction,
        );
      } catch (error) {
        // If stock deduction fails after order creation, delete the order and throw error
        // This should rarely happen since we validate before creating the order
        await supabase
          .from('orders')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', order.id);
        
        throw new BadRequestException(
          `Failed to deduct stock for order: ${error instanceof Error ? error.message : 'Unknown error'}. Order has been cancelled.`,
        );
      }

      // Update table status if dine-in and table exists in tables table
      // Note: tableId can be any value, so we only update if it exists
      if (createDto.orderType === 'dine_in' && createDto.tableId) {
        const { data: existingTable } = await supabase
          .from('tables')
          .select('id')
          .eq('id', createDto.tableId)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .single();
        
        if (existingTable) {
          await supabase
            .from('tables')
            .update({ status: 'occupied', updated_at: new Date().toISOString() })
            .eq('id', createDto.tableId)
            .eq('tenant_id', tenantId);
        }
        // If table doesn't exist, that's okay - we allow any table number
      }

      // Create payment record if payment method is provided and payment timing is pay_first
      // Note: Order remains unpaid until explicitly marked as paid via updatePaymentStatus
      if (createDto.paymentMethod && createDto.paymentTiming === 'pay_first') {
        try {
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              order_id: order.id,
              amount: totals.totalAmount,
              payment_method: createDto.paymentMethod,
              status: 'pending', // Payment is pending until order is marked as paid
            });

          if (paymentError) {
            console.error('Failed to create payment record:', paymentError);
            // Don't fail the order if payment record creation fails
          }
        } catch (error) {
          // Log error but don't fail the order
          console.error('Failed to create payment record:', error);
        }
      }

      // Create delivery record if order type is delivery
      if (createDto.orderType === 'delivery') {
        try {
          // Build address notes for walk-in customers (store as JSON for language-based display)
          let deliveryNotes: string | null = null;
          if (!createDto.customerAddressId && (createDto.deliveryAddressEn || createDto.deliveryAddressAr)) {
            const addressData = {
              addressEn: createDto.deliveryAddressEn || null,
              addressAr: createDto.deliveryAddressAr || null,
              city: createDto.deliveryAddressCity || null,
              state: createDto.deliveryAddressState || null,
              country: createDto.deliveryAddressCountry || null,
            };
            deliveryNotes = JSON.stringify(addressData);
          }

          await this.deliveryService.createDeliveryForOrder(
            tenantId,
            order.id,
            createDto.customerAddressId,
            totals.deliveryCharge,
            deliveryNotes,
          );
        } catch (error) {
          console.error('Failed to create delivery record:', error);
          // Don't fail order creation if delivery record creation fails
        }
      }

      // Trigger Supabase Realtime event for new order
      await supabase
        .from('orders')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', order.id);

      // Try to get full order details for response
      // If getOrderById fails (e.g., due to RLS or timing), return the basic order
      try {
        const fullOrder = await this.getOrderById(tenantId, order.id);
        return fullOrder;
      } catch (error) {
        // If getOrderById fails, return the basic order data
        console.warn(`Failed to fetch full order details for ${order.id}, returning basic order:`, error instanceof Error ? error.message : 'Unknown error');
        return {
          ...order,
          items: orderItems,
          payments: [],
          timeline: [{ event: 'Order Placed', timestamp: order.placed_at || order.created_at }],
        };
      }
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Get all orders with filters
   */
  async getOrders(
    tenantId: string,
    filters: {
      status?: string;
      branchId?: string;
      orderType?: string;
      paymentStatus?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Fetch orders without joins to avoid relationship errors
    let query = supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }

    if (filters.orderType) {
      query = query.eq('order_type', filters.orderType);
    }

    if (filters.paymentStatus) {
      query = query.eq('payment_status', filters.paymentStatus);
    }

    if (filters.startDate) {
      query = query.gte('order_date', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('order_date', filters.endDate);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1);
    }

    const { data: orders, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch orders: ${error.message}`);
    }

    if (!orders || orders.length === 0) {
      return [];
    }

    // Collect unique IDs for batch fetching
    const branchIds = [...new Set(orders.map((o: any) => o.branch_id).filter(Boolean))];
    const counterIds = [...new Set(orders.map((o: any) => o.counter_id).filter(Boolean))];
    const tableIds = [...new Set(orders.map((o: any) => o.table_id).filter(Boolean))];
    const customerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];
    const cashierIds = [...new Set(orders.map((o: any) => o.cashier_id).filter(Boolean))];

    // Fetch related data in batches
    const [branches, counters, tables, customers, cashiers] = await Promise.all([
      branchIds.length > 0
        ? supabase
            .from('branches')
            .select('id, name_en, name_ar, code')
            .in('id', branchIds)
        : Promise.resolve({ data: [], error: null }),
      counterIds.length > 0
        ? supabase
            .from('counters')
            .select('id, name')
            .in('id', counterIds)
        : Promise.resolve({ data: [], error: null }),
      tableIds.length > 0
        ? supabase
            .from('tables')
            .select('id, table_number, seating_capacity')
            .in('id', tableIds)
        : Promise.resolve({ data: [], error: null }),
      customerIds.length > 0
        ? supabase
            .from('customers')
            .select('id, name_en, name_ar, phone')
            .in('id', customerIds)
        : Promise.resolve({ data: [], error: null }),
      cashierIds.length > 0
        ? supabase
            .from('users')
            .select('id, name_en, name_ar, email')
            .in('id', cashierIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Create lookup maps
    const branchMap = new Map((branches.data || []).map((b: any) => [b.id, b]));
    const counterMap = new Map((counters.data || []).map((c: any) => [c.id, c]));
    const tableMap = new Map((tables.data || []).map((t: any) => [t.id, t]));
    const customerMap = new Map((customers.data || []).map((c: any) => [c.id, c]));
    const cashierMap = new Map((cashiers.data || []).map((u: any) => [u.id, u]));

    // Get order items count for each order and enrich with related data
    const ordersWithItemCount = await Promise.all(
      (orders || []).map(async (order: any) => {
        const { count } = await supabase
          .from('order_items')
          .select('*', { count: 'exact', head: true })
          .eq('order_id', order.id);

        // Transform snake_case to camelCase and ensure numeric fields are numbers
        return {
          id: order.id,
          tenantId: order.tenant_id,
          branchId: order.branch_id,
          branch: order.branch_id ? branchMap.get(order.branch_id) || null : null,
          counterId: order.counter_id || null,
          counter: order.counter_id ? counterMap.get(order.counter_id) || null : null,
          tableId: order.table_id || null,
          table: order.table_id ? tableMap.get(order.table_id) || null : null,
          customerId: order.customer_id || null,
          customer: order.customer_id ? customerMap.get(order.customer_id) || null : null,
          cashierId: order.cashier_id || null,
          cashier: order.cashier_id ? cashierMap.get(order.cashier_id) || null : null,
          orderNumber: order.order_number,
          tokenNumber: order.token_number || null,
          orderType: order.order_type,
          status: order.status,
          paymentStatus: order.payment_status,
          subtotal: Number(order.subtotal) || 0,
          discountAmount: Number(order.discount_amount) || 0,
          taxAmount: Number(order.tax_amount) || 0,
          deliveryCharge: Number(order.delivery_charge) || 0,
          totalAmount: Number(order.total_amount) || 0,
          couponCode: order.coupon_code || null,
          couponDiscount: order.coupon_discount ? Number(order.coupon_discount) : null,
          specialInstructions: order.special_instructions || null,
          numberOfPersons: null, // Not stored in orders table (only in reservations)
          orderDate: order.order_date || order.created_at,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          itemsCount: count || 0,
        };
      }),
    );

    return ordersWithItemCount;
  }

  /**
   * Get order by ID with full details
   */
  async getOrderById(tenantId: string, orderId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // First, get the basic order without joins to avoid join failures
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !order) {
      throw new NotFoundException('Order not found');
    }

    // Manually fetch related data to avoid join failures
    const [branch, counter, table, customer, cashier] = await Promise.all([
      order.branch_id
        ? supabase
            .from('branches')
            .select('id, name_en, name_ar, code')
            .eq('id', order.branch_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order.counter_id
        ? supabase
            .from('counters')
            .select('id, name')
            .eq('id', order.counter_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order.table_id
        ? supabase
            .from('tables')
            .select('id, table_number, seating_capacity')
            .eq('id', order.table_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order.customer_id
        ? supabase
            .from('customers')
            .select('id, name_en, name_ar, phone, email')
            .eq('id', order.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order.cashier_id
        ? supabase
            .from('users')
            .select('id, name_en, name_ar, email')
            .eq('id', order.cashier_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    // Transform snake_case to camelCase and ensure numeric fields are numbers
    const orderWithRelations = {
      id: order.id,
      tenantId: order.tenant_id,
      branchId: order.branch_id,
      branch: branch.data || null,
      counterId: order.counter_id || null,
      counter: counter.data || null,
      tableId: order.table_id || null,
      table: table.data || null,
      customerId: order.customer_id || null,
      customer: customer.data || null,
      cashierId: order.cashier_id || null,
      cashier: cashier.data || null,
      orderNumber: order.order_number,
      tokenNumber: order.token_number || null,
      orderType: order.order_type,
      status: order.status,
      paymentStatus: order.payment_status,
      subtotal: Number(order.subtotal) || 0,
      discountAmount: Number(order.discount_amount) || 0,
      taxAmount: Number(order.tax_amount) || 0,
      deliveryCharge: Number(order.delivery_charge) || 0,
      totalAmount: Number(order.total_amount) || 0,
      couponCode: order.coupon_code || null,
      couponDiscount: order.coupon_discount ? Number(order.coupon_discount) : null,
      specialInstructions: order.special_instructions || null,
      numberOfPersons: null, // Not stored in orders table (only in reservations)
      orderDate: order.order_date || order.created_at,
      placedAt: order.placed_at || null,
      paidAt: order.paid_at || null,
      completedAt: order.completed_at || null,
      cancelledAt: order.cancelled_at || null,
      cancellationReason: order.cancellation_reason || null,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };

    // Get order items without joins (to avoid join failures)
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (itemsError) {
      throw new InternalServerErrorException(`Failed to fetch order items: ${itemsError.message}`);
    }

    // Get payments
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    // Build order timeline
    const timeline = [];
    if (order.placed_at) timeline.push({ event: 'Order Placed', timestamp: order.placed_at });
    if (order.paid_at) timeline.push({ event: 'Payment Received', timestamp: order.paid_at });
    if (order.status === 'preparing' || order.status === 'ready' || order.status === 'served' || order.status === 'completed') {
      timeline.push({ event: 'Sent to Kitchen', timestamp: order.placed_at || order.created_at });
    }
    if (order.status === 'ready' || order.status === 'served' || order.status === 'completed') {
      timeline.push({ event: 'Order Ready', timestamp: order.updated_at });
    }
    if (order.status === 'served' || order.status === 'completed') {
      timeline.push({ event: 'Order Served', timestamp: order.updated_at });
    }
    if (order.status === 'completed' && order.completed_at) {
      timeline.push({ event: 'Order Completed', timestamp: order.completed_at });
    }
    if (order.status === 'cancelled' && order.cancelled_at) {
      timeline.push({ event: 'Order Cancelled', timestamp: order.cancelled_at, reason: order.cancellation_reason });
    }

    if (!orderItems || orderItems.length === 0) {
      return {
        ...orderWithRelations,
        items: [],
        payments: payments || [],
        timeline,
      };
    }

    // Collect unique IDs for batch fetching
    const foodItemIds = [...new Set(orderItems.map((item: any) => item.food_item_id).filter(Boolean))];
    const variationIds = [...new Set(orderItems.map((item: any) => item.variation_id).filter(Boolean))];

    // Fetch food items and variations in batches
    const [foodItems, variations] = await Promise.all([
      foodItemIds.length > 0
        ? supabase
            .from('food_items')
            .select('id, name_en, name_ar, image_url')
            .in('id', foodItemIds)
        : Promise.resolve({ data: [], error: null }),
      variationIds.length > 0
        ? supabase
            .from('food_item_variations')
            .select('id, variation_group, variation_name, price_adjustment')
            .in('id', variationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Create lookup maps
    const foodItemMap = new Map((foodItems.data || []).map((fi: any) => [fi.id, fi]));
    const variationMap = new Map((variations.data || []).map((v: any) => [v.id, v]));

    // Get add-ons for each order item and transform to camelCase
    const itemsWithAddOns = await Promise.all(
      (orderItems || []).map(async (item: any) => {
        const { data: addOns } = await supabase
          .from('order_item_add_ons')
          .select('*')
          .eq('order_item_id', item.id);

        // Get add-on details
        const addOnIds = (addOns || []).map((a: any) => a.add_on_id).filter(Boolean);
        const addOnDetails = addOnIds.length > 0
          ? await supabase
              .from('add_ons')
              .select('id, name_en, name_ar, price')
              .in('id', addOnIds)
          : { data: [], error: null };

        const addOnDetailsMap = new Map((addOnDetails.data || []).map((a: any) => [a.id, a]));

        // Transform food item to camelCase
        const foodItemData = item.food_item_id ? foodItemMap.get(item.food_item_id) : null;
        const transformedFoodItem = foodItemData ? {
          id: foodItemData.id,
          nameEn: foodItemData.name_en || null,
          nameAr: foodItemData.name_ar || null,
          imageUrl: foodItemData.image_url || null,
        } : null;

        // Transform variation to camelCase
        const variationData = item.variation_id ? variationMap.get(item.variation_id) : null;
        const transformedVariation = variationData ? {
          id: variationData.id,
          variationGroup: variationData.variation_group || null,
          variationName: variationData.variation_name || null,
          priceAdjustment: Number(variationData.price_adjustment) || 0,
        } : null;

        return {
          id: item.id,
          orderId: item.order_id,
          foodItemId: item.food_item_id,
          foodItem: transformedFoodItem,
          variationId: item.variation_id || null,
          variation: transformedVariation,
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unit_price) || 0,
          discountAmount: Number(item.discount_amount) || 0,
          taxAmount: Number(item.tax_amount) || 0,
          subtotal: Number(item.subtotal) || 0,
          specialInstructions: item.special_instructions || null,
          addOns: (addOns || []).map((addOn: any) => {
            const addOnData = addOn.add_on_id ? addOnDetailsMap.get(addOn.add_on_id) : null;
            const transformedAddOn = addOnData ? {
              id: addOnData.id,
              nameEn: addOnData.name_en || null,
              nameAr: addOnData.name_ar || null,
              price: Number(addOnData.price) || 0,
            } : null;

            return {
              id: addOn.id,
              addOnId: addOn.add_on_id,
              quantity: Number(addOn.quantity) || 0,
              unitPrice: Number(addOn.unit_price) || 0,
              addOn: transformedAddOn,
            };
          }),
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        };
      }),
    );

    return {
      ...orderWithRelations,
      items: itemsWithAddOns,
      payments: payments || [],
      timeline,
    };
  }

  /**
   * Update/modify an existing order
   * Only allowed if order is not paid
   */
  async updateOrder(
    tenantId: string,
    userId: string,
    orderId: string,
    updateDto: UpdateOrderDto,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get current order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only allow modification if order is not paid
    if (order.payment_status === 'paid') {
      throw new BadRequestException('Cannot modify order that has been paid');
    }

    // Get existing order items to restore inventory
    const { data: existingItems } = await supabase
      .from('order_items')
      .select('food_item_id, quantity')
      .eq('order_id', orderId);

    // If items are being updated, validate inventory for new items
    if (updateDto.items && updateDto.items.length > 0) {
      const orderItemsForValidation = updateDto.items.map((item) => ({
        foodItemId: item.foodItemId,
        quantity: item.quantity,
      }));

      const stockValidation = await this.inventoryService.validateStockForOrder(
        tenantId,
        orderItemsForValidation,
      );

      if (!stockValidation.isValid) {
        const insufficientItemsList = stockValidation.insufficientItems
          .map((item) => `${item.ingredientName} (Available: ${item.available}, Required: ${item.required})`)
          .join(', ');
        throw new BadRequestException(
          `Cannot update order: Insufficient inventory. ${insufficientItemsList}`,
        );
      }
    }

    // Calculate new totals if items are being updated
    let totals;
    if (updateDto.items && updateDto.items.length > 0) {
      totals = await this.calculateOrderTotals(
        tenantId,
        updateDto.items,
        updateDto.extraDiscountAmount || 0,
        updateDto.couponCode,
        updateDto.orderType || order.order_type,
        updateDto.customerId || order.customer_id,
      );
    } else {
      // Recalculate with existing items but new discount/coupon
      const { data: existingOrderItems } = await supabase
        .from('order_items')
        .select('food_item_id, quantity, variation_id')
        .eq('order_id', orderId);

      if (existingOrderItems && existingOrderItems.length > 0) {
        const itemsForRecalc = existingOrderItems.map((item: any) => ({
          foodItemId: item.food_item_id,
          quantity: item.quantity,
          variationId: item.variation_id,
        }));

        totals = await this.calculateOrderTotals(
          tenantId,
          itemsForRecalc,
          updateDto.extraDiscountAmount || 0,
          updateDto.couponCode,
          updateDto.orderType || order.order_type,
          updateDto.customerId || order.customer_id,
        );
      } else {
        // No items, use existing totals
        totals = {
          subtotal: order.subtotal,
          itemDiscounts: 0,
          extraDiscount: updateDto.extraDiscountAmount || 0,
          couponDiscount: 0,
          taxAmount: order.tax_amount,
          deliveryCharge: order.delivery_charge,
          totalAmount: order.total_amount,
        };
      }
    }

    // Restore inventory for old items
    if (existingItems && existingItems.length > 0) {
      try {
        const itemsToRestore = existingItems.map((item: any) => ({
          foodItemId: item.food_item_id,
          quantity: item.quantity,
        }));
        // Note: We need a method to restore stock, for now we'll skip this
        // as it requires tracking what was deducted
      } catch (error) {
        console.error('Failed to restore inventory for old items:', error);
        // Continue with update even if restore fails
      }
    }

    // Delete existing order items and add-ons
    await supabase.from('order_item_add_ons').delete().eq('order_item_id', orderId);
    await supabase.from('order_items').delete().eq('order_id', orderId);

    // Create new order items if provided
    if (updateDto.items && updateDto.items.length > 0) {
      for (const item of updateDto.items) {
        // Get food item price
        const { data: foodItem } = await supabase
          .from('food_items')
          .select('base_price')
          .eq('id', item.foodItemId)
          .single();

        let unitPrice = foodItem?.base_price || 0;

        // Get variation price adjustment
        if (item.variationId) {
          const { data: variation } = await supabase
            .from('food_item_variations')
            .select('price_adjustment')
            .eq('id', item.variationId)
            .single();

          if (variation) {
            unitPrice += variation.price_adjustment;
          }
        }

        // Calculate add-on prices
        let addOnTotal = 0;
        if (item.addOns && item.addOns.length > 0) {
          const addOnIds = item.addOns.map((a) => a.addOnId);
          const { data: addOns } = await supabase
            .from('add_ons')
            .select('id, price')
            .in('id', addOnIds)
            .is('deleted_at', null);

          if (addOns) {
            for (const addOn of item.addOns) {
              const addOnData = addOns.find((a) => a.id === addOn.addOnId);
              if (addOnData) {
                addOnTotal += addOnData.price * (addOn.quantity || 1);
              }
            }
          }
        }

        unitPrice += addOnTotal;

        // Calculate item discount
        const now = new Date().toISOString();
        const { data: discounts } = await supabase
          .from('food_item_discounts')
          .select('discount_type, discount_value')
          .eq('food_item_id', item.foodItemId)
          .eq('is_active', true)
          .lte('start_date', now)
          .gte('end_date', now);

        let itemDiscount = 0;
        if (discounts && discounts.length > 0) {
          const discount = discounts[0];
          const itemSubtotal = unitPrice * item.quantity;
          if (discount.discount_type === 'percentage') {
            itemDiscount = (itemSubtotal * discount.discount_value) / 100;
          } else {
            itemDiscount = discount.discount_value * item.quantity;
          }
        }

        // Calculate tax for this item
        const itemSubtotal = unitPrice * item.quantity;
        const itemTaxAmount = totals.taxAmount > 0 
          ? (itemSubtotal / totals.subtotal) * totals.taxAmount 
          : 0;

        const itemTotal = itemSubtotal - itemDiscount + itemTaxAmount;

        // Create order item
        const { data: orderItem, error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: orderId,
            food_item_id: item.foodItemId,
            variation_id: item.variationId || null,
            quantity: item.quantity,
            unit_price: unitPrice,
            discount_amount: itemDiscount,
            tax_amount: itemTaxAmount,
            subtotal: itemTotal,
            special_instructions: item.specialInstructions || null,
          })
          .select()
          .single();

        if (itemError) {
          throw new InternalServerErrorException(`Failed to create order item: ${itemError.message}`);
        }

        // Create order item add-ons
        if (item.addOns && item.addOns.length > 0) {
          const addOnInserts = [];
          for (const addOn of item.addOns) {
            const { data: addOnData } = await supabase
              .from('add_ons')
              .select('price')
              .eq('id', addOn.addOnId)
              .single();

            if (addOnData) {
              addOnInserts.push({
                order_item_id: orderItem.id,
                add_on_id: addOn.addOnId,
                quantity: addOn.quantity || 1,
                unit_price: addOnData.price,
              });
            }
          }

          if (addOnInserts.length > 0) {
            const { error: addOnError } = await supabase
              .from('order_item_add_ons')
              .insert(addOnInserts);

            if (addOnError) {
              throw new InternalServerErrorException(`Failed to create order item add-ons: ${addOnError.message}`);
            }
          }
        }
      }

      // Deduct stock for new items
      try {
        const orderItemsForDeduction = updateDto.items.map((item) => ({
          foodItemId: item.foodItemId,
          quantity: item.quantity,
        }));
        await this.inventoryService.deductStockForOrder(
          tenantId,
          userId,
          orderId,
          orderItemsForDeduction,
        );
      } catch (error) {
        console.error('Failed to deduct stock for updated order:', error);
        // Continue even if stock deduction fails (shouldn't happen after validation)
      }
    }

    // Update order
    const updateData: any = {
      status: 'pending', // Reset status to pending after modification
      updated_at: new Date().toISOString(),
    };

    if (updateDto.tableId !== undefined) updateData.table_id = updateDto.tableId || null;
    if (updateDto.customerId !== undefined) updateData.customer_id = updateDto.customerId || null;
    if (updateDto.orderType !== undefined) updateData.order_type = updateDto.orderType;
    if (updateDto.specialInstructions !== undefined) updateData.special_instructions = updateDto.specialInstructions || null;
    // Note: number_of_persons is not in orders table, it's in reservations table
    // if (updateDto.numberOfPersons !== undefined) updateData.number_of_persons = updateDto.numberOfPersons || null;

    // Update totals
    updateData.subtotal = totals.subtotal;
    updateData.discount_amount = totals.itemDiscounts + totals.extraDiscount + totals.couponDiscount;
    updateData.tax_amount = totals.taxAmount;
    updateData.delivery_charge = totals.deliveryCharge;
    updateData.total_amount = totals.totalAmount;

    // Update coupon code if provided
    if (updateDto.couponCode !== undefined) {
      updateData.coupon_code = updateDto.couponCode || null;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(`Failed to update order: ${updateError.message}`);
    }

    // Update delivery record if order type is delivery and address fields are provided
    if (updateDto.orderType === 'delivery' || order.order_type === 'delivery') {
      try {
        // Get existing delivery record
        const { data: existingDelivery } = await supabase
          .from('deliveries')
          .select('id')
          .eq('order_id', orderId)
          .maybeSingle();

        if (existingDelivery) {
          // Build address notes for walk-in customers (store as JSON for language-based display)
          let deliveryNotes: string | null = null;
          if (!updateDto.customerAddressId && (updateDto.deliveryAddressEn || updateDto.deliveryAddressAr)) {
            const addressData = {
              addressEn: updateDto.deliveryAddressEn || null,
              addressAr: updateDto.deliveryAddressAr || null,
              city: updateDto.deliveryAddressCity || null,
              state: updateDto.deliveryAddressState || null,
              country: updateDto.deliveryAddressCountry || null,
            };
            deliveryNotes = JSON.stringify(addressData);
          }

          // Update delivery record
          const deliveryUpdateData: any = {};
          if (updateDto.customerAddressId !== undefined) {
            deliveryUpdateData.customer_address_id = updateDto.customerAddressId || null;
          }
          if (deliveryNotes !== null) {
            deliveryUpdateData.notes = deliveryNotes;
          }
          if (totals.deliveryCharge !== undefined) {
            deliveryUpdateData.delivery_charge = totals.deliveryCharge;
          }

          if (Object.keys(deliveryUpdateData).length > 0) {
            await supabase
              .from('deliveries')
              .update(deliveryUpdateData)
              .eq('id', existingDelivery.id);
          }
        }
      } catch (error) {
        console.error('Failed to update delivery record:', error);
        // Don't fail order update if delivery record update fails
      }
    }

    // Trigger Supabase Realtime event
    await supabase
      .from('orders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', orderId);

    return this.getOrderById(tenantId, orderId);
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    tenantId: string,
    orderId: string,
    updateDto: UpdateOrderStatusDto,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get current order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      pending: ['preparing', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['served', 'cancelled'],
      served: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    const allowedStatuses = validTransitions[order.status] || [];
    if (!allowedStatuses.includes(updateDto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${updateDto.status}. Allowed transitions: ${allowedStatuses.join(', ')}`,
      );
    }

    // Prepare update data
    const updateData: any = {
      status: updateDto.status,
      updated_at: new Date().toISOString(),
    };

    // Set status-specific timestamps
    if (updateDto.status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    } else if (updateDto.status === 'cancelled') {
      updateData.cancelled_at = new Date().toISOString();
      updateData.cancellation_reason = updateDto.cancellationReason || null;
    }

    // Update order
    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to update order status: ${error.message}`);
    }

    // Update customer statistics when order is completed
    if (updateDto.status === 'completed' && order.customer_id) {
      await this.updateCustomerStatistics(tenantId, order.customer_id);
    }

    // Update table status if order is completed or cancelled and table exists
    if (order.table_id && (updateDto.status === 'completed' || updateDto.status === 'cancelled')) {
      const { data: existingTable } = await supabase
        .from('tables')
        .select('id')
        .eq('id', order.table_id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();
      
      if (existingTable) {
        await supabase
          .from('tables')
          .update({ status: 'available', updated_at: new Date().toISOString() })
          .eq('id', order.table_id)
          .eq('tenant_id', tenantId);
      }
      // If table doesn't exist, that's okay - we allow any table number
    }

    // Trigger Supabase Realtime event for status update
    await supabase
      .from('orders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', orderId);

    return this.getOrderById(tenantId, orderId);
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    tenantId: string,
    orderId: string,
    updateDto: UpdatePaymentStatusDto,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get current order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Prepare update data
    const updateData: any = {
      payment_status: updateDto.paymentStatus,
      updated_at: new Date().toISOString(),
    };

    // Set paid_at timestamp if marking as paid
    if (updateDto.paymentStatus === 'paid' && !order.paid_at) {
      updateData.paid_at = new Date().toISOString();
    }

    // Update order
    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(`Failed to update payment status: ${error.message}`);
    }

    // Create or update payment record if marking as paid
    if (updateDto.paymentStatus === 'paid' && updateDto.amountPaid !== undefined) {
      const paymentAmount = updateDto.amountPaid || order.total_amount;
      const paymentMethod = updateDto.paymentMethod || 'cash'; // Use provided payment method or default to cash
      
      // Check if payment record already exists (could be pending from order creation)
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();

      if (existingPayment) {
        // Update existing payment record to completed
        await supabase
          .from('payments')
          .update({
            amount: paymentAmount,
            payment_method: paymentMethod,
            status: 'completed',
            paid_at: new Date().toISOString(),
          })
          .eq('id', existingPayment.id);
      } else {
        // Create new payment record
        await supabase
          .from('payments')
          .insert({
            order_id: orderId,
            amount: paymentAmount,
            payment_method: paymentMethod,
            status: 'completed',
            paid_at: new Date().toISOString(),
          });
      }
    }

    // Trigger Supabase Realtime event
    await supabase
      .from('orders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', orderId);

    return this.getOrderById(tenantId, orderId);
  }

  /**
   * Delete order (soft delete)
   */
  async deleteOrder(tenantId: string, orderId: string, cancellationReason?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only allow deletion of pending or cancelled orders
    if (order.status !== 'pending' && order.status !== 'cancelled') {
      throw new BadRequestException('Only pending or cancelled orders can be deleted');
    }

    // Soft delete
    const { error } = await supabase
      .from('orders')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellationReason || 'Order deleted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete order: ${error.message}`);
    }

    // Update table status if applicable and table exists
    if (order.table_id) {
      const { data: existingTable } = await supabase
        .from('tables')
        .select('id')
        .eq('id', order.table_id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();
      
      if (existingTable) {
        await supabase
          .from('tables')
          .update({ status: 'available', updated_at: new Date().toISOString() })
          .eq('id', order.table_id)
          .eq('tenant_id', tenantId);
      }
      // If table doesn't exist, that's okay - we allow any table number
    }

    return { message: 'Order deleted successfully' };
  }

  /**
   * Update customer statistics (total_orders, total_spent, last_order_date)
   */
  private async updateCustomerStatistics(tenantId: string, customerId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get all completed orders for this customer
    const { data: completedOrders, error: ordersError } = await supabase
      .from('orders')
      .select('total_amount, order_date, completed_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'completed')
      .is('deleted_at', null);

    if (ordersError) {
      console.error('Failed to fetch customer orders for statistics:', ordersError);
      return;
    }

    if (!completedOrders || completedOrders.length === 0) {
      // No completed orders, reset statistics
      await supabase
        .from('customers')
        .update({
          total_orders: 0,
          total_spent: 0,
          last_order_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId)
        .eq('tenant_id', tenantId);
      return;
    }

    // Calculate statistics
    const totalOrders = completedOrders.length;
    const totalSpent = completedOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    
    // Get the most recent order date
    const orderDates = completedOrders
      .map((order) => order.completed_at || order.order_date)
      .filter(Boolean)
      .sort()
      .reverse();
    const lastOrderDate = orderDates.length > 0 ? orderDates[0] : null;

    // Update customer statistics
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        total_orders: totalOrders,
        total_spent: totalSpent,
        last_order_date: lastOrderDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Failed to update customer statistics:', updateError);
    }
  }
}
