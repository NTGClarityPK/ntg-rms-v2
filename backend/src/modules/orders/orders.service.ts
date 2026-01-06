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
import { UpdateOrderItemStatusDto } from './dto/update-order-item-status.dto';
import { CouponsService } from '../coupons/coupons.service';
import { InventoryService } from '../inventory/inventory.service';
import { DeliveryService } from '../delivery/delivery.service';
import { TaxesService } from '../taxes/taxes.service';
import { SettingsService } from '../settings/settings.service';
import { OrdersSseService } from './orders-sse.service';
import { PaginationParams, PaginatedResponse, getPaginationParams, createPaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class OrdersService {
  constructor(
    private supabaseService: SupabaseService,
    private couponsService: CouponsService,
    private inventoryService: InventoryService,
    private taxesService: TaxesService,
    private settingsService: SettingsService,
    private ordersSseService: OrdersSseService,
    @Inject(forwardRef(() => DeliveryService))
    private deliveryService: DeliveryService,
  ) {}

  /**
   * Generate unique order number
   */
  private async generateOrderNumber(tenantId: string, branchId: string, branchCode?: string): Promise<string> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get branch code if not provided
    let code = branchCode;
    if (!code) {
      const { data: branch } = await supabase
        .from('branches')
        .select('code')
        .eq('id', branchId)
        .single();

      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
      code = branch.code;
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
    return `${code}-${dateStr}-${sequence}`;
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

    const tokenNum = ((count || 0) + 1).toString().padStart(4, '0');
    return tokenNum;
  }

  /**
   * Batch fetch all data needed for order items (food items, buffets, variations, add-ons, discounts)
   */
  private async batchFetchOrderItemData(
    tenantId: string,
    items: CreateOrderDto['items'],
  ): Promise<{
    foodItemMap: Map<string, any>;
    buffetMap: Map<string, any>;
    comboMealMap: Map<string, any>;
    variationMap: Map<string, any>;
    addOnMap: Map<string, any>;
    discountMap: Map<string, any>;
  }> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const buffetIds = [...new Set(items.filter((item) => item.buffetId).map((item) => item.buffetId!))];
    const comboMealIds = [...new Set(items.filter((item) => item.comboMealId).map((item) => item.comboMealId!))];
    const foodItemIds = [...new Set(items.filter((item) => item.foodItemId).map((item) => item.foodItemId!))];
    const variationIds = [...new Set(items.filter((item) => item.variationId && item.foodItemId).map((item) => item.variationId!))];
    const allAddOnIds = items
      .filter((item) => item.addOns && item.addOns.length > 0 && item.foodItemId)
      .flatMap((item) => item.addOns!.map((a) => a.addOnId));
    const uniqueAddOnIds = [...new Set(allAddOnIds)];
    const now = new Date().toISOString();

    // Batch fetch all data in parallel
    const [buffetsResult, comboMealsResult, foodItemsResult, variationsResult, addOnsResult, discountsResult] = await Promise.all([
      buffetIds.length > 0
        ? supabase
            .from('buffets')
            .select('id, price_per_person')
            .in('id', buffetIds)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      comboMealIds.length > 0
        ? supabase
            .from('combo_meals')
            .select('id, base_price')
            .in('id', comboMealIds)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      foodItemIds.length > 0
        ? supabase
            .from('food_items')
            .select('id, base_price, stock_type, stock_quantity, category_id')
            .in('id', foodItemIds)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      variationIds.length > 0
        ? supabase
            .from('food_item_variations')
            .select('id, price_adjustment')
            .in('id', variationIds)
        : Promise.resolve({ data: [], error: null }),
      uniqueAddOnIds.length > 0
        ? supabase
            .from('add_ons')
            .select('id, price')
            .in('id', uniqueAddOnIds)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      foodItemIds.length > 0
        ? supabase
            .from('food_item_discounts')
            .select('food_item_id, discount_type, discount_value')
            .in('food_item_id', foodItemIds)
            .eq('is_active', true)
            .lte('start_date', now)
            .gte('end_date', now)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Create lookup maps
    const foodItemMap = new Map((foodItemsResult.data || []).map((f: any) => [f.id, f]));
    const buffetMap = new Map((buffetsResult.data || []).map((b: any) => [b.id, b]));
    const comboMealMap = new Map((comboMealsResult.data || []).map((c: any) => [c.id, c]));
    const variationMap = new Map((variationsResult.data || []).map((v: any) => [v.id, v]));
    const addOnMap = new Map((addOnsResult.data || []).map((a: any) => [a.id, a]));
    
    // Group discounts by food_item_id (first discount per item)
    const discountMap = new Map<string, any>();
    (discountsResult.data || []).forEach((d: any) => {
      if (!discountMap.has(d.food_item_id)) {
        discountMap.set(d.food_item_id, d);
      }
    });

    return {
      foodItemMap,
      buffetMap,
      comboMealMap,
      variationMap,
      addOnMap,
      discountMap,
    };
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
    branchId?: string,
    preFetchedData?: {
      foodItemMap: Map<string, any>;
      buffetMap: Map<string, any>;
      comboMealMap: Map<string, any>;
      variationMap: Map<string, any>;
      addOnMap: Map<string, any>;
      discountMap: Map<string, any>;
    },
    preFetchedSettings?: any,
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
    let subtotal = 0;
    let itemDiscounts = 0;

    // Calculate subtotal and item-level discounts
    const orderItemsForTax: Array<{ foodItemId?: string; categoryId?: string; subtotal: number }> = [];
    
    // Use pre-fetched data if provided, otherwise fetch it
    let foodItemMap: Map<string, any>;
    let buffetMap: Map<string, any>;
    let comboMealMap: Map<string, any>;
    let variationMap: Map<string, any>;
    let addOnMap: Map<string, any>;
    let discountsMap: Map<string, any>;

    if (preFetchedData) {
      // Use pre-fetched data (no database queries needed)
      foodItemMap = preFetchedData.foodItemMap;
      buffetMap = preFetchedData.buffetMap;
      comboMealMap = preFetchedData.comboMealMap;
      variationMap = preFetchedData.variationMap;
      addOnMap = preFetchedData.addOnMap;
      // Convert discountMap from single discount to array format for compatibility
      discountsMap = new Map<string, any[]>();
      preFetchedData.discountMap.forEach((discount, foodItemId) => {
        discountsMap.set(foodItemId, [discount]);
      });
    } else {
      // Fetch data (original behavior for backward compatibility)
      const fetchedData = await this.batchFetchOrderItemData(tenantId, items);
      foodItemMap = fetchedData.foodItemMap;
      buffetMap = fetchedData.buffetMap;
      comboMealMap = fetchedData.comboMealMap;
      variationMap = fetchedData.variationMap;
      addOnMap = fetchedData.addOnMap;
      discountsMap = new Map<string, any[]>();
      fetchedData.discountMap.forEach((discount, foodItemId) => {
        discountsMap.set(foodItemId, [discount]);
      });
    }

    // Process each item using the batch-fetched data
    for (const item of items) {
      let unitPrice = 0;
      let categoryId: string | undefined;
      let foodItemId: string | undefined;

      // Handle different item types using batch-fetched data
      if (item.buffetId) {
        const buffet = buffetMap.get(item.buffetId);
        if (!buffet) {
          throw new NotFoundException(`Buffet ${item.buffetId} not found`);
        }
        unitPrice = buffet.price_per_person;
      } else if (item.comboMealId) {
        const comboMeal = comboMealMap.get(item.comboMealId);
        if (!comboMeal) {
          throw new NotFoundException(`Combo meal ${item.comboMealId} not found`);
        }
        unitPrice = comboMeal.base_price;
      } else if (item.foodItemId) {
        const foodItem = foodItemMap.get(item.foodItemId);
        if (!foodItem) {
          throw new NotFoundException(`Food item ${item.foodItemId} not found`);
        }

        // Check stock availability
        if (foodItem.stock_type === 'limited' && foodItem.stock_quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for food item ${item.foodItemId}. Available: ${foodItem.stock_quantity}, Requested: ${item.quantity}`,
          );
        }

        unitPrice = foodItem.base_price;
        categoryId = foodItem.category_id;
        foodItemId = item.foodItemId;
      } else {
        throw new BadRequestException('Order item must have either foodItemId, buffetId, or comboMealId');
      }

      // Get variation price adjustment if applicable (only for food items)
      if (item.variationId && item.foodItemId) {
        const variation = variationMap.get(item.variationId);
        if (variation) {
          unitPrice += variation.price_adjustment;
        }
      }

      // Get add-on prices (only for food items)
      let addOnTotal = 0;
      if (item.addOns && item.addOns.length > 0 && item.foodItemId) {
        for (const addOn of item.addOns) {
          const addOnData = addOnMap.get(addOn.addOnId);
          if (addOnData) {
            addOnTotal += addOnData.price * (addOn.quantity || 1);
          }
        }
      }

      unitPrice += addOnTotal;
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;
      
      // Store item info for tax calculation (only for food items with categoryId)
      if (foodItemId && categoryId) {
        orderItemsForTax.push({
          foodItemId,
          categoryId,
          subtotal: itemSubtotal,
        });
      } else {
        // For buffets and combo meals, add to tax calculation without category
        orderItemsForTax.push({
          subtotal: itemSubtotal,
        });
      }

      // Check for active discounts on this food item (only for food items)
      if (item.foodItemId) {
        const discounts = discountsMap.get(item.foodItemId);
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
        }, branchId);
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
      // Filter to only include food items with foodItemId for tax calculation
      const foodItemsForTax = orderItemsForTax.filter((item): item is { foodItemId: string; categoryId?: string; subtotal: number } => 
        item.foodItemId !== undefined
      );
      
      // Use branchId parameter
      const taxCalculation = await this.taxesService.calculateTaxForOrder(
        tenantId,
        foodItemsForTax,
        taxableAmount,
        deliveryCharge,
        0, // serviceCharge (not implemented yet)
        branchId
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
  async createOrder(tenantId: string, userId: string, userEmail: string, createDto: CreateOrderDto) {
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
              name: 'Main Branch',
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
                name: 'Main Branch',
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

      // Fetch branch code once for order number generation (optimization)
      let branchCode: string | undefined = undefined;
      if (effectiveBranchId) {
        const { data: branch } = await supabase
          .from('branches')
          .select('code')
          .eq('id', effectiveBranchId)
          .maybeSingle();
        branchCode = branch?.code;
      }

      // Validate tables for dine-in orders
      // Support both tableId (backward compatibility) and tableIds (multiple tables)
      const tableIdsToValidate: string[] = [];
      if (createDto.tableIds && createDto.tableIds.length > 0) {
        tableIdsToValidate.push(...createDto.tableIds);
      } else if (createDto.tableId) {
        tableIdsToValidate.push(createDto.tableId);
      }

      // Fetch settings early (will be reused in calculateOrderTotals and table validation)
      const settingsPromise = this.settingsService.getSettings(tenantId);
      let tableValidationSettings: any = null;

      if (createDto.orderType === 'dine_in' && tableIdsToValidate.length > 0) {
        // Get settings to check totalTables (await here since we need it for validation)
        tableValidationSettings = await settingsPromise;
        const totalTables = tableValidationSettings.general?.totalTables || 0;

        // Remove duplicates
        const uniqueTableIds = [...new Set(tableIdsToValidate)];

        // Validate all tables exist and are in range
        const { data: tables } = await supabase
          .from('tables')
          .select('table_number, id')
          .in('id', uniqueTableIds)
          .eq('branch_id', createDto.branchId)
          .is('deleted_at', null);

        if (!tables || tables.length !== uniqueTableIds.length) {
          throw new BadRequestException('One or more tables not found');
        }

        // If totalTables is set (> 0), validate all table numbers are within range
        if (totalTables > 0) {
          for (const table of tables) {
            const tableNumber = parseInt(table.table_number, 10);
            if (isNaN(tableNumber) || tableNumber < 1 || tableNumber > totalTables) {
              throw new BadRequestException(
                `Table ${table.table_number} must be between 1 and ${totalTables}`
              );
            }
          }
        }

        // Check if any of the tables have active orders (optimized: single query with better filter)
        // Check order_tables junction table first (more efficient than join)
        const { data: orderTableEntries } = await supabase
          .from('order_tables')
          .select('table_id, order_id')
          .in('table_id', uniqueTableIds);

        const orderIdsFromJunction = orderTableEntries 
          ? [...new Set(orderTableEntries.map(ot => ot.order_id))]
          : [];

        // Get active orders from both old table_id field and junction table in parallel
        const [activeOrdersByTableId, activeOrdersFromJunction] = await Promise.all([
          supabase
            .from('orders')
            .select('id, order_number, status, table_id')
            .eq('tenant_id', tenantId)
            .eq('branch_id', createDto.branchId)
            .in('table_id', uniqueTableIds)
            .eq('order_type', 'dine_in')
            .not('status', 'in', '(completed,cancelled)')
            .is('deleted_at', null),
          orderIdsFromJunction.length > 0
            ? supabase
                .from('orders')
                .select('id, order_number, status')
                .in('id', orderIdsFromJunction)
                .eq('tenant_id', tenantId)
                .eq('branch_id', createDto.branchId)
                .eq('order_type', 'dine_in')
                .not('status', 'in', '(completed,cancelled)')
                .is('deleted_at', null)
            : Promise.resolve({ data: [], error: null }),
        ]);

        // Map junction table orders back to table_ids
        const orderTableMap = new Map<string, string[]>();
        if (orderTableEntries) {
          for (const ot of orderTableEntries) {
            if (!orderTableMap.has(ot.order_id)) {
              orderTableMap.set(ot.order_id, []);
            }
            orderTableMap.get(ot.order_id)!.push(ot.table_id);
          }
        }

        const activeOrdersFromJunctionWithTableIds = (activeOrdersFromJunction.data || []).map(order => ({
          ...order,
          table_id: orderTableMap.get(order.id)?.[0] || null,
        }));

        // Combine both sources (remove duplicates by id)
        const orderMap = new Map();
        (activeOrdersByTableId.data || []).forEach(order => orderMap.set(order.id, order));
        activeOrdersFromJunctionWithTableIds.forEach(order => orderMap.set(order.id, order));
        const allActiveOrders = Array.from(orderMap.values());

        if (allActiveOrders.length > 0) {
          // Group by table to show which tables are occupied
          const occupiedTables = new Map<string, string[]>();
          for (const order of allActiveOrders) {
            const tableId = order.table_id;
            if (tableId) {
              if (!occupiedTables.has(tableId)) {
                occupiedTables.set(tableId, []);
              }
              occupiedTables.get(tableId)!.push(order.order_number);
            }
          }

          const occupiedMessages = Array.from(occupiedTables.entries()).map(([tableId, orderNumbers]) => {
            const table = tables.find(t => t.id === tableId);
            return `Table ${table?.table_number || tableId}: ${orderNumbers.join(', ')}`;
          });

          throw new BadRequestException(
            `One or more tables are currently occupied: ${occupiedMessages.join('; ')}. Please complete or cancel the existing orders first.`
          );
        }
      }

      // Note: For delivery orders, customerAddressId is optional
      // Walk-in customers can place delivery orders without a customer address ID
      // The address information will be stored in the delivery record

      // Validate items
      if (!createDto.items || createDto.items.length === 0) {
        throw new BadRequestException('Order must contain at least one item');
      }

      // Run stock validation, item data fetching, and settings fetch in parallel (they're all independent)
      const orderItemsForValidation = createDto.items.map((item) => ({
        foodItemId: item.foodItemId,
        quantity: item.quantity,
      }));
      
      // Fetch settings in parallel with other operations if not already fetched for table validation
      const parallelFetches: Promise<any>[] = [
        this.inventoryService.validateStockForOrder(tenantId, orderItemsForValidation),
        this.batchFetchOrderItemData(tenantId, createDto.items),
      ];
      
      // Only add settings promise if not already fetched
      if (!tableValidationSettings) {
        parallelFetches.push(settingsPromise);
      }
      
      const results = await Promise.all(parallelFetches);
      const stockValidation = results[0];
      const itemData = results[1];
      const settings = tableValidationSettings || results[2];

      if (!stockValidation.isValid) {
        const insufficientItemsList = stockValidation.insufficientItems
          .map((item) => `${item.ingredientName} (Available: ${item.available}, Required: ${item.required})`)
          .join(', ');
        throw new BadRequestException(
          `Cannot create order: Insufficient inventory. ${insufficientItemsList}`,
        );
      }

      // Calculate totals using pre-fetched data (both item data and settings)
      const totals = await this.calculateOrderTotals(
        tenantId,
        createDto.items,
        createDto.extraDiscountAmount || 0,
        createDto.couponCode,
        createDto.orderType,
        createDto.customerId,
        createDto.branchId,
        itemData, // Pass pre-fetched data to avoid duplicate queries
        settings, // Pass pre-fetched settings to avoid duplicate queries
      );

      // Generate order number and token in parallel with counter lookup
      const counterPromise = !createDto.counterId
        ? supabase
            .from('counters')
            .select('id')
            .eq('branch_id', createDto.branchId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const tokenNumberPromise = createDto.tokenNumber 
        ? Promise.resolve(createDto.tokenNumber)
        : this.generateTokenNumber(tenantId, createDto.branchId);

      const [orderNumber, tokenNumber, counterResult] = await Promise.all([
        this.generateOrderNumber(tenantId, createDto.branchId, branchCode),
        tokenNumberPromise,
        counterPromise,
      ]);

      const counterId = createDto.counterId || counterResult.data?.id || null;

      // Determine table_id for backward compatibility (use first table if multiple)
      const tableIdForOrder = tableIdsToValidate.length > 0 
        ? tableIdsToValidate[0] 
        : (createDto.tableId || null);

      // Fetch user name for waiter_name field
      const { data: user } = await supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      const waiterName = user?.name || null;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenantId,
          branch_id: createDto.branchId,
          counter_id: counterId,
          table_id: tableIdForOrder, // Keep for backward compatibility
          customer_id: createDto.customerId || null,
          cashier_id: userId,
          waiter_email: userEmail, // Store the email of the user who created the order
          waiter_name: waiterName, // Store the name of the user who created the order
          order_number: orderNumber,
          token_number: tokenNumber,
          order_type: createDto.orderType,
          status: 'preparing',
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

      // Create entries in order_tables junction table for all selected tables
      if (tableIdsToValidate.length > 0) {
        const orderTableEntries = tableIdsToValidate.map(tableId => ({
          order_id: order.id,
          table_id: tableId,
        }));

        const { error: orderTablesError } = await supabase
          .from('order_tables')
          .insert(orderTableEntries);

        if (orderTablesError) {
          console.error('Failed to create order_tables entries:', orderTablesError);
          // Don't fail the order creation, but log the error
        }
      }

      // Use pre-fetched data from totals calculation (no duplicate queries!)
      const { foodItemMap, buffetMap, comboMealMap, variationMap, addOnMap, discountMap } = itemData;

      // Calculate all item prices and prepare inserts
      const orderItemInserts = [];
      const orderItemAddOnInserts: Array<{ order_item_id: string; add_on_id: string; quantity: number; unit_price: number }> = [];

      for (const item of createDto.items) {
        let unitPrice = 0;
        let foodItemId: string | null = null;
        let buffetId: string | null = null;
        let comboMealId: string | null = null;

        // Handle different item types
        if (item.buffetId) {
          const buffet = buffetMap.get(item.buffetId);
          if (!buffet) {
            throw new NotFoundException(`Buffet ${item.buffetId} not found`);
          }
          unitPrice = buffet.price_per_person;
          buffetId = item.buffetId;
        } else if (item.comboMealId) {
          const comboMeal = comboMealMap.get(item.comboMealId);
          if (!comboMeal) {
            throw new NotFoundException(`Combo meal ${item.comboMealId} not found`);
          }
          unitPrice = comboMeal.base_price;
          comboMealId = item.comboMealId;
        } else if (item.foodItemId) {
          const foodItem = foodItemMap.get(item.foodItemId);
          if (!foodItem) {
            throw new NotFoundException(`Food item ${item.foodItemId} not found`);
          }
          unitPrice = foodItem.base_price;
          foodItemId = item.foodItemId;

          // Get variation price adjustment
          if (item.variationId) {
            const variation = variationMap.get(item.variationId);
            if (variation) {
              unitPrice += variation.price_adjustment;
            }
          }

          // Calculate add-on prices
          if (item.addOns && item.addOns.length > 0) {
            for (const addOn of item.addOns) {
              const addOnData = addOnMap.get(addOn.addOnId);
              if (addOnData) {
                unitPrice += addOnData.price * (addOn.quantity || 1);
              }
            }
          }
        } else {
          throw new BadRequestException('Order item must have either foodItemId, buffetId, or comboMealId');
        }

        // Calculate item discount
        let itemDiscount = 0;
        if (foodItemId) {
          const discount = discountMap.get(foodItemId);
          if (discount) {
            const itemSubtotal = unitPrice * item.quantity;
            if (discount.discount_type === 'percentage') {
              itemDiscount = (itemSubtotal * discount.discount_value) / 100;
            } else {
              itemDiscount = discount.discount_value * item.quantity;
            }
          }
        }

        // Calculate tax for this item (proportional)
        const itemSubtotal = unitPrice * item.quantity;
        const itemTaxAmount = totals.taxAmount > 0 
          ? (itemSubtotal / totals.subtotal) * totals.taxAmount 
          : 0;

        const itemTotal = itemSubtotal - itemDiscount + itemTaxAmount;

        // Prepare order item insert (will batch insert all at once)
        orderItemInserts.push({
          order_id: order.id,
          food_item_id: foodItemId || null,
          buffet_id: buffetId || null,
          combo_meal_id: comboMealId || null,
          variation_id: item.variationId || null,
          quantity: item.quantity,
          unit_price: unitPrice,
          discount_amount: itemDiscount,
          tax_amount: itemTaxAmount,
          subtotal: itemTotal,
          special_instructions: item.specialInstructions || null,
          status: 'preparing',
        });
      }

      // Batch insert all order items at once
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemInserts)
        .select();

      if (itemsError || !orderItems) {
        throw new InternalServerErrorException(`Failed to create order items: ${itemsError?.message || 'Unknown error'}`);
      }

      // Prepare order item add-ons inserts (batch insert all at once)
      for (let i = 0; i < createDto.items.length; i++) {
        const item = createDto.items[i];
        const orderItem = orderItems[i];
        
        if (item.addOns && item.addOns.length > 0 && orderItem) {
          for (const addOn of item.addOns) {
            const addOnData = addOnMap.get(addOn.addOnId);
            if (addOnData) {
              orderItemAddOnInserts.push({
                order_item_id: orderItem.id,
                add_on_id: addOn.addOnId,
                quantity: addOn.quantity || 1,
                unit_price: addOnData.price,
              });
            }
          }
        }
      }

      // Batch insert all order item add-ons at once
      if (orderItemAddOnInserts.length > 0) {
        const { error: addOnError } = await supabase
          .from('order_item_add_ons')
          .insert(orderItemAddOnInserts);

        if (addOnError) {
          throw new InternalServerErrorException(`Failed to create order item add-ons: ${addOnError.message}`);
        }
      }

      // Prepare parallel operations after order creation (all depend on order.id but are independent)
      const parallelOperations: Promise<any>[] = [];

      // Prepare coupon usage recording
      if (totals.couponId && totals.couponDiscount > 0) {
        parallelOperations.push(
          this.couponsService.recordCouponUsage(
            tenantId,
            totals.couponId,
            order.id,
            createDto.customerId,
          ).catch(error => {
            console.error('Failed to record coupon usage:', error);
            // Don't fail the order
          })
        );
      }

      // Prepare stock deduction
      const orderItemsForDeduction = createDto.items
        .filter((item) => item.foodItemId)
        .map((item) => ({
          foodItemId: item.foodItemId!,
          quantity: item.quantity,
          variationId: item.variationId,
          addOns: item.addOns?.map((addOn) => ({
            addOnId: addOn.addOnId,
            quantity: addOn.quantity || 1,
          })),
        }));
      
      parallelOperations.push(
        this.inventoryService.deductStockForOrder(
          tenantId,
          userId,
          order.id,
          orderItemsForDeduction,
        ).catch(async (error) => {
          // If stock deduction fails, delete the order and throw error
          await supabase
            .from('orders')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', order.id);
          
          throw new BadRequestException(
            `Failed to deduct stock for order: ${error instanceof Error ? error.message : 'Unknown error'}. Order has been cancelled.`,
          );
        })
      );

      // Prepare table status update (skip SELECT if we validated tables earlier)
      if (createDto.orderType === 'dine_in' && tableIdsToValidate.length > 0) {
        // We already validated tables exist, so we can directly update all tables
        const uniqueTableIds = [...new Set(tableIdsToValidate)];
        parallelOperations.push(
          Promise.resolve(
            supabase
              .from('tables')
              .update({ status: 'occupied', updated_at: new Date().toISOString() })
              .in('id', uniqueTableIds)
              .eq('branch_id', createDto.branchId)
          ).then(({ error }) => {
            if (error) {
              console.error('Failed to update table status:', error);
            }
          })
        );
      } else if (createDto.orderType === 'dine_in' && createDto.tableId) {
        // Fallback: check if table exists, then update
        parallelOperations.push(
          Promise.resolve(
            supabase
              .from('tables')
              .select('id')
              .eq('id', createDto.tableId)
              .eq('branch_id', createDto.branchId)
              .is('deleted_at', null)
              .maybeSingle()
          ).then(async ({ data }) => {
            if (data) {
              const { error } = await supabase
                .from('tables')
                .update({ status: 'occupied', updated_at: new Date().toISOString() })
                .eq('id', createDto.tableId)
                .eq('branch_id', createDto.branchId);
              if (error) {
                console.error('Failed to update table status:', error);
              }
            }
          })
        );
      }

      // Prepare payment record creation
      if (createDto.paymentMethod && createDto.paymentTiming === 'pay_first') {
        parallelOperations.push(
          Promise.resolve(
            supabase
              .from('payments')
              .insert({
                order_id: order.id,
                amount: totals.totalAmount,
                payment_method: createDto.paymentMethod,
                status: 'pending',
              })
          ).then(({ error }) => {
            if (error) {
              console.error('Failed to create payment record:', error);
            }
          })
        );
      }

      // Prepare delivery record creation
      if (createDto.orderType === 'delivery') {
        let deliveryNotes: string | null = null;
        if (!createDto.customerAddressId && (createDto.deliveryAddress || createDto.deliveryAddress)) {
          const addressData = {
            address: createDto.deliveryAddress || null,
            city: createDto.deliveryAddressCity || null,
            state: createDto.deliveryAddressState || null,
            country: createDto.deliveryAddressCountry || null,
          };
          deliveryNotes = JSON.stringify(addressData);
        }

        parallelOperations.push(
          this.deliveryService.createDeliveryForOrder(
            tenantId,
            order.id,
            createDto.customerAddressId,
            totals.deliveryCharge,
            deliveryNotes,
          ).catch(error => {
            console.error('Failed to create delivery record:', error);
            // Don't fail the order
          })
        );
      }

      // Execute all parallel operations
      await Promise.all(parallelOperations);

      // Note: Removed redundant updated_at trigger - order was just created so updated_at is already current
      // Supabase Realtime will trigger automatically on the insert

      // Construct lightweight order response from data we already have (skip expensive getOrderById)
      const fullOrder = {
        id: order.id,
        tenantId: order.tenant_id,
        branchId: order.branch_id,
        counterId: order.counter_id || null,
        tableId: order.table_id || null,
        customerId: order.customer_id || null,
        cashierId: order.cashier_id || null,
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
        orderDate: order.order_date || order.created_at,
        placedAt: order.placed_at || order.created_at,
        paidAt: order.paid_at || null,
        completedAt: order.completed_at || null,
        cancelledAt: order.cancelled_at || null,
        cancellationReason: order.cancellation_reason || null,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        items: orderItems.map((item: any) => ({
          id: item.id,
          orderId: item.order_id,
          foodItemId: item.food_item_id,
          buffetId: item.buffet_id,
          comboMealId: item.combo_meal_id,
          variationId: item.variation_id,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price) || 0,
          discountAmount: Number(item.discount_amount) || 0,
          taxAmount: Number(item.tax_amount) || 0,
          subtotal: Number(item.subtotal) || 0,
          specialInstructions: item.special_instructions || null,
          status: item.status,
          createdAt: item.created_at,
        })),
        payments: [],
        timeline: [{ event: 'Order Placed', timestamp: order.placed_at || order.created_at }],
      };
      
      // Emit SSE event for new order (non-blocking - fire and forget)
      console.log(`📡 Emitting ORDER_CREATED event for order ${order.id}, tenant ${tenantId}, branch ${fullOrder.branchId || 'null'}`);
      this.ordersSseService.emitOrderUpdate({
        type: 'ORDER_CREATED',
        tenantId,
        branchId: fullOrder.branchId || null,
        orderId: order.id,
        order: fullOrder,
      });
      
      return fullOrder;
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
      status?: string | string[];
      branchId?: string;
      orderType?: string;
      paymentStatus?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
      page?: number;
      includeItems?: boolean;
      search?: string;
      waiterEmail?: string;
    } = {},
  ): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Build base query for counting
    let countQuery = supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    // Build query for fetching data
    let query = supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Handle search: if search query provided, find matching customer IDs first
    let matchingCustomerIds: string[] | null = null;
    if (filters.search && filters.search.trim()) {
      const searchTerm = filters.search.trim();
      
      // Search in customers table for matching name or phone
      const { data: matchingCustomers } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', tenantId)
        .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
      
      if (matchingCustomers && matchingCustomers.length > 0) {
        matchingCustomerIds = matchingCustomers.map((c: any) => c.id);
      }
    }

    // Apply filters to both count and data queries
    const applyFilters = (q: any) => {
      // Support multiple statuses (array) or single status (string)
      if (filters.status) {
        if (Array.isArray(filters.status) && filters.status.length > 0) {
          q = q.in('status', filters.status);
        } else if (typeof filters.status === 'string') {
          q = q.eq('status', filters.status);
        }
      }

      if (filters.branchId) {
        q = q.eq('branch_id', filters.branchId);
      }

      if (filters.orderType) {
        q = q.eq('order_type', filters.orderType);
      }

      if (filters.paymentStatus) {
        q = q.eq('payment_status', filters.paymentStatus);
      }

      if (filters.startDate) {
        q = q.gte('order_date', filters.startDate);
      }

      if (filters.endDate) {
        q = q.lte('order_date', filters.endDate);
      }

      if (filters.waiterEmail) {
        q = q.eq('waiter_email', filters.waiterEmail);
      }

      // Apply search filter
      if (filters.search && filters.search.trim()) {
        const searchTerm = filters.search.trim();
        const searchConditions: string[] = [];
        
        // Search in order_number and token_number (direct fields in orders table)
        searchConditions.push(`order_number.ilike.%${searchTerm}%`);
        searchConditions.push(`token_number.ilike.%${searchTerm}%`);
        
        // If we found matching customers, add customer_id condition to the or filter
        if (matchingCustomerIds && matchingCustomerIds.length > 0) {
          // Supabase PostgREST supports mixing ilike and in in or conditions
          // Format: customer_id.in.(id1,id2,id3)
          searchConditions.push(`customer_id.in.(${matchingCustomerIds.join(',')})`);
        }
        
        // Use 'or' to combine all search conditions
        if (searchConditions.length > 0) {
          q = q.or(searchConditions.join(','));
        }
      }

      return q;
    };

    countQuery = applyFilters(countQuery);
    query = applyFilters(query);

    // Get total count
    const { count: totalCount } = await countQuery;

    // Apply pagination
    const usePagination = filters.page !== undefined || filters.limit !== undefined;
    if (usePagination) {
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const { offset } = getPaginationParams(page, limit);
      query = query.range(offset, offset + limit - 1);
    } else if (filters.offset !== undefined || filters.limit !== undefined) {
      // Support legacy offset/limit for backward compatibility
      const offset = filters.offset || 0;
      const limit = filters.limit || 100;
      query = query.range(offset, offset + limit - 1);
    } else {
      // Default limit if no pagination specified
      query = query.limit(100);
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
    const orderIds = orders.map((o: any) => o.id);
    
    // Fetch order_tables junction table to get all tables for orders
    const { data: orderTablesData } = await supabase
      .from('order_tables')
      .select('order_id, table_id')
      .in('order_id', orderIds);
    
    // Collect table IDs from both old table_id field and new order_tables junction
    const tableIdsFromOrders = [...new Set(orders.map((o: any) => o.table_id).filter(Boolean))];
    const tableIdsFromJunction = [...new Set((orderTablesData || []).map((ot: any) => ot.table_id).filter(Boolean))];
    const tableIds = [...new Set([...tableIdsFromOrders, ...tableIdsFromJunction])];
    
    // Create map of order_id -> table_ids array
    const orderTablesMap = new Map<string, string[]>();
    (orderTablesData || []).forEach((ot: any) => {
      if (!orderTablesMap.has(ot.order_id)) {
        orderTablesMap.set(ot.order_id, []);
      }
      orderTablesMap.get(ot.order_id)!.push(ot.table_id);
    });
    
    const customerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];
    const cashierIds = [...new Set(orders.map((o: any) => o.cashier_id).filter(Boolean))];

    // Fetch related data in batches
    const [branches, counters, tables, customers, cashiers] = await Promise.all([
      branchIds.length > 0
        ? supabase
            .from('branches')
            .select('id, name, code')
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
            .select('id, name, phone')
            .in('id', customerIds)
        : Promise.resolve({ data: [], error: null }),
      cashierIds.length > 0
        ? supabase
            .from('users')
            .select('id, name, email')
            .in('id', cashierIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Create lookup maps
    const branchMap = new Map((branches.data || []).map((b: any) => [b.id, b]));
    const counterMap = new Map((counters.data || []).map((c: any) => [c.id, c]));
    const tableMap = new Map((tables.data || []).map((t: any) => [t.id, t]));
    const customerMap = new Map((customers.data || []).map((c: any) => [c.id, c]));
    const cashierMap = new Map((cashiers.data || []).map((u: any) => [u.id, u]));

    // If includeItems is true, batch fetch all order items
    let orderItemsMap = new Map<string, any[]>();
    let foodItemMap = new Map<string, any>();
    let variationMap = new Map<string, any>();
    let addOnMap = new Map<string, any>();
    let buffetMap = new Map<string, any>();
    let comboMealMap = new Map<string, any>();

    if (filters.includeItems && orders && orders.length > 0) {
      const orderIds = orders.map((o: any) => o.id);
      
      // Batch fetch all order items for all orders
      const { data: allOrderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true });

      if (itemsError) {
        throw new InternalServerErrorException(`Failed to fetch order items: ${itemsError.message}`);
      }

      // Group items by order_id
      if (allOrderItems) {
        allOrderItems.forEach((item: any) => {
          const orderId = item.order_id;
          if (!orderItemsMap.has(orderId)) {
            orderItemsMap.set(orderId, []);
          }
          orderItemsMap.get(orderId)!.push(item);
        });
      }

      // Collect unique IDs for batch fetching related data
      const foodItemIds = [...new Set(allOrderItems?.map((item: any) => item.food_item_id).filter(Boolean) || [])];
      const variationIds = [...new Set(allOrderItems?.map((item: any) => item.variation_id).filter(Boolean) || [])];
      const buffetIds = [...new Set(allOrderItems?.map((item: any) => item.buffet_id).filter(Boolean) || [])];
      const comboMealIds = [...new Set(allOrderItems?.map((item: any) => item.combo_meal_id).filter(Boolean) || [])];

      // Batch fetch food items, variations, buffets, and combo meals
      const [foodItemsResult, variationsResult, buffetsResult, comboMealsResult] = await Promise.all([
        foodItemIds.length > 0
          ? supabase
              .from('food_items')
              .select('id, name, image_url')
              .in('id', foodItemIds)
          : Promise.resolve({ data: [], error: null }),
        variationIds.length > 0
          ? supabase
              .from('food_item_variations')
              .select('id, variation_group, variation_name, price_adjustment')
              .in('id', variationIds)
          : Promise.resolve({ data: [], error: null }),
        buffetIds.length > 0
          ? supabase
              .from('buffets')
              .select('id, name, image_url, food_item_ids')
              .in('id', buffetIds)
          : Promise.resolve({ data: [], error: null }),
        comboMealIds.length > 0
          ? supabase
              .from('combo_meals')
              .select('id, name, image_url, food_item_ids')
              .in('id', comboMealIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Create lookup maps
      if (foodItemsResult.data) {
        foodItemsResult.data.forEach((fi: any) => {
          foodItemMap.set(fi.id, fi);
        });
      }
      if (variationsResult.data) {
        variationsResult.data.forEach((v: any) => {
          variationMap.set(v.id, v);
        });
      }
      
      if (buffetsResult.data) {
        buffetsResult.data.forEach((b: any) => {
          buffetMap.set(b.id, {
            id: b.id,
            name: b.name ?? null, // Use nullish coalescing to preserve empty strings
            imageUrl: b.image_url || null,
          });
        });
      }
      
      if (comboMealsResult.data) {
        comboMealsResult.data.forEach((c: any) => {
          comboMealMap.set(c.id, {
            id: c.id,
            name: c.name || null,
            imageUrl: c.image_url || null,
            foodItemIds: c.food_item_ids || [],
          });
        });
      }
      
      // Fetch food items for combo meals to show constituent items
      const comboMealFoodItemIds = [...new Set(
        comboMealsResult.data?.flatMap((c: any) => c.food_item_ids || []) || []
      )];
      if (comboMealFoodItemIds.length > 0) {
        const { data: comboMealFoodItems } = await supabase
          .from('food_items')
          .select('id, name, image_url')
          .in('id', comboMealFoodItemIds);
        
        if (comboMealFoodItems) {
          comboMealFoodItems.forEach((fi: any) => {
            if (!foodItemMap.has(fi.id)) {
              foodItemMap.set(fi.id, fi);
            }
          });
        }
      }

      // Batch fetch all add-ons for all order items
      const orderItemIds = allOrderItems?.map((item: any) => item.id).filter(Boolean) || [];
      if (orderItemIds.length > 0) {
        const { data: allAddOns } = await supabase
          .from('order_item_add_ons')
          .select('*')
          .in('order_item_id', orderItemIds);

        // Collect add-on IDs
        const addOnIds = [...new Set(allAddOns?.map((a: any) => a.add_on_id).filter(Boolean) || [])];
        
        if (addOnIds.length > 0) {
          const { data: addOnDetails } = await supabase
            .from('add_ons')
            .select('id, name, price')
            .in('id', addOnIds);

          if (addOnDetails) {
            addOnDetails.forEach((a: any) => {
              addOnMap.set(a.id, a);
            });
          }
        }

        // Group add-ons by order_item_id
        const addOnsByItemId = new Map<string, any[]>();
        allAddOns?.forEach((addOn: any) => {
          const itemId = addOn.order_item_id;
          if (!addOnsByItemId.has(itemId)) {
            addOnsByItemId.set(itemId, []);
          }
          addOnsByItemId.get(itemId)!.push(addOn);
        });

        // Attach add-ons to order items map
        orderItemsMap.forEach((items, orderId) => {
          items.forEach((item: any) => {
            (item as any).addOns = addOnsByItemId.get(item.id) || [];
          });
        });
      }
    }

    // Get order items count for each order and enrich with related data
    const ordersWithItemCount = await Promise.all(
      (orders || []).map(async (order: any) => {
        // Get items count (if not including items) or use items from map
        let itemsCount = 0;
        let items: any[] = [];

        if (filters.includeItems) {
          const orderItems = orderItemsMap.get(order.id) || [];
          itemsCount = orderItems.length;
          
          // Transform order items with related data
          items = await Promise.all(orderItems.map(async (item: any) => {
            const foodItemData = item.food_item_id ? foodItemMap.get(item.food_item_id) : null;
            const transformedFoodItem = foodItemData ? {
              id: foodItemData.id,
              name: foodItemData.name || null,
              imageUrl: foodItemData.image_url || null,
            } : null;

            let buffetData = item.buffet_id ? buffetMap.get(item.buffet_id) : null;
            // If buffet_id exists but not in map, fetch it individually
            if (item.buffet_id && !buffetData) {
              const { data: singleBuffet } = await supabase
                .from('buffets')
                .select('id, name, image_url')
                .eq('id', item.buffet_id)
                .maybeSingle();
              if (singleBuffet) {
                buffetData = {
                  id: singleBuffet.id,
                  name: singleBuffet.name ?? null,
                  imageUrl: singleBuffet.image_url || null,
                };
                // Cache it in the map for future use
                buffetMap.set(singleBuffet.id, buffetData);
              }
            }
            const transformedBuffet = buffetData ? {
              id: buffetData.id,
              name: buffetData.name ?? null, // Use nullish coalescing to preserve empty strings
              imageUrl: buffetData.imageUrl || null,
            } : null;

            const comboMealData = item.combo_meal_id ? comboMealMap.get(item.combo_meal_id) : null;
            const transformedComboMeal = comboMealData ? {
              id: comboMealData.id,
              name: comboMealData.name || null,
              imageUrl: comboMealData.imageUrl || null,
              foodItemIds: comboMealData.foodItemIds || [],
              // Include constituent food items for combo meals
              foodItems: (comboMealData.foodItemIds || []).map((foodItemId: string) => {
                const fi = foodItemMap.get(foodItemId);
                return fi ? {
                  id: fi.id,
                  name: fi.name || null,
                  imageUrl: fi.image_url || null,
                } : null;
              }).filter(Boolean),
            } : null;

            const variationData = item.variation_id ? variationMap.get(item.variation_id) : null;
            const transformedVariation = variationData ? {
              id: variationData.id,
              variationGroup: variationData.variation_group || null,
              variationName: variationData.variation_name || null,
              priceAdjustment: Number(variationData.price_adjustment) || 0,
            } : null;

            const itemAddOns = (item.addOns || []).map((addOn: any) => {
              const addOnData = addOn.add_on_id ? addOnMap.get(addOn.add_on_id) : null;
              const transformedAddOn = addOnData ? {
                id: addOnData.id,
                name: addOnData.name || null,
                price: Number(addOnData.price) || 0,
              } : null;

              return {
                id: addOn.id,
                addOnId: addOn.add_on_id,
                quantity: Number(addOn.quantity) || 0,
                unitPrice: Number(addOn.unit_price) || 0,
                addOn: transformedAddOn,
              };
            });

            return {
              id: item.id,
              orderId: item.order_id,
              foodItemId: item.food_item_id || null,
              foodItem: transformedFoodItem,
              buffetId: item.buffet_id || null,
              buffet: transformedBuffet,
              comboMealId: item.combo_meal_id || null,
              comboMeal: transformedComboMeal,
              variationId: item.variation_id || null,
              variation: transformedVariation,
              quantity: Number(item.quantity) || 0,
              unitPrice: Number(item.unit_price) || 0,
              discountAmount: Number(item.discount_amount) || 0,
              taxAmount: Number(item.tax_amount) || 0,
              subtotal: Number(item.subtotal) || 0,
              specialInstructions: item.special_instructions || null,
              status: (item.status || 'preparing') as 'preparing' | 'ready' | 'served',
              addOns: itemAddOns,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
            };
          }));
        } else {
          // Only get count if not including items
          const { count } = await supabase
            .from('order_items')
            .select('*', { count: 'exact', head: true })
            .eq('order_id', order.id);
          itemsCount = count || 0;
        }

        // Get table IDs from junction table for this order
        const orderTableIds = orderTablesMap.get(order.id) || [];
        // If no tables in junction table, fall back to old table_id field
        const finalTableIds = orderTableIds.length > 0 ? orderTableIds : (order.table_id ? [order.table_id] : []);
        
        // Get table objects for all tables
        const orderTables = finalTableIds
          .map((tableId: string) => tableMap.get(tableId))
          .filter(Boolean);

        // Transform snake_case to camelCase and ensure numeric fields are numbers
        return {
          id: order.id,
          tenantId: order.tenant_id,
          branchId: order.branch_id,
          branch: order.branch_id ? branchMap.get(order.branch_id) || null : null,
          counterId: order.counter_id || null,
          counter: order.counter_id ? counterMap.get(order.counter_id) || null : null,
          tableId: order.table_id || (finalTableIds.length > 0 ? finalTableIds[0] : null), // Backward compatibility: first table or old table_id
          table: finalTableIds.length > 0 ? tableMap.get(finalTableIds[0]) || null : (order.table_id ? tableMap.get(order.table_id) || null : null), // Backward compatibility: first table or old table
          tableIds: finalTableIds, // Array of all table IDs
          tables: orderTables, // Array of all table objects
          customerId: order.customer_id || null,
          customer: order.customer_id ? customerMap.get(order.customer_id) || null : null,
          cashierId: order.cashier_id || null,
          cashier: order.cashier_id ? cashierMap.get(order.cashier_id) || null : null,
          waiterEmail: order.waiter_email || null,
          waiterName: order.waiter_name || null,
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
          itemsCount,
          ...(filters.includeItems ? { items } : {}),
        };
      }),
    );

    // Return paginated response if pagination is used
    if (usePagination) {
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      return createPaginatedResponse(ordersWithItemCount, totalCount || 0, page, limit);
    }

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

    // Fetch tables from order_tables junction table
    const { data: orderTablesData } = await supabase
      .from('order_tables')
      .select('table_id')
      .eq('order_id', orderId);
    
    // Get all table IDs (from junction table or fallback to old table_id)
    const tableIdsFromJunction = (orderTablesData || []).map((ot: any) => ot.table_id).filter(Boolean);
    const finalTableIds = tableIdsFromJunction.length > 0 
      ? tableIdsFromJunction 
      : (order.table_id ? [order.table_id] : []);

    // Manually fetch related data to avoid join failures
    const [branch, counter, customer, cashier, tablesData] = await Promise.all([
      order.branch_id
        ? supabase
            .from('branches')
            .select('id, name, code')
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
      order.customer_id
        ? supabase
            .from('customers')
            .select('id, name, phone, email')
            .eq('id', order.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order.cashier_id
        ? supabase
            .from('users')
            .select('id, name, email')
            .eq('id', order.cashier_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      finalTableIds.length > 0
        ? supabase
            .from('tables')
            .select('id, table_number, seating_capacity')
            .in('id', finalTableIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    
    // Get first table for backward compatibility
    const firstTable = tablesData.data && tablesData.data.length > 0 ? tablesData.data[0] : null;

    // Transform snake_case to camelCase and ensure numeric fields are numbers
    const orderWithRelations = {
      id: order.id,
      tenantId: order.tenant_id,
      branchId: order.branch_id,
      branch: branch.data || null,
      counterId: order.counter_id || null,
      counter: counter.data || null,
      tableId: order.table_id || (finalTableIds.length > 0 ? finalTableIds[0] : null), // Backward compatibility: first table or old table_id
      table: firstTable || null, // Backward compatibility: first table
      tableIds: finalTableIds, // Array of all table IDs
      tables: tablesData.data || [], // Array of all table objects
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
    const buffetIds = [...new Set(orderItems.map((item: any) => item.buffet_id).filter(Boolean))];
    const comboMealIds = [...new Set(orderItems.map((item: any) => item.combo_meal_id).filter(Boolean))];

    // Fetch food items, variations, buffets, and combo meals in batches
    const [foodItems, variations, buffets, comboMeals] = await Promise.all([
      foodItemIds.length > 0
        ? supabase
            .from('food_items')
            .select('id, name, image_url')
            .in('id', foodItemIds)
        : Promise.resolve({ data: [], error: null }),
      variationIds.length > 0
        ? supabase
            .from('food_item_variations')
            .select('id, variation_group, variation_name, price_adjustment')
            .in('id', variationIds)
        : Promise.resolve({ data: [], error: null }),
      buffetIds.length > 0
        ? supabase
            .from('buffets')
            .select('id, name, image_url, food_item_ids')
            .in('id', buffetIds)
        : Promise.resolve({ data: [], error: null }),
      comboMealIds.length > 0
        ? supabase
            .from('combo_meals')
            .select('id, name, image_url, food_item_ids')
            .in('id', comboMealIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Create lookup maps
    const foodItemMap = new Map((foodItems.data || []).map((fi: any) => [fi.id, fi]));
    const variationMap = new Map((variations.data || []).map((v: any) => [v.id, v]));
    
    const buffetMap = new Map<string, any>();
    if (buffets.data) {
      buffets.data.forEach((b: any) => {
        buffetMap.set(b.id, {
          id: b.id,
          name: b.name ?? null, // Use nullish coalescing to preserve empty strings
          imageUrl: b.image_url || null,
        });
      });
    }
    
    const comboMealMap = new Map<string, any>();
    if (comboMeals.data) {
      comboMeals.data.forEach((c: any) => {
        comboMealMap.set(c.id, {
          id: c.id,
          name: c.name || null,
          imageUrl: c.image_url || null,
          foodItemIds: c.food_item_ids || [],
          // Include constituent food items for combo meals
          foodItems: (c.food_item_ids || []).map((foodItemId: string) => {
            const fi = foodItemMap.get(foodItemId);
            return fi ? {
              id: fi.id,
              name: fi.name || null,
              imageUrl: fi.image_url || null,
            } : null;
          }).filter(Boolean),
        });
      });
    }
    
    // Fetch food items for combo meals to show constituent items
    const comboMealFoodItemIds = [...new Set(
      comboMeals.data?.flatMap((c: any) => c.food_item_ids || []) || []
    )];
    if (comboMealFoodItemIds.length > 0) {
      const { data: comboMealFoodItems } = await supabase
        .from('food_items')
        .select('id, name, image_url')
        .in('id', comboMealFoodItemIds);
      
      if (comboMealFoodItems) {
        comboMealFoodItems.forEach((fi: any) => {
          if (!foodItemMap.has(fi.id)) {
            foodItemMap.set(fi.id, fi);
          }
        });
      }
    }

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
              .select('id, name, price')
              .in('id', addOnIds)
          : { data: [], error: null };

        const addOnDetailsMap = new Map((addOnDetails.data || []).map((a: any) => [a.id, a]));

        // Transform food item to camelCase
        const foodItemData = item.food_item_id ? foodItemMap.get(item.food_item_id) : null;
        const transformedFoodItem = foodItemData ? {
          id: foodItemData.id,
          name: foodItemData.name || null,
          imageUrl: foodItemData.image_url || null,
        } : null;

        // Transform buffet to camelCase
        let buffetData = item.buffet_id ? buffetMap.get(item.buffet_id) : null;
        // If buffet_id exists but not in map, fetch it individually
        if (item.buffet_id && !buffetData) {
          const { data: singleBuffet } = await supabase
            .from('buffets')
            .select('id, name, image_url')
            .eq('id', item.buffet_id)
            .maybeSingle();
          if (singleBuffet) {
            buffetData = {
              id: singleBuffet.id,
              name: singleBuffet.name ?? null,
              imageUrl: singleBuffet.image_url || null,
            };
            // Cache it in the map for future use
            buffetMap.set(singleBuffet.id, buffetData);
          }
        }
        const transformedBuffet = buffetData ? {
          id: buffetData.id,
          name: buffetData.name ?? null, // Use nullish coalescing to preserve empty strings
          imageUrl: buffetData.imageUrl || null,
        } : null;

        // Transform combo meal to camelCase
        const comboMealData = item.combo_meal_id ? comboMealMap.get(item.combo_meal_id) : null;
        const transformedComboMeal = comboMealData ? {
          id: comboMealData.id,
          name: comboMealData.name || null,
          imageUrl: comboMealData.imageUrl || null,
          foodItemIds: comboMealData.foodItemIds || [],
          foodItems: comboMealData.foodItems || [],
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
          foodItemId: item.food_item_id || null,
          foodItem: transformedFoodItem,
          buffetId: item.buffet_id || null,
          buffet: transformedBuffet,
          comboMealId: item.combo_meal_id || null,
          comboMeal: transformedComboMeal,
          variationId: item.variation_id || null,
          variation: transformedVariation,
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unit_price) || 0,
          discountAmount: Number(item.discount_amount) || 0,
          taxAmount: Number(item.tax_amount) || 0,
          subtotal: Number(item.subtotal) || 0,
          specialInstructions: item.special_instructions || null,
          status: (item.status || 'pending') as 'pending' | 'preparing' | 'ready',
          addOns: (addOns || []).map((addOn: any) => {
            const addOnData = addOn.add_on_id ? addOnDetailsMap.get(addOn.add_on_id) : null;
            const transformedAddOn = addOnData ? {
              id: addOnData.id,
              name: addOnData.name || null,
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
      const orderItemsForValidation = updateDto.items
        .filter((item) => item.foodItemId) // Only include food items
        .map((item) => ({
          foodItemId: item.foodItemId!,
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
        updateDto.branchId || order.branch_id,
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
          updateDto.branchId || order.branch_id,
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
            status: 'preparing', // Default status for new items
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
        const orderItemsForDeduction = updateDto.items
          .filter((item) => item.foodItemId) // Only include food items
          .map((item) => ({
            foodItemId: item.foodItemId!,
            quantity: item.quantity,
            variationId: item.variationId,
            addOns: item.addOns?.map((addOn) => ({
              addOnId: addOn.addOnId,
              quantity: addOn.quantity || 1,
            })),
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
      status: 'preparing', // Reset status to preparing after modification
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
          if (!updateDto.customerAddressId && (updateDto.deliveryAddress || updateDto.deliveryAddress)) {
            const addressData = {
              address: updateDto.deliveryAddress || null,
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

    // No status transition constraints - allow any status to change to any other status

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
    const { data: supabaseUpdatedOrder, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to update order status: ${error.message}`);
    }

    // When order status is changed to "ready" or "served" from orders tab,
    // update all item statuses to match (for kitchen display synchronization)
    if (updateDto.status === 'ready' || updateDto.status === 'served') {
      // Get all items for this order (excluding buffets)
      const { data: allItems } = await supabase
        .from('order_items')
        .select('id, status, buffet_id')
        .eq('order_id', orderId);

      if (allItems && allItems.length > 0) {
        // Filter items to update (exclude buffets)
        const itemsToUpdate = allItems.filter(
          (item: any) => !item.buffet_id
        );

        if (itemsToUpdate.length > 0) {
          if (updateDto.status === 'ready') {
            // Update all preparing items to ready
            const preparingItemIds = itemsToUpdate
              .filter((item: any) => (item.status || 'preparing') === 'preparing')
              .map((item: any) => item.id);

            if (preparingItemIds.length > 0) {
              await supabase
                .from('order_items')
                .update({
                  status: 'ready',
                  updated_at: new Date().toISOString(),
                })
                .in('id', preparingItemIds);
            }
          } else if (updateDto.status === 'served') {
            // Update all preparing and ready items to served
            const itemIdsToServe = itemsToUpdate
              .filter(
                (item: any) =>
                  (item.status || 'preparing') === 'preparing' ||
                  item.status === 'ready'
              )
              .map((item: any) => item.id);

            if (itemIdsToServe.length > 0) {
              await supabase
                .from('order_items')
                .update({
                  status: 'served',
                  updated_at: new Date().toISOString(),
                })
                .in('id', itemIdsToServe);
            }
          }
        }
      }
    }

    // Update customer statistics when order is completed
    if (updateDto.status === 'completed' && order.customer_id) {
      await this.updateCustomerStatistics(tenantId, order.customer_id);
    }

    // Update table status if order is completed or cancelled and table exists
    if (order.order_type === 'dine_in' && (updateDto.status === 'completed' || updateDto.status === 'cancelled')) {
      // Get all tables associated with this order (from junction table)
      const { data: orderTables } = await supabase
        .from('order_tables')
        .select('table_id')
        .eq('order_id', order.id);
      
      const tableIds: string[] = [];
      if (orderTables && orderTables.length > 0) {
        tableIds.push(...orderTables.map(ot => ot.table_id));
      } else if (order.table_id) {
        // Fallback to legacy table_id field
        tableIds.push(order.table_id);
      }
      
      if (tableIds.length > 0) {
        const uniqueTableIds = [...new Set(tableIds)];
        await supabase
          .from('tables')
          .update({ status: 'available', updated_at: new Date().toISOString() })
          .in('id', uniqueTableIds)
          .eq('branch_id', order.branch_id);
      }
    }

    // Trigger Supabase Realtime event for status update
    await supabase
      .from('orders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', orderId);

    // Get updated order for SSE event
    const updatedOrder = await this.getOrderById(tenantId, orderId);
    
    // Emit SSE event for order status change
    this.ordersSseService.emitOrderUpdate({
      type: 'ORDER_STATUS_CHANGED',
      tenantId,
      branchId: (updatedOrder as any)?.branchId || null,
      orderId,
      order: updatedOrder,
    });

    return updatedOrder;
  }

  /**
   * Update individual order item status
   * This is used by kitchen display to mark items as preparing or ready
   * The overall order status will be automatically updated based on item statuses
   */
  async updateOrderItemStatus(
    tenantId: string,
    orderId: string,
    itemId: string,
    updateDto: UpdateOrderItemStatusDto,
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

    // Get the order item
    const { data: orderItem, error: itemError } = await supabase
      .from('order_items')
      .select('*')
      .eq('id', itemId)
      .eq('order_id', orderId)
      .single();

    if (itemError || !orderItem) {
      throw new NotFoundException('Order item not found');
    }

    // Update the item status
    const { error: updateError } = await supabase
      .from('order_items')
      .update({
        status: updateDto.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('order_id', orderId);

    if (updateError) {
      throw new InternalServerErrorException(`Failed to update order item status: ${updateError.message}`);
    }

    // Get all items for this order to determine overall order status
    const { data: allItems } = await supabase
      .from('order_items')
      .select('status')
      .eq('order_id', orderId);

    if (!allItems || allItems.length === 0) {
      throw new InternalServerErrorException('No items found for order');
    }

    // Determine overall order status based on item statuses
    const itemStatuses = allItems.map((item: any) => item.status || 'preparing');
    const totalItems = itemStatuses.length;
    const readyCount = itemStatuses.filter((status: string) => status === 'ready').length;
    const preparingCount = itemStatuses.filter((status: string) => status === 'preparing').length;
    const servedCount = itemStatuses.filter((status: string) => status === 'served').length;

    let newOrderStatus = order.status;

    // Update order status based on item statuses
    // Priority: preparing > ready > served (order status reflects the "lowest" item status)
    // Order is "preparing" if ANY items are still preparing
    if (preparingCount > 0) {
      newOrderStatus = 'preparing';
    }
    // Order is "ready" if ANY items are ready (and no items are preparing)
    else if (readyCount > 0) {
      newOrderStatus = 'ready';
    }
    // Order is "served" only when ALL items are served
    else if (servedCount === totalItems) {
      newOrderStatus = 'served';
    }
    // This should not happen, but keep current status as fallback
    else {
      newOrderStatus = order.status;
    }

    // Only update order status if it changed
    if (newOrderStatus !== order.status) {
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({
          status: newOrderStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (orderUpdateError) {
        console.error('Failed to update order status after item status change:', orderUpdateError);
        // Don't throw - item status was updated successfully
      }
    }

    // Trigger Supabase Realtime event
    await supabase
      .from('orders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', orderId);

    // Get updated order for SSE event
    const updatedOrder = await this.getOrderById(tenantId, orderId);
    
    // Emit SSE event for order item status change
    this.ordersSseService.emitOrderUpdate({
      type: 'ORDER_STATUS_CHANGED',
      tenantId,
      orderId,
      order: updatedOrder,
    });

    return updatedOrder;
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

    const now = new Date().toISOString();

    // Prepare update data
    const updateData: any = {
      payment_status: updateDto.paymentStatus,
      updated_at: now,
    };

    // If marking as paid, set paid_at (idempotent - safe to set multiple times)
    if (updateDto.paymentStatus === 'paid') {
      updateData.paid_at = now;
    }

    // Update order first (most important operation)
    const { data: updateResult, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle();

    if (updateError) {
      throw new InternalServerErrorException(`Failed to update payment status: ${updateError.message}`);
    }

    if (!updateResult) {
      throw new NotFoundException('Order not found');
    }

    // Handle payment record creation/update if marking as paid (optimized: single query to get payment ID, then update/insert)
    if (updateDto.paymentStatus === 'paid' && updateDto.amountPaid !== undefined) {
      const paymentAmount = updateDto.amountPaid;
      const paymentMethod = updateDto.paymentMethod || 'cash';

      // Get first payment ID (single efficient query)
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingPayment) {
        // Update existing payment
        const { error: paymentError } = await supabase
          .from('payments')
          .update({
            amount: paymentAmount,
            payment_method: paymentMethod,
            status: 'completed',
            paid_at: now,
          })
          .eq('id', existingPayment.id);

        if (paymentError) {
          throw new InternalServerErrorException(`Failed to update payment: ${paymentError.message}`);
        }
      } else {
        // Insert new payment
        const { error: insertError } = await supabase
          .from('payments')
          .insert({
            order_id: orderId,
            amount: paymentAmount,
            payment_method: paymentMethod,
            status: 'completed',
            paid_at: now,
          });

        if (insertError) {
          throw new InternalServerErrorException(`Failed to create payment: ${insertError.message}`);
        }
      }
    }

    // Return minimal response - frontend doesn't use this but we maintain API contract
    return {
      id: orderId,
      tenantId,
      paymentStatus: updateDto.paymentStatus,
      paidAt: updateDto.paymentStatus === 'paid' ? now : null,
      updatedAt: now,
      payments: [], // Empty array - frontend doesn't use this
    } as any;
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
    if (order.order_type === 'dine_in') {
      // Get all tables associated with this order (from junction table)
      const { data: orderTables } = await supabase
        .from('order_tables')
        .select('table_id')
        .eq('order_id', order.id);
      
      const tableIds: string[] = [];
      if (orderTables && orderTables.length > 0) {
        tableIds.push(...orderTables.map(ot => ot.table_id));
      } else if (order.table_id) {
        // Fallback to legacy table_id field
        tableIds.push(order.table_id);
      }
      
      if (tableIds.length > 0) {
        const uniqueTableIds = [...new Set(tableIds)];
        await supabase
          .from('tables')
          .update({ status: 'available', updated_at: new Date().toISOString() })
          .in('id', uniqueTableIds)
          .eq('branch_id', order.branch_id);
      }
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
