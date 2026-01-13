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
import { TranslationService } from '../translations/services/translation.service';

@Injectable()
export class InventoryService {
  constructor(
    private supabaseService: SupabaseService,
    private translationService: TranslationService,
  ) {}

  // ============================================
  // INGREDIENT MANAGEMENT
  // ============================================

  /**
   * Get all ingredients for a tenant (optionally filtered by branch)
   * @param language - Language code for translations (default: 'en')
   */
  async getIngredients(
    tenantId: string,
    filters?: { category?: string; isActive?: boolean; search?: string },
    pagination?: PaginationParams,
    branchId?: string,
    language: string = 'en',
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
      .is('deleted_at', null);

    if (branchId) {
      query = query.eq('branch_id', branchId);
      countQuery = countQuery.eq('branch_id', branchId);
    }

    query = query.order('name', { ascending: true });

    if (filters?.category) {
      query = query.eq('category', filters.category);
      countQuery = countQuery.eq('category', filters.category);
    }

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
      countQuery = countQuery.eq('is_active', filters.isActive);
    }

    // Apply search filter if provided
    if (filters?.search && filters.search.trim()) {
      const searchTerm = filters.search.trim();
      query = query.ilike('name', `%${searchTerm}%`);
      countQuery = countQuery.ilike('name', `%${searchTerm}%`);
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

    // Transform snake_case to camelCase and get translated names
    const transformedData = await Promise.all(
      (data || []).map(async (ing: any) => {
    // Get translated name and storage location if translation exists, otherwise use original
    let translatedName = ing.name;
    let translatedStorageLocation = ing.storage_location;
    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'ingredient',
        entityId: ing.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) {
        translatedName = nameTranslation;
      }

      if (ing.storage_location) {
        const storageTranslation = await this.translationService.getTranslation({
          entityType: 'ingredient',
          entityId: ing.id,
          languageCode: language,
          fieldName: 'storage_location',
          fallbackLanguage: 'en',
        });
        if (storageTranslation) {
          translatedStorageLocation = storageTranslation;
        }
      }
    } catch (translationError) {
      // Use original values if translation fetch fails
      console.warn(`Failed to get translation for ingredient ${ing.id}:`, translationError);
    }

        return {
          id: ing.id,
          tenantId: ing.tenant_id,
          name: translatedName,
          category: ing.category,
          unitOfMeasurement: ing.unit_of_measurement,
          currentStock: Number(ing.current_stock) || 0,
          minimumThreshold: Number(ing.minimum_threshold) || 0,
          costPerUnit: Number(ing.cost_per_unit) || 0,
          storageLocation: translatedStorageLocation,
          isActive: ing.is_active,
          createdAt: ing.created_at,
          updatedAt: ing.updated_at,
          deletedAt: ing.deleted_at,
        };
      }),
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(transformedData, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return transformedData;
  }

  /**
   * Get ingredient by ID
   * @param language - Language code for translations (default: 'en')
   */
  async getIngredientById(tenantId: string, ingredientId: string, language: string = 'en') {
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

    // Get translated name and storage location if translation exists, otherwise use original
    let translatedName = data.name;
    let translatedStorageLocation = data.storage_location;
    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'ingredient',
        entityId: ingredientId,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) {
        translatedName = nameTranslation;
      }

      if (data.storage_location) {
        const storageTranslation = await this.translationService.getTranslation({
          entityType: 'ingredient',
          entityId: ingredientId,
          languageCode: language,
          fieldName: 'storage_location',
          fallbackLanguage: 'en',
        });
        if (storageTranslation) {
          translatedStorageLocation = storageTranslation;
        }
      }
    } catch (translationError) {
      // Use original values if translation fetch fails
      console.warn(`Failed to get translation for ingredient ${ingredientId}:`, translationError);
    }

    // Transform snake_case to camelCase
    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: translatedName,
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
  async createIngredient(tenantId: string, createDto: CreateIngredientDto, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const ingredientData: any = {
        tenant_id: tenantId,
        name: createDto.name,
        category: createDto.category || null,
        unit_of_measurement: createDto.unitOfMeasurement,
        current_stock: createDto.currentStock || 0,
        minimum_threshold: createDto.minimumThreshold || 0,
        cost_per_unit: createDto.costPerUnit || 0,
        storage_location: createDto.storageLocation || null,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
    };

    if (branchId) {
      ingredientData.branch_id = branchId;
    }

    const { data, error } = await supabase
      .from('ingredients')
      .insert(ingredientData)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to create ingredient: ${error.message}`);
    }

    // Generate translations for the name and storage location asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Only translate to tenant-enabled languages (pass tenantId)
    this.translationService.createTranslations({
      entityType: 'ingredient',
      entityId: data.id,
      fieldName: 'name',
      text: createDto.name,
    }, undefined, tenantId).catch((translationError) => {
      console.error('Failed to create translations for ingredient name:', translationError);
    });

    if (createDto.storageLocation) {
      this.translationService.createTranslations({
        entityType: 'ingredient',
        entityId: data.id,
        fieldName: 'storage_location',
        text: createDto.storageLocation,
      }, undefined, tenantId).catch((translationError) => {
        console.error('Failed to create translations for ingredient storage location:', translationError);
      });
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
      message: 'Ingredient created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  /**
   * Update an ingredient
   * @param language - Current user's language (default: 'en'). If name is updated, only this language's translation is updated.
   */
  async updateIngredient(
    tenantId: string,
    ingredientId: string,
    updateDto: UpdateIngredientDto,
    language: string = 'en',
    userId?: string,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if ingredient exists and get current data (using default language for comparison)
    const currentIngredient = await this.getIngredientById(tenantId, ingredientId, 'en');

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

    // If name was updated, update translation for the current language
    if (updateDto.name !== undefined && updateDto.name !== currentIngredient.name) {
      try {
        await this.translationService.updateTranslation(
          {
            entityType: 'ingredient',
            entityId: ingredientId,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      } catch (translationError) {
        // Log but don't fail - ingredient is updated, translation can be fixed later
        console.error('Failed to update translation for ingredient:', translationError);
      }
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

    // Delete translations for this ingredient
    try {
      await this.translationService.deleteEntityTranslations('ingredient', ingredientId);
    } catch (translationError) {
      // Log but don't fail - ingredient is deleted, translations cleanup can happen later
      console.warn(`Failed to delete translations for ingredient ${ingredientId}:`, translationError);
    }

    return { message: 'Ingredient deleted successfully' };
  }

  // ============================================
  // STOCK MANAGEMENT
  // ============================================

  /**
   * Add stock (Purchase Entry)
   */
  async addStock(tenantId: string, userId: string, addDto: AddStockDto, language: string = 'en') {
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

    // Create translations for reason and supplier_name (if provided) asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Only translate to tenant-enabled languages (pass tenantId)
    if (addDto.reason) {
      this.translationService.createTranslations({
        entityType: 'stock_operation',
        entityId: transaction.id,
        fieldName: 'reason',
        text: addDto.reason,
      }, undefined, tenantId).catch((translationError) => {
        console.error('Failed to create translations for stock operation reason:', translationError);
      });
    }

    if (addDto.supplierName) {
      this.translationService.createTranslations({
        entityType: 'stock_operation',
        entityId: transaction.id,
        fieldName: 'supplier_name',
        text: addDto.supplierName,
      }, undefined, tenantId).catch((translationError) => {
        console.error('Failed to create translations for stock operation supplier name:', translationError);
      });
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
  async deductStock(tenantId: string, userId: string, deductDto: DeductStockDto, language: string = 'en') {
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

    // Create translations for reason asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Only translate to tenant-enabled languages (pass tenantId)
    if (reasonText) {
      this.translationService.createTranslations({
        entityType: 'stock_operation',
        entityId: transaction.id,
        fieldName: 'reason',
        text: reasonText,
      }, undefined, tenantId).catch((translationError) => {
        console.error('Failed to create translations for stock operation reason:', translationError);
      });
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
  async adjustStock(tenantId: string, userId: string, adjustDto: AdjustStockDto, language: string = 'en') {
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

    // Create translations for reason asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Only translate to tenant-enabled languages (pass tenantId)
    if (adjustDto.reason) {
      this.translationService.createTranslations({
        entityType: 'stock_operation',
        entityId: transaction.id,
        fieldName: 'reason',
        text: adjustDto.reason,
      }, undefined, tenantId).catch((translationError) => {
        console.error('Failed to create translations for stock operation reason:', translationError);
      });
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
    language: string = 'en',
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

    // Transform snake_case to camelCase with translations
    const transformedData = await Promise.all(
      (data || []).map(async (tx: any) => {
        // Get translations for reason and supplier_name
        let translatedReason = tx.reason;
        let translatedSupplierName = tx.supplier_name;

        try {
          // Only fetch translations if language is not English (to avoid unnecessary lookups)
          if (language !== 'en' && (tx.reason || tx.supplier_name)) {
            // Get all translations for this entity once (more efficient than calling twice)
            const allTranslations = await this.translationService.getEntityTranslations(
              'stock_operation' as any,
              tx.id,
            );
            
            // Check if translation exists for the requested language
            if (tx.reason && allTranslations?.reason?.[language]) {
              translatedReason = allTranslations.reason[language];
            }
            
            if (tx.supplier_name && allTranslations?.supplier_name?.[language]) {
              translatedSupplierName = allTranslations.supplier_name[language];
            }
          }
        } catch (translationError) {
          // Silently fail - translation might not exist yet (created asynchronously)
          // or there might be an error, but we'll use the original value
          console.warn(`Failed to get translations for stock transaction ${tx.id}:`, translationError);
        }

        return {
          id: tx.id,
          tenantId: tx.tenant_id,
          branchId: tx.branch_id,
          ingredientId: tx.ingredient_id,
          transactionType: tx.transaction_type,
          quantity: Number(tx.quantity) || 0,
          unitCost: tx.unit_cost ? Number(tx.unit_cost) : undefined,
          totalCost: tx.total_cost ? Number(tx.total_cost) : undefined,
          reason: translatedReason,
          supplierName: translatedSupplierName,
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
        };
      })
    );

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
   * Get all recipes for a tenant (optionally filtered by branch)
   */
  async getRecipes(
    tenantId: string,
    foodItemId?: string,
    addOnId?: string,
    pagination?: PaginationParams,
    branchId?: string,
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
      );

    if (branchId) {
      // Include recipes for this branch OR recipes with null branch_id (tenant-level recipes)
      // Recipes with null branch_id are tenant-level and visible to all branches
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      countQuery = countQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    // When no branchId is provided, we'll filter by tenant through food_items/add_ons below

    query = query.order('created_at', { ascending: false });

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
  async getRecipeByFoodItemId(tenantId: string, foodItemId: string, branchId?: string) {
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

    let query = supabase
      .from('recipes')
      .select(
        `
        *,
        ingredient:ingredients(id, name, unit_of_measurement, current_stock, minimum_threshold)
      `,
      )
      .eq('food_item_id', foodItemId);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;

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
  async createOrUpdateRecipe(tenantId: string, createDto: CreateRecipeDto, branchId?: string) {
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

    // Delete existing recipes (filter by branch if provided)
    if (createDto.foodItemId) {
      let deleteQuery = supabase
        .from('recipes')
        .delete()
        .eq('food_item_id', createDto.foodItemId)
        .is('add_on_id', null);
      
      if (branchId) {
        deleteQuery = deleteQuery.eq('branch_id', branchId);
      }
      
      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        throw new InternalServerErrorException(
          `Failed to delete existing recipes: ${deleteError.message}`,
        );
      }
    } else if (createDto.addOnId) {
      let deleteQuery = supabase
        .from('recipes')
        .delete()
        .eq('add_on_id', createDto.addOnId)
        .is('food_item_id', null);
      
      if (branchId) {
        deleteQuery = deleteQuery.eq('branch_id', branchId);
      }
      
      const { error: deleteError } = await deleteQuery;

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
      branch_id: branchId || null,
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

    if (orderItems.length === 0) {
      return { isValid: true, insufficientItems: [] };
    }

    // Batch fetch all recipes for all food items in parallel
    const foodItemIds = orderItems.map(item => item.foodItemId);
    const { data: allRecipes } = await supabase
      .from('recipes')
      .select('*')
      .in('food_item_id', foodItemIds)
      .is('add_on_id', null);

    if (!allRecipes || allRecipes.length === 0) {
      return { isValid: true, insufficientItems: [] };
    }

    // Group recipes by food_item_id for quick lookup
    const recipesByFoodItem = new Map<string, typeof allRecipes>();
    for (const recipe of allRecipes) {
      if (!recipesByFoodItem.has(recipe.food_item_id)) {
        recipesByFoodItem.set(recipe.food_item_id, []);
      }
      recipesByFoodItem.get(recipe.food_item_id)!.push(recipe);
    }

    // Collect all unique ingredient IDs
    const ingredientIds = [...new Set(allRecipes.map(r => r.ingredient_id))];

    // Batch fetch all ingredients in parallel
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('ingredients')
      .select('id, name, current_stock')
      .eq('tenant_id', tenantId)
      .in('id', ingredientIds)
      .is('deleted_at', null);

    if (ingredientsError) {
      throw new InternalServerErrorException(`Failed to fetch ingredients: ${ingredientsError.message}`);
    }

    // Create ingredient map for quick lookup
    const ingredientMap = new Map<string, { name: string; currentStock: number }>();
    for (const ing of ingredients || []) {
      ingredientMap.set(ing.id, {
        name: ing.name || 'Unknown',
        currentStock: Number(ing.current_stock) || 0,
      });
    }

    // Check stock for all items
    for (const item of orderItems) {
      const recipes = recipesByFoodItem.get(item.foodItemId);
      if (!recipes || recipes.length === 0) {
        continue;
      }

      for (const recipe of recipes) {
        const totalQuantityNeeded = Number(recipe.quantity) * Number(item.quantity);
        const ingredient = ingredientMap.get(recipe.ingredient_id);

        if (!ingredient) {
          insufficientItems.push({
            ingredientName: 'Unknown',
            available: 0,
            required: totalQuantityNeeded,
          });
          continue;
        }

        if (ingredient.currentStock < totalQuantityNeeded) {
          insufficientItems.push({
            ingredientName: ingredient.name,
            available: ingredient.currentStock,
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

    if (orderItems.length === 0) {
      return {
        message: 'Stock deducted successfully for order',
        deductions,
      };
    }

    // Filter items with foodItemId
    const itemsWithFoodItem = orderItems.filter(item => item.foodItemId);
    if (itemsWithFoodItem.length === 0) {
      return {
        message: 'Stock deducted successfully for order',
        deductions,
      };
    }

    // Fetch token number and branch_id from order (can be done in parallel with other initial fetches)
    const orderInfoPromise = supabase
      .from('orders')
      .select('token_number, branch_id')
      .eq('id', orderId)
      .maybeSingle()
      .then(({ data }) => ({
        tokenNumber: data?.token_number || 'N/A',
        branchId: data?.branch_id || null,
      }));

    // Collect all IDs needed for batch fetching
    const foodItemIds = itemsWithFoodItem.map(item => item.foodItemId!);
    const variationIds = itemsWithFoodItem
      .filter(item => item.variationId)
      .map(item => item.variationId!);
    const addOnIds = itemsWithFoodItem
      .flatMap(item => item.addOns || [])
      .map(addOn => addOn.addOnId);

    // Batch fetch all recipes (food items and add-ons) in parallel
    const [orderInfo, foodItemRecipesResult, addOnRecipesResult, variationsResult, foodItemVariationsResult] = await Promise.all([
      orderInfoPromise,
      foodItemIds.length > 0
        ? supabase
            .from('recipes')
            .select('*')
            .in('food_item_id', foodItemIds)
            .is('add_on_id', null)
        : Promise.resolve({ data: [], error: null }),
      addOnIds.length > 0
        ? supabase
            .from('recipes')
            .select('*')
            .in('add_on_id', addOnIds)
            .is('food_item_id', null)
        : Promise.resolve({ data: [], error: null }),
      variationIds.length > 0
        ? supabase
            .from('variations')
            .select('id, recipe_multiplier')
            .in('id', variationIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      variationIds.length > 0
        ? supabase
            .from('food_item_variations')
            .select('id, variation_id, variation_group, variation_name, recipe_multiplier')
            .in('id', variationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const tokenNumber = orderInfo.tokenNumber;
    const orderBranchId = orderInfo.branchId;
    const foodItemRecipes = foodItemRecipesResult.data || [];
    const addOnRecipes = addOnRecipesResult.data || [];
    const variations = variationsResult.data || [];
    const foodItemVariations = foodItemVariationsResult.data || [];

    // Create maps for quick lookup
    const recipesByFoodItem = new Map<string, typeof foodItemRecipes>();
    for (const recipe of foodItemRecipes) {
      if (!recipesByFoodItem.has(recipe.food_item_id)) {
        recipesByFoodItem.set(recipe.food_item_id, []);
      }
      recipesByFoodItem.get(recipe.food_item_id)!.push(recipe);
    }

    const recipesByAddOn = new Map<string, typeof addOnRecipes>();
    for (const recipe of addOnRecipes) {
      if (!recipesByAddOn.has(recipe.add_on_id)) {
        recipesByAddOn.set(recipe.add_on_id, []);
      }
      recipesByAddOn.get(recipe.add_on_id)!.push(recipe);
    }

    const variationMultiplierMap = new Map<string, number>();
    for (const variation of variations) {
      variationMultiplierMap.set(variation.id, Number(variation.recipe_multiplier) || 1.0);
    }

    const foodItemVariationMap = new Map();
    for (const fiv of foodItemVariations) {
      foodItemVariationMap.set(fiv.id, fiv);
      // If it has a variation_id and we don't have it in our map yet, add it
      if (fiv.variation_id && !variationMultiplierMap.has(fiv.id)) {
        const linkedVar = variations.find(v => v.id === fiv.variation_id);
        if (linkedVar) {
          variationMultiplierMap.set(fiv.id, Number(linkedVar.recipe_multiplier) || 1.0);
        } else if (fiv.recipe_multiplier) {
          variationMultiplierMap.set(fiv.id, Number(fiv.recipe_multiplier) || 1.0);
        }
      } else if (fiv.recipe_multiplier && !variationMultiplierMap.has(fiv.id)) {
        variationMultiplierMap.set(fiv.id, Number(fiv.recipe_multiplier) || 1.0);
      }
    }

    // Collect all ingredient IDs that will be needed
    const ingredientIds = new Set<string>();
    for (const recipe of foodItemRecipes) {
      ingredientIds.add(recipe.ingredient_id);
    }
    for (const recipe of addOnRecipes) {
      ingredientIds.add(recipe.ingredient_id);
    }

    // Batch fetch all ingredients
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('ingredients')
      .select('id, name, current_stock')
      .eq('tenant_id', tenantId)
      .in('id', Array.from(ingredientIds))
      .is('deleted_at', null);

    if (ingredientsError) {
      throw new InternalServerErrorException(`Failed to fetch ingredients: ${ingredientsError.message}`);
    }

    const ingredientMap = new Map<string, { name: string; currentStock: number }>();
    for (const ing of ingredients || []) {
      ingredientMap.set(ing.id, {
        name: ing.name || 'Unknown',
        currentStock: Number(ing.current_stock) || 0,
      });
    }

    // Collect all deductions needed (batch processing)
    const deductionList: Array<{
      ingredientId: string;
      ingredientName: string;
      quantity: number;
      baseQuantity?: number;
      multiplier?: number;
      source?: string;
      addOnId?: string;
    }> = [];
    const transactionDate = new Date().toISOString();
    const reasonText = `AUTO_DEDUCTION_TOKEN:${tokenNumber}`;
    const transactionType = 'usage';

    // Process deductions and collect them
    for (const item of itemsWithFoodItem) {
      // Get variation multiplier
      let variationMultiplier = 1.0;
      if (item.variationId) {
        variationMultiplier = variationMultiplierMap.get(item.variationId) || 1.0;
      }

      // Process food item recipes
      const recipes = recipesByFoodItem.get(item.foodItemId!);
      if (recipes && recipes.length > 0) {
        for (const recipe of recipes) {
          const baseQuantity = Number(recipe.quantity) * Number(item.quantity);
          const totalQuantityNeeded = baseQuantity * variationMultiplier;

          const ingredient = ingredientMap.get(recipe.ingredient_id);
          if (!ingredient) {
            throw new BadRequestException(`Ingredient ${recipe.ingredient_id} not found`);
          }

          if (ingredient.currentStock < totalQuantityNeeded) {
            throw new BadRequestException(
              `Insufficient stock for ingredient ${ingredient.name}. Available: ${ingredient.currentStock}, Required: ${totalQuantityNeeded}`,
            );
          }

          deductionList.push({
            ingredientId: recipe.ingredient_id,
            ingredientName: ingredient.name,
            quantity: totalQuantityNeeded,
            baseQuantity,
            multiplier: variationMultiplier,
          });
        }
      }

      // Process add-on recipes
      if (item.addOns && item.addOns.length > 0) {
        for (const addOn of item.addOns) {
          const addOnRecipes = recipesByAddOn.get(addOn.addOnId);
          if (addOnRecipes && addOnRecipes.length > 0) {
            for (const recipe of addOnRecipes) {
              const totalQuantityNeeded = Number(recipe.quantity) * Number(addOn.quantity) * Number(item.quantity);

              const ingredient = ingredientMap.get(recipe.ingredient_id);
              if (!ingredient) {
                throw new BadRequestException(`Ingredient ${recipe.ingredient_id} not found`);
              }

              if (ingredient.currentStock < totalQuantityNeeded) {
                throw new BadRequestException(
                  `Insufficient stock for ingredient ${ingredient.name} (from add-on). Available: ${ingredient.currentStock}, Required: ${totalQuantityNeeded}`,
                );
              }

              deductionList.push({
                ingredientId: recipe.ingredient_id,
                ingredientName: ingredient.name,
                quantity: totalQuantityNeeded,
                source: 'add-on',
                addOnId: addOn.addOnId,
              });
            }
          }
        }
      }
    }

    if (deductionList.length === 0) {
      return {
        message: 'Stock deducted successfully for order',
        deductions: [],
      };
    }

    // Aggregate quantities by ingredient ID (in case same ingredient appears multiple times)
    const aggregatedDeductions = new Map<string, { quantity: number; details: typeof deductionList }>();
    for (const ded of deductionList) {
      if (!aggregatedDeductions.has(ded.ingredientId)) {
        aggregatedDeductions.set(ded.ingredientId, { quantity: 0, details: [] });
      }
      const agg = aggregatedDeductions.get(ded.ingredientId)!;
      agg.quantity += ded.quantity;
      agg.details.push(ded);
    }

    // Prepare batch stock transaction inserts
    const stockTransactionInserts = deductionList.map((ded) => ({
      tenant_id: tenantId,
      branch_id: orderBranchId, // Use the order's branch_id
      ingredient_id: ded.ingredientId,
      transaction_type: transactionType,
      quantity: -Math.abs(ded.quantity), // Negative for deduction
      reason: reasonText,
      reference_id: orderId,
      transaction_date: transactionDate,
      created_by: userId,
    }));

    // Batch insert all stock transactions
    const { data: transactions, error: transactionsError } = await supabase
      .from('stock_transactions')
      .insert(stockTransactionInserts)
      .select('id, ingredient_id, quantity');

    if (transactionsError) {
      throw new InternalServerErrorException(
        `Failed to create stock transactions: ${transactionsError.message}`,
      );
    }

    // Batch update ingredient stocks (aggregated by ingredient)
    const stockUpdates = Array.from(aggregatedDeductions.entries()).map(([ingredientId, agg]) => {
      const ingredient = ingredientMap.get(ingredientId)!;
      const newStock = Math.max(0, ingredient.currentStock - agg.quantity);
      return {
        id: ingredientId,
        newStock,
      };
    });

    // Update stocks in parallel (batch update per ingredient)
    const updatePromises = stockUpdates.map((update) =>
      supabase
        .from('ingredients')
        .update({ current_stock: update.newStock })
        .eq('id', update.id)
        .eq('tenant_id', tenantId)
    );

    const updateResults = await Promise.all(updatePromises);
    for (const result of updateResults) {
      if (result.error) {
        throw new InternalServerErrorException(
          `Failed to update ingredient stock: ${result.error.message}`,
        );
      }
    }

    // Build deductions response (simplified - transactions are already in order matching deductionList)
    const transactionList = transactions || [];
    for (let i = 0; i < deductionList.length; i++) {
      const ded = deductionList[i];
      const trans = transactionList[i] || null;
      deductions.push({
        ingredientId: ded.ingredientId,
        ingredientName: ded.ingredientName,
        quantity: ded.quantity,
        baseQuantity: ded.baseQuantity,
        multiplier: ded.multiplier,
        source: ded.source,
        addOnId: ded.addOnId,
        result: trans ? {
          id: trans.id,
          ingredientId: trans.ingredient_id,
          quantity: trans.quantity,
        } : null,
      });
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

    if (filters?.branchId) {
      query = query.eq('branch_id', filters.branchId);
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
  async getLowStockAlerts(tenantId: string, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Fetch all active ingredients (Supabase doesn't support column-to-column comparison)
    let query = supabase
      .from('ingredients')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);
    
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    
    const { data, error } = await query;

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
