import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { PushSyncDto } from './dto/push-sync.dto';
import { OrdersService } from '../orders/orders.service';
import { InventoryService } from '../inventory/inventory.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { CreateIngredientDto } from '../inventory/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '../inventory/dto/update-ingredient.dto';
import { AddStockDto } from '../inventory/dto/add-stock.dto';
import { DeductStockDto } from '../inventory/dto/deduct-stock.dto';
import { AdjustStockDto } from '../inventory/dto/adjust-stock.dto';
import { TransferStockDto } from '../inventory/dto/transfer-stock.dto';
import { CreateRecipeDto } from '../inventory/dto/create-recipe.dto';

@Injectable()
export class SyncService {
  constructor(
    private supabaseService: SupabaseService,
    private ordersService: OrdersService,
    private inventoryService: InventoryService,
    private restaurantService: RestaurantService,
  ) {}

  async pushSync(pushDto: PushSyncDto, tenantId: string, userId: string) {
    const results = [];
    const errors = [];

    // Group changes by table and action
    const ordersToCreate: any[] = [];
    const orderItemsByOrderId: Record<string, any[]> = {};

    // Group inventory changes
    const ingredientsToCreate: any[] = [];
    const ingredientsToUpdate: any[] = [];
    const ingredientsToDelete: any[] = [];
    const stockTransactionsToCreate: any[] = [];
    const recipesToCreate: any[] = [];
    
    // Group tenant updates
    const tenantsToUpdate: any[] = [];

    // First pass: collect orders, order items, and inventory changes
    for (const change of pushDto.changes) {
      try {
        if (change.table === 'orders' && change.action === 'CREATE') {
          ordersToCreate.push(change.data);
        } else if (change.table === 'orderItems' && change.action === 'CREATE') {
          const orderId = change.data.orderId;
          if (!orderItemsByOrderId[orderId]) {
            orderItemsByOrderId[orderId] = [];
          }
          orderItemsByOrderId[orderId].push(change.data);
        } else if (change.table === 'ingredients') {
          if (change.action === 'CREATE') {
            ingredientsToCreate.push({ id: change.recordId, data: change.data });
          } else if (change.action === 'UPDATE') {
            ingredientsToUpdate.push({ id: change.recordId, data: change.data });
          } else if (change.action === 'DELETE') {
            ingredientsToDelete.push({ id: change.recordId });
          }
        } else if (change.table === 'stockTransactions' && change.action === 'CREATE') {
          stockTransactionsToCreate.push({ id: change.recordId, data: change.data });
        } else if (change.table === 'recipes' && change.action === 'CREATE') {
          recipesToCreate.push({ id: change.recordId, data: change.data });
        } else if (change.table === 'tenants' && change.action === 'UPDATE') {
          tenantsToUpdate.push({ id: change.recordId, data: change.data });
        } else {
          // Handle other table types (customers, tables, etc.) if needed
          console.log(`Skipping sync for table: ${change.table}, action: ${change.action}`);
        }
      } catch (error) {
        errors.push({
          recordId: change.recordId || change.data?.id,
          table: change.table,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Track successfully synced order IDs to skip duplicate stock transactions
    const syncedOrderIds = new Set<string>();

    // Process each order
    for (const orderData of ordersToCreate) {
      try {
        // Get order items for this order
        const items = orderItemsByOrderId[orderData.id] || [];

        if (items.length === 0) {
          errors.push({
            recordId: orderData.id,
            table: 'orders',
            error: 'Order has no items',
          });
          continue;
        }

        // Transform order items to match CreateOrderDto format
        const orderItems = items.map((item) => {
          // Transform add-ons if they exist
          const addOns = item.addOns?.map((addOn: any) => ({
            addOnId: addOn.addOnId,
            quantity: addOn.quantity || 1,
          })) || [];

          return {
            foodItemId: item.foodItemId,
            quantity: item.quantity,
            variationId: item.variationId,
            addOns: addOns.length > 0 ? addOns : undefined,
            specialInstructions: item.specialInstructions,
          };
        });

        // Validate branch exists before attempting to create order
        // Handle empty string, null, or undefined branchId
        if (!orderData.branchId || orderData.branchId.trim() === '') {
          // Try to get the first active branch for this tenant
          const supabase = this.supabaseService.getServiceRoleClient();
          const { data: defaultBranch } = await supabase
            .from('branches')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!defaultBranch) {
            throw new BadRequestException('No branch found. Please create a branch first.');
          }

          // Use the default branch
          orderData.branchId = defaultBranch.id;
          console.log(`Using default branch ${defaultBranch.id} for order ${orderData.id}`);
        } else {
          // Validate the provided branch exists
          const supabase = this.supabaseService.getServiceRoleClient();
          const { data: branch, error: branchError } = await supabase
            .from('branches')
            .select('id')
            .eq('id', orderData.branchId)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .single();

          if (branchError || !branch) {
            // Try to get the first active branch as fallback
            const { data: fallbackBranch } = await supabase
              .from('branches')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('is_active', true)
              .is('deleted_at', null)
              .limit(1)
              .single();

            if (!fallbackBranch) {
              throw new BadRequestException(`Branch ${orderData.branchId} not found and no default branch available. Please create a branch first.`);
            }

            // Use fallback branch
            console.log(`Branch ${orderData.branchId} not found, using fallback branch ${fallbackBranch.id} for order ${orderData.id}`);
            orderData.branchId = fallbackBranch.id;
          }
        }

        // Create order using OrdersService
        // Note: The backend will recalculate totals, so we pass the items and let it calculate
        // Note: createOrder() automatically deducts stock via deductStockForOrder()
        const createOrderDto = {
          branchId: orderData.branchId,
          counterId: orderData.counterId,
          tableId: orderData.tableId,
          customerId: orderData.customerId,
          orderType: orderData.orderType,
          items: orderItems,
          tokenNumber: orderData.tokenNumber,
          extraDiscountAmount: orderData.discountAmount || 0,
          couponCode: orderData.couponCode,
          specialInstructions: orderData.specialInstructions,
          numberOfPersons: orderData.numberOfPersons,
          paymentTiming: (orderData.paymentStatus === 'paid' ? 'pay_first' : 'pay_after') as 'pay_first' | 'pay_after',
        };

        const createdOrder = await this.ordersService.createOrder(
          tenantId,
          userId,
          createOrderDto,
        );

        // Track this order ID (both original and new ID) to skip duplicate stock transactions
        syncedOrderIds.add(orderData.id);
        syncedOrderIds.add(createdOrder.id);

        results.push({
          table: 'orders',
          recordId: orderData.id,
          newId: createdOrder.id,
          status: 'SUCCESS',
        });

        // Also mark order items as synced
        for (const item of items) {
          results.push({
            table: 'orderItems',
            recordId: item.id,
            newId: item.id, // Order items are created with the order
            status: 'SUCCESS',
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to sync order ${orderData.id}:`, errorMessage);
        
        errors.push({
          table: 'orders',
          recordId: orderData.id,
          error: errorMessage,
        });

        // Mark related order items as failed too
        const items = orderItemsByOrderId[orderData.id] || [];
        for (const item of items) {
          errors.push({
            table: 'orderItems',
            recordId: item.id,
            error: `Parent order failed: ${errorMessage}`,
          });
        }
      }
    }

    // Process ingredients
    for (const ingredient of ingredientsToCreate) {
      try {
        const createDto: CreateIngredientDto = {
          nameEn: ingredient.data.nameEn,
          nameAr: ingredient.data.nameAr,
          category: ingredient.data.category,
          unitOfMeasurement: ingredient.data.unitOfMeasurement,
          currentStock: ingredient.data.currentStock,
          minimumThreshold: ingredient.data.minimumThreshold,
          costPerUnit: ingredient.data.costPerUnit,
          storageLocation: ingredient.data.storageLocation,
          isActive: ingredient.data.isActive !== undefined ? ingredient.data.isActive : true,
        };
        const created = await this.inventoryService.createIngredient(tenantId, createDto);
        results.push({
          table: 'ingredients',
          recordId: ingredient.id,
          newId: created.id,
          status: 'SUCCESS',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          table: 'ingredients',
          recordId: ingredient.id,
          error: errorMessage,
        });
      }
    }

    for (const ingredient of ingredientsToUpdate) {
      try {
        const updateDto: UpdateIngredientDto = {
          nameEn: ingredient.data.nameEn,
          nameAr: ingredient.data.nameAr,
          category: ingredient.data.category,
          unitOfMeasurement: ingredient.data.unitOfMeasurement,
          currentStock: ingredient.data.currentStock,
          minimumThreshold: ingredient.data.minimumThreshold,
          costPerUnit: ingredient.data.costPerUnit,
          storageLocation: ingredient.data.storageLocation,
          isActive: ingredient.data.isActive,
        };
        await this.inventoryService.updateIngredient(tenantId, ingredient.id, updateDto);
        results.push({
          table: 'ingredients',
          recordId: ingredient.id,
          status: 'SUCCESS',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          table: 'ingredients',
          recordId: ingredient.id,
          error: errorMessage,
        });
      }
    }

    for (const ingredient of ingredientsToDelete) {
      try {
        await this.inventoryService.deleteIngredient(tenantId, ingredient.id);
        results.push({
          table: 'ingredients',
          recordId: ingredient.id,
          status: 'SUCCESS',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          table: 'ingredients',
          recordId: ingredient.id,
          error: errorMessage,
        });
      }
    }

    // Process stock transactions
    // Skip stock transactions that reference orders we just synced (to avoid double deduction)
    // The order creation already handles stock deduction automatically
    for (const transaction of stockTransactionsToCreate) {
      try {
        const txData = transaction.data;
        
        // Skip stock transactions with referenceId matching a synced order
        // This prevents double deduction when orders are synced (which auto-deducts stock)
        if (txData.referenceId && syncedOrderIds.has(txData.referenceId)) {
          console.log(`Skipping stock transaction ${transaction.id} - order ${txData.referenceId} already synced and stock deducted`);
          results.push({
            table: 'stockTransactions',
            recordId: transaction.id,
            status: 'SKIPPED',
            message: 'Stock already deducted via order sync',
          });
          continue;
        }

        if (txData.transactionType === 'purchase') {
          const addDto: AddStockDto = {
            ingredientId: txData.ingredientId,
            quantity: txData.quantity,
            unitCost: txData.unitCost || 0,
            branchId: txData.branchId,
            supplierName: txData.supplierName,
            invoiceNumber: txData.invoiceNumber,
            reason: txData.reason || 'purchase',
            transactionDate: txData.transactionDate,
          };
          await this.inventoryService.addStock(tenantId, userId, addDto);
        } else if (txData.transactionType === 'usage') {
          const deductDto: DeductStockDto = {
            ingredientId: txData.ingredientId,
            quantity: Math.abs(txData.quantity),
            branchId: txData.branchId,
            reason: txData.reason || 'usage',
            referenceId: txData.referenceId,
            transactionDate: txData.transactionDate,
          };
          await this.inventoryService.deductStock(tenantId, userId, deductDto);
        } else if (txData.transactionType === 'adjustment') {
          const adjustDto: AdjustStockDto = {
            ingredientId: txData.ingredientId,
            newQuantity: txData.quantity,
            branchId: txData.branchId,
            reason: txData.reason || 'adjustment',
            transactionDate: txData.transactionDate,
          };
          await this.inventoryService.adjustStock(tenantId, userId, adjustDto);
        }
        results.push({
          table: 'stockTransactions',
          recordId: transaction.id,
          status: 'SUCCESS',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          table: 'stockTransactions',
          recordId: transaction.id,
          error: errorMessage,
        });
      }
    }

    // Process recipes (group by foodItemId)
    const recipesByFoodItem: Record<string, any[]> = {};
    for (const recipe of recipesToCreate) {
      const foodItemId = recipe.data.foodItemId;
      if (!recipesByFoodItem[foodItemId]) {
        recipesByFoodItem[foodItemId] = [];
      }
      recipesByFoodItem[foodItemId].push(recipe.data);
    }

    for (const [foodItemId, recipes] of Object.entries(recipesByFoodItem)) {
      try {
        const createDto: CreateRecipeDto = {
          foodItemId,
          ingredients: recipes.map((r) => ({
            ingredientId: r.ingredientId,
            quantity: r.quantity,
            unit: r.unit,
          })),
        };
        await this.inventoryService.createOrUpdateRecipe(tenantId, createDto);
        for (const recipe of recipes) {
          results.push({
            table: 'recipes',
            recordId: recipe.id || `${foodItemId}-${recipe.ingredientId}`,
            status: 'SUCCESS',
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        for (const recipe of recipes) {
          errors.push({
            table: 'recipes',
            recordId: recipe.id || `${foodItemId}-${recipe.ingredientId}`,
            error: errorMessage,
          });
        }
      }
    }

    // Process tenant updates
    for (const tenant of tenantsToUpdate) {
      try {
        // The recordId should be the tenantId
        const tenantId = tenant.id;
        await this.restaurantService.updateRestaurantInfo(tenantId, tenant.data);
        results.push({
          table: 'tenants',
          recordId: tenantId,
          status: 'SUCCESS',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          table: 'tenants',
          recordId: tenant.id,
          error: errorMessage,
        });
      }
    }

    return {
      success: errors.length === 0,
      synced: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async pullSync(tenantId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    const now = new Date().toISOString();

    try {
      // Fetch all data for the tenant
      // First fetch add-on groups to filter add-ons
      const { data: addOnGroupsData } = await supabase
        .from('add_on_groups')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      
      const addOnGroupIds = (addOnGroupsData || []).map((g: any) => g.id);

      // Fetch branches to filter counters and tables
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      
      const branchIds = (branchesData || []).map((b: any) => b.id);

      // Fetch food item IDs to filter discounts
      const { data: foodItemsData } = await supabase
        .from('food_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      
      const foodItemIds = (foodItemsData || []).map((f: any) => f.id);

      const [branches, categories, foodItems, addOnGroups, addOns, counters, tables, foodItemDiscounts, ingredients, recipes] = await Promise.all([
        // Branches
        supabase
          .from('branches')
          .select('*')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true }),
        
        // Categories
        supabase
          .from('categories')
          .select('*')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('display_order', { ascending: true }),
        
        // Food Items
        supabase
          .from('food_items')
          .select('*')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('display_order', { ascending: true }),
        
        // Add-on Groups
        supabase
          .from('add_on_groups')
          .select('*')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('display_order', { ascending: true }),
        
        // Add-ons - filter by group IDs that belong to this tenant
        addOnGroupIds.length > 0
          ? supabase
              .from('add_ons')
              .select('*')
              .in('add_on_group_id', addOnGroupIds)
              .is('deleted_at', null)
              .order('display_order', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        
        // Counters - filter by branch IDs that belong to this tenant
        branchIds.length > 0
          ? supabase
              .from('counters')
              .select('*')
              .in('branch_id', branchIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [], error: null }),
        
        // Tables - filter by branch IDs that belong to this tenant
        branchIds.length > 0
          ? supabase
              .from('tables')
              .select('*')
              .in('branch_id', branchIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [], error: null }),
        
        // Food Item Discounts - filter by food item IDs that belong to this tenant
        foodItemIds.length > 0
          ? supabase
              .from('food_item_discounts')
              .select('*')
              .in('food_item_id', foodItemIds)
              .eq('is_active', true)
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        
        // Ingredients
        supabase
          .from('ingredients')
          .select('*')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('name_en', { ascending: true }),
        
        // Recipes - filter by food item IDs that belong to this tenant
        foodItemIds.length > 0
          ? supabase
              .from('recipes')
              .select('*')
              .in('food_item_id', foodItemIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Transform data to match frontend IndexedDB format
      const transformedData = {
        branches: (branches.data || []).map((b: any) => ({
          id: b.id,
          tenantId: b.tenant_id,
          nameEn: b.name_en,
          nameAr: b.name_ar,
          code: b.code,
          addressEn: b.address_en,
          addressAr: b.address_ar,
          city: b.city,
          state: b.state,
          country: b.country,
          phone: b.phone,
          email: b.email,
          latitude: b.latitude,
          longitude: b.longitude,
          managerId: b.manager_id,
          isActive: b.is_active,
          createdAt: b.created_at,
          updatedAt: b.updated_at,
          deletedAt: b.deleted_at,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
        
        categories: (categories.data || []).map((c: any) => ({
          id: c.id,
          tenantId: c.tenant_id,
          nameEn: c.name_en,
          nameAr: c.name_ar,
          descriptionEn: c.description_en,
          descriptionAr: c.description_ar,
          imageUrl: c.image_url,
          categoryType: c.category_type,
          parentId: c.parent_id,
          displayOrder: c.display_order,
          isActive: c.is_active,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          deletedAt: c.deleted_at,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
        
        foodItems: (foodItems.data || []).map((f: any) => ({
          id: f.id,
          tenantId: f.tenant_id,
          categoryId: f.category_id,
          nameEn: f.name_en,
          nameAr: f.name_ar,
          descriptionEn: f.description_en,
          descriptionAr: f.description_ar,
          imageUrl: f.image_url,
          basePrice: parseFloat(f.base_price || 0),
          stockType: f.stock_type,
          stockQuantity: f.stock_quantity || 0,
          menuType: f.menu_type, // Legacy
          ageLimit: f.age_limit,
          displayOrder: f.display_order,
          isActive: f.is_active,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
          deletedAt: f.deleted_at,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
        
        addOnGroups: (addOnGroups.data || []).map((g: any) => ({
          id: g.id,
          tenantId: g.tenant_id,
          nameEn: g.name_en,
          nameAr: g.name_ar,
          selectionType: g.selection_type,
          isRequired: g.is_required,
          minSelections: g.min_selections,
          maxSelections: g.max_selections,
          displayOrder: g.display_order,
          isActive: g.is_active,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          deletedAt: g.deleted_at,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
        
        addOns: (addOns.data || []).map((a: any) => ({
          id: a.id,
          addOnGroupId: a.add_on_group_id,
          nameEn: a.name_en,
          nameAr: a.name_ar,
          price: parseFloat(a.price || 0),
          displayOrder: a.display_order,
          isActive: a.is_active,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
          deletedAt: a.deleted_at,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
        
        counters: (counters.data || []).map((c: any) => ({
          id: c.id,
          branchId: c.branch_id,
          name: c.name,
          code: c.code,
          isActive: c.is_active,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          deletedAt: c.deleted_at,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
        
        tables: (tables.data || []).map((t: any) => ({
          id: t.id,
          tenantId: tenantId, // Add tenantId for filtering
          branchId: t.branch_id,
          tableNumber: t.table_number,
          name: t.table_number || `Table ${t.table_number}`, // Use table_number as name
          capacity: t.seating_capacity || 4,
          status: t.status || 'available',
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          deletedAt: t.deleted_at,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
        
        foodItemDiscounts: (foodItemDiscounts.data || []).map((d: any) => ({
          id: d.id,
          foodItemId: d.food_item_id,
          discountType: d.discount_type,
          discountValue: parseFloat(d.discount_value || 0),
          startDate: d.start_date,
          endDate: d.end_date,
          reason: d.reason,
          isActive: d.is_active,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        })),
        
        ingredients: (ingredients.data || []).map((i: any) => ({
          id: i.id,
          tenantId: i.tenant_id,
          nameEn: i.name_en,
          nameAr: i.name_ar,
          category: i.category,
          unitOfMeasurement: i.unit_of_measurement,
          currentStock: Number(i.current_stock) || 0,
          minimumThreshold: Number(i.minimum_threshold) || 0,
          costPerUnit: Number(i.cost_per_unit) || 0,
          storageLocation: i.storage_location,
          isActive: i.is_active,
          createdAt: i.created_at,
          updatedAt: i.updated_at,
          deletedAt: i.deleted_at,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
        
        recipes: (recipes.data || []).map((r: any) => ({
          id: r.id,
          foodItemId: r.food_item_id,
          ingredientId: r.ingredient_id,
          quantity: Number(r.quantity) || 0,
          unit: r.unit,
          createdAt: r.created_at || now,
          updatedAt: r.updated_at || now,
          lastSynced: now,
          syncStatus: 'synced' as const,
        })),
      };

      return {
        success: true,
        timestamp: now,
        data: transformedData,
      };
    } catch (error) {
      console.error('Failed to pull sync:', error);
      throw new Error(`Failed to pull sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getSyncStatus() {
    return { message: 'Get sync status - to be implemented' };
  }

  async resolveConflicts(resolveDto: any) {
    return { message: 'Resolve conflicts - to be implemented' };
  }
}

