import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ConflictException 
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { StorageService } from './utils/storage.service';
import { TranslationService } from '../translations/services/translation.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateFoodItemDto } from './dto/create-food-item.dto';
import { UpdateFoodItemDto } from './dto/update-food-item.dto';
import { CreateAddOnGroupDto } from './dto/create-add-on-group.dto';
import { UpdateAddOnGroupDto } from './dto/update-add-on-group.dto';
import { CreateAddOnDto } from './dto/create-add-on.dto';
import { UpdateAddOnDto } from './dto/update-add-on.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { CreateBuffetDto } from './dto/create-buffet.dto';
import { UpdateBuffetDto } from './dto/update-buffet.dto';
import { CreateComboMealDto } from './dto/create-combo-meal.dto';
import { UpdateComboMealDto } from './dto/update-combo-meal.dto';
import { CreateVariationGroupDto } from './dto/create-variation-group.dto';
import { UpdateVariationGroupDto } from './dto/update-variation-group.dto';
import { CreateVariationDto } from './dto/create-variation.dto';
import { UpdateVariationDto } from './dto/update-variation.dto';
import { PaginationParams, PaginatedResponse, getPaginationParams, createPaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class MenuService {
  private readonly IMAGE_BUCKET = 'menu-images';

  constructor(
    private supabaseService: SupabaseService,
    private storageService: StorageService,
    private translationService: TranslationService,
  ) {}

  // ============================================
  // CATEGORY MANAGEMENT
  // ============================================

  async getCategories(
    tenantId: string,
    pagination?: PaginationParams,
    branchId?: string,
    language: string = 'en',
  ): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Build count query
    let countQuery = supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      countQuery = countQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    
    const { count: totalCount } = await countQuery;

    let query = supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    
    query = query.order('display_order', { ascending: true });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: categories, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch categories: ${error.message}`);
    }

    // Organize categories with subcategories
    const categoryMap = new Map();
    const rootCategories = [];

    // Helper function to get translated category data
    const getTranslatedCategory = async (cat: any) => {
      let translatedName = cat.name;
      let translatedDescription = cat.description;

      try {
        const nameTranslation = await this.translationService.getTranslation({
          entityType: 'category',
          entityId: cat.id,
          languageCode: language,
          fieldName: 'name',
          fallbackLanguage: 'en',
        });
        if (nameTranslation) translatedName = nameTranslation;

        if (cat.description) {
          const descTranslation = await this.translationService.getTranslation({
            entityType: 'category',
            entityId: cat.id,
            languageCode: language,
            fieldName: 'description',
            fallbackLanguage: 'en',
          });
          if (descTranslation) translatedDescription = descTranslation;
        }
      } catch (translationError) {
        // Use original values if translation fails
        console.warn(`Failed to get translations for category ${cat.id}:`, translationError);
      }

      return {
        id: cat.id,
        name: translatedName,
        description: translatedDescription,
        imageUrl: cat.image_url,
        categoryType: cat.category_type,
        parentId: cat.parent_id,
        displayOrder: cat.display_order,
        isActive: cat.is_active,
        createdAt: cat.created_at,
        updatedAt: cat.updated_at,
        subcategories: [],
      };
    };

    // Process categories with translations
    const processedCategories = await Promise.all(
      categories.map((cat) => getTranslatedCategory(cat))
    );

    // Build category map and organize hierarchy
    processedCategories.forEach((category) => {
      categoryMap.set(category.id, category);
    });

    processedCategories.forEach((category) => {
      // Find original category to get parent_id for hierarchy
      const originalCat = categories.find((c) => c.id === category.id);
      if (originalCat?.parent_id) {
        const parent = categoryMap.get(originalCat.parent_id);
        if (parent) {
          parent.subcategories.push(category);
        }
      } else {
        rootCategories.push(category);
      }
    });

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(rootCategories, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return rootCategories;
  }

  async getCategoryById(tenantId: string, id: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const { data: category, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !category) {
      throw new NotFoundException('Category not found');
    }

    // Get subcategories
    const { data: subcategories } = await supabase
      .from('categories')
      .select('*')
      .eq('parent_id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    // Get translated name and description
    let translatedName = category.name;
    let translatedDescription = category.description;

    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'category',
        entityId: id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;

      if (category.description) {
        const descTranslation = await this.translationService.getTranslation({
          entityType: 'category',
          entityId: id,
          languageCode: language,
          fieldName: 'description',
          fallbackLanguage: 'en',
        });
        if (descTranslation) translatedDescription = descTranslation;
      }
    } catch (translationError) {
      console.warn(`Failed to get translations for category ${id}:`, translationError);
    }

    // Get translated subcategories
    const translatedSubcategories = await Promise.all(
      (subcategories || []).map(async (sub) => {
        let subName = sub.name;
        let subDesc = sub.description;
        try {
          const subNameTranslation = await this.translationService.getTranslation({
            entityType: 'category',
            entityId: sub.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (subNameTranslation) subName = subNameTranslation;
        } catch (e) {
          // Use original
        }
        return {
          id: sub.id,
          name: subName,
          description: subDesc,
          imageUrl: sub.image_url,
          categoryType: sub.category_type,
          displayOrder: sub.display_order,
          isActive: sub.is_active,
        };
      })
    );

    return {
      id: category.id,
      name: translatedName,
      description: translatedDescription,
      imageUrl: category.image_url,
      categoryType: category.category_type,
      parentId: category.parent_id,
      displayOrder: category.display_order,
      isActive: category.is_active,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
      subcategories: translatedSubcategories,
    };
  }

  async createCategory(tenantId: string, createDto: CreateCategoryDto, branchId?: string, skipTranslations = false) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Validate parent category if provided
    if (createDto.parentId) {
      const { data: parent } = await supabase
        .from('categories')
        .select('id')
        .eq('id', createDto.parentId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const categoryData: any = {
      tenant_id: tenantId,
      name: createDto.name,
      description: createDto.description || null,
      image_url: createDto.imageUrl || null,
      category_type: createDto.categoryType || 'food',
      parent_id: createDto.parentId || null,
      display_order: 0,
      is_active: createDto.isActive !== undefined ? createDto.isActive : true,
    };

    if (branchId) {
      categoryData.branch_id = branchId;
    }

    const { data: category, error } = await supabase
      .from('categories')
      .insert(categoryData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create category: ${error.message}`);
    }

    // Generate translations for name and description asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Skip if skipTranslations is true (e.g., during seed data creation)
    if (!skipTranslations) {
      // Use batch translation to handle multiple fields efficiently
      const categoryFieldsToTranslate = [
        { fieldName: 'name', text: createDto.name },
        ...(createDto.description ? [{ fieldName: 'description', text: createDto.description }] : []),
      ];

      this.translationService
        .createBatchTranslations('category', category.id, categoryFieldsToTranslate, undefined, tenantId)
        .catch((translationError) => {
          console.error('Failed to create batch translations for category:', translationError);
        });
    }

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      imageUrl: category.image_url,
      categoryType: category.category_type,
      parentId: category.parent_id,
      displayOrder: category.display_order,
      isActive: category.is_active,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
      message: 'Category created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  async updateCategory(
    tenantId: string,
    id: string,
    updateDto: UpdateCategoryDto,
    language: string = 'en',
    userId?: string,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if category exists
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    // Validate parent category if provided
    if (updateDto.parentId && updateDto.parentId !== id) {
      const { data: parent } = await supabase
        .from('categories')
        .select('id')
        .eq('id', updateDto.parentId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }

      // Prevent circular reference
      if (updateDto.parentId === id) {
        throw new BadRequestException('Category cannot be its own parent');
      }
    }

    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name.trim();
    if (updateDto.description !== undefined) updateData.description = updateDto.description;
    if (updateDto.imageUrl !== undefined) updateData.image_url = updateDto.imageUrl;
    if (updateDto.categoryType !== undefined) updateData.category_type = updateDto.categoryType;
    if (updateDto.parentId !== undefined) updateData.parent_id = updateDto.parentId;
    if (updateDto.displayOrder !== undefined) updateData.display_order = updateDto.displayOrder;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    updateData.updated_at = new Date().toISOString();

    // Get current category to check if name/description changed
    const currentCategory = await this.getCategoryById(tenantId, id);

    const { data: category, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update category: ${error.message}`);
    }

    // Update translations if name or description changed
    try {
      if (updateDto.name !== undefined && updateDto.name !== currentCategory.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'category',
            entityId: id,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }

      if (updateDto.description !== undefined && updateDto.description !== currentCategory.description) {
        await this.translationService.updateTranslation(
          {
            entityType: 'category',
            entityId: id,
            languageCode: language,
            fieldName: 'description',
            translatedText: updateDto.description,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for category:', translationError);
    }

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      imageUrl: category.image_url,
      categoryType: category.category_type,
      parentId: category.parent_id,
      displayOrder: category.display_order,
      isActive: category.is_active,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
    };
  }

  async deleteCategory(tenantId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if category exists
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    // Check if category has food items
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('id')
      .eq('category_id', id)
      .is('deleted_at', null)
      .limit(1);

    if (foodItems && foodItems.length > 0) {
      throw new ConflictException('Cannot delete category with associated food items');
    }

    // Check if category has subcategories
    const { data: subcategories } = await supabase
      .from('categories')
      .select('id')
      .eq('parent_id', id)
      .is('deleted_at', null)
      .limit(1);

    if (subcategories && subcategories.length > 0) {
      throw new ConflictException('Cannot delete category with subcategories');
    }

    // Soft delete
    const { error } = await supabase
      .from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`Failed to delete category: ${error.message}`);
    }

    // Delete translations for this category
    try {
      await this.translationService.deleteEntityTranslations('category', id);
    } catch (translationError) {
      console.warn(`Failed to delete translations for category ${id}:`, translationError);
    }

    return { message: 'Category deleted successfully' };
  }

  // ============================================
  // FOOD ITEM MANAGEMENT
  // ============================================

  async getFoodItems(tenantId: string, categoryId?: string, pagination?: PaginationParams, onlyActiveMenus: boolean = false, search?: string, branchId?: string, language: string = 'en'): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get food items (without pagination first to get accurate count)
    let query = supabase
      .from('food_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (branchId) {
      // When a branch is selected, only show items from that branch (exclude NULL for strict filtering)
      query = query.eq('branch_id', branchId);
    }
    // Note: If branchId is not provided, we show all items (for backward compatibility)
    // But in practice, branchId should always be provided for branch-specific views

    // Apply search filter if provided
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }

    const { data: allFoodItems, error } = await query.order('display_order', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to fetch food items: ${error.message}`);
    }

    let filteredFoodItems = allFoodItems || [];

    // If filtering by active menus is enabled
    if (onlyActiveMenus) {
      // Optimize: Use a single query with join to get active menu types and their food items
      // First, get active menu types from menus table
      let activeMenusQuery = supabase
        .from('menus')
        .select('menu_type')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      
      if (branchId) {
        // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
        activeMenusQuery = activeMenusQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }
      
      // Check for soft-deleted menus if the table has deleted_at column
      try {
        activeMenusQuery = activeMenusQuery.is('deleted_at', null);
      } catch (e) {
        // If deleted_at column doesn't exist, continue without it
      }

      const { data: activeMenus, error: activeMenusError } = await activeMenusQuery;

      let activeMenuTypes: string[] = [];

      if (activeMenusError) {
        // If error is about column not existing, retry without deleted_at check
        if (activeMenusError.message?.includes('deleted_at') || activeMenusError.message?.includes('column')) {
          let retryQuery = supabase
            .from('menus')
            .select('menu_type')
            .eq('tenant_id', tenantId)
            .eq('is_active', true);
          
          if (branchId) {
            // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
            retryQuery = retryQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
          }
          
          const { data: retryActiveMenus, error: retryError } = await retryQuery;
          
          if (retryError) {
            throw new BadRequestException(`Failed to fetch active menus: ${retryError.message}`);
          }
          
          activeMenuTypes = retryActiveMenus?.map((m: any) => m.menu_type) || [];
        } else {
          throw new BadRequestException(`Failed to fetch active menus: ${activeMenusError.message}`);
        }
      } else {
        activeMenuTypes = activeMenus?.map((m: any) => m.menu_type) || [];
      }

      // Only process legacy menu types if we have at least one active menu
      // When filtering by active menus, we should NOT include legacy menu types if no menus are active
      // This ensures that when there are no active menus, no items are shown in POS
      if (activeMenuTypes.length > 0) {
        // Optimize: Get all menu types with items and all existing menu types in parallel
        const [allMenuItemsResult, existingMenusResult] = await Promise.all([
          supabase
            .from('menu_items')
            .select('menu_type')
            .eq('tenant_id', tenantId),
          supabase
            .from('menus')
            .select('menu_type')
            .eq('tenant_id', tenantId),
        ]);

        // Process legacy menu types (menu_items without menu records)
        // Only include these if we already have some active menus
        if (allMenuItemsResult.data) {
          const allMenuTypesWithItems = [...new Set(allMenuItemsResult.data.map((mi: any) => mi.menu_type))];
          const allExistingMenuTypes = (existingMenusResult.data || []).map((m: any) => m.menu_type);
          
          // Get menu types that have items but don't have a record in menus table
          const menuTypesToInclude = allMenuTypesWithItems.filter(
            (menuType) => !allExistingMenuTypes.includes(menuType)
          );

          // Include these menu types as active (they have items but no menu record)
          // But only if we already have at least one active menu
          activeMenuTypes = [...activeMenuTypes, ...menuTypesToInclude];
        }
      }

      // If there are active menus, filter items to only those in active menus
      if (activeMenuTypes.length > 0) {
        // Query menu_items directly for items in active menus (more efficient)
        const { data: allMenuItems, error: menuItemsError } = await supabase
          .from('menu_items')
          .select('food_item_id')
          .in('menu_type', activeMenuTypes)
          .eq('tenant_id', tenantId);

        if (menuItemsError) {
          throw new BadRequestException(`Failed to fetch menu items: ${menuItemsError.message}`);
        }

        // Create a set of food item IDs that belong to active menus
        const foodItemsInActiveMenus = new Set(
          allMenuItems?.map((mi: any) => mi.food_item_id) || []
        );

        // Filter food items to only include those in active menus
        filteredFoodItems = filteredFoodItems.filter((item: any) =>
          foodItemsInActiveMenus.has(item.id)
        );
      } else {
        // If no active menus exist, show no items (for POS, not admin management)
        filteredFoodItems = [];
      }
    }

    // Get accurate total count
    const totalCount = filteredFoodItems.length;

    // Apply pagination to items
    let paginatedFoodItems = filteredFoodItems;
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      paginatedFoodItems = filteredFoodItems.slice(offset, offset + limit);
    }

    // If no items after pagination, return empty result
    if (paginatedFoodItems.length === 0) {
      if (pagination) {
        return createPaginatedResponse([], totalCount, pagination.page || 1, pagination.limit || 10);
      }
      return [];
    }

    // Collect all food item IDs for batch fetching
    const foodItemIds = paginatedFoodItems.map((item) => item.id);

    // Batch fetch all related data in parallel (fixes N+1 query problem)
    const [variationsResult, labelsResult, addOnGroupsResult, discountsResult, menuItemsResult] = await Promise.all([
      supabase
        .from('food_item_variations')
        .select('*')
        .in('food_item_id', foodItemIds)
        .order('display_order', { ascending: true }),
      supabase
        .from('food_item_labels')
        .select('food_item_id, label')
        .in('food_item_id', foodItemIds),
      supabase
        .from('food_item_add_on_groups')
        .select('food_item_id, add_on_group_id')
        .in('food_item_id', foodItemIds),
      supabase
        .from('food_item_discounts')
        .select('*')
        .in('food_item_id', foodItemIds)
        .eq('is_active', true)
        .gte('end_date', new Date().toISOString()),
      supabase
        .from('menu_items')
        .select('food_item_id, menu_type')
        .in('food_item_id', foodItemIds),
    ]);

    // Create lookup maps for O(1) access
    const variationsMap = new Map<string, any[]>();
    const labelsMap = new Map<string, string[]>();
    const addOnGroupsMap = new Map<string, string[]>();
    const discountsMap = new Map<string, any[]>();
    const menuItemsMap = new Map<string, string[]>();

    // Group variations by food_item_id
    (variationsResult.data || []).forEach((v: any) => {
      if (!variationsMap.has(v.food_item_id)) {
        variationsMap.set(v.food_item_id, []);
      }
      variationsMap.get(v.food_item_id)!.push({
        id: v.id,
        variationGroup: v.variation_group,
        variationName: v.variation_name,
        priceAdjustment: parseFloat(v.price_adjustment),
        stockQuantity: v.stock_quantity,
        displayOrder: v.display_order,
      });
    });

    // Group labels by food_item_id
    (labelsResult.data || []).forEach((l: any) => {
      if (!labelsMap.has(l.food_item_id)) {
        labelsMap.set(l.food_item_id, []);
      }
      labelsMap.get(l.food_item_id)!.push(l.label);
    });

    // Group add-on groups by food_item_id
    (addOnGroupsResult.data || []).forEach((a: any) => {
      if (!addOnGroupsMap.has(a.food_item_id)) {
        addOnGroupsMap.set(a.food_item_id, []);
      }
      addOnGroupsMap.get(a.food_item_id)!.push(a.add_on_group_id);
    });

    // Group discounts by food_item_id
    (discountsResult.data || []).forEach((d: any) => {
      if (!discountsMap.has(d.food_item_id)) {
        discountsMap.set(d.food_item_id, []);
      }
      discountsMap.get(d.food_item_id)!.push({
        id: d.id,
        discountType: d.discount_type,
        discountValue: parseFloat(d.discount_value),
        startDate: d.start_date,
        endDate: d.end_date,
        reason: d.reason,
      });
    });

    // Group menu items by food_item_id
    (menuItemsResult.data || []).forEach((m: any) => {
      if (!menuItemsMap.has(m.food_item_id)) {
        menuItemsMap.set(m.food_item_id, []);
      }
      menuItemsMap.get(m.food_item_id)!.push(m.menu_type);
    });

    // Helper function to get translated food item data
    const getTranslatedFoodItem = async (item: any) => {
      let translatedName = item.name;
      let translatedDescription = item.description;

      try {
        const nameTranslation = await this.translationService.getTranslation({
          entityType: 'food_item',
          entityId: item.id,
          languageCode: language,
          fieldName: 'name',
          fallbackLanguage: 'en',
        });
        if (nameTranslation) translatedName = nameTranslation;

        if (item.description) {
          const descTranslation = await this.translationService.getTranslation({
            entityType: 'food_item',
            entityId: item.id,
            languageCode: language,
            fieldName: 'description',
            fallbackLanguage: 'en',
          });
          if (descTranslation) translatedDescription = descTranslation;
        }
      } catch (translationError) {
        // Use original values if translation fails
        console.warn(`Failed to get translations for food item ${item.id}:`, translationError);
      }

      return {
        id: item.id,
        name: translatedName,
        description: translatedDescription,
        imageUrl: item.image_url,
        categoryId: item.category_id,
        basePrice: parseFloat(item.base_price),
        stockType: item.stock_type,
        stockQuantity: item.stock_quantity,
        menuType: item.menu_type, // Legacy field
        menuTypes: menuItemsMap.get(item.id) || [], // Array of menu types
        ageLimit: item.age_limit,
        displayOrder: item.display_order,
        isActive: item.is_active,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        variations: variationsMap.get(item.id) || [],
        labels: labelsMap.get(item.id) || [],
        addOnGroupIds: addOnGroupsMap.get(item.id) || [],
        activeDiscounts: discountsMap.get(item.id) || [],
      };
    };

    // Map items with their related data and translations
    const itemsWithDetails = await Promise.all(
      paginatedFoodItems.map((item) => getTranslatedFoodItem(item))
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      // Use the accurate total count of filtered items
      return createPaginatedResponse(itemsWithDetails, totalCount, pagination.page || 1, pagination.limit || 10);
    }

    return itemsWithDetails;
  }

  async getFoodItemById(tenantId: string, id: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const { data: foodItem, error } = await supabase
      .from('food_items')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !foodItem) {
      throw new NotFoundException('Food item not found');
    }

    // Get all related data
    const [variations, labels, addOnGroups, discounts, menuItems] = await Promise.all([
      supabase
        .from('food_item_variations')
        .select('*')
        .eq('food_item_id', id)
        .order('display_order', { ascending: true }),
      supabase
        .from('food_item_labels')
        .select('label')
        .eq('food_item_id', id),
      supabase
        .from('food_item_add_on_groups')
        .select('add_on_group_id')
        .eq('food_item_id', id),
      supabase
        .from('food_item_discounts')
        .select('*')
        .eq('food_item_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('menu_items')
        .select('menu_type')
        .eq('food_item_id', id),
    ]);

    // Get translations for name and description
    let translatedName = foodItem.name;
    let translatedDescription = foodItem.description;

    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'food_item',
        entityId: foodItem.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;

      if (foodItem.description) {
        const descTranslation = await this.translationService.getTranslation({
          entityType: 'food_item',
          entityId: foodItem.id,
          languageCode: language,
          fieldName: 'description',
          fallbackLanguage: 'en',
        });
        if (descTranslation) translatedDescription = descTranslation;
      }
    } catch (translationError) {
      // Use original values if translation fails
      console.warn(`Failed to get translations for food item ${foodItem.id}:`, translationError);
    }

    return {
      id: foodItem.id,
      name: translatedName,
      description: translatedDescription,
      imageUrl: foodItem.image_url,
      categoryId: foodItem.category_id,
      basePrice: parseFloat(foodItem.base_price),
      stockType: foodItem.stock_type,
      stockQuantity: foodItem.stock_quantity,
      menuType: foodItem.menu_type, // Legacy field
      menuTypes: menuItems.data?.map((m: any) => m.menu_type) || [], // Array of menu types
      ageLimit: foodItem.age_limit,
      displayOrder: foodItem.display_order,
      isActive: foodItem.is_active,
      createdAt: foodItem.created_at,
      updatedAt: foodItem.updated_at,
      variations: variations.data?.map((v) => ({
        id: v.id,
        variationGroup: v.variation_group,
        variationName: v.variation_name,
        priceAdjustment: parseFloat(v.price_adjustment),
        stockQuantity: v.stock_quantity,
        displayOrder: v.display_order,
      })) || [],
      labels: labels.data?.map((l) => l.label) || [],
      addOnGroupIds: addOnGroups.data?.map((a) => a.add_on_group_id) || [],
      discounts: discounts.data?.map((d) => ({
        id: d.id,
        discountType: d.discount_type,
        discountValue: parseFloat(d.discount_value),
        startDate: d.start_date,
        endDate: d.end_date,
        reason: d.reason,
        isActive: d.is_active,
      })) || [],
    };
  }

  async createFoodItem(tenantId: string, createDto: CreateFoodItemDto, branchId?: string, skipTranslations = false) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Validate category
    let categoryQuery = supabase
      .from('categories')
      .select('id')
      .eq('id', createDto.categoryId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    // If branchId is provided, check that category belongs to this branch or is global (branch_id is null)
    if (branchId) {
      categoryQuery = categoryQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data: category } = await categoryQuery.single();

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Create food item
    const foodItemData: any = {
      tenant_id: tenantId,
      category_id: createDto.categoryId,
      name: createDto.name,
      description: createDto.description || null,
      image_url: createDto.imageUrl || null,
      base_price: createDto.basePrice,
      stock_type: createDto.stockType || 'unlimited',
      stock_quantity: createDto.stockQuantity || 0,
      menu_type: createDto.menuType || 'all_day',
      age_limit: createDto.ageLimit || null,
      display_order: 0,
      is_active: true,
    };

    if (branchId) {
      foodItemData.branch_id = branchId;
    }

    const { data: foodItem, error } = await supabase
      .from('food_items')
      .insert(foodItemData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create food item: ${error.message}`);
    }

    // Create variations
    if (createDto.variations && createDto.variations.length > 0) {
      // Look up variation IDs for each variation
      const variationsData = await Promise.all(
        createDto.variations.map(async (v, index) => {
          let variationId = null;
          
          // If we have variation_group and variation_name, try to find the variation_id
          if (v.variationGroup && v.variationName) {
            // Find the variation group
            const { data: variationGroup } = await supabase
              .from('variation_groups')
              .select('id')
              .eq('name', v.variationGroup)
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .maybeSingle();

            if (variationGroup) {
              // Find the variation in that group
              const { data: variation } = await supabase
                .from('variations')
                .select('id, recipe_multiplier')
                .eq('variation_group_id', variationGroup.id)
                .eq('name', v.variationName)
                .is('deleted_at', null)
                .maybeSingle();

              if (variation) {
                variationId = variation.id;
              }
            }
          }

          return {
            food_item_id: foodItem.id,
            variation_group: v.variationGroup,
            variation_name: v.variationName,
            variation_id: variationId,
            price_adjustment: v.priceAdjustment || 0,
            stock_quantity: v.stockQuantity || null,
            display_order: v.displayOrder || index,
          };
        })
      );

      await supabase.from('food_item_variations').insert(variationsData);
    }

    // Parallelize independent operations: labels, add-on groups validation, and menu items
    const parallelOps: Promise<any>[] = [];

    // Create labels
    if (createDto.labels && createDto.labels.length > 0) {
      const labelsData = createDto.labels.map((label) => ({
        food_item_id: foodItem.id,
        label: label,
      }));
      parallelOps.push(
        Promise.resolve(supabase.from('food_item_labels').insert(labelsData))
      );
    }

    // Link add-on groups
    if (createDto.addOnGroupIds && createDto.addOnGroupIds.length > 0) {
      // Validate add-on groups belong to tenant (can be done in parallel with other operations)
      parallelOps.push(
        Promise.resolve(
          supabase
            .from('add_on_groups')
            .select('id')
            .eq('tenant_id', tenantId)
            .in('id', createDto.addOnGroupIds)
            .is('deleted_at', null)
        ).then(async ({ data: addOnGroups, error }) => {
          if (error) throw error;
          if (addOnGroups.length !== createDto.addOnGroupIds.length) {
            throw new BadRequestException('One or more add-on groups not found');
          }
          const addOnGroupsData = createDto.addOnGroupIds.map((groupId) => ({
            food_item_id: foodItem.id,
            add_on_group_id: groupId,
          }));
          return Promise.resolve(
            supabase.from('food_item_add_on_groups').insert(addOnGroupsData)
          );
        })
      );
    }

    // Create menu assignments
    if (createDto.menuTypes && createDto.menuTypes.length > 0) {
      const menuItemsData = createDto.menuTypes.map((menuType, index) => ({
        tenant_id: tenantId,
        menu_type: menuType,
        food_item_id: foodItem.id,
        display_order: index,
      }));
      parallelOps.push(
        Promise.resolve(supabase.from('menu_items').insert(menuItemsData))
      );
    } else if (createDto.menuType) {
      // Legacy support: if menuType is provided, use it
      parallelOps.push(
        Promise.resolve(
          supabase.from('menu_items').insert({
            tenant_id: tenantId,
            menu_type: createDto.menuType,
            food_item_id: foodItem.id,
            display_order: 0,
          })
        )
      );
    }

    // Create discounts
    if (createDto.discounts && createDto.discounts.length > 0) {
      const discountsData = createDto.discounts.map((d) => ({
        food_item_id: foodItem.id,
        discount_type: d.discountType,
        discount_value: d.discountValue,
        start_date: d.startDate,
        end_date: d.endDate,
        reason: d.reason || null,
        is_active: true,
      }));
      parallelOps.push(
        Promise.resolve(supabase.from('food_item_discounts').insert(discountsData))
      );
    }

    // Execute all parallel operations
    if (parallelOps.length > 0) {
      await Promise.all(parallelOps);
    }

    // Create translations for name and description asynchronously (fire and forget)
    // Use batch translation to handle multiple fields in a single request (more efficient)
    // Don't block the response - translations will be processed in the background
    // Skip if skipTranslations is true (e.g., during seed data creation)
    if (!skipTranslations) {
      const fieldsToTranslate = [
        { fieldName: 'name', text: createDto.name },
        ...(createDto.description ? [{ fieldName: 'description', text: createDto.description }] : []),
      ];

      this.translationService
        .createBatchTranslations('food_item', foodItem.id, fieldsToTranslate, undefined, tenantId)
        .catch((translationError) => {
          console.error('Failed to create batch translations for food item:', translationError);
        });
    }

    const result = await this.getFoodItemById(tenantId, foodItem.id);
    return {
      ...result,
      message: 'Food item created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  async updateFoodItem(tenantId: string, id: string, updateDto: UpdateFoodItemDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if food item exists
    const { data: existing } = await supabase
      .from('food_items')
      .select('id, branch_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Food item not found');
    }

    // Validate category if provided
    if (updateDto.categoryId) {
      let categoryQuery = supabase
        .from('categories')
        .select('id')
        .eq('id', updateDto.categoryId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      // If food item has a branch_id, check that category belongs to this branch or is global (branch_id is null)
      if (existing.branch_id) {
        categoryQuery = categoryQuery.or(`branch_id.eq.${existing.branch_id},branch_id.is.null`);
      }

      const { data: category } = await categoryQuery.single();

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    // Get current food item state to check if isActive is being changed and for translation comparison
    const { data: currentFoodItem } = await supabase
      .from('food_items')
      .select('is_active, name, description')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    const isActivating = updateDto.isActive === true && currentFoodItem?.is_active !== true;
    const isDeactivating = updateDto.isActive === false && currentFoodItem?.is_active !== false;

    // Update food item
    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name.trim();
    if (updateDto.description !== undefined) updateData.description = updateDto.description;
    if (updateDto.imageUrl !== undefined) updateData.image_url = updateDto.imageUrl;
    if (updateDto.categoryId !== undefined) updateData.category_id = updateDto.categoryId;
    if (updateDto.basePrice !== undefined) updateData.base_price = updateDto.basePrice;
    if (updateDto.stockType !== undefined) updateData.stock_type = updateDto.stockType;
    if (updateDto.stockQuantity !== undefined) updateData.stock_quantity = updateDto.stockQuantity;
    if (updateDto.menuType !== undefined) updateData.menu_type = updateDto.menuType;
    if (updateDto.ageLimit !== undefined) updateData.age_limit = updateDto.ageLimit;
    if (updateDto.displayOrder !== undefined) updateData.display_order = updateDto.displayOrder;
    // Always set is_active to true - all food items are active
    updateData.is_active = true;
    updateData.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('food_items')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new BadRequestException(`Failed to update food item: ${updateError.message}`);
    }

    // If activating the food item, activate menus that contain this food item
    // (only if food item is not active in another active menu)
    if (isActivating) {
      // Check if food item is active in another active menu
      const isActiveInAnotherMenu = await this.isFoodItemActiveInAnotherActiveMenu(
        supabase,
        tenantId,
        id,
      );

      // Only activate menus if not active in another active menu
      if (!isActiveInAnotherMenu) {
        // Get all menus that contain this food item
        const { data: menuItems } = await supabase
          .from('menu_items')
          .select('menu_type')
          .eq('food_item_id', id);

        if (menuItems && menuItems.length > 0) {
          const menuTypes = [...new Set(menuItems.map((mi: any) => mi.menu_type))];

          // Activate all menus that contain this food item
          for (const menuType of menuTypes) {
            // Check if menu record exists
            const { data: existingMenu } = await supabase
              .from('menus')
              .select('menu_type')
              .eq('tenant_id', tenantId)
              .eq('menu_type', menuType)
              .limit(1);

            if (existingMenu && existingMenu.length > 0) {
              // Update existing menu
              await supabase
                .from('menus')
                .update({
                  is_active: true,
                  updated_at: new Date().toISOString(),
                })
                .eq('tenant_id', tenantId)
                .eq('menu_type', menuType);
            } else {
              // Create menu record if it doesn't exist
              const displayName = menuType.charAt(0).toUpperCase() + menuType.slice(1).replace(/_/g, ' ');
              await supabase
                .from('menus')
                .insert({
                  tenant_id: tenantId,
                  menu_type: menuType,
                  name: displayName,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
            }
          }
        }
      }
    } else if (isDeactivating) {
      // If deactivating the food item, deactivate all menus that contain this food item
      // Get all menus that contain this food item
      const { data: menuItems } = await supabase
        .from('menu_items')
        .select('menu_type')
        .eq('food_item_id', id);

      if (menuItems && menuItems.length > 0) {
        const menuTypes = [...new Set(menuItems.map((mi: any) => mi.menu_type))];

        // Deactivate all menus that contain this food item
        for (const menuType of menuTypes) {
          // Check if menu record exists
          const { data: existingMenu } = await supabase
            .from('menus')
            .select('menu_type')
            .eq('tenant_id', tenantId)
            .eq('menu_type', menuType)
            .limit(1);

          if (existingMenu && existingMenu.length > 0) {
            // Check if menu has other active food items before deactivating
            const { data: otherMenuItems } = await supabase
              .from('menu_items')
              .select('food_item_id')
              .eq('menu_type', menuType);

            if (otherMenuItems && otherMenuItems.length > 0) {
              const otherFoodItemIds = otherMenuItems
                .map((mi: any) => mi.food_item_id)
                .filter((fid: string) => fid !== id); // Exclude current food item

              if (otherFoodItemIds.length > 0) {
                // Check if any other food items in this menu are active
                const { data: activeOtherItems } = await supabase
                  .from('food_items')
                  .select('id')
                  .eq('tenant_id', tenantId)
                  .in('id', otherFoodItemIds)
                  .eq('is_active', true)
                  .is('deleted_at', null);

                // Only deactivate menu if no other active food items remain
                if (!activeOtherItems || activeOtherItems.length === 0) {
                  await supabase
                    .from('menus')
                    .update({
                      is_active: false,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('tenant_id', tenantId)
                    .eq('menu_type', menuType);
                }
              } else {
                // No other items in menu, deactivate it
                await supabase
                  .from('menus')
                  .update({
                    is_active: false,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('tenant_id', tenantId)
                  .eq('menu_type', menuType);
              }
            } else {
              // No other items in menu, deactivate it
              await supabase
                .from('menus')
                .update({
                  is_active: false,
                  updated_at: new Date().toISOString(),
                })
                .eq('tenant_id', tenantId)
                .eq('menu_type', menuType);
            }
          }
        }
      }
    }

    // Update variations if provided
    if (updateDto.variations !== undefined) {
      // Delete existing variations
      await supabase.from('food_item_variations').delete().eq('food_item_id', id);

      // Insert new variations
      if (updateDto.variations.length > 0) {
        // Look up variation IDs for each variation
        const variationsData = await Promise.all(
          updateDto.variations.map(async (v, index) => {
            let variationId = null;
            
            // If we have variation_group and variation_name, try to find the variation_id
            if (v.variationGroup && v.variationName) {
              // Find the variation group
              const { data: variationGroup } = await supabase
                .from('variation_groups')
                .select('id')
                .eq('name', v.variationGroup)
                .eq('tenant_id', tenantId)
                .is('deleted_at', null)
                .maybeSingle();

              if (variationGroup) {
                // Find the variation in that group
                const { data: variation } = await supabase
                  .from('variations')
                  .select('id, recipe_multiplier')
                  .eq('variation_group_id', variationGroup.id)
                  .eq('name', v.variationName)
                  .is('deleted_at', null)
                  .maybeSingle();

                if (variation) {
                  variationId = variation.id;
                }
              }
            }

            return {
              food_item_id: id,
              variation_group: v.variationGroup,
              variation_name: v.variationName,
              variation_id: variationId,
              price_adjustment: v.priceAdjustment || 0,
              stock_quantity: v.stockQuantity || null,
              display_order: v.displayOrder || index,
            };
          })
        );

        await supabase.from('food_item_variations').insert(variationsData);
      }
    }

    // Update labels if provided
    if (updateDto.labels !== undefined) {
      // Delete existing labels
      await supabase.from('food_item_labels').delete().eq('food_item_id', id);

      // Insert new labels
      if (updateDto.labels.length > 0) {
        const labelsData = updateDto.labels.map((label) => ({
          food_item_id: id,
          label: label,
        }));

        await supabase.from('food_item_labels').insert(labelsData);
      }
    }

    // Update add-on groups if provided
    if (updateDto.addOnGroupIds !== undefined) {
      // Delete existing links
      await supabase.from('food_item_add_on_groups').delete().eq('food_item_id', id);

      // Insert new links
      if (updateDto.addOnGroupIds.length > 0) {
        // Validate add-on groups
        const { data: addOnGroups } = await supabase
          .from('add_on_groups')
          .select('id')
          .eq('tenant_id', tenantId)
          .in('id', updateDto.addOnGroupIds)
          .is('deleted_at', null);

        if (addOnGroups.length !== updateDto.addOnGroupIds.length) {
          throw new BadRequestException('One or more add-on groups not found');
        }

        const addOnGroupsData = updateDto.addOnGroupIds.map((groupId) => ({
          food_item_id: id,
          add_on_group_id: groupId,
        }));

        await supabase.from('food_item_add_on_groups').insert(addOnGroupsData);
      }
    }

    // Update menu assignments if provided
    if (updateDto.menuTypes !== undefined) {
      // Delete existing menu assignments
      await supabase.from('menu_items').delete().eq('food_item_id', id);

      // Insert new menu assignments
      if (updateDto.menuTypes.length > 0) {
        const menuItemsData = updateDto.menuTypes.map((menuType, index) => ({
          tenant_id: tenantId,
          menu_type: menuType,
          food_item_id: id,
          display_order: index,
        }));

        await supabase.from('menu_items').insert(menuItemsData);
      }
    } else if (updateDto.menuType !== undefined) {
      // Legacy support: if menuType is provided, replace all assignments
      await supabase.from('menu_items').delete().eq('food_item_id', id);
      await supabase.from('menu_items').insert({
        tenant_id: tenantId,
        menu_type: updateDto.menuType,
        food_item_id: id,
        display_order: 0,
      });
    }

    // Update discounts if provided
    if (updateDto.discounts !== undefined) {
      // Note: We don't delete existing discounts, only add new ones
      // To deactivate, use the discount's own update endpoint
      if (updateDto.discounts.length > 0) {
        const discountsData = updateDto.discounts.map((d) => ({
          food_item_id: id,
          discount_type: d.discountType,
          discount_value: d.discountValue,
          start_date: d.startDate,
          end_date: d.endDate,
          reason: d.reason || null,
          is_active: true,
        }));

        await supabase.from('food_item_discounts').insert(discountsData);
      }
    }

    // Update translations if name or description changed
    try {
      if (updateDto.name !== undefined && updateDto.name.trim() !== currentFoodItem?.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'food_item',
            entityId: id,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name.trim(),
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }

      if (updateDto.description !== undefined && updateDto.description !== currentFoodItem?.description) {
        await this.translationService.updateTranslation(
          {
            entityType: 'food_item',
            entityId: id,
            languageCode: language,
            fieldName: 'description',
            translatedText: updateDto.description,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for food item:', translationError);
    }

    return this.getFoodItemById(tenantId, id, language);
  }

  async deleteFoodItem(tenantId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if food item exists
    const { data: existing } = await supabase
      .from('food_items')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Food item not found');
    }

    // Check if food item has orders
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('id')
      .eq('food_item_id', id)
      .limit(1);

    if (orderItems && orderItems.length > 0) {
      throw new ConflictException('Cannot delete food item with associated orders');
    }

    // Soft delete
    const { error } = await supabase
      .from('food_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`Failed to delete food item: ${error.message}`);
    }

    // Delete translations for this food item
    try {
      await this.translationService.deleteEntityTranslations('food_item', id);
    } catch (translationError) {
      console.warn(`Failed to delete translations for food item ${id}:`, translationError);
    }

    return { message: 'Food item deleted successfully' };
  }

  // ============================================
  // ADD-ON GROUP MANAGEMENT
  // ============================================

  async getAddOnGroups(tenantId: string, pagination?: PaginationParams, branchId?: string, language: string = 'en'): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    let countQuery = supabase
      .from('add_on_groups')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      countQuery = countQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    
    const { count: totalCount } = await countQuery;

    let query = supabase
      .from('add_on_groups')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    
    query = query.order('display_order', { ascending: true });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: addOnGroups, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch add-on groups: ${error.message}`);
    }

    // Get add-ons for each group and translations
    const groupsWithAddOns = await Promise.all(
      addOnGroups.map(async (group) => {
        const { data: addOns } = await supabase
          .from('add_ons')
          .select('*')
          .eq('add_on_group_id', group.id)
          .is('deleted_at', null)
          .order('display_order', { ascending: true });

        // Get translation for group name
        let translatedName = group.name;
        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'addon_group',
            entityId: group.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;
        } catch (translationError) {
          console.warn(`Failed to get translations for add-on group ${group.id}:`, translationError);
        }

        // Get translations for add-ons
        const addOnsWithTranslations = await Promise.all(
          (addOns || []).map(async (addOn) => {
            let translatedAddOnName = addOn.name;
            try {
              const addOnNameTranslation = await this.translationService.getTranslation({
                entityType: 'addon',
                entityId: addOn.id,
                languageCode: language,
                fieldName: 'name',
                fallbackLanguage: 'en',
              });
              if (addOnNameTranslation) translatedAddOnName = addOnNameTranslation;
            } catch (translationError) {
              console.warn(`Failed to get translations for add-on ${addOn.id}:`, translationError);
            }

            return {
              id: addOn.id,
              name: translatedAddOnName,
              price: parseFloat(addOn.price),
              isActive: addOn.is_active,
              displayOrder: addOn.display_order,
            };
          })
        );

        return {
          id: group.id,
          name: translatedName,
          selectionType: group.selection_type,
          isRequired: group.is_required,
          minSelections: group.min_selections,
          maxSelections: group.max_selections,
          displayOrder: group.display_order,
          isActive: group.is_active,
          category: group.category || null,
          createdAt: group.created_at,
          updatedAt: group.updated_at,
          addOns: addOnsWithTranslations,
        };
      })
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(groupsWithAddOns, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return groupsWithAddOns;
  }

  async getAddOnGroupById(tenantId: string, id: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const { data: addOnGroup, error } = await supabase
      .from('add_on_groups')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !addOnGroup) {
      throw new NotFoundException('Add-on group not found');
    }

    const { data: addOns } = await supabase
      .from('add_ons')
      .select('*')
      .eq('add_on_group_id', id)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    // Get translation for group name
    let translatedName = addOnGroup.name;
    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'addon_group',
        entityId: addOnGroup.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;
    } catch (translationError) {
      console.warn(`Failed to get translations for add-on group ${addOnGroup.id}:`, translationError);
    }

    // Get translations for add-ons
    const addOnsWithTranslations = await Promise.all(
      (addOns || []).map(async (addOn) => {
        let translatedAddOnName = addOn.name;
        try {
          const addOnNameTranslation = await this.translationService.getTranslation({
            entityType: 'addon',
            entityId: addOn.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (addOnNameTranslation) translatedAddOnName = addOnNameTranslation;
        } catch (translationError) {
          console.warn(`Failed to get translations for add-on ${addOn.id}:`, translationError);
        }

        return {
          id: addOn.id,
          name: translatedAddOnName,
          price: parseFloat(addOn.price),
          isActive: addOn.is_active,
          displayOrder: addOn.display_order,
        };
      })
    );

    return {
      id: addOnGroup.id,
      name: translatedName,
      selectionType: addOnGroup.selection_type,
      isRequired: addOnGroup.is_required,
      minSelections: addOnGroup.min_selections,
      maxSelections: addOnGroup.max_selections,
      displayOrder: addOnGroup.display_order,
      isActive: addOnGroup.is_active,
      category: addOnGroup.category || null,
      createdAt: addOnGroup.created_at,
      updatedAt: addOnGroup.updated_at,
      addOns: addOnsWithTranslations,
    };
  }

  async createAddOnGroup(tenantId: string, createDto: CreateAddOnGroupDto, branchId?: string, skipTranslations = false) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Auto-set maxSelections to 1 if selectionType is single
    const maxSelections = createDto.selectionType === 'single' 
      ? 1 
      : (createDto.maxSelections ?? null);
    
    // Auto-set minSelections based on selectionType and isRequired
    const minSelections = createDto.selectionType === 'single' && createDto.isRequired
      ? 1
      : (createDto.minSelections ?? 0);

    const addOnGroupData: any = {
        tenant_id: tenantId,
        name: createDto.name,
        selection_type: createDto.selectionType || 'multiple',
        is_required: createDto.isRequired || false,
        min_selections: minSelections,
        max_selections: maxSelections,
      display_order: createDto.displayOrder || 0,
      is_active: createDto.isActive ?? true,
        category: createDto.category || null,
    };
    
    if (branchId) {
      addOnGroupData.branch_id = branchId;
    }

    const { data: addOnGroup, error } = await supabase
      .from('add_on_groups')
      .insert(addOnGroupData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create add-on group: ${error.message}`);
    }

    // Create translations for name asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Skip if skipTranslations is true (e.g., during seed data creation)
    if (!skipTranslations) {
      this.translationService.createTranslations({
        entityType: 'addon_group',
        entityId: addOnGroup.id,
        fieldName: 'name',
        text: createDto.name,
      }).catch((translationError) => {
        console.error('Failed to create translations for add-on group:', translationError);
      });
    }

    return {
      id: addOnGroup.id,
      name: addOnGroup.name,
      selectionType: addOnGroup.selection_type,
      isRequired: addOnGroup.is_required,
      minSelections: addOnGroup.min_selections,
      maxSelections: addOnGroup.max_selections,
      displayOrder: addOnGroup.display_order,
      isActive: addOnGroup.is_active,
      category: addOnGroup.category || null,
      createdAt: addOnGroup.created_at,
      updatedAt: addOnGroup.updated_at,
      addOns: [],
      message: 'Add-on group created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  async updateAddOnGroup(tenantId: string, id: string, updateDto: UpdateAddOnGroupDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if add-on group exists
    const { data: existing } = await supabase
      .from('add_on_groups')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Add-on group not found');
    }

    // Get current values to check selectionType and name
    const { data: current } = await supabase
      .from('add_on_groups')
      .select('selection_type, is_required, name')
      .eq('id', id)
      .single();

    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name.trim();
    
    const selectionType = updateDto.selectionType !== undefined ? updateDto.selectionType : current?.selection_type;
    const isRequired = updateDto.isRequired !== undefined ? updateDto.isRequired : current?.is_required;
    
    if (updateDto.selectionType !== undefined) {
      updateData.selection_type = updateDto.selectionType;
      // Auto-set maxSelections to 1 if selectionType is single
      if (updateDto.selectionType === 'single') {
        updateData.max_selections = 1;
        // Auto-set minSelections based on isRequired
        if (isRequired) {
          updateData.min_selections = 1;
        } else {
          updateData.min_selections = 0;
        }
      }
    }
    
    if (updateDto.isRequired !== undefined) {
      updateData.is_required = updateDto.isRequired;
      // If selectionType is single and isRequired changes, update minSelections
      if (selectionType === 'single') {
        updateData.min_selections = updateDto.isRequired ? 1 : 0;
      }
    }
    
    if (updateDto.minSelections !== undefined) {
      // Only allow minSelections update if selectionType is not single, or if it's 0 or 1
      if (selectionType !== 'single' || (updateDto.minSelections === 0 || updateDto.minSelections === 1)) {
        updateData.min_selections = updateDto.minSelections;
      }
    }
    
    if (updateDto.maxSelections !== undefined) {
      // Only allow maxSelections update if selectionType is not single
      if (selectionType !== 'single') {
        updateData.max_selections = updateDto.maxSelections;
      } else {
        // Force to 1 if selectionType is single
        updateData.max_selections = 1;
      }
    }
    if (updateDto.displayOrder !== undefined) updateData.display_order = updateDto.displayOrder;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    if (updateDto.category !== undefined) updateData.category = updateDto.category?.trim() || null;
    updateData.updated_at = new Date().toISOString();

    const { data: addOnGroup, error } = await supabase
      .from('add_on_groups')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update add-on group: ${error.message}`);
    }

    // Update translations if name changed
    try {
      if (updateDto.name !== undefined && updateDto.name.trim() !== current?.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'addon_group',
            entityId: id,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name.trim(),
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for add-on group:', translationError);
    }

    return this.getAddOnGroupById(tenantId, id, language);
  }

  async deleteAddOnGroup(tenantId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if add-on group exists
    const { data: existing } = await supabase
      .from('add_on_groups')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Add-on group not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('add_on_groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`Failed to delete add-on group: ${error.message}`);
    }

    // Delete translations for this add-on group
    try {
      await this.translationService.deleteEntityTranslations('addon_group', id);
    } catch (translationError) {
      console.warn(`Failed to delete translations for add-on group ${id}:`, translationError);
    }

    return { message: 'Add-on group deleted successfully' };
  }

  // ============================================
  // ADD-ON MANAGEMENT
  // ============================================

  async getAddOns(tenantId: string, addOnGroupId: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify add-on group belongs to tenant
    const { data: group } = await supabase
      .from('add_on_groups')
      .select('id')
      .eq('id', addOnGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Add-on group not found');
    }

    const { data: addOns, error } = await supabase
      .from('add_ons')
      .select('*')
      .eq('add_on_group_id', addOnGroupId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to fetch add-ons: ${error.message}`);
    }

    // Get translations for each add-on
    const addOnsWithTranslations = await Promise.all(
      addOns.map(async (addOn) => {
        let translatedName = addOn.name;
        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'addon',
            entityId: addOn.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;
        } catch (translationError) {
          console.warn(`Failed to get translations for add-on ${addOn.id}:`, translationError);
        }

        return {
          id: addOn.id,
          addOnGroupId: addOn.add_on_group_id,
          name: translatedName,
          price: parseFloat(addOn.price),
          isActive: addOn.is_active,
          displayOrder: addOn.display_order,
          createdAt: addOn.created_at,
          updatedAt: addOn.updated_at,
        };
      })
    );

    return addOnsWithTranslations;
  }

  async getAddOnById(tenantId: string, addOnGroupId: string, id: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify add-on group belongs to tenant
    const { data: group } = await supabase
      .from('add_on_groups')
      .select('id')
      .eq('id', addOnGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Add-on group not found');
    }

    const { data: addOn, error } = await supabase
      .from('add_ons')
      .select('*')
      .eq('id', id)
      .eq('add_on_group_id', addOnGroupId)
      .is('deleted_at', null)
      .single();

    if (error || !addOn) {
      throw new NotFoundException('Add-on not found');
    }

    // Get translation for add-on name
    let translatedName = addOn.name;
    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'addon',
        entityId: addOn.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;
    } catch (translationError) {
      console.warn(`Failed to get translations for add-on ${addOn.id}:`, translationError);
    }

    return {
      id: addOn.id,
      addOnGroupId: addOn.add_on_group_id,
      name: translatedName,
      price: parseFloat(addOn.price),
      isActive: addOn.is_active,
      displayOrder: addOn.display_order,
      createdAt: addOn.created_at,
      updatedAt: addOn.updated_at,
    };
  }

  async createAddOn(tenantId: string, createDto: CreateAddOnDto, skipTranslations = false) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify add-on group belongs to tenant
    const { data: group } = await supabase
      .from('add_on_groups')
      .select('id')
      .eq('id', createDto.addOnGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Add-on group not found');
    }

    const { data: addOn, error } = await supabase
      .from('add_ons')
      .insert({
        add_on_group_id: createDto.addOnGroupId,
        name: createDto.name,
        price: createDto.price || 0,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
        display_order: createDto.displayOrder || 0,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create add-on: ${error.message}`);
    }

    // Create translations for name asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Skip if skipTranslations is true (e.g., during seed data creation)
    if (!skipTranslations) {
      this.translationService.createTranslations({
        entityType: 'addon',
        entityId: addOn.id,
        fieldName: 'name',
        text: createDto.name,
      }).catch((translationError) => {
        console.error('Failed to create translations for add-on:', translationError);
      });
    }

    return {
      id: addOn.id,
      addOnGroupId: addOn.add_on_group_id,
      name: addOn.name,
      price: parseFloat(addOn.price),
      isActive: addOn.is_active,
      displayOrder: addOn.display_order,
      createdAt: addOn.created_at,
      updatedAt: addOn.updated_at,
      message: 'Add-on created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  async updateAddOn(tenantId: string, addOnGroupId: string, id: string, updateDto: UpdateAddOnDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify add-on group belongs to tenant
    const { data: group } = await supabase
      .from('add_on_groups')
      .select('id')
      .eq('id', addOnGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Add-on group not found');
    }

    // Check if add-on exists and get current name for translation comparison
    const { data: existing } = await supabase
      .from('add_ons')
      .select('id, name')
      .eq('id', id)
      .eq('add_on_group_id', addOnGroupId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Add-on not found');
    }

    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name.trim();
    if (updateDto.price !== undefined) updateData.price = updateDto.price;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    if (updateDto.displayOrder !== undefined) updateData.display_order = updateDto.displayOrder;
    updateData.updated_at = new Date().toISOString();

    const { data: addOn, error } = await supabase
      .from('add_ons')
      .update(updateData)
      .eq('id', id)
      .eq('add_on_group_id', addOnGroupId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update add-on: ${error.message}`);
    }

    // Update translations if name changed
    try {
      if (updateDto.name !== undefined && updateDto.name.trim() !== existing?.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'addon',
            entityId: id,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name.trim(),
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for add-on:', translationError);
    }

    return {
      id: addOn.id,
      addOnGroupId: addOn.add_on_group_id,
      name: addOn.name,
      price: parseFloat(addOn.price),
      isActive: addOn.is_active,
      displayOrder: addOn.display_order,
      createdAt: addOn.created_at,
      updatedAt: addOn.updated_at,
    };
  }

  async deleteAddOn(tenantId: string, addOnGroupId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify add-on group belongs to tenant
    const { data: group } = await supabase
      .from('add_on_groups')
      .select('id')
      .eq('id', addOnGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Add-on group not found');
    }

    // Check if add-on exists
    const { data: existing } = await supabase
      .from('add_ons')
      .select('id')
      .eq('id', id)
      .eq('add_on_group_id', addOnGroupId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Add-on not found');
    }

    // Check if add-on is used in orders
    const { data: orderAddOns } = await supabase
      .from('order_item_add_ons')
      .select('id')
      .eq('add_on_id', id)
      .limit(1);

    if (orderAddOns && orderAddOns.length > 0) {
      throw new ConflictException('Cannot delete add-on with associated orders');
    }

    // Soft delete
    const { error } = await supabase
      .from('add_ons')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('add_on_group_id', addOnGroupId);

    if (error) {
      throw new BadRequestException(`Failed to delete add-on: ${error.message}`);
    }

    // Delete translations for this add-on
    try {
      await this.translationService.deleteEntityTranslations('addon', id);
    } catch (translationError) {
      console.warn(`Failed to delete translations for add-on ${id}:`, translationError);
    }

    return { message: 'Add-on deleted successfully' };
  }

  // ============================================
  // MENU MANAGEMENT
  // Note: Since there's no menus table in the schema,
  // this is a simplified implementation that works with food items
  // and their menu_type field. A proper menus table can be added later.
  // ============================================

  async getMenus(tenantId: string, pagination?: PaginationParams, branchId?: string, language: string = 'en'): Promise<PaginatedResponse<any> | any[]> {
    // Get menus from menu_items junction table AND menus table
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Ensure default menus exist (this will create them if they don't, and create translations)
    await this.createDefaultMenus(tenantId, branchId);
    
    // First, get all menus from the menus table (this includes menus without food items)
    let menuDataQuery = supabase
      .from('menus')
      .select('id, menu_type, name, is_active')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // When a branch is selected, only get menus from that branch (exclude NULL for strict filtering)
      menuDataQuery = menuDataQuery.eq('branch_id', branchId);
    }
    
    const { data: menuData, error: menuDataError } = await menuDataQuery;
    
    if (menuDataError && !menuDataError.message.includes('relation') && !menuDataError.message.includes('does not exist')) {
      throw new BadRequestException(`Failed to fetch menus: ${menuDataError.message}`);
    }
    
    // Get menu types from menus table
    const menuTypesFromMenusTable = menuData?.map((m: any) => m.menu_type) || [];
    
    // Get food items for this branch (to filter menu_items)
    let foodItemsQuery = supabase
      .from('food_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      foodItemsQuery = foodItemsQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    
    const { data: branchFoodItems, error: foodItemsError } = await foodItemsQuery;
    
    if (foodItemsError) {
      throw new BadRequestException(`Failed to fetch food items: ${foodItemsError.message}`);
    }
    
    const branchFoodItemIds = branchFoodItems?.map((item: any) => item.id) || [];
    
    // Get menu_items that reference food items for this branch (if there are any food items)
    let menuItems: any[] = [];
    if (branchFoodItemIds.length > 0) {
      let menuItemsQuery = supabase
        .from('menu_items')
        .select('menu_type, food_item_id')
        .eq('tenant_id', tenantId)
        .in('food_item_id', branchFoodItemIds);
      
      const { data: menuItemsData, error: menuItemsError } = await menuItemsQuery;

      if (menuItemsError) {
        throw new BadRequestException(`Failed to fetch menu items: ${menuItemsError.message}`);
      }
      
      menuItems = menuItemsData || [];
    }

    // Get unique menu types from menu_items
    const uniqueMenuTypesFromItems = [...new Set(menuItems?.map((mi: any) => mi.menu_type) || [])];
    
    // Include default menu types if they don't exist yet
    const defaultMenuTypes = ['all_day', 'breakfast', 'lunch', 'dinner', 'kids_special'];
    
    // Merge menu types from menus table, menu_items, and default types
    const allMenuTypes = [...new Set([...defaultMenuTypes, ...menuTypesFromMenusTable, ...uniqueMenuTypesFromItems])];
    
    // Apply pagination if provided
    let paginatedMenuTypes = allMenuTypes;
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      paginatedMenuTypes = allMenuTypes.slice(offset, offset + limit);
    }

    // Get active food items to filter counts (only for this branch)
    const foodItemIds = menuItems?.map((mi: any) => mi.food_item_id) || [];
    let activeItemIds: string[] = [];
    
    if (foodItemIds.length > 0) {
      let activeItemsQuery = supabase
        .from('food_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', foodItemIds)
        .eq('is_active', true)
        .is('deleted_at', null);
      
      if (branchId) {
        // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
        activeItemsQuery = activeItemsQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }
      
      const { data: activeItems } = await activeItemsQuery;
      activeItemIds = activeItems?.map((item: any) => item.id) || [];
    }

    // Default menu type to name mapping
    const defaultMenuNames: Record<string, string> = {
      'all_day': 'All Day',
      'breakfast': 'Breakfast',
      'lunch': 'Lunch',
      'dinner': 'Dinner',
      'kids_special': "Kids' Special",
    };

    // Create maps of menu_type to id, name and is_active
    const menuIdMap = new Map<string, string>();
    const menuNameMap = new Map<string, string>();
    const menuActiveMap = new Map<string, boolean>();
    if (menuData) {
      menuData.forEach((mn: any) => {
        menuIdMap.set(mn.menu_type, mn.id);
        menuNameMap.set(mn.menu_type, mn.name);
        menuActiveMap.set(mn.menu_type, mn.is_active !== false); // Default to true if null/undefined
      });
    }

    // Group by menu_type and count all items (not just active ones), with translations
    const menus = await Promise.all(
      paginatedMenuTypes.map(async (menuType) => {
        const itemsInMenu = (menuItems || []).filter((mi: any) => mi.menu_type === menuType);
        
        // Always use stored name from menus table - don't generate fallback names
        const storedName = menuNameMap.get(menuType);
        const defaultName = defaultMenuNames[menuType];
        const displayName = storedName || defaultName || menuType;
        const menuId = menuIdMap.get(menuType);
        
        // Get translated name if translation exists
        // Try to get translation if we have a menuId (even if using default name)
        let translatedName = displayName;
        if (menuId) {
          try {
            const nameTranslation = await this.translationService.getTranslation({
              entityType: 'menu',
              entityId: menuId,
              languageCode: language,
              fieldName: 'name',
              fallbackLanguage: 'en',
            });
            if (nameTranslation) translatedName = nameTranslation;
          } catch (translationError) {
            console.warn(`Failed to get translations for menu ${menuType}:`, translationError);
          }
        }
        
        // Get is_active from menus table, default to true if not set
        const isActive = menuActiveMap.has(menuType) 
          ? menuActiveMap.get(menuType)! 
          : (itemsInMenu.length > 0); // Default to true if menu has items, false if empty
        
        return {
          menuType,
          name: translatedName,
          isActive,
          itemCount: itemsInMenu.length, // Count all items, not just active ones
        };
      })
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(menus, allMenuTypes.length, pagination.page || 1, pagination.limit || 10);
    }

    return menus;
  }

  async getMenuItems(tenantId: string, menuType: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get food item IDs from menu_items junction table
    const { data: menuItems, error } = await supabase
      .from('menu_items')
      .select('food_item_id')
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType);

    if (error) {
      throw new BadRequestException(`Failed to fetch menu items: ${error.message}`);
    }

    // Verify items are still active
    const foodItemIds = menuItems.map((mi) => mi.food_item_id);
    if (foodItemIds.length === 0) {
      return [];
    }

    const { data: activeItems } = await supabase
      .from('food_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('id', foodItemIds)
      .eq('is_active', true)
      .is('deleted_at', null);

    return activeItems.map((item) => item.id);
  }

  async getMenuItemsForTypes(tenantId: string, menuTypes: string[], branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    if (menuTypes.length === 0) {
      return {};
    }
    
    // Get food item IDs from menu_items junction table for all menu types at once
    let menuItemsQuery = supabase
      .from('menu_items')
      .select('menu_type, food_item_id')
      .eq('tenant_id', tenantId)
      .in('menu_type', menuTypes);

    const { data: menuItems, error } = await menuItemsQuery;

    if (error) {
      throw new BadRequestException(`Failed to fetch menu items: ${error.message}`);
    }

    // Group food item IDs by menu type
    const menuItemsMap = new Map<string, Set<string>>();
    menuTypes.forEach(type => menuItemsMap.set(type, new Set()));
    
    menuItems?.forEach((mi: any) => {
      if (menuItemsMap.has(mi.menu_type)) {
        menuItemsMap.get(mi.menu_type)!.add(mi.food_item_id);
      }
    });

    // Get all unique food item IDs
    const allFoodItemIds = new Set<string>();
    menuItemsMap.forEach((ids) => {
      ids.forEach(id => allFoodItemIds.add(id));
    });

    if (allFoodItemIds.size === 0) {
      return Object.fromEntries(menuTypes.map(type => [type, []]));
    }

    // Verify items are still active (one query for all items)
    let activeItemsQuery = supabase
      .from('food_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('id', Array.from(allFoodItemIds))
      .eq('is_active', true)
      .is('deleted_at', null);

    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      activeItemsQuery = activeItemsQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data: activeItems } = await activeItemsQuery;
    const activeItemIds = new Set(activeItems?.map((item: any) => item.id) || []);

    // Return map of menu type to array of active food item IDs
    const result: Record<string, string[]> = {};
    menuTypes.forEach(type => {
      const typeItemIds = menuItemsMap.get(type) || new Set();
      result[type] = Array.from(typeItemIds).filter(id => activeItemIds.has(id));
    });

    return result;
  }

  async assignItemsToMenu(tenantId: string, menuType: string, foodItemIds: string[]) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Validate food items belong to tenant
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('id', foodItemIds)
      .is('deleted_at', null);

    if (foodItems.length !== foodItemIds.length) {
      throw new BadRequestException('One or more food items not found');
    }

    // Remove existing assignments for this menu type
    const { error: deleteError } = await supabase
      .from('menu_items')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType);

    if (deleteError) {
      throw new BadRequestException(`Failed to clear existing menu assignments: ${deleteError.message}`);
    }

    // Insert new assignments
    if (foodItemIds.length > 0) {
      const menuItemsToInsert = foodItemIds.map((foodItemId, index) => ({
        tenant_id: tenantId,
        menu_type: menuType,
        food_item_id: foodItemId,
        display_order: index,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('menu_items')
        .insert(menuItemsToInsert);

      if (insertError) {
        throw new BadRequestException(`Failed to assign items to menu: ${insertError.message}`);
      }

      // Ensure menu record exists in menus table
      // Check if menu record exists
      const { data: existingMenu } = await supabase
        .from('menus')
        .select('menu_type')
        .eq('tenant_id', tenantId)
        .eq('menu_type', menuType)
        .limit(1);

      if (!existingMenu || existingMenu.length === 0) {
        // Create menu record if it doesn't exist
        // Generate display name from menu_type
        const displayName = menuType.charAt(0).toUpperCase() + menuType.slice(1).replace(/_/g, ' ');
        const { error: menuInsertError } = await supabase
          .from('menus')
          .insert({
            tenant_id: tenantId,
            menu_type: menuType,
            name: displayName,
            is_active: true, // Default to active when items are assigned
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        // If table doesn't exist or insert fails, we'll continue (menu will still work)
        if (menuInsertError && !menuInsertError.message.includes('relation') && !menuInsertError.message.includes('does not exist')) {
          // Log error but don't throw - menu_items assignment was successful
          console.warn(`Failed to create menu record: ${menuInsertError.message}`);
        }
      }
    }

    return { message: 'Items assigned to menu successfully', menuType, itemCount: foodItemIds.length };
  }

  /**
   * Helper function to check if a food item is active in another active menu
   * @param supabase Supabase client
   * @param tenantId Tenant ID
   * @param foodItemId Food item ID to check
   * @param excludeMenuType Menu type to exclude from the check (current menu)
   * @returns true if food item is active in another active menu, false otherwise
   */
  private async isFoodItemActiveInAnotherActiveMenu(
    supabase: any,
    tenantId: string,
    foodItemId: string,
    excludeMenuType?: string,
  ): Promise<boolean> {
    // Get all active menus (excluding the current menu if specified)
    const activeMenusQuery = supabase
      .from('menus')
      .select('menu_type')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    
    if (excludeMenuType) {
      activeMenusQuery.neq('menu_type', excludeMenuType);
    }

    const { data: activeMenus } = await activeMenusQuery;

    if (!activeMenus || activeMenus.length === 0) {
      return false;
    }

    const activeMenuTypes = activeMenus.map((m: any) => m.menu_type);

    // Check if the food item is in any of these active menus
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('menu_type')
      .eq('food_item_id', foodItemId)
      .in('menu_type', activeMenuTypes);

    // Check if the food item itself is active
    const { data: foodItem } = await supabase
      .from('food_items')
      .select('is_active')
      .eq('id', foodItemId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    // Return true if food item is active AND is in another active menu
    return foodItem?.is_active === true && menuItems && menuItems.length > 0;
  }

  async activateMenu(tenantId: string, menuType: string, isActive: boolean) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Update the menu's is_active status in the menus table
    // First, check if a menu record exists
    const { data: existingMenus, error: selectError } = await supabase
      .from('menus')
      .select('menu_type')
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType)
      .limit(1);

    if (selectError && !selectError.message.includes('does not exist')) {
      throw new BadRequestException(`Failed to check menu status: ${selectError.message}`);
    }

    if (existingMenus && existingMenus.length > 0) {
      // Update existing menu record
      const { error } = await supabase
        .from('menus')
        .update({ 
          is_active: isActive, 
          updated_at: new Date().toISOString() 
        })
        .eq('tenant_id', tenantId)
        .eq('menu_type', menuType);

      if (error) {
        throw new BadRequestException(`Failed to ${isActive ? 'activate' : 'deactivate'} menu: ${error.message}`);
      }
    } else {
      // If menu record doesn't exist, create it with the active status
      // Generate display name from menu_type
      const displayName = menuType.charAt(0).toUpperCase() + menuType.slice(1).replace(/_/g, ' ');
      const { data: insertedMenu, error } = await supabase
        .from('menus')
        .insert({
          tenant_id: tenantId,
          menu_type: menuType,
          name: displayName,
          is_active: isActive,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      // If table doesn't exist or insert fails, we'll continue (menu will still work)
      if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
        throw new BadRequestException(`Failed to ${isActive ? 'activate' : 'deactivate'} menu: ${error.message}`);
      }

      // Create translations for menu name if menu was created successfully (asynchronously)
      // Don't block the response - translations will be processed in the background
      if (insertedMenu && insertedMenu.id) {
        this.translationService.createTranslations({
          entityType: 'menu',
          entityId: insertedMenu.id,
          fieldName: 'name',
          text: displayName,
        }).catch((translationError) => {
          console.error(`Failed to create translations for menu ${insertedMenu.id}:`, translationError);
        });
      }
    }

    // Return response immediately to prevent timeout
    const response = { message: `Menu ${isActive ? 'activated' : 'deactivated'} successfully`, menuType, isActive };

    // Process food items asynchronously in the background (don't await)
    this.updateFoodItemsForMenu(supabase, tenantId, menuType, isActive).catch((error) => {
      // Log error but don't fail the request since menu update already succeeded
      console.error(`Failed to update food items for menu ${menuType}:`, error);
    });

    return response;
  }

  /**
   * Update food items when menu is activated/deactivated (runs asynchronously)
   */
  private async updateFoodItemsForMenu(
    supabase: any,
    tenantId: string,
    menuType: string,
    isActive: boolean,
  ): Promise<void> {
    // Get all food items in this menu
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('food_item_id')
      .eq('menu_type', menuType);

    if (!menuItems || menuItems.length === 0) {
      return;
    }

    const foodItemIds = menuItems.map((mi: any) => mi.food_item_id);

    // Get all active menus (excluding current menu) for batch checking
    const { data: activeMenus } = await supabase
      .from('menus')
      .select('menu_type')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .neq('menu_type', menuType);

    const activeMenuTypes = activeMenus?.map((m: any) => m.menu_type) || [];

    // Get all menu_items for these food items in active menus (batch query)
    const { data: allMenuItems } = await supabase
      .from('menu_items')
      .select('food_item_id, menu_type')
      .in('food_item_id', foodItemIds)
      .in('menu_type', activeMenuTypes.length > 0 ? activeMenuTypes : []);

    // Create a map of food items that are in other active menus
    const foodItemsInOtherActiveMenus = new Set<string>();
    if (allMenuItems) {
      allMenuItems.forEach((mi: any) => {
        foodItemsInOtherActiveMenus.add(mi.food_item_id);
      });
    }

    // Get current active status of all food items (batch query)
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('id, is_active')
      .eq('tenant_id', tenantId)
      .in('id', foodItemIds)
      .is('deleted_at', null);

    // Determine which food items should be updated
    const itemsToUpdate: string[] = [];
    const updateData = isActive ? true : false;

    if (foodItems) {
      for (const foodItem of foodItems) {
        // Skip if already in the desired state
        if (foodItem.is_active === updateData) {
          continue;
        }

        // If activating: only activate if not active in another active menu
        // If deactivating: only deactivate if not active in another active menu
        const isInOtherActiveMenu = foodItemsInOtherActiveMenus.has(foodItem.id);
        if (!isInOtherActiveMenu) {
          itemsToUpdate.push(foodItem.id);
        }
      }
    }

    // Batch update all food items at once
    if (itemsToUpdate.length > 0) {
      await supabase
        .from('food_items')
        .update({
          is_active: updateData,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .in('id', itemsToUpdate);
    }
  }

  async createMenu(tenantId: string, createDto: CreateMenuDto, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if menu type already exists for this branch
    let existingQuery = supabase
      .from('menus')
      .select('menu_type')
      .eq('tenant_id', tenantId)
      .eq('menu_type', createDto.menuType);
    
    if (branchId) {
      existingQuery = existingQuery.eq('branch_id', branchId);
    }
    
    const { data: existing } = await existingQuery.limit(1);

    if (existing && existing.length > 0) {
      throw new ConflictException('Menu type already exists for this branch');
    }


    // Store menu name in menus table (create table if it doesn't exist - Supabase will handle it)
    // Use manual check-then-update-or-insert since partial unique indexes don't work with upsert onConflict
    if (createDto.name) {
      const menuData: any = {
          tenant_id: tenantId,
          menu_type: createDto.menuType,
          name: createDto.name,
        is_active: createDto.isActive ?? true,
          branch_id: branchId || null, // Always include branch_id, set to null if not provided
      };
      
      // Check if menu already exists
      let existingMenuQuery = supabase
        .from('menus')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('menu_type', createDto.menuType)
        .is('deleted_at', null);
      
      if (branchId) {
        existingMenuQuery = existingMenuQuery.eq('branch_id', branchId);
      } else {
        existingMenuQuery = existingMenuQuery.is('branch_id', null);
      }
      
      const { data: existingMenu } = await existingMenuQuery.limit(1);
      
      let menuId: string | null = null;
      let menuNameError;
      if (existingMenu && existingMenu.length > 0) {
        menuId = existingMenu[0].id;
        // Update existing menu
        const { error: updateError } = await supabase
          .from('menus')
          .update({
            name: createDto.name,
            is_active: createDto.isActive ?? true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingMenu[0].id)
          .select('id')
          .single();
        if (!updateError) {
          const { data: updatedMenu } = await supabase
            .from('menus')
            .select('id')
            .eq('id', existingMenu[0].id)
            .single();
          if (updatedMenu) menuId = updatedMenu.id;
        }
        menuNameError = updateError;
      } else {
        // Insert new menu
        const { data: insertedMenu, error: insertError } = await supabase
          .from('menus')
          .insert(menuData)
          .select('id')
          .single();
        if (insertedMenu) menuId = insertedMenu.id;
        menuNameError = insertError;
      }

      // If table doesn't exist, we'll continue without storing the name
      // The name will be generated from menu_type in getMenus
      if (menuNameError && !menuNameError.message.includes('relation') && !menuNameError.message.includes('does not exist')) {
        console.warn('Failed to store menu name:', menuNameError.message);
      }

      // Create translations for menu name if menu was created/updated successfully (asynchronously)
      // Don't block the response - translations will be processed in the background
      if (menuId && createDto.name) {
        this.translationService.createTranslations({
          entityType: 'menu',
          entityId: menuId,
          fieldName: 'name',
          text: createDto.name,
        }).catch((translationError) => {
          console.error(`Failed to create translations for menu ${menuId}:`, translationError);
        });
      }
    }

    // If food items are provided, assign them to the menu
    if (createDto.foodItemIds && createDto.foodItemIds.length > 0) {
      // Validate food items belong to tenant
      const { data: foodItems } = await supabase
        .from('food_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', createDto.foodItemIds)
        .is('deleted_at', null);

      if (foodItems.length !== createDto.foodItemIds.length) {
        throw new BadRequestException('One or more food items not found');
      }

      // Insert menu assignments
      const menuItemsToInsert = createDto.foodItemIds.map((foodItemId, index) => ({
        tenant_id: tenantId,
        menu_type: createDto.menuType,
        food_item_id: foodItemId,
        display_order: index,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('menu_items')
        .insert(menuItemsToInsert);

      if (insertError) {
        throw new BadRequestException(`Failed to create menu: ${insertError.message}`);
      }
    }

    return {
      message: 'Menu created successfully',
      menuType: createDto.menuType,
      name: createDto.name || createDto.menuType.charAt(0).toUpperCase() + createDto.menuType.slice(1).replace(/_/g, ' '),
      itemCount: createDto.foodItemIds?.length || 0,
      isActive: createDto.isActive !== undefined ? createDto.isActive : true,
    };
  }

  async createDefaultMenus(tenantId: string, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Default menu types with their proper display names
    const defaultMenus = [
      { menuType: 'all_day', name: 'All Day' },
      { menuType: 'breakfast', name: 'Breakfast' },
      { menuType: 'lunch', name: 'Lunch' },
      { menuType: 'dinner', name: 'Dinner' },
      { menuType: 'kids_special', name: "Kids' Special" },
    ];

    // Check which menus already exist
    let existingQuery = supabase
      .from('menus')
      .select('menu_type')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      existingQuery = existingQuery.eq('branch_id', branchId);
    } else {
      existingQuery = existingQuery.is('branch_id', null);
    }

    const { data: existingMenus } = await existingQuery;
    const existingMenuTypes = new Set(existingMenus?.map((m: any) => m.menu_type) || []);

    // Create menus that don't exist yet
    const menusToCreate = defaultMenus
      .filter(menu => !existingMenuTypes.has(menu.menuType))
      .map(menu => ({
        tenant_id: tenantId,
        branch_id: branchId || null,
        menu_type: menu.menuType,
        name: menu.name,
        is_active: true,
      }));

    if (menusToCreate.length > 0) {
      const { data: insertedMenus, error: insertError } = await supabase
        .from('menus')
        .insert(menusToCreate)
        .select('id, menu_type, name');

      if (insertError && !insertError.message.includes('relation') && !insertError.message.includes('does not exist')) {
        console.warn('Failed to create default menus:', insertError.message);
        // Don't throw - this is non-critical
      } else {
        console.log(`Created ${menusToCreate.length} default menus for tenant:`, tenantId);
        
        // Create translations for default menus directly (no AI needed for standard data)
        // Don't block the response - translations will be processed in the background
        if (insertedMenus && insertedMenus.length > 0) {
          for (const menu of insertedMenus) {
            this.translationService.insertTranslationsDirectly({
              entityType: 'menu',
              entityId: menu.id,
              fieldName: 'name',
              text: menu.name,
            }).catch((translationError) => {
              console.error(`Failed to create translations for default menu ${menu.menu_type}:`, translationError);
            });
          }
        }
      }
    }
    
    // Also ensure translations exist for existing default menus that might not have them
    // Get all existing default menu types
    const defaultMenuTypes = ['all_day', 'breakfast', 'lunch', 'dinner', 'kids_special'];
    let existingMenusQuery = supabase
      .from('menus')
      .select('id, menu_type, name')
      .eq('tenant_id', tenantId)
      .in('menu_type', defaultMenuTypes)
      .is('deleted_at', null);
    
    if (branchId) {
      existingMenusQuery = existingMenusQuery.eq('branch_id', branchId);
    } else {
      existingMenusQuery = existingMenusQuery.is('branch_id', null);
    }
    
    const { data: existingDefaultMenus } = await existingMenusQuery;
    
    if (existingDefaultMenus && existingDefaultMenus.length > 0) {
      for (const menu of existingDefaultMenus) {
        try {
          // Check if translation metadata exists for this menu
          const { data: metadata } = await supabase
            .from('translation_metadata')
            .select('id')
            .eq('entity_type', 'menu')
            .eq('entity_id', menu.id)
            .single();
          
          // If no translation metadata exists, create translations directly (no AI needed for standard data)
          // Don't block the response - translations will be processed in the background
          if (!metadata) {
            this.translationService.insertTranslationsDirectly({
              entityType: 'menu',
              entityId: menu.id,
              fieldName: 'name',
              text: menu.name,
            }).catch((translationError) => {
              // Ignore errors - translations might already exist or there might be other issues
              console.error(`Failed to ensure translations for existing default menu ${menu.menu_type}:`, translationError);
            });
          }
        } catch (translationError) {
          // Ignore errors - translations might already exist or there might be other issues
          console.warn(`Failed to check translation metadata for existing default menu ${menu.menu_type}:`, translationError);
        }
      }
    }
  }

  async deleteMenu(tenantId: string, menuType: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Prevent deletion of default menu types
    const defaultMenuTypes = ['all_day', 'breakfast', 'lunch', 'dinner', 'kids_special'];
    if (defaultMenuTypes.includes(menuType)) {
      throw new BadRequestException('Cannot delete default menu types');
    }

    // Check if menu type exists in menus table (this includes menus with 0 items)
    const { data: existingMenu } = await supabase
      .from('menus')
      .select('id, menu_type')
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType)
      .is('deleted_at', null)
      .limit(1);

    // Also check menu_items as fallback (for backward compatibility with menus that might not be in menus table)
    const { data: existingItems } = await supabase
      .from('menu_items')
      .select('menu_type')
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType)
      .limit(1);

    if ((!existingMenu || existingMenu.length === 0) && (!existingItems || existingItems.length === 0)) {
      throw new NotFoundException('Menu type not found');
    }

    // Delete all menu_items with this menu type (if any exist)
    const { error: deleteItemsError } = await supabase
      .from('menu_items')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType);

    if (deleteItemsError) {
      throw new BadRequestException(`Failed to delete menu items: ${deleteItemsError.message}`);
    }

    // Delete translations for this menu if it exists
    if (existingMenu && existingMenu.length > 0 && existingMenu[0].id) {
      try {
        await this.translationService.deleteEntityTranslations('menu', existingMenu[0].id);
      } catch (translationError) {
        console.warn(`Failed to delete translations for menu ${existingMenu[0].id}:`, translationError);
      }
    }

    // Delete menu from menus table if it exists
    const { error: deleteMenuError } = await supabase
      .from('menus')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType);

    if (deleteMenuError) {
      // If menus table doesn't exist or has an error, that's okay - we still deleted menu_items
      // Only throw if it's not a "relation does not exist" error
      if (!deleteMenuError.message.includes('relation') && !deleteMenuError.message.includes('does not exist')) {
        throw new BadRequestException(`Failed to delete menu: ${deleteMenuError.message}`);
      }
    }

    return { message: 'Menu deleted successfully', menuType };
  }

  // ============================================
  // BUFFET MANAGEMENT
  // ============================================

  async getBuffets(tenantId: string, pagination?: PaginationParams, branchId?: string, language: string = 'en'): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    let countQuery = supabase
      .from('buffets')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      countQuery = countQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    
    const { count: totalCount } = await countQuery;

    let query = supabase
      .from('buffets')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    
    query = query.order('display_order', { ascending: true });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: buffets, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch buffets: ${error.message}`);
    }

    // Get translations for each buffet
    const formattedBuffets = await Promise.all(
      buffets.map(async (buffet) => {
        let translatedName = buffet.name;
        let translatedDescription = buffet.description;

        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'buffet',
            entityId: buffet.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;

          if (buffet.description) {
            const descTranslation = await this.translationService.getTranslation({
              entityType: 'buffet',
              entityId: buffet.id,
              languageCode: language,
              fieldName: 'description',
              fallbackLanguage: 'en',
            });
            if (descTranslation) translatedDescription = descTranslation;
          }
        } catch (translationError) {
          console.warn(`Failed to get translations for buffet ${buffet.id}:`, translationError);
        }

        return {
          id: buffet.id,
          name: translatedName,
          description: translatedDescription,
          imageUrl: buffet.image_url,
          pricePerPerson: buffet.price_per_person,
          minPersons: buffet.min_persons,
          duration: buffet.duration,
          menuTypes: buffet.menu_types || [],
          displayOrder: buffet.display_order,
          isActive: buffet.is_active,
          createdAt: buffet.created_at,
          updatedAt: buffet.updated_at,
        };
      })
    );

    if (pagination) {
      return createPaginatedResponse(formattedBuffets, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return formattedBuffets;
  }

  async getBuffetById(tenantId: string, id: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: buffet, error } = await supabase
      .from('buffets')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !buffet) {
      throw new NotFoundException('Buffet not found');
    }

    // Get food items from menu types
    let availableFoodItems = [];
    if (buffet.menu_types && buffet.menu_types.length > 0) {
      const { data: menuItems } = await supabase
        .from('menu_items')
        .select('food_item_id')
        .eq('tenant_id', tenantId)
        .in('menu_type', buffet.menu_types);

      if (menuItems && menuItems.length > 0) {
        const foodItemIds = [...new Set(menuItems.map((mi) => mi.food_item_id))];
        const { data: items } = await supabase
          .from('food_items')
          .select('id, name, base_price, image_url')
          .eq('tenant_id', tenantId)
          .in('id', foodItemIds)
          .eq('is_active', true)
          .is('deleted_at', null);

        availableFoodItems = items || [];
      }
    }

    // Get translations for name and description
    let translatedName = buffet.name;
    let translatedDescription = buffet.description;

    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'buffet',
        entityId: buffet.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;

      if (buffet.description) {
        const descTranslation = await this.translationService.getTranslation({
          entityType: 'buffet',
          entityId: buffet.id,
          languageCode: language,
          fieldName: 'description',
          fallbackLanguage: 'en',
        });
        if (descTranslation) translatedDescription = descTranslation;
      }
    } catch (translationError) {
      console.warn(`Failed to get translations for buffet ${buffet.id}:`, translationError);
    }

    return {
      id: buffet.id,
      name: translatedName,
      description: translatedDescription,
      imageUrl: buffet.image_url,
      pricePerPerson: buffet.price_per_person,
      minPersons: buffet.min_persons,
      duration: buffet.duration,
      menuTypes: buffet.menu_types || [],
      displayOrder: buffet.display_order,
      isActive: buffet.is_active,
      createdAt: buffet.created_at,
      updatedAt: buffet.updated_at,
      availableFoodItems,
    };
  }

  async createBuffet(tenantId: string, createDto: CreateBuffetDto, branchId?: string, skipTranslations = false) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if buffet with same name already exists for this branch
    let existingQuery = supabase
      .from('buffets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', createDto.name.trim())
      .is('deleted_at', null);
    
    if (branchId) {
      existingQuery = existingQuery.eq('branch_id', branchId);
    }
    
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      throw new ConflictException('A buffet with this name already exists');
    }

    // Get max display order
    const { data: maxOrder } = await supabase
      .from('buffets')
      .select('display_order')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const displayOrder = createDto.displayOrder ?? ((maxOrder?.display_order || 0) + 1);

    const buffetData: any = {
        tenant_id: tenantId,
        name: createDto.name.trim(),
        description: createDto.description,
        image_url: createDto.imageUrl,
        price_per_person: createDto.pricePerPerson,
        min_persons: createDto.minPersons,
        duration: createDto.duration,
        menu_types: createDto.menuTypes || [],
        display_order: displayOrder,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    
    if (branchId) {
      buffetData.branch_id = branchId;
    }

    const { data: buffet, error } = await supabase
      .from('buffets')
      .insert(buffetData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create buffet: ${error.message}`);
    }

    // Create translations for name and description asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Skip if skipTranslations is true (e.g., during seed data creation)
    if (!skipTranslations) {
      // Use batch translation to handle multiple fields efficiently
      const buffetFieldsToTranslate = [
        { fieldName: 'name', text: createDto.name },
        ...(createDto.description ? [{ fieldName: 'description', text: createDto.description }] : []),
      ];

      this.translationService
        .createBatchTranslations('buffet', buffet.id, buffetFieldsToTranslate, undefined, tenantId)
        .catch((translationError) => {
          console.error('Failed to create batch translations for buffet:', translationError);
        });
    }

    return {
      id: buffet.id,
      name: buffet.name,
      description: buffet.description,
      imageUrl: buffet.image_url,
      pricePerPerson: buffet.price_per_person,
      minPersons: buffet.min_persons,
      duration: buffet.duration,
      menuTypes: buffet.menu_types || [],
      displayOrder: buffet.display_order,
      isActive: buffet.is_active,
      createdAt: buffet.created_at,
      updatedAt: buffet.updated_at,
      message: 'Buffet created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  async updateBuffet(tenantId: string, id: string, updateDto: UpdateBuffetDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if buffet exists and get current values for translation comparison
    const { data: existing } = await supabase
      .from('buffets')
      .select('id, name, description')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Buffet not found');
    }

    // Check if name is being changed and if new name already exists
    if (updateDto.name && updateDto.name.trim() !== '') {
      const { data: nameConflict } = await supabase
        .from('buffets')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', updateDto.name.trim())
        .neq('id', id)
        .is('deleted_at', null)
        .single();

      if (nameConflict) {
        throw new ConflictException('A buffet with this name already exists');
      }
    }

    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name.trim();
    if (updateDto.description !== undefined) updateData.description = updateDto.description;
    if ((updateDto as any).imageUrl !== undefined) updateData.image_url = (updateDto as any).imageUrl;
    if (updateDto.pricePerPerson !== undefined) updateData.price_per_person = updateDto.pricePerPerson;
    if (updateDto.minPersons !== undefined) updateData.min_persons = updateDto.minPersons;
    if (updateDto.duration !== undefined) updateData.duration = updateDto.duration;
    if (updateDto.menuTypes !== undefined) updateData.menu_types = updateDto.menuTypes;
    if (updateDto.displayOrder !== undefined) updateData.display_order = updateDto.displayOrder;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    updateData.updated_at = new Date().toISOString();

    const { data: buffet, error } = await supabase
      .from('buffets')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update buffet: ${error.message}`);
    }

    // Update translations if name or description changed
    try {
      if (updateDto.name !== undefined && updateDto.name.trim() !== existing?.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'buffet',
            entityId: id,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name.trim(),
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }

      if (updateDto.description !== undefined && updateDto.description !== existing?.description) {
        await this.translationService.updateTranslation(
          {
            entityType: 'buffet',
            entityId: id,
            languageCode: language,
            fieldName: 'description',
            translatedText: updateDto.description,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for buffet:', translationError);
    }

    return {
      id: buffet.id,
      name: buffet.name,
      description: buffet.description,
      imageUrl: buffet.image_url,
      pricePerPerson: buffet.price_per_person,
      minPersons: buffet.min_persons,
      duration: buffet.duration,
      menuTypes: buffet.menu_types || [],
      displayOrder: buffet.display_order,
      isActive: buffet.is_active,
      createdAt: buffet.created_at,
      updatedAt: buffet.updated_at,
    };
  }

  async deleteBuffet(tenantId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if buffet exists
    const { data: existing } = await supabase
      .from('buffets')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Buffet not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('buffets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`Failed to delete buffet: ${error.message}`);
    }

    // Delete translations for this buffet
    try {
      await this.translationService.deleteEntityTranslations('buffet', id);
    } catch (translationError) {
      console.warn(`Failed to delete translations for buffet ${id}:`, translationError);
    }

    return { message: 'Buffet deleted successfully', id };
  }

  async uploadBuffetImage(tenantId: string, id: string, file: any) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if buffet exists
    const { data: existing } = await supabase
      .from('buffets')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Buffet not found');
    }

    const imageUrl = await this.storageService.uploadImage(
      file,
      this.IMAGE_BUCKET,
      `buffets/${id}`,
      tenantId,
    );

    const { data: buffet, error } = await supabase
      .from('buffets')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update buffet image: ${error.message}`);
    }

    return {
      id: buffet.id,
      name: buffet.name,
      description: buffet.description,
      imageUrl: buffet.image_url,
      pricePerPerson: buffet.price_per_person,
      minPersons: buffet.min_persons,
      duration: buffet.duration,
      menuTypes: buffet.menu_types || [],
      displayOrder: buffet.display_order,
      isActive: buffet.is_active,
      createdAt: buffet.created_at,
      updatedAt: buffet.updated_at,
    };
  }

  // ============================================
  // COMBO MEAL MANAGEMENT
  // ============================================

  async getComboMeals(tenantId: string, pagination?: PaginationParams, branchId?: string, language: string = 'en'): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    let countQuery = supabase
      .from('combo_meals')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      countQuery = countQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { count: totalCount } = await countQuery;

    let query = supabase
      .from('combo_meals')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (branchId) {
      // Include items with matching branch_id OR NULL branch_id (for backward compatibility)
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    query = query.order('display_order', { ascending: true });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: comboMeals, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch combo meals: ${error.message}`);
    }

    // Get translations for each combo meal
    const formattedComboMeals = await Promise.all(
      comboMeals.map(async (combo) => {
        let translatedName = combo.name;
        let translatedDescription = combo.description;

        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'combo_meal',
            entityId: combo.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;

          if (combo.description) {
            const descTranslation = await this.translationService.getTranslation({
              entityType: 'combo_meal',
              entityId: combo.id,
              languageCode: language,
              fieldName: 'description',
              fallbackLanguage: 'en',
            });
            if (descTranslation) translatedDescription = descTranslation;
          }
        } catch (translationError) {
          console.warn(`Failed to get translations for combo meal ${combo.id}:`, translationError);
        }

        return {
          id: combo.id,
          name: translatedName,
          description: translatedDescription,
          imageUrl: combo.image_url,
          basePrice: combo.base_price,
          foodItemIds: combo.food_item_ids || [],
          menuTypes: combo.menu_types || [],
          discountPercentage: combo.discount_percentage,
          displayOrder: combo.display_order,
          isActive: combo.is_active,
          createdAt: combo.created_at,
          updatedAt: combo.updated_at,
        };
      })
    );

    if (pagination) {
      return createPaginatedResponse(formattedComboMeals, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return formattedComboMeals;
  }

  async getComboMealById(tenantId: string, id: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: comboMeal, error } = await supabase
      .from('combo_meals')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !comboMeal) {
      throw new NotFoundException('Combo meal not found');
    }

    // Get food items
    let foodItems = [];
    if (comboMeal.food_item_ids && comboMeal.food_item_ids.length > 0) {
      const { data: items } = await supabase
        .from('food_items')
        .select('id, name, base_price, image_url')
        .eq('tenant_id', tenantId)
        .in('id', comboMeal.food_item_ids)
        .is('deleted_at', null);

      foodItems = items || [];
    }

    // Get translations for name and description
    let translatedName = comboMeal.name;
    let translatedDescription = comboMeal.description;

    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'combo_meal',
        entityId: comboMeal.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;

      if (comboMeal.description) {
        const descTranslation = await this.translationService.getTranslation({
          entityType: 'combo_meal',
          entityId: comboMeal.id,
          languageCode: language,
          fieldName: 'description',
          fallbackLanguage: 'en',
        });
        if (descTranslation) translatedDescription = descTranslation;
      }
    } catch (translationError) {
      console.warn(`Failed to get translations for combo meal ${comboMeal.id}:`, translationError);
    }

    return {
      id: comboMeal.id,
      name: translatedName,
      description: translatedDescription,
      imageUrl: comboMeal.image_url,
      basePrice: comboMeal.base_price,
      foodItemIds: comboMeal.food_item_ids || [],
      menuTypes: comboMeal.menu_types || [],
      discountPercentage: comboMeal.discount_percentage,
      displayOrder: comboMeal.display_order,
      isActive: comboMeal.is_active,
      createdAt: comboMeal.created_at,
      updatedAt: comboMeal.updated_at,
      foodItems,
    };
  }

  async createComboMeal(tenantId: string, createDto: CreateComboMealDto, branchId?: string, skipTranslations = false) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if combo meal with same name already exists for this branch
    let existingQuery = supabase
      .from('combo_meals')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', createDto.name.trim())
      .is('deleted_at', null);
    
    if (branchId) {
      existingQuery = existingQuery.eq('branch_id', branchId);
    }
    
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      throw new ConflictException('A combo meal with this name already exists');
    }

    // Validate food items belong to tenant
    if (createDto.foodItemIds && createDto.foodItemIds.length > 0) {
      const { data: foodItems } = await supabase
        .from('food_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', createDto.foodItemIds)
        .is('deleted_at', null);

      if (foodItems.length !== createDto.foodItemIds.length) {
        throw new BadRequestException('One or more food items not found');
      }
    }

    // Get max display order
    const { data: maxOrder } = await supabase
      .from('combo_meals')
      .select('display_order')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const displayOrder = createDto.displayOrder ?? ((maxOrder?.display_order || 0) + 1);

    const comboMealData: any = {
        tenant_id: tenantId,
        name: createDto.name.trim(),
        description: createDto.description,
        image_url: createDto.imageUrl,
        base_price: createDto.basePrice,
        food_item_ids: createDto.foodItemIds || [],
        menu_types: createDto.menuTypes || [],
        discount_percentage: createDto.discountPercentage,
        display_order: displayOrder,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    
    if (branchId) {
      comboMealData.branch_id = branchId;
    }

    const { data: comboMeal, error } = await supabase
      .from('combo_meals')
      .insert(comboMealData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create combo meal: ${error.message}`);
    }

    // Create translations for name and description asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Skip if skipTranslations is true (e.g., during seed data creation)
    if (!skipTranslations) {
      // Use batch translation to handle multiple fields efficiently
      const comboMealFieldsToTranslate = [
        { fieldName: 'name', text: createDto.name },
        ...(createDto.description ? [{ fieldName: 'description', text: createDto.description }] : []),
      ];

      this.translationService
        .createBatchTranslations('combo_meal', comboMeal.id, comboMealFieldsToTranslate, undefined, tenantId)
        .catch((translationError) => {
          console.error('Failed to create batch translations for combo meal:', translationError);
        });
    }

    return {
      id: comboMeal.id,
      name: comboMeal.name,
      description: comboMeal.description,
      imageUrl: comboMeal.image_url,
      basePrice: comboMeal.base_price,
      foodItemIds: comboMeal.food_item_ids || [],
      menuTypes: comboMeal.menu_types || [],
      discountPercentage: comboMeal.discount_percentage,
      displayOrder: comboMeal.display_order,
      isActive: comboMeal.is_active,
      createdAt: comboMeal.created_at,
      updatedAt: comboMeal.updated_at,
      message: 'Combo meal created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  async updateComboMeal(tenantId: string, id: string, updateDto: UpdateComboMealDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if combo meal exists and get current values for translation comparison
    const { data: existing } = await supabase
      .from('combo_meals')
      .select('id, name, description')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Combo meal not found');
    }

    // Check if name is being changed and if new name already exists
    if (updateDto.name && updateDto.name.trim() !== '') {
      const { data: nameConflict } = await supabase
        .from('combo_meals')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', updateDto.name.trim())
        .neq('id', id)
        .is('deleted_at', null)
        .single();

      if (nameConflict) {
        throw new ConflictException('A combo meal with this name already exists');
      }
    }

    // Validate food items if provided
    if (updateDto.foodItemIds && updateDto.foodItemIds.length > 0) {
      const { data: foodItems } = await supabase
        .from('food_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', updateDto.foodItemIds)
        .is('deleted_at', null);

      if (foodItems.length !== updateDto.foodItemIds.length) {
        throw new BadRequestException('One or more food items not found');
      }
    }

    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name.trim();
    if (updateDto.description !== undefined) updateData.description = updateDto.description;
    if ((updateDto as any).imageUrl !== undefined) updateData.image_url = (updateDto as any).imageUrl;
    if (updateDto.basePrice !== undefined) updateData.base_price = updateDto.basePrice;
    if (updateDto.foodItemIds !== undefined) updateData.food_item_ids = updateDto.foodItemIds;
    if (updateDto.menuTypes !== undefined) updateData.menu_types = updateDto.menuTypes;
    if (updateDto.discountPercentage !== undefined) updateData.discount_percentage = updateDto.discountPercentage;
    if (updateDto.displayOrder !== undefined) updateData.display_order = updateDto.displayOrder;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    updateData.updated_at = new Date().toISOString();

    const { data: comboMeal, error } = await supabase
      .from('combo_meals')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update combo meal: ${error.message}`);
    }

    // Update translations if name or description changed
    try {
      if (updateDto.name !== undefined && updateDto.name.trim() !== existing?.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'combo_meal',
            entityId: id,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name.trim(),
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }

      if (updateDto.description !== undefined && updateDto.description !== existing?.description) {
        await this.translationService.updateTranslation(
          {
            entityType: 'combo_meal',
            entityId: id,
            languageCode: language,
            fieldName: 'description',
            translatedText: updateDto.description,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for combo meal:', translationError);
    }

    return {
      id: comboMeal.id,
      name: comboMeal.name,
      description: comboMeal.description,
      imageUrl: comboMeal.image_url,
      basePrice: comboMeal.base_price,
      foodItemIds: comboMeal.food_item_ids || [],
      menuTypes: comboMeal.menu_types || [],
      discountPercentage: comboMeal.discount_percentage,
      displayOrder: comboMeal.display_order,
      isActive: comboMeal.is_active,
      createdAt: comboMeal.created_at,
      updatedAt: comboMeal.updated_at,
    };
  }

  async deleteComboMeal(tenantId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if combo meal exists
    const { data: existing } = await supabase
      .from('combo_meals')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Combo meal not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('combo_meals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`Failed to delete combo meal: ${error.message}`);
    }

    // Delete translations for this combo meal
    try {
      await this.translationService.deleteEntityTranslations('combo_meal', id);
    } catch (translationError) {
      console.warn(`Failed to delete translations for combo meal ${id}:`, translationError);
    }

    return { message: 'Combo meal deleted successfully', id };
  }

  async uploadComboMealImage(tenantId: string, id: string, file: any) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if combo meal exists
    const { data: existing } = await supabase
      .from('combo_meals')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Combo meal not found');
    }

    const imageUrl = await this.storageService.uploadImage(
      file,
      this.IMAGE_BUCKET,
      `combo-meals/${id}`,
      tenantId,
    );

    const { data: comboMeal, error } = await supabase
      .from('combo_meals')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update combo meal image: ${error.message}`);
    }

    return {
      id: comboMeal.id,
      name: comboMeal.name,
      description: comboMeal.description,
      imageUrl: comboMeal.image_url,
      basePrice: comboMeal.base_price,
      foodItemIds: comboMeal.food_item_ids || [],
      menuTypes: comboMeal.menu_types || [],
      discountPercentage: comboMeal.discount_percentage,
      displayOrder: comboMeal.display_order,
      isActive: comboMeal.is_active,
      createdAt: comboMeal.created_at,
      updatedAt: comboMeal.updated_at,
    };
  }

  // ============================================
  // VARIATION GROUP MANAGEMENT
  // ============================================

  async getVariationGroups(tenantId: string, pagination?: PaginationParams, branchId?: string, language: string = 'en'): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    let countQuery = supabase
      .from('variation_groups')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // When a branch is selected, only show variation groups from that branch (exclude NULL for strict filtering)
      countQuery = countQuery.eq('branch_id', branchId);
    }
    
    const { count: totalCount } = await countQuery;

    let query = supabase
      .from('variation_groups')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      // When a branch is selected, only show variation groups from that branch (exclude NULL for strict filtering)
      query = query.eq('branch_id', branchId);
    }
    
    query = query.order('created_at', { ascending: false });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: variationGroups, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch variation groups: ${error.message}`);
    }

    // Get variations for each group and translations
    const groupsWithVariations = await Promise.all(
      variationGroups.map(async (group) => {
        const { data: variations } = await supabase
          .from('variations')
          .select('*')
          .eq('variation_group_id', group.id)
          .is('deleted_at', null)
          .order('display_order', { ascending: true });

        // Get translation for group name
        let translatedName = group.name;
        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'variation_group',
            entityId: group.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;
        } catch (translationError) {
          console.warn(`Failed to get translations for variation group ${group.id}:`, translationError);
        }

        // Get translations for variations
        const variationsWithTranslations = await Promise.all(
          (variations || []).map(async (variation) => {
            let translatedVariationName = variation.name;
            try {
              const variationNameTranslation = await this.translationService.getTranslation({
                entityType: 'variation',
                entityId: variation.id,
                languageCode: language,
                fieldName: 'name',
                fallbackLanguage: 'en',
              });
              if (variationNameTranslation) translatedVariationName = variationNameTranslation;
            } catch (translationError) {
              console.warn(`Failed to get translations for variation ${variation.id}:`, translationError);
            }

            return {
              id: variation.id,
              name: translatedVariationName,
              recipeMultiplier: parseFloat(variation.recipe_multiplier),
              pricingAdjustment: parseFloat(variation.pricing_adjustment),
              displayOrder: variation.display_order,
            };
          })
        );

        return {
          id: group.id,
          name: translatedName,
          createdAt: group.created_at,
          updatedAt: group.updated_at,
          variations: variationsWithTranslations,
        };
      })
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(groupsWithVariations, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return groupsWithVariations;
  }

  async getVariationGroupById(tenantId: string, id: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const { data: variationGroup, error } = await supabase
      .from('variation_groups')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !variationGroup) {
      throw new NotFoundException('Variation group not found');
    }

    const { data: variations } = await supabase
      .from('variations')
      .select('*')
      .eq('variation_group_id', id)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    // Get translation for group name
    let translatedName = variationGroup.name;
    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'variation_group',
        entityId: variationGroup.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;
    } catch (translationError) {
      console.warn(`Failed to get translations for variation group ${variationGroup.id}:`, translationError);
    }

    // Get translations for variations
    const variationsWithTranslations = await Promise.all(
      (variations || []).map(async (variation) => {
        let translatedVariationName = variation.name;
        try {
          const variationNameTranslation = await this.translationService.getTranslation({
            entityType: 'variation',
            entityId: variation.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (variationNameTranslation) translatedVariationName = variationNameTranslation;
        } catch (translationError) {
          console.warn(`Failed to get translations for variation ${variation.id}:`, translationError);
        }

        return {
          id: variation.id,
          name: translatedVariationName,
          recipeMultiplier: parseFloat(variation.recipe_multiplier),
          pricingAdjustment: parseFloat(variation.pricing_adjustment),
          displayOrder: variation.display_order,
        };
      })
    );

    return {
      id: variationGroup.id,
      name: translatedName,
      createdAt: variationGroup.created_at,
      updatedAt: variationGroup.updated_at,
      variations: variationsWithTranslations,
    };
  }

  async createVariationGroup(tenantId: string, createDto: CreateVariationGroupDto, branchId?: string, skipTranslations = false) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const variationGroupData: any = {
        tenant_id: tenantId,
        name: createDto.name.trim(),
    };
    
    if (branchId) {
      variationGroupData.branch_id = branchId;
    }

    const { data: variationGroup, error } = await supabase
      .from('variation_groups')
      .insert(variationGroupData)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create variation group: ${error.message}`);
    }

    // Create translations for name asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Skip if skipTranslations is true (e.g., during seed data creation)
    if (!skipTranslations) {
      this.translationService.createTranslations({
        entityType: 'variation_group',
        entityId: variationGroup.id,
        fieldName: 'name',
        text: createDto.name,
      }).catch((translationError) => {
        console.error('Failed to create translations for variation group:', translationError);
      });
    }

    return {
      id: variationGroup.id,
      name: variationGroup.name,
      createdAt: variationGroup.created_at,
      updatedAt: variationGroup.updated_at,
      variations: [],
      message: 'Variation group created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  async updateVariationGroup(tenantId: string, id: string, updateDto: UpdateVariationGroupDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if variation group exists and get current name for translation comparison
    const { data: existing } = await supabase
      .from('variation_groups')
      .select('id, name')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Variation group not found');
    }

    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name.trim();
    updateData.updated_at = new Date().toISOString();

    const { data: variationGroup, error } = await supabase
      .from('variation_groups')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update variation group: ${error.message}`);
    }

    // Update translations if name changed
    try {
      if (updateDto.name !== undefined && updateDto.name.trim() !== existing?.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'variation_group',
            entityId: id,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name.trim(),
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for variation group:', translationError);
    }

    return this.getVariationGroupById(tenantId, id, language);
  }

  async deleteVariationGroup(tenantId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if variation group exists
    const { data: existing } = await supabase
      .from('variation_groups')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Variation group not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('variation_groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`Failed to delete variation group: ${error.message}`);
    }

    // Delete translations for this variation group
    try {
      await this.translationService.deleteEntityTranslations('variation_group', id);
    } catch (translationError) {
      console.warn(`Failed to delete translations for variation group ${id}:`, translationError);
    }

    return { message: 'Variation group deleted successfully' };
  }

  // ============================================
  // VARIATION MANAGEMENT
  // ============================================

  async getVariations(tenantId: string, variationGroupId: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify variation group belongs to tenant
    const { data: group } = await supabase
      .from('variation_groups')
      .select('id')
      .eq('id', variationGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Variation group not found');
    }

    const { data: variations, error } = await supabase
      .from('variations')
      .select('*')
      .eq('variation_group_id', variationGroupId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to fetch variations: ${error.message}`);
    }

    // Get translations for each variation
    const variationsWithTranslations = await Promise.all(
      (variations || []).map(async (variation) => {
        let translatedName = variation.name;
        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'variation',
            entityId: variation.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;
        } catch (translationError) {
          console.warn(`Failed to get translations for variation ${variation.id}:`, translationError);
        }

        return {
          id: variation.id,
          name: translatedName,
          recipeMultiplier: parseFloat(variation.recipe_multiplier),
          pricingAdjustment: parseFloat(variation.pricing_adjustment),
          displayOrder: variation.display_order,
          createdAt: variation.created_at,
          updatedAt: variation.updated_at,
        };
      })
    );

    return variationsWithTranslations;
  }

  async getVariationById(tenantId: string, variationGroupId: string, id: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify variation group belongs to tenant
    const { data: group } = await supabase
      .from('variation_groups')
      .select('id')
      .eq('id', variationGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Variation group not found');
    }

    const { data: variation, error } = await supabase
      .from('variations')
      .select('*')
      .eq('id', id)
      .eq('variation_group_id', variationGroupId)
      .is('deleted_at', null)
      .single();

    if (error || !variation) {
      throw new NotFoundException('Variation not found');
    }

    // Get translation for variation name
    let translatedName = variation.name;
    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'variation',
        entityId: variation.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;
    } catch (translationError) {
      console.warn(`Failed to get translations for variation ${variation.id}:`, translationError);
    }

    return {
      id: variation.id,
      name: translatedName,
      recipeMultiplier: parseFloat(variation.recipe_multiplier),
      pricingAdjustment: parseFloat(variation.pricing_adjustment),
      displayOrder: variation.display_order,
      createdAt: variation.created_at,
      updatedAt: variation.updated_at,
    };
  }

  async createVariation(tenantId: string, variationGroupId: string, createDto: CreateVariationDto, skipTranslations = false) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify variation group belongs to tenant
    const { data: group } = await supabase
      .from('variation_groups')
      .select('id')
      .eq('id', variationGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Variation group not found');
    }

    const { data: variation, error } = await supabase
      .from('variations')
      .insert({
        variation_group_id: variationGroupId,
        name: createDto.name.trim(),
        recipe_multiplier: createDto.recipeMultiplier || 1.0,
        pricing_adjustment: createDto.pricingAdjustment || 0,
        display_order: createDto.displayOrder || 0,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create variation: ${error.message}`);
    }

    // Create translations for name asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    // Skip if skipTranslations is true (e.g., during seed data creation)
    if (!skipTranslations) {
      this.translationService.createTranslations({
        entityType: 'variation',
        entityId: variation.id,
        fieldName: 'name',
        text: createDto.name,
      }).catch((translationError) => {
        console.error('Failed to create translations for variation:', translationError);
      });
    }

    return {
      id: variation.id,
      name: variation.name,
      recipeMultiplier: parseFloat(variation.recipe_multiplier),
      pricingAdjustment: parseFloat(variation.pricing_adjustment),
      displayOrder: variation.display_order,
      createdAt: variation.created_at,
      updatedAt: variation.updated_at,
      message: 'Variation created successfully. Translations are being processed in the background and will be available shortly.',
    };
  }

  async updateVariation(tenantId: string, variationGroupId: string, id: string, updateDto: UpdateVariationDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify variation group belongs to tenant
    const { data: group } = await supabase
      .from('variation_groups')
      .select('id')
      .eq('id', variationGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Variation group not found');
    }

    // Check if variation exists and get current name for translation comparison
    const { data: existing } = await supabase
      .from('variations')
      .select('id, name')
      .eq('id', id)
      .eq('variation_group_id', variationGroupId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Variation not found');
    }

    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name.trim();
    if (updateDto.recipeMultiplier !== undefined) updateData.recipe_multiplier = updateDto.recipeMultiplier;
    if (updateDto.pricingAdjustment !== undefined) updateData.pricing_adjustment = updateDto.pricingAdjustment;
    if (updateDto.displayOrder !== undefined) updateData.display_order = updateDto.displayOrder;
    updateData.updated_at = new Date().toISOString();

    const { data: variation, error } = await supabase
      .from('variations')
      .update(updateData)
      .eq('id', id)
      .eq('variation_group_id', variationGroupId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update variation: ${error.message}`);
    }

    // Update translations if name changed
    try {
      if (updateDto.name !== undefined && updateDto.name.trim() !== existing?.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'variation',
            entityId: id,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name.trim(),
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for variation:', translationError);
    }

    return {
      id: variation.id,
      name: variation.name,
      recipeMultiplier: parseFloat(variation.recipe_multiplier),
      pricingAdjustment: parseFloat(variation.pricing_adjustment),
      displayOrder: variation.display_order,
      createdAt: variation.created_at,
      updatedAt: variation.updated_at,
    };
  }

  async deleteVariation(tenantId: string, variationGroupId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify variation group belongs to tenant
    const { data: group } = await supabase
      .from('variation_groups')
      .select('id')
      .eq('id', variationGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Variation group not found');
    }

    // Check if variation exists
    const { data: existing } = await supabase
      .from('variations')
      .select('id')
      .eq('id', id)
      .eq('variation_group_id', variationGroupId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Variation not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('variations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('variation_group_id', variationGroupId);

    if (error) {
      throw new BadRequestException(`Failed to delete variation: ${error.message}`);
    }

    // Delete translations for this variation
    try {
      await this.translationService.deleteEntityTranslations('variation', id);
    } catch (translationError) {
      console.warn(`Failed to delete translations for variation ${id}:`, translationError);
    }

    return { message: 'Variation deleted successfully' };
  }

  // Get food items that use a specific variation group
  async getFoodItemsWithVariationGroup(tenantId: string, variationGroupId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify variation group belongs to tenant
    const { data: group } = await supabase
      .from('variation_groups')
      .select('id, name')
      .eq('id', variationGroupId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!group) {
      throw new NotFoundException('Variation group not found');
    }

    // Get food items that have variations with this group name
    const { data: foodItems, error } = await supabase
      .from('food_items')
      .select(`
        id,
        name,
        food_item_variations (
          id,
          variation_group,
          variation_name,
          price_adjustment,
          recipe_multiplier,
          variation_id
        )
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (error) {
      throw new BadRequestException(`Failed to fetch food items: ${error.message}`);
    }

    // Filter food items that have variations matching this variation group name
    const filteredItems = foodItems
      .filter((item: any) => {
        if (!item.food_item_variations || item.food_item_variations.length === 0) {
          return false;
        }
        return item.food_item_variations.some((v: any) => v.variation_group === group.name);
      })
      .map((item: any) => ({
        id: item.id,
        name: item.name,
        variations: item.food_item_variations.filter((v: any) => v.variation_group === group.name),
      }));

    return filteredItems;
  }
}
