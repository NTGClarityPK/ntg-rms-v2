import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { AddStockDto } from './dto/add-stock.dto';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { InventoryReportsQueryDto } from './dto/inventory-reports.dto';
import { PaginationParams, PaginatedResponse, getPaginationParams, createPaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class InventoryService {
  constructor(private supabaseService: SupabaseService) {}

  // ============================================
  // INGREDIENT MANAGEMENT
  // ============================================

  /**
   * Get all ingredients for a tenant
   */
  async getIngredients(
    tenantId: string,
    filters?: { category?: string; isActive?: boolean },
    pagination?: PaginationParams,
  ): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Build count query
    let countQuery = supabase
      .from('ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    let query = supabase
      .from('ingredients')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (filters?.category) {
      query = query.eq('category', filters.category);
      countQuery = countQuery.eq('category', filters.category);
    }

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
      countQuery = countQuery.eq('is_active', filters.isActive);
    }

    // Get total count
    const { count: totalCount } = await countQuery;

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch ingredients: ${error.message}`);
    }

    // Transform snake_case to camelCase
    const transformedData = (data || []).map((ing: any) => ({
      id: ing.id,
      tenantId: ing.tenant_id,
      name: ing.name,
      category: ing.category,
      unitOfMeasurement: ing.unit_of_measurement,
      currentStock: Number(ing.current_stock) || 0,
      minimumThreshold: Number(ing.minimum_threshold) || 0,
      costPerUnit: Number(ing.cost_per_unit) || 0,
      storageLocation: ing.storage_location,
      isActive: ing.is_active,
      createdAt: ing.created_at,
      updatedAt: ing.updated_at,
      deletedAt: ing.deleted_at,
    }));

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(transformedData, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return transformedData;
  }

  /**
   * Get ingredient by ID
   */
  async getIngredientById(tenantId: string, ingredientId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .eq('id', ingredientId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Ingredient not found');
      }
      throw new InternalServerErrorException(`Failed to fetch ingredient: ${error.message}`);
    }

    // Transform snake_case to camelCase
    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      category: data.category,
      unitOfMeasurement: data.unit_of_measurement,
      currentStock: Number(data.current_stock) || 0,
      minimumThreshold: Number(data.minimum_threshold) || 0,
      costPerUnit: Number(data.cost_per_unit) || 0,
      storageLocation: data.storage_location,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
    };
  }

  /**
   * Create a new ingredient
   */
  async createIngredient(tenantId: string, createDto: CreateIngredientDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data, error } = await supabase
      .from('ingredients')
      .insert({
        tenant_id: tenantId,
        name: createDto.name,
        category: createDto.category || null,
        unit_of_measurement: createDto.unitOfMeasurement,
        current_stock: createDto.currentStock || 0,
        minimum_threshold: createDto.minimumThreshold || 0,
        cost_per_unit: createDto.costPerUnit || 0,
        storage_location: createDto.storageLocation || null,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to create ingredient: ${error.message}`);
    }

    // Transform snake_case to camelCase
    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      category: data.category,
      unitOfMeasurement: data.unit_of_measurement,
      currentStock: Number(data.current_stock) || 0,
      minimumThreshold: Number(data.minimum_threshold) || 0,
      costPerUnit: Number(data.cost_per_unit) || 0,
      storageLocation: data.storage_location,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
    };
  }

  /**
   * Update an ingredient
   */
  async updateIngredient(
    tenantId: string,
    ingredientId: string,
    updateDto: UpdateIngredientDto,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if ingredient exists
    await this.getIngredientById(tenantId, ingredientId);

    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name;
    if (updateDto.category !== undefined) updateData.category = updateDto.category;
    if (updateDto.unitOfMeasurement !== undefined)
      updateData.unit_of_measurement = updateDto.unitOfMeasurement;
    if (updateDto.currentStock !== undefined) updateData.current_stock = updateDto.currentStock;
    if (updateDto.minimumThreshold !== undefined)
      updateData.minimum_threshold = updateDto.minimumThreshold;
    if (updateDto.costPerUnit !== undefined) updateData.cost_per_unit = updateDto.costPerUnit;
    if (updateDto.storageLocation !== undefined)
      updateData.storage_location = updateDto.storageLocation;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;

    const { data, error } = await supabase
      .from('ingredients')
      .update(updateData)
      .eq('id', ingredientId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to update ingredient: ${error.message}`);
    }

    // Transform snake_case to camelCase
    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      category: data.category,
      unitOfMeasurement: data.unit_of_measurement,
      currentStock: Number(data.current_stock) || 0,
      minimumThreshold: Number(data.minimum_threshold) || 0,
      costPerUnit: Number(data.cost_per_unit) || 0,
      storageLocation: data.storage_location,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
    };
  }

  /**
   * Delete an ingredient (soft delete)
   */
  async deleteIngredient(tenantId: string, ingredientId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if ingredient exists
    await this.getIngredientById(tenantId, ingredientId);

    // Check if ingredient is used in any recipes
    const { data: recipes } = await supabase
      .from('recipes')
      .select('id')
      .eq('ingredient_id', ingredientId)
      .limit(1);

    if (recipes && recipes.length > 0) {
      throw new BadRequestException(
        'Cannot delete ingredient that is used in recipes. Please remove it from recipes first.',
      );
    }

    const { error } = await supabase
      .from('ingredients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ingredientId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete ingredient: ${error.message}`);
    }

    return { message: 'Ingredient deleted successfully' };
  }

  // ============================================
  // STOCK MANAGEMENT
  // ============================================

  /**
   * Add stock (Purchase Entry)
   */
  async addStock(tenantId: string, userId: string, addDto: AddStockDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify ingredient exists
    const ingredient = await this.getIngredientById(tenantId, addDto.ingredientId);

    const totalCost = addDto.quantity * addDto.unitCost;

    // Create stock transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('stock_transactions')
      .insert({
        tenant_id: tenantId,
        branch_id: addDto.branchId || null,
        ingredient_id: addDto.ingredientId,
        transaction_type: 'purchase',
        quantity: addDto.quantity,
        unit_cost: addDto.unitCost,
        total_cost: totalCost,
        reason: addDto.reason || 'Stock purchase',
        supplier_name: addDto.supplierName || null,
        invoice_number: addDto.invoiceNumber || null,
        transaction_date: addDto.transactionDate || new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();

    if (transactionError) {
      throw new InternalServerErrorException(
        `Failed to create stock transaction: ${transactionError.message}`,
      );
    }

    // Update ingredient stock
    const newStock = Number(ingredient.currentStock) + Number(addDto.quantity);
    const { error: updateError } = await supabase
      .from('ingredients')
      .update({ current_stock: newStock })
      .eq('id', addDto.ingredientId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(
        `Failed to update ingredient stock: ${updateError.message}`,
      );
    }

    // Transform snake_case to camelCase
    return {
      id: transaction.id,
      tenantId: transaction.tenant_id,
      branchId: transaction.branch_id,
      ingredientId: transaction.ingredient_id,
      transactionType: transaction.transaction_type,
      quantity: Number(transaction.quantity) || 0,
      unitCost: transaction.unit_cost ? Number(transaction.unit_cost) : undefined,
      totalCost: transaction.total_cost ? Number(transaction.total_cost) : undefined,
      reason: transaction.reason,
      supplierName: transaction.supplier_name,
      invoiceNumber: transaction.invoice_number,
      referenceId: transaction.reference_id,
      transactionDate: transaction.transaction_date,
      createdAt: transaction.created_at,
      createdBy: transaction.created_by,
      newStock,
    };
  }

  /**
   * Deduct stock (Usage/Waste)
   */
  async deductStock(tenantId: string, userId: string, deductDto: DeductStockDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify ingredient exists and has enough stock
    const ingredient = await this.getIngredientById(tenantId, deductDto.ingredientId);

    if (Number(ingredient.currentStock) < Number(deductDto.quantity)) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${ingredient.currentStock}, Requested: ${deductDto.quantity}`,
      );
    }

    // Determine transaction type from reason (must be <= 50 chars for VARCHAR(50))
    // If reason is a valid transaction type (usage, waste, damaged, expired), use it
    // Otherwise, default to 'usage' and put the full reason in the reason field
    const validTransactionTypes = ['usage', 'waste', 'damaged', 'expired'];
    const transactionType = validTransactionTypes.includes(deductDto.reason?.toLowerCase() || '') 
      ? deductDto.reason.toLowerCase() 
      : 'usage';
    const reasonText = validTransactionTypes.includes(deductDto.reason?.toLowerCase() || '') 
      ? deductDto.reason 
      : (deductDto.reason || 'Stock deduction');

    // Create stock transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('stock_transactions')
      .insert({
        tenant_id: tenantId,
        branch_id: deductDto.branchId || null,
        ingredient_id: deductDto.ingredientId,
        transaction_type: transactionType, // Must be <= 50 chars (VARCHAR(50))
        quantity: -Math.abs(deductDto.quantity), // Negative for deduction
        reason: reasonText, // Can be long (TEXT field)
        reference_id: deductDto.referenceId || null,
        transaction_date: deductDto.transactionDate || new Date().toISOString(),
        created_by: userId,
      })
      .select(`
        *,
        ingredient:ingredients(id, name, unit_of_measurement)
      `)
      .single();

    if (transactionError) {
      throw new InternalServerErrorException(
        `Failed to create stock transaction: ${transactionError.message}`,
      );
    }

    // Update ingredient stock
    const newStock = Number(ingredient.currentStock) - Number(deductDto.quantity);
    const { error: updateError } = await supabase
      .from('ingredients')
      .update({ current_stock: Math.max(0, newStock) })
      .eq('id', deductDto.ingredientId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(
        `Failed to update ingredient stock: ${updateError.message}`,
      );
    }

    // Transform snake_case to camelCase
    return {
      id: transaction.id,
      tenantId: transaction.tenant_id,
      branchId: transaction.branch_id,
      ingredientId: transaction.ingredient_id,
      transactionType: transaction.transaction_type,
      quantity: Number(transaction.quantity) || 0,
      unitCost: transaction.unit_cost ? Number(transaction.unit_cost) : undefined,
      totalCost: transaction.total_cost ? Number(transaction.total_cost) : undefined,
      reason: transaction.reason,
      supplierName: transaction.supplier_name,
      invoiceNumber: transaction.invoice_number,
      referenceId: transaction.reference_id,
      transactionDate: transaction.transaction_date,
      createdAt: transaction.created_at,
      createdBy: transaction.created_by,
      ingredient: transaction.ingredient
        ? {
            id: transaction.ingredient.id,
            name: transaction.ingredient.name,
            unitOfMeasurement: transaction.ingredient.unit_of_measurement,
          }
        : undefined,
      newStock: Math.max(0, newStock),
    };
  }

  /**
   * Adjust stock (Physical count correction)
   */
  async adjustStock(tenantId: string, userId: string, adjustDto: AdjustStockDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify ingredient exists
    const ingredient = await this.getIngredientById(tenantId, adjustDto.ingredientId);

    const currentStock = Number(ingredient.currentStock);
    const newStock = Number(adjustDto.newQuantity);
    const difference = newStock - currentStock;

    // Create stock transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('stock_transactions')
      .insert({
        tenant_id: tenantId,
        branch_id: adjustDto.branchId || null,
        ingredient_id: adjustDto.ingredientId,
        transaction_type: 'adjustment',
        quantity: difference,
        reason: adjustDto.reason || 'Stock adjustment',
        transaction_date: adjustDto.transactionDate || new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();

    if (transactionError) {
      throw new InternalServerErrorException(
        `Failed to create stock transaction: ${transactionError.message}`,
      );
    }

    // Update ingredient stock
    const { error: updateError } = await supabase
      .from('ingredients')
      .update({ current_stock: newStock })
      .eq('id', adjustDto.ingredientId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(
        `Failed to update ingredient stock: ${updateError.message}`,
      );
    }

    // Transform snake_case to camelCase
    return {
      id: transaction.id,
      tenantId: transaction.tenant_id,
      branchId: transaction.branch_id,
      ingredientId: transaction.ingredient_id,
      transactionType: transaction.transaction_type,
      quantity: Number(transaction.quantity) || 0,
      unitCost: transaction.unit_cost ? Number(transaction.unit_cost) : undefined,
      totalCost: transaction.total_cost ? Number(transaction.total_cost) : undefined,
      reason: transaction.reason,
      supplierName: transaction.supplier_name,
      invoiceNumber: transaction.invoice_number,
      referenceId: transaction.reference_id,
      transactionDate: transaction.transaction_date,
      createdAt: transaction.created_at,
      createdBy: transaction.created_by,
      previousStock: currentStock,
      newStock,
      difference,
    };
  }

  /**
   * Transfer stock between branches
   */
  async transferStock(tenantId: string, userId: string, transferDto: TransferStockDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify ingredient exists
    const ingredient = await this.getIngredientById(tenantId, transferDto.ingredientId);

    // Check if source branch has enough stock
    // Note: In a multi-branch system, you might want to track stock per branch
    // For now, we'll use the main ingredient stock
    if (Number(ingredient.currentStock) < Number(transferDto.quantity)) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${ingredient.currentStock}, Requested: ${transferDto.quantity}`,
      );
    }

    // Verify branches exist and belong to tenant
    const { data: fromBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', transferDto.fromBranchId)
      .eq('tenant_id', tenantId)
      .single();

    if (!fromBranch) {
      throw new NotFoundException('Source branch not found');
    }

    const { data: toBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', transferDto.toBranchId)
      .eq('tenant_id', tenantId)
      .single();

    if (!toBranch) {
      throw new NotFoundException('Destination branch not found');
    }

    // Create transfer out transaction
    const { data: transferOut, error: outError } = await supabase
      .from('stock_transactions')
      .insert({
        tenant_id: tenantId,
        branch_id: transferDto.fromBranchId,
        ingredient_id: transferDto.ingredientId,
        transaction_type: 'transfer_out',
        quantity: -Math.abs(transferDto.quantity),
        reason: transferDto.reason || `Transfer to branch ${toBranch.id}`,
        transaction_date: transferDto.transactionDate || new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();

    if (outError) {
      throw new InternalServerErrorException(
        `Failed to create transfer out transaction: ${outError.message}`,
      );
    }

    // Create transfer in transaction
    const { data: transferIn, error: inError } = await supabase
      .from('stock_transactions')
      .insert({
        tenant_id: tenantId,
        branch_id: transferDto.toBranchId,
        ingredient_id: transferDto.ingredientId,
        transaction_type: 'transfer_in',
        quantity: transferDto.quantity,
        reason: transferDto.reason || `Transfer from branch ${fromBranch.id}`,
        transaction_date: transferDto.transactionDate || new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();

    if (inError) {
      throw new InternalServerErrorException(
        `Failed to create transfer in transaction: ${inError.message}`,
      );
    }

    // Note: In a multi-branch system, you would update branch-specific stock
    // For now, the main ingredient stock remains the same (transfer doesn't change total)
    // But we record the transactions for tracking

    // Transform snake_case to camelCase
    const transformTransaction = (tx: any) => ({
      id: tx.id,
      tenantId: tx.tenant_id,
      branchId: tx.branch_id,
      ingredientId: tx.ingredient_id,
      transactionType: tx.transaction_type,
      quantity: Number(tx.quantity) || 0,
      unitCost: tx.unit_cost ? Number(tx.unit_cost) : undefined,
      totalCost: tx.total_cost ? Number(tx.total_cost) : undefined,
      reason: tx.reason,
      supplierName: tx.supplier_name,
      invoiceNumber: tx.invoice_number,
      referenceId: tx.reference_id,
      transactionDate: tx.transaction_date,
      createdAt: tx.created_at,
      createdBy: tx.created_by,
    });

    return {
      transferOut: transformTransaction(transferOut),
      transferIn: transformTransaction(transferIn),
      message: 'Stock transferred successfully',
    };
  }

  /**
   * Get stock transactions
   */
  async getStockTransactions(
    tenantId: string,
    filters?: InventoryReportsQueryDto,
    pagination?: PaginationParams,
  ): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Build count query
    let countQuery = supabase
      .from('stock_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    let query = supabase
      .from('stock_transactions')
      .select(
        `
        *,
        ingredient:ingredients(id, name, unit_of_measurement),
        branch:branches(id, name),
        created_by_user:users!stock_transactions_created_by_fkey(id, name)
      `,
      )
      .eq('tenant_id', tenantId)
      .order('transaction_date', { ascending: false });

    if (filters?.branchId) {
      query = query.eq('branch_id', filters.branchId);
      countQuery = countQuery.eq('branch_id', filters.branchId);
    }

    if (filters?.ingredientId) {
      query = query.eq('ingredient_id', filters.ingredientId);
      countQuery = countQuery.eq('ingredient_id', filters.ingredientId);
    }

    if (filters?.startDate) {
      query = query.gte('transaction_date', filters.startDate);
      countQuery = countQuery.gte('transaction_date', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('transaction_date', filters.endDate);
      countQuery = countQuery.lte('transaction_date', filters.endDate);
    }

    // Get total count
    const { count: totalCount } = await countQuery;

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch stock transactions: ${error.message}`,
      );
    }

    // Transform snake_case to camelCase
    const transformedData = (data || []).map((tx: any) => ({
      id: tx.id,
      tenantId: tx.tenant_id,
      branchId: tx.branch_id,
      ingredientId: tx.ingredient_id,
      transactionType: tx.transaction_type,
      quantity: Number(tx.quantity) || 0,
      unitCost: tx.unit_cost ? Number(tx.unit_cost) : undefined,
      totalCost: tx.total_cost ? Number(tx.total_cost) : undefined,
      reason: tx.reason,
      supplierName: tx.supplier_name,
      invoiceNumber: tx.invoice_number,
      referenceId: tx.reference_id,
      transactionDate: tx.transaction_date,
      createdAt: tx.created_at,
      createdBy: tx.created_by,
      ingredient: tx.ingredient
        ? {
            id: tx.ingredient.id,
            name: tx.ingredient.name,
            unitOfMeasurement: tx.ingredient.unit_of_measurement,
          }
        : undefined,
      branch: tx.branch
        ? {
            id: tx.branch.id,
            name: tx.branch.name,
          }
        : undefined,
      createdByUser: tx.created_by_user
        ? {
            id: tx.created_by_user.id,
            name: tx.created_by_user.name,
          }
        : undefined,
    }));

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(transformedData, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return transformedData;
  }

  // ============================================
  // RECIPE MANAGEMENT
  // ============================================

  /**
   * Get all recipes for a tenant
   */
  async getRecipes(
    tenantId: string,
    foodItemId?: string,
    addOnId?: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Build count query (simplified - count all recipes for tenant)
    let countQuery = supabase
      .from('recipes')
      .select('*', { count: 'exact', head: true });

    let query = supabase
      .from('recipes')
      .select(
        `
        *,
        food_item:food_items(id, name),
        add_on:add_ons(id, name),
        ingredient:ingredients(id, name, unit_of_measurement, current_stock)
      `,
      )
      .order('created_at', { ascending: false });

    if (foodItemId) {
      query = query.eq('food_item_id', foodItemId).is('add_on_id', null);
      countQuery = countQuery.eq('food_item_id', foodItemId).is('add_on_id', null);
    } else if (addOnId) {
      // Verify add-on belongs to tenant
      const { data: addOnGroup } = await supabase
        .from('add_ons')
        .select('add_on_group_id, add_on_groups!inner(tenant_id)')
        .eq('id', addOnId)
        .is('deleted_at', null)
        .single();

      if (!addOnGroup || (addOnGroup as any).add_on_groups.tenant_id !== tenantId) {
        throw new NotFoundException('Add-on not found');
      }

      query = query.eq('add_on_id', addOnId).is('food_item_id', null);
      countQuery = countQuery.eq('add_on_id', addOnId).is('food_item_id', null);
    } else {
      // Filter by tenant through food_items and add_ons
      const [foodItemsResult, addOnGroupsResult] = await Promise.all([
        supabase
          .from('food_items')
          .select('id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null),
        supabase
          .from('add_on_groups')
          .select('id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null),
      ]);

      const foodItemIds = foodItemsResult.data?.map((fi) => fi.id) || [];
      const addOnGroupIds = addOnGroupsResult.data?.map((g) => g.id) || [];

      if (addOnGroupIds.length > 0) {
        const { data: addOns } = await supabase
          .from('add_ons')
          .select('id')
          .in('add_on_group_id', addOnGroupIds)
          .is('deleted_at', null);
        const addOnIds = addOns?.map((a) => a.id) || [];

        if (foodItemIds.length > 0 && addOnIds.length > 0) {
          query = query.or(`food_item_id.in.(${foodItemIds.join(',')}),add_on_id.in.(${addOnIds.join(',')})`);
          countQuery = countQuery.or(`food_item_id.in.(${foodItemIds.join(',')}),add_on_id.in.(${addOnIds.join(',')})`);
        } else if (foodItemIds.length > 0) {
          query = query.in('food_item_id', foodItemIds).is('add_on_id', null);
          countQuery = countQuery.in('food_item_id', foodItemIds).is('add_on_id', null);
        } else if (addOnIds.length > 0) {
          query = query.in('add_on_id', addOnIds).is('food_item_id', null);
          countQuery = countQuery.in('add_on_id', addOnIds).is('food_item_id', null);
        } else {
          return pagination ? createPaginatedResponse([], 0, pagination.page || 1, pagination.limit || 10) : [];
        }
      } else if (foodItemIds.length > 0) {
        query = query.in('food_item_id', foodItemIds).is('add_on_id', null);
        countQuery = countQuery.in('food_item_id', foodItemIds).is('add_on_id', null);
      } else {
        return pagination ? createPaginatedResponse([], 0, pagination.page || 1, pagination.limit || 10) : [];
      }
    }

    // Get total count
    const { count: totalCount } = await countQuery;

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch recipes: ${error.message}`);
    }

    // Transform snake_case to camelCase
    const transformedData = (data || []).map((recipe: any) => ({
      id: recipe.id,
      foodItemId: recipe.food_item_id,
      addOnId: recipe.add_on_id,
      ingredientId: recipe.ingredient_id,
      quantity: Number(recipe.quantity) || 0,
      unit: recipe.unit,
      foodItem: recipe.food_item
        ? {
            id: recipe.food_item.id,
            name: recipe.food_item.name,
          }
        : undefined,
      addOn: recipe.add_on
        ? {
            id: recipe.add_on.id,
            name: recipe.add_on.name,
          }
        : undefined,
      ingredient: recipe.ingredient
        ? {
            id: recipe.ingredient.id,
            name: recipe.ingredient.name,
            unitOfMeasurement: recipe.ingredient.unit_of_measurement,
            currentStock: Number(recipe.ingredient.current_stock) || 0,
          }
        : undefined,
    }));

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(transformedData, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return transformedData;
  }

  /**
   * Get recipe by food item ID
   */
  async getRecipeByFoodItemId(tenantId: string, foodItemId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify food item belongs to tenant
    const { data: foodItem } = await supabase
      .from('food_items')
      .select('id')
      .eq('id', foodItemId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!foodItem) {
      throw new NotFoundException('Food item not found');
    }

    const { data, error } = await supabase
      .from('recipes')
      .select(
        `
        *,
        ingredient:ingredients(id, name, unit_of_measurement, current_stock, minimum_threshold)
      `,
      )
      .eq('food_item_id', foodItemId);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch recipe: ${error.message}`);
    }

    // Transform snake_case to camelCase
    return (data || []).map((recipe: any) => ({
      id: recipe.id,
      foodItemId: recipe.food_item_id,
      ingredientId: recipe.ingredient_id,
      quantity: Number(recipe.quantity) || 0,
      unit: recipe.unit,
      ingredient: recipe.ingredient
        ? {
            id: recipe.ingredient.id,
            name: recipe.ingredient.name,
            unitOfMeasurement: recipe.ingredient.unit_of_measurement,
            currentStock: Number(recipe.ingredient.current_stock) || 0,
            minimumThreshold: Number(recipe.ingredient.minimum_threshold) || 0,
          }
        : undefined,
    }));
  }

  /**
   * Create or update recipe for a food item
   */
  async createOrUpdateRecipe(tenantId: string, createDto: CreateRecipeDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify either food item or add-on belongs to tenant
    if (createDto.foodItemId) {
      const { data: foodItem } = await supabase
        .from('food_items')
        .select('id')
        .eq('id', createDto.foodItemId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();

      if (!foodItem) {
        throw new NotFoundException('Food item not found');
      }
    } else if (createDto.addOnId) {
      // Verify add-on belongs to tenant through add-on group
      const { data: addOn } = await supabase
        .from('add_ons')
        .select('add_on_group_id, add_on_groups!inner(tenant_id)')
        .eq('id', createDto.addOnId)
        .is('deleted_at', null)
        .single();

      if (!addOn || (addOn as any).add_on_groups.tenant_id !== tenantId) {
        throw new NotFoundException('Add-on not found');
      }
    } else {
      throw new BadRequestException('Either foodItemId or addOnId must be provided');
    }

    // Verify all ingredients belong to tenant
    const ingredientIds = createDto.ingredients.map((ing) => ing.ingredientId);
    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('id', ingredientIds)
      .is('deleted_at', null);

    if (!ingredients || ingredients.length !== ingredientIds.length) {
      throw new BadRequestException('One or more ingredients not found or do not belong to tenant');
    }

    // Delete existing recipes
    if (createDto.foodItemId) {
      const { error: deleteError } = await supabase
        .from('recipes')
        .delete()
        .eq('food_item_id', createDto.foodItemId)
        .is('add_on_id', null);

      if (deleteError) {
        throw new InternalServerErrorException(
          `Failed to delete existing recipes: ${deleteError.message}`,
        );
      }
    } else if (createDto.addOnId) {
      const { error: deleteError } = await supabase
        .from('recipes')
        .delete()
        .eq('add_on_id', createDto.addOnId)
        .is('food_item_id', null);

      if (deleteError) {
        throw new InternalServerErrorException(
          `Failed to delete existing recipes: ${deleteError.message}`,
        );
      }
    }

    // Insert new recipes
    const recipeData = createDto.ingredients.map((ing) => ({
      food_item_id: createDto.foodItemId || null,
      add_on_id: createDto.addOnId || null,
      ingredient_id: ing.ingredientId,
      quantity: ing.quantity,
      unit: ing.unit,
    }));

    const { data, error } = await supabase
      .from('recipes')
      .insert(recipeData)
      .select(
        `
        *,
        ingredient:ingredients(id, name, unit_of_measurement)
      `,
      );

    if (error) {
      throw new InternalServerErrorException(`Failed to create recipe: ${error.message}`);
    }

    // Transform snake_case to camelCase
    return (data || []).map((recipe: any) => ({
      id: recipe.id,
      foodItemId: recipe.food_item_id,
      addOnId: recipe.add_on_id,
      ingredientId: recipe.ingredient_id,
      quantity: Number(recipe.quantity) || 0,
      unit: recipe.unit,
      ingredient: recipe.ingredient
        ? {
            id: recipe.ingredient.id,
            name: recipe.ingredient.name,
            unitOfMeasurement: recipe.ingredient.unit_of_measurement,
          }
        : undefined,
    }));
  }

  /**
   * Delete recipe for a food item or add-on
   */
  async deleteRecipe(tenantId: string, foodItemId?: string, addOnId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    if (foodItemId) {
      // Verify food item belongs to tenant
      const { data: foodItem } = await supabase
        .from('food_items')
        .select('id')
        .eq('id', foodItemId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();

      if (!foodItem) {
        throw new NotFoundException('Food item not found');
      }

      const { error } = await supabase.from('recipes').delete().eq('food_item_id', foodItemId).is('add_on_id', null);

      if (error) {
        throw new InternalServerErrorException(`Failed to delete recipe: ${error.message}`);
      }
    } else if (addOnId) {
      // Verify add-on belongs to tenant
      const { data: addOn } = await supabase
        .from('add_ons')
        .select('id')
        .eq('id', addOnId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();

      if (!addOn) {
        throw new NotFoundException('Add-on not found');
      }

      const { error } = await supabase.from('recipes').delete().eq('add_on_id', addOnId).is('food_item_id', null);

      if (error) {
        throw new InternalServerErrorException(`Failed to delete recipe: ${error.message}`);
      }
    } else {
      throw new BadRequestException('Either foodItemId or addOnId must be provided');
    }

    return { message: 'Recipe deleted successfully' };
  }

  // ============================================
  // AUTO-DEDUCT STOCK ON ORDER PLACEMENT
  // ============================================

  /**
   * Validate stock availability for order items before order creation
   * Returns list of insufficient ingredients if any
   */
  async validateStockForOrder(
    tenantId: string,
    orderItems: Array<{ foodItemId: string; quantity: number }>,
  ): Promise<{ isValid: boolean; insufficientItems: Array<{ ingredientName: string; available: number; required: number }> }> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const insufficientItems: Array<{ ingredientName: string; available: number; required: number }> = [];

    for (const item of orderItems) {
      // Get recipe for this food item
      const { data: recipes } = await supabase
        .from('recipes')
        .select('*')
        .eq('food_item_id', item.foodItemId);

      if (!recipes || recipes.length === 0) {
        // No recipe defined, skip this item
        continue;
      }

      // Check stock for each ingredient in the recipe
      for (const recipe of recipes) {
        const totalQuantityNeeded = Number(recipe.quantity) * Number(item.quantity);

        // Get ingredient to check stock
        const ingredient = await this.getIngredientById(tenantId, recipe.ingredient_id);
        const availableStock = Number(ingredient.currentStock) || 0;

        if (availableStock < totalQuantityNeeded) {
          insufficientItems.push({
            ingredientName: ingredient.name || 'Unknown',
            available: availableStock,
            required: totalQuantityNeeded,
          });
        }
      }
    }

    return {
      isValid: insufficientItems.length === 0,
      insufficientItems,
    };
  }

  /**
   * Auto-deduct stock when an order is placed
   * This should be called from the orders service when an order is created
   */
  async deductStockForOrder(
    tenantId: string,
    userId: string,
    orderId: string,
    orderItems: Array<{ 
      foodItemId?: string; 
      quantity: number; 
      variationId?: string;
      addOns?: Array<{ addOnId: string; quantity: number }>;
    }>,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const deductions: any[] = [];

    for (const item of orderItems) {
      // Skip if no food item (buffets/combo meals handled separately)
      if (!item.foodItemId) {
        continue;
      }

      // Get variation recipe multiplier if variation is selected
      let variationMultiplier = 1.0;
      if (item.variationId) {
        try {
          // First try to get from variations table (direct ID match)
          const { data: variation, error: variationError } = await supabase
            .from('variations')
            .select('recipe_multiplier')
            .eq('id', item.variationId)
            .is('deleted_at', null)
            .maybeSingle();

          if (variation && !variationError) {
            variationMultiplier = Number(variation.recipe_multiplier) || 1.0;
          } else {
            // Fallback to food_item_variations table
            const { data: foodItemVariation, error: foodItemVarError } = await supabase
              .from('food_item_variations')
              .select('variation_id, variation_group, variation_name, recipe_multiplier')
              .eq('id', item.variationId)
              .maybeSingle();

            if (foodItemVariation && !foodItemVarError) {
              // If food_item_variations has a variation_id, get multiplier from variations table
              if (foodItemVariation.variation_id) {
                const { data: linkedVariation, error: linkedError } = await supabase
                  .from('variations')
                  .select('recipe_multiplier')
                  .eq('id', foodItemVariation.variation_id)
                  .is('deleted_at', null)
                  .maybeSingle();

                if (linkedVariation && !linkedError) {
                  variationMultiplier = Number(linkedVariation.recipe_multiplier) || 1.0;
                } else if (foodItemVariation.recipe_multiplier) {
                  // Fallback to food_item_variations.recipe_multiplier if variations lookup fails
                  variationMultiplier = Number(foodItemVariation.recipe_multiplier) || 1.0;
                }
              } else if (foodItemVariation.recipe_multiplier) {
                // Use recipe_multiplier directly from food_item_variations if available
                variationMultiplier = Number(foodItemVariation.recipe_multiplier) || 1.0;
              } else if (foodItemVariation.variation_group && foodItemVariation.variation_name) {
                // Look up variation by group name and variation name from variations table
                // First, find the variation group
                const { data: variationGroup, error: groupError } = await supabase
                  .from('variation_groups')
                  .select('id')
                  .eq('name', foodItemVariation.variation_group)
                  .eq('tenant_id', tenantId)
                  .is('deleted_at', null)
                  .maybeSingle();

                if (variationGroup && !groupError) {
                  // Now find the variation in that group
                  const { data: matchedVariation, error: matchError } = await supabase
                    .from('variations')
                    .select('recipe_multiplier')
                    .eq('variation_group_id', variationGroup.id)
                    .eq('name', foodItemVariation.variation_name)
                    .is('deleted_at', null)
                    .maybeSingle();

                  if (matchedVariation && !matchError) {
                    variationMultiplier = Number(matchedVariation.recipe_multiplier) || 1.0;
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('Error looking up variation multiplier:', error);
          // Default to 1.0 if lookup fails
          variationMultiplier = 1.0;
        }
      }

      // Get recipe for this food item
      const { data: recipes } = await supabase
        .from('recipes')
        .select('*')
        .eq('food_item_id', item.foodItemId)
        .is('add_on_id', null); // Only get food item recipes, not add-on recipes

      if (recipes && recipes.length > 0) {
        // Deduct stock for each ingredient in the recipe (with variation multiplier)
        for (const recipe of recipes) {
          const baseQuantity = Number(recipe.quantity) * Number(item.quantity);
          const totalQuantityNeeded = baseQuantity * variationMultiplier;

          // Get ingredient
          const ingredient = await this.getIngredientById(tenantId, recipe.ingredient_id);

          // Double-check stock availability before deducting (should have been validated earlier)
          if (Number(ingredient.currentStock) < totalQuantityNeeded) {
            throw new BadRequestException(
              `Insufficient stock for ingredient ${ingredient.name || 'Unknown'}. Available: ${ingredient.currentStock}, Required: ${totalQuantityNeeded}`,
            );
          }

          // Deduct stock
          const deductDto: DeductStockDto = {
            ingredientId: recipe.ingredient_id,
            quantity: totalQuantityNeeded,
            reason: `Auto deduction`,
            referenceId: orderId,
          };

          const result = await this.deductStock(tenantId, userId, deductDto);
          deductions.push({
            ingredientId: recipe.ingredient_id,
            ingredientName: ingredient.name || 'Unknown',
            quantity: totalQuantityNeeded,
            baseQuantity,
            multiplier: variationMultiplier,
            result,
          });
        }
      }

      // Deduct stock for add-on recipes
      if (item.addOns && item.addOns.length > 0) {
        for (const addOn of item.addOns) {
          // Get recipe for this add-on
          const { data: addOnRecipes } = await supabase
            .from('recipes')
            .select('*')
            .eq('add_on_id', addOn.addOnId)
            .is('food_item_id', null); // Only get add-on recipes

          if (addOnRecipes && addOnRecipes.length > 0) {
            // Deduct stock for each ingredient in the add-on recipe
            for (const recipe of addOnRecipes) {
              const totalQuantityNeeded = Number(recipe.quantity) * Number(addOn.quantity) * Number(item.quantity);

              // Get ingredient
              const ingredient = await this.getIngredientById(tenantId, recipe.ingredient_id);

              // Double-check stock availability
              if (Number(ingredient.currentStock) < totalQuantityNeeded) {
                throw new BadRequestException(
                  `Insufficient stock for ingredient ${ingredient.name || 'Unknown'} (from add-on). Available: ${ingredient.currentStock}, Required: ${totalQuantityNeeded}`,
                );
              }

              // Deduct stock
              const deductDto: DeductStockDto = {
                ingredientId: recipe.ingredient_id,
                quantity: totalQuantityNeeded,
                reason: `Auto deduction`,
                referenceId: orderId,
              };

              const result = await this.deductStock(tenantId, userId, deductDto);
              deductions.push({
                ingredientId: recipe.ingredient_id,
                ingredientName: ingredient.name || 'Unknown',
                quantity: totalQuantityNeeded,
                source: 'add-on',
                addOnId: addOn.addOnId,
                result,
              });
            }
          }
        }
      }
    }

    return {
      message: 'Stock deducted successfully for order',
      deductions,
    };
  }

  // ============================================
  // INVENTORY REPORTS
  // ============================================

  /**
   * Get current stock report
   */
  async getCurrentStockReport(tenantId: string, filters?: InventoryReportsQueryDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    let query = supabase
      .from('ingredients')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch stock report: ${error.message}`);
    }

    // Filter low stock items if requested (Supabase doesn't support column-to-column comparison)
    let filteredData = data || [];
    if (filters?.lowStockOnly) {
      filteredData = filteredData.filter(
        (ingredient: any) =>
          Number(ingredient.current_stock) <= Number(ingredient.minimum_threshold),
      );
    }

    // Transform snake_case to camelCase and calculate stock value
    const report = filteredData.map((ingredient: any) => {
      const currentStock = Number(ingredient.current_stock) || 0;
      const costPerUnit = Number(ingredient.cost_per_unit) || 0;
      const minimumThreshold = Number(ingredient.minimum_threshold) || 0;
      const stockValue = currentStock * costPerUnit;
      const isLowStock = currentStock <= minimumThreshold;
      return {
        id: ingredient.id,
        tenantId: ingredient.tenant_id,
        name: ingredient.name,
        category: ingredient.category,
        unitOfMeasurement: ingredient.unit_of_measurement,
        currentStock,
        minimumThreshold,
        costPerUnit,
        storageLocation: ingredient.storage_location,
        isActive: ingredient.is_active,
        createdAt: ingredient.created_at,
        updatedAt: ingredient.updated_at,
        stockValue,
        isLowStock,
      };
    });

    return report;
  }

  /**
   * Get low stock alerts
   */
  async getLowStockAlerts(tenantId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Fetch all active ingredients (Supabase doesn't support column-to-column comparison)
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch low stock alerts: ${error.message}`);
    }

    // Filter ingredients where current_stock <= minimum_threshold
    const lowStockItems = (data || [])
      .filter(
        (ingredient: any) =>
          Number(ingredient.current_stock) <= Number(ingredient.minimum_threshold),
      )
      .sort((a: any, b: any) => Number(a.current_stock) - Number(b.current_stock));

    // Transform snake_case to camelCase
    return lowStockItems.map((ingredient: any) => {
      const currentStock = Number(ingredient.current_stock) || 0;
      const minimumThreshold = Number(ingredient.minimum_threshold) || 0;
      return {
        id: ingredient.id,
        tenantId: ingredient.tenant_id,
        name: ingredient.name,
        category: ingredient.category,
        unitOfMeasurement: ingredient.unit_of_measurement,
        currentStock,
        minimumThreshold,
        costPerUnit: Number(ingredient.cost_per_unit) || 0,
        storageLocation: ingredient.storage_location,
        isActive: ingredient.is_active,
        createdAt: ingredient.created_at,
        updatedAt: ingredient.updated_at,
        stockDeficit: minimumThreshold - currentStock,
      };
    });
  }

  /**
   * Get stock movement report
   */
  async getStockMovementReport(tenantId: string, filters: InventoryReportsQueryDto) {
    return this.getStockTransactions(tenantId, filters);
  }
}
