import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ConflictException 
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { StorageService } from './utils/storage.service';
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
  ) {}

  // ============================================
  // CATEGORY MANAGEMENT
  // ============================================

  async getCategories(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    let query = supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

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

    categories.forEach((cat) => {
      const category = {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        imageUrl: cat.image_url,
        categoryType: cat.category_type,
        parentId: cat.parent_id,
        displayOrder: cat.display_order,
        isActive: cat.is_active,
        createdAt: cat.created_at,
        updatedAt: cat.updated_at,
        subcategories: [],
      };
      categoryMap.set(cat.id, category);
    });

    categories.forEach((cat) => {
      const category = categoryMap.get(cat.id);
      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
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

  async getCategoryById(tenantId: string, id: string) {
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
      subcategories: subcategories?.map((sub) => ({
        id: sub.id,
        name: sub.name,
        description: sub.description,
        imageUrl: sub.image_url,
        categoryType: sub.category_type,
        displayOrder: sub.display_order,
        isActive: sub.is_active,
      })) || [],
    };
  }

  async createCategory(tenantId: string, createDto: CreateCategoryDto) {
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

    const { data: category, error } = await supabase
      .from('categories')
      .insert({
        tenant_id: tenantId,
        name: createDto.name,
        description: createDto.description || null,
        image_url: createDto.imageUrl || null,
        category_type: createDto.categoryType || 'food',
        parent_id: createDto.parentId || null,
        display_order: 0,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create category: ${error.message}`);
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

  async updateCategory(tenantId: string, id: string, updateDto: UpdateCategoryDto) {
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

    return { message: 'Category deleted successfully' };
  }

  // ============================================
  // FOOD ITEM MANAGEMENT
  // ============================================

  async getFoodItems(tenantId: string, categoryId?: string, pagination?: PaginationParams, onlyActiveMenus: boolean = false, search?: string): Promise<PaginatedResponse<any> | any[]> {
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
      // Get all active menu types
      const { data: activeMenus } = await supabase
        .from('menus')
        .select('menu_type')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      const activeMenuTypes = activeMenus?.map((m: any) => m.menu_type) || [];

      // If there are active menus, filter items to only those in active menus
      if (activeMenuTypes.length > 0) {
        const allFoodItemIds = filteredFoodItems.map((item: any) => item.id);
        const { data: allMenuItems } = await supabase
          .from('menu_items')
          .select('food_item_id, menu_type')
          .in('food_item_id', allFoodItemIds)
          .in('menu_type', activeMenuTypes);

        // Create a set of food item IDs that belong to active menus
        const foodItemsInActiveMenus = new Set(
          allMenuItems?.map((mi: any) => mi.food_item_id) || []
        );

        // Filter food items to only include those in active menus
        filteredFoodItems = filteredFoodItems.filter((item: any) =>
          foodItemsInActiveMenus.has(item.id)
        );
      }
      // If no active menus exist, show all items (fallback for admin management)
    }

    // Get accurate total count
    const totalCount = filteredFoodItems.length;

    // Apply pagination to items
    let paginatedFoodItems = filteredFoodItems;
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      paginatedFoodItems = filteredFoodItems.slice(offset, offset + limit);
    }

    // Get variations, labels, and add-on groups for each item
    const itemsWithDetails = await Promise.all(
      paginatedFoodItems.map(async (item) => {
        const [variations, labels, addOnGroups, discounts, menuItems] = await Promise.all([
          supabase
            .from('food_item_variations')
            .select('*')
            .eq('food_item_id', item.id)
            .order('display_order', { ascending: true }),
          supabase
            .from('food_item_labels')
            .select('label')
            .eq('food_item_id', item.id),
          supabase
            .from('food_item_add_on_groups')
            .select('add_on_group_id')
            .eq('food_item_id', item.id),
          supabase
            .from('food_item_discounts')
            .select('*')
            .eq('food_item_id', item.id)
            .eq('is_active', true)
            .gte('end_date', new Date().toISOString()),
          supabase
            .from('menu_items')
            .select('menu_type')
            .eq('food_item_id', item.id),
        ]);

        return {
          id: item.id,
          name: item.name,
          description: item.description,
          imageUrl: item.image_url,
          categoryId: item.category_id,
          basePrice: parseFloat(item.base_price),
          stockType: item.stock_type,
          stockQuantity: item.stock_quantity,
          menuType: item.menu_type, // Legacy field
          menuTypes: menuItems.data?.map((m: any) => m.menu_type) || [], // Array of menu types
          ageLimit: item.age_limit,
          displayOrder: item.display_order,
          isActive: item.is_active,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
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
          activeDiscounts: discounts.data?.map((d) => ({
            id: d.id,
            discountType: d.discount_type,
            discountValue: parseFloat(d.discount_value),
            startDate: d.start_date,
            endDate: d.end_date,
            reason: d.reason,
          })) || [],
        };
      })
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      // Use the accurate total count of filtered items
      return createPaginatedResponse(itemsWithDetails, totalCount, pagination.page || 1, pagination.limit || 10);
    }

    return itemsWithDetails;
  }

  async getFoodItemById(tenantId: string, id: string) {
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

    return {
      id: foodItem.id,
      name: foodItem.name,
      description: foodItem.description,
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

  async createFoodItem(tenantId: string, createDto: CreateFoodItemDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Validate category
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', createDto.categoryId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Create food item
    const { data: foodItem, error } = await supabase
      .from('food_items')
      .insert({
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
      })
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

    // Create labels
    if (createDto.labels && createDto.labels.length > 0) {
      const labelsData = createDto.labels.map((label) => ({
        food_item_id: foodItem.id,
        label: label,
      }));

      await supabase.from('food_item_labels').insert(labelsData);
    }

    // Link add-on groups
    if (createDto.addOnGroupIds && createDto.addOnGroupIds.length > 0) {
      // Validate add-on groups belong to tenant
      const { data: addOnGroups } = await supabase
        .from('add_on_groups')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', createDto.addOnGroupIds)
        .is('deleted_at', null);

      if (addOnGroups.length !== createDto.addOnGroupIds.length) {
        throw new BadRequestException('One or more add-on groups not found');
      }

      const addOnGroupsData = createDto.addOnGroupIds.map((groupId) => ({
        food_item_id: foodItem.id,
        add_on_group_id: groupId,
      }));

      await supabase.from('food_item_add_on_groups').insert(addOnGroupsData);
    }

    // Create menu assignments
    if (createDto.menuTypes && createDto.menuTypes.length > 0) {
      const menuItemsData = createDto.menuTypes.map((menuType, index) => ({
        tenant_id: tenantId,
        menu_type: menuType,
        food_item_id: foodItem.id,
        display_order: index,
      }));

      await supabase.from('menu_items').insert(menuItemsData);
    } else if (createDto.menuType) {
      // Legacy support: if menuType is provided, use it
      await supabase.from('menu_items').insert({
        tenant_id: tenantId,
        menu_type: createDto.menuType,
        food_item_id: foodItem.id,
        display_order: 0,
      });
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

      await supabase.from('food_item_discounts').insert(discountsData);
    }

    return this.getFoodItemById(tenantId, foodItem.id);
  }

  async updateFoodItem(tenantId: string, id: string, updateDto: UpdateFoodItemDto) {
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

    // Validate category if provided
    if (updateDto.categoryId) {
      const { data: category } = await supabase
        .from('categories')
        .select('id')
        .eq('id', updateDto.categoryId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    // Get current food item state to check if isActive is being changed
    const { data: currentFoodItem } = await supabase
      .from('food_items')
      .select('is_active')
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
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
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

    return this.getFoodItemById(tenantId, id);
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

    return { message: 'Food item deleted successfully' };
  }

  // ============================================
  // ADD-ON GROUP MANAGEMENT
  // ============================================

  async getAddOnGroups(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('add_on_groups')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    let query = supabase
      .from('add_on_groups')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: addOnGroups, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch add-on groups: ${error.message}`);
    }

    // Get add-ons for each group
    const groupsWithAddOns = await Promise.all(
      addOnGroups.map(async (group) => {
        const { data: addOns } = await supabase
          .from('add_ons')
          .select('*')
          .eq('add_on_group_id', group.id)
          .is('deleted_at', null)
          .order('display_order', { ascending: true });

        return {
          id: group.id,
          name: group.name,
          selectionType: group.selection_type,
          isRequired: group.is_required,
          minSelections: group.min_selections,
          maxSelections: group.max_selections,
          displayOrder: group.display_order,
          isActive: group.is_active,
          category: group.category || null,
          createdAt: group.created_at,
          updatedAt: group.updated_at,
          addOns: addOns?.map((addOn) => ({
            id: addOn.id,
            name: addOn.name,
            price: parseFloat(addOn.price),
            isActive: addOn.is_active,
            displayOrder: addOn.display_order,
          })) || [],
        };
      })
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(groupsWithAddOns, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return groupsWithAddOns;
  }

  async getAddOnGroupById(tenantId: string, id: string) {
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
      addOns: addOns?.map((addOn) => ({
        id: addOn.id,
        name: addOn.name,
        price: parseFloat(addOn.price),
        isActive: addOn.is_active,
        displayOrder: addOn.display_order,
      })) || [],
    };
  }

  async createAddOnGroup(tenantId: string, createDto: CreateAddOnGroupDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Auto-set maxSelections to 1 if selectionType is single
    const maxSelections = createDto.selectionType === 'single' 
      ? 1 
      : (createDto.maxSelections ?? null);
    
    // Auto-set minSelections based on selectionType and isRequired
    const minSelections = createDto.selectionType === 'single' && createDto.isRequired
      ? 1
      : (createDto.minSelections ?? 0);

    const { data: addOnGroup, error } = await supabase
      .from('add_on_groups')
      .insert({
        tenant_id: tenantId,
        name: createDto.name,
        selection_type: createDto.selectionType || 'multiple',
        is_required: createDto.isRequired || false,
        min_selections: minSelections,
        max_selections: maxSelections,
        display_order: 0,
        is_active: true,
        category: createDto.category || null,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create add-on group: ${error.message}`);
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
    };
  }

  async updateAddOnGroup(tenantId: string, id: string, updateDto: UpdateAddOnGroupDto) {
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

    // Get current values to check selectionType
    const { data: current } = await supabase
      .from('add_on_groups')
      .select('selection_type, is_required')
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

    return this.getAddOnGroupById(tenantId, id);
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

    return { message: 'Add-on group deleted successfully' };
  }

  // ============================================
  // ADD-ON MANAGEMENT
  // ============================================

  async getAddOns(tenantId: string, addOnGroupId: string) {
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

    return addOns.map((addOn) => ({
      id: addOn.id,
      addOnGroupId: addOn.add_on_group_id,
      name: addOn.name,
      price: parseFloat(addOn.price),
      isActive: addOn.is_active,
      displayOrder: addOn.display_order,
      createdAt: addOn.created_at,
      updatedAt: addOn.updated_at,
    }));
  }

  async getAddOnById(tenantId: string, addOnGroupId: string, id: string) {
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

  async createAddOn(tenantId: string, createDto: CreateAddOnDto) {
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

  async updateAddOn(tenantId: string, addOnGroupId: string, id: string, updateDto: UpdateAddOnDto) {
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

    return { message: 'Add-on deleted successfully' };
  }

  // ============================================
  // MENU MANAGEMENT
  // Note: Since there's no menus table in the schema,
  // this is a simplified implementation that works with food items
  // and their menu_type field. A proper menus table can be added later.
  // ============================================

  async getMenus(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResponse<any> | any[]> {
    // Get menus from menu_items junction table
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get all unique menu types from menu_items for this tenant
    const { data: menuItems, error } = await supabase
      .from('menu_items')
      .select('menu_type, food_item_id')
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`Failed to fetch menus: ${error.message}`);
    }

    // Get unique menu types
    const uniqueMenuTypes = [...new Set(menuItems.map((mi) => mi.menu_type))];
    
    // Include default menu types if they don't exist yet
    const defaultMenuTypes = ['all_day', 'breakfast', 'lunch', 'dinner', 'kids_special'];
    const allMenuTypes = [...new Set([...defaultMenuTypes, ...uniqueMenuTypes])];
    
    // Apply pagination if provided
    let paginatedMenuTypes = allMenuTypes;
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      paginatedMenuTypes = allMenuTypes.slice(offset, offset + limit);
    }

    // Get active food items to filter counts
    const foodItemIds = menuItems.map((mi) => mi.food_item_id);
    let activeItemIds: string[] = [];
    
    if (foodItemIds.length > 0) {
      const { data: activeItems } = await supabase
        .from('food_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', foodItemIds)
        .eq('is_active', true)
        .is('deleted_at', null);
      
      activeItemIds = activeItems?.map((item) => item.id) || [];
    }

    // Try to get menu names and active status from menus table
    const { data: menuData } = await supabase
      .from('menus')
      .select('menu_type, name, is_active')
      .eq('tenant_id', tenantId)
      .in('menu_type', allMenuTypes);

    // Create maps of menu_type to name and is_active
    const menuNameMap = new Map<string, string>();
    const menuActiveMap = new Map<string, boolean>();
    if (menuData) {
      menuData.forEach((mn: any) => {
        menuNameMap.set(mn.menu_type, mn.name);
        menuActiveMap.set(mn.menu_type, mn.is_active !== false); // Default to true if null/undefined
      });
    }

    // Group by menu_type and count all items (not just active ones)
    const menus = paginatedMenuTypes.map((menuType) => {
      const itemsInMenu = menuItems.filter((mi) => mi.menu_type === menuType);
      
      // Use stored name if available, otherwise generate from menu_type
      const storedName = menuNameMap.get(menuType);
      const displayName = storedName || (menuType.charAt(0).toUpperCase() + menuType.slice(1).replace(/_/g, ' '));
      
      // Get is_active from menus table, default to true if not set
      const isActive = menuActiveMap.has(menuType) 
        ? menuActiveMap.get(menuType)! 
        : (itemsInMenu.length > 0); // Default to true if menu has items, false if empty
      
      return {
        menuType,
        name: displayName,
        isActive,
        itemCount: itemsInMenu.length, // Count all items, not just active ones
      };
    });

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
      const { error } = await supabase
        .from('menus')
        .insert({
          tenant_id: tenantId,
          menu_type: menuType,
          name: displayName,
          is_active: isActive,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      // If table doesn't exist or insert fails, we'll continue (menu will still work)
      if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
        throw new BadRequestException(`Failed to ${isActive ? 'activate' : 'deactivate'} menu: ${error.message}`);
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

  async createMenu(tenantId: string, createDto: CreateMenuDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if menu type already exists
    const { data: existing } = await supabase
      .from('menu_items')
      .select('menu_type')
      .eq('tenant_id', tenantId)
      .eq('menu_type', createDto.menuType)
      .limit(1);

    if (existing && existing.length > 0) {
      throw new ConflictException('Menu type already exists');
    }

    // Store menu name in menus table (create table if it doesn't exist - Supabase will handle it)
    // We'll use upsert to handle both create and update
    if (createDto.name) {
      const { error: menuNameError } = await supabase
        .from('menus')
        .upsert({
          tenant_id: tenantId,
          menu_type: createDto.menuType,
          name: createDto.name,
          is_active: createDto.isActive !== undefined ? createDto.isActive : true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'tenant_id,menu_type',
        });

      // If table doesn't exist, we'll continue without storing the name
      // The name will be generated from menu_type in getMenus
      if (menuNameError && !menuNameError.message.includes('relation') && !menuNameError.message.includes('does not exist')) {
        console.warn('Failed to store menu name:', menuNameError.message);
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

  async deleteMenu(tenantId: string, menuType: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Prevent deletion of default menu types
    const defaultMenuTypes = ['all_day', 'breakfast', 'lunch', 'dinner', 'kids_special'];
    if (defaultMenuTypes.includes(menuType)) {
      throw new BadRequestException('Cannot delete default menu types');
    }

    // Check if menu type exists
    const { data: existing } = await supabase
      .from('menu_items')
      .select('menu_type')
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType)
      .limit(1);

    if (!existing || existing.length === 0) {
      throw new NotFoundException('Menu type not found');
    }

    // Delete all menu_items with this menu type
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType);

    if (error) {
      throw new BadRequestException(`Failed to delete menu: ${error.message}`);
    }

    // Also delete menu name from menus table if it exists
    await supabase
      .from('menus')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('menu_type', menuType);

    return { message: 'Menu deleted successfully', menuType };
  }

  // ============================================
  // BUFFET MANAGEMENT
  // ============================================

  async getBuffets(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('buffets')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    let query = supabase
      .from('buffets')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: buffets, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch buffets: ${error.message}`);
    }

    const formattedBuffets = buffets.map((buffet) => ({
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
    }));

    if (pagination) {
      return createPaginatedResponse(formattedBuffets, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return formattedBuffets;
  }

  async getBuffetById(tenantId: string, id: string) {
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
      availableFoodItems,
    };
  }

  async createBuffet(tenantId: string, createDto: CreateBuffetDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if buffet with same name already exists
    const { data: existing } = await supabase
      .from('buffets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', createDto.name.trim())
      .is('deleted_at', null)
      .single();

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

    const { data: buffet, error } = await supabase
      .from('buffets')
      .insert({
        tenant_id: tenantId,
        name: createDto.name.trim(),
        description: createDto.description,
        price_per_person: createDto.pricePerPerson,
        min_persons: createDto.minPersons,
        duration: createDto.duration,
        menu_types: createDto.menuTypes || [],
        display_order: displayOrder,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create buffet: ${error.message}`);
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

  async updateBuffet(tenantId: string, id: string, updateDto: UpdateBuffetDto) {
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

  async getComboMeals(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('combo_meals')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    let query = supabase
      .from('combo_meals')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: comboMeals, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch combo meals: ${error.message}`);
    }

    const formattedComboMeals = comboMeals.map((combo) => ({
      id: combo.id,
      name: combo.name,
      description: combo.description,
      imageUrl: combo.image_url,
      basePrice: combo.base_price,
      foodItemIds: combo.food_item_ids || [],
      menuTypes: combo.menu_types || [],
      discountPercentage: combo.discount_percentage,
      displayOrder: combo.display_order,
      isActive: combo.is_active,
      createdAt: combo.created_at,
      updatedAt: combo.updated_at,
    }));

    if (pagination) {
      return createPaginatedResponse(formattedComboMeals, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return formattedComboMeals;
  }

  async getComboMealById(tenantId: string, id: string) {
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
      foodItems,
    };
  }

  async createComboMeal(tenantId: string, createDto: CreateComboMealDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if combo meal with same name already exists
    const { data: existing } = await supabase
      .from('combo_meals')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', createDto.name.trim())
      .is('deleted_at', null)
      .single();

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

    const { data: comboMeal, error } = await supabase
      .from('combo_meals')
      .insert({
        tenant_id: tenantId,
        name: createDto.name.trim(),
        description: createDto.description,
        base_price: createDto.basePrice,
        food_item_ids: createDto.foodItemIds || [],
        menu_types: createDto.menuTypes || [],
        discount_percentage: createDto.discountPercentage,
        display_order: displayOrder,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create combo meal: ${error.message}`);
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

  async updateComboMeal(tenantId: string, id: string, updateDto: UpdateComboMealDto) {
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

  async getVariationGroups(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('variation_groups')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    let query = supabase
      .from('variation_groups')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: variationGroups, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch variation groups: ${error.message}`);
    }

    // Get variations for each group
    const groupsWithVariations = await Promise.all(
      variationGroups.map(async (group) => {
        const { data: variations } = await supabase
          .from('variations')
          .select('*')
          .eq('variation_group_id', group.id)
          .is('deleted_at', null)
          .order('display_order', { ascending: true });

        return {
          id: group.id,
          name: group.name,
          createdAt: group.created_at,
          updatedAt: group.updated_at,
          variations: variations?.map((variation) => ({
            id: variation.id,
            name: variation.name,
            recipeMultiplier: parseFloat(variation.recipe_multiplier),
            pricingAdjustment: parseFloat(variation.pricing_adjustment),
            displayOrder: variation.display_order,
          })) || [],
        };
      })
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(groupsWithVariations, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return groupsWithVariations;
  }

  async getVariationGroupById(tenantId: string, id: string) {
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

    return {
      id: variationGroup.id,
      name: variationGroup.name,
      createdAt: variationGroup.created_at,
      updatedAt: variationGroup.updated_at,
      variations: variations?.map((variation) => ({
        id: variation.id,
        name: variation.name,
        recipeMultiplier: parseFloat(variation.recipe_multiplier),
        pricingAdjustment: parseFloat(variation.pricing_adjustment),
        displayOrder: variation.display_order,
      })) || [],
    };
  }

  async createVariationGroup(tenantId: string, createDto: CreateVariationGroupDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: variationGroup, error } = await supabase
      .from('variation_groups')
      .insert({
        tenant_id: tenantId,
        name: createDto.name.trim(),
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create variation group: ${error.message}`);
    }

    return {
      id: variationGroup.id,
      name: variationGroup.name,
      createdAt: variationGroup.created_at,
      updatedAt: variationGroup.updated_at,
      variations: [],
    };
  }

  async updateVariationGroup(tenantId: string, id: string, updateDto: UpdateVariationGroupDto) {
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

    return this.getVariationGroupById(tenantId, id);
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

    return { message: 'Variation group deleted successfully' };
  }

  // ============================================
  // VARIATION MANAGEMENT
  // ============================================

  async getVariations(tenantId: string, variationGroupId: string) {
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

    return variations?.map((variation) => ({
      id: variation.id,
      name: variation.name,
      recipeMultiplier: parseFloat(variation.recipe_multiplier),
      pricingAdjustment: parseFloat(variation.pricing_adjustment),
      displayOrder: variation.display_order,
      createdAt: variation.created_at,
      updatedAt: variation.updated_at,
    })) || [];
  }

  async getVariationById(tenantId: string, variationGroupId: string, id: string) {
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

  async createVariation(tenantId: string, variationGroupId: string, createDto: CreateVariationDto) {
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

  async updateVariation(tenantId: string, variationGroupId: string, id: string, updateDto: UpdateVariationDto) {
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
