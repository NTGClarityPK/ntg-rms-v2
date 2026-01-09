import apiClient from './client';
import { createCrudApi, extendCrudApi } from '@/shared/services/api/factory';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';

export interface Category {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  categoryType: string;
  parentId?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subcategories?: Category[];
}

export interface FoodItemVariation {
  id?: string;
  variationGroup: string;
  variationName: string;
  priceAdjustment: number;
  recipeMultiplier?: number;
  stockQuantity?: number;
  displayOrder: number;
}

export interface Variation {
  id: string;
  variationGroupId: string;
  name: string;
  recipeMultiplier: number;
  pricingAdjustment: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface VariationGroup {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  variations?: Variation[];
}

export interface FoodItemDiscount {
  id?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startDate: string;
  endDate: string;
  reason?: string;
  isActive?: boolean;
}

export interface FoodItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  categoryId?: string;
  basePrice: number;
  stockType: string;
  stockQuantity: number;
  menuType?: string; // Legacy field, kept for backward compatibility
  menuTypes?: string[]; // Array of menu types the item belongs to
  ageLimit?: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variations?: FoodItemVariation[];
  labels?: string[];
  addOnGroupIds?: string[];
  discounts?: FoodItemDiscount[];
  activeDiscounts?: FoodItemDiscount[];
}

export interface AddOn {
  id: string;
  addOnGroupId: string;
  name: string;
  price: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddOnGroup {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple';
  isRequired: boolean;
  minSelections: number;
  maxSelections?: number;
  displayOrder: number;
  isActive: boolean;
  category?: 'Add' | 'Remove' | 'Change' | null;
  createdAt: string;
  updatedAt: string;
  addOns?: AddOn[];
}

export interface Buffet {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  pricePerPerson: number; // Only price per person, no base price
  minPersons?: number; // Optional minimum number of persons (not required - single person allowed)
  duration?: number; // Duration in minutes (how long the buffet is available)
  menuTypes: string[]; // Menu types - food items will be auto-populated from these menus
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  availableFoodItems?: FoodItem[]; // Populated food items from menu types (read-only)
}

export interface ComboMeal {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  basePrice: number;
  foodItemIds: string[]; // Food items included in combo
  menuTypes?: string[];
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  foodItems?: FoodItem[]; // Populated food items
  discountPercentage?: number; // Discount percentage compared to individual items
}

// Use factory for base CRUD operations
const baseCategoriesApi = createCrudApi<Category>('/menu/categories');
const baseFoodItemsApi = createCrudApi<FoodItem>('/menu/food-items');

export const menuApi = {
  // Categories - Using factory for CRUD operations with branchId support
  getCategories: async (
    pagination?: PaginationParams,
    branchId?: string,
    language?: string,
  ): Promise<any[] | PaginatedResponse<any>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    if (branchId) params.append('branchId', branchId);
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/categories${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },
  getCategoryById: async (id: string, language?: string): Promise<Category> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const { data } = await apiClient.get(`/menu/categories/${id}${queryString}`);
    return data;
  },
  createCategory: async (category: Partial<Category>, branchId?: string): Promise<Category> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const { data } = await apiClient.post(`/menu/categories${params}`, category);
    return data;
  },
  updateCategory: async (id: string, category: Partial<Category>, language?: string): Promise<Category> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const { data } = await apiClient.put(`/menu/categories/${id}${queryString}`, category);
    return data;
  },
  deleteCategory: baseCategoriesApi.delete,

  uploadCategoryImage: async (id: string, file: File): Promise<Category> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post(`/menu/categories/${id}/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  // Food Items - Using factory for CRUD operations
  getFoodItems: async (categoryId?: string, pagination?: PaginationParams, search?: string, onlyActiveMenus?: boolean, branchId?: string, language?: string): Promise<FoodItem[] | PaginatedResponse<FoodItem>> => {
    // Use base API but add custom filter handling
    const params = new URLSearchParams();
    if (categoryId) params.append('categoryId', categoryId);
    if (onlyActiveMenus) params.append('onlyActiveMenus', 'true');
    if (branchId) params.append('branchId', branchId);
    if (language) params.append('language', language);
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    if (search) params.append('search', search);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const { data } = await apiClient.get(`/menu/food-items${queryString}`);
    return data;
  },

  getFoodItemById: async (id: string, language?: string): Promise<FoodItem> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const { data } = await apiClient.get(`/menu/food-items/${id}${queryString}`);
    return data;
  },
  createFoodItem: async (foodItem: Partial<FoodItem>, branchId?: string): Promise<FoodItem> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const { data } = await apiClient.post(`/menu/food-items${params}`, foodItem);
    return data;
  },
  updateFoodItem: async (id: string, foodItem: Partial<FoodItem>, language?: string): Promise<FoodItem> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const { data } = await apiClient.put(`/menu/food-items/${id}${queryString}`, foodItem);
    return data;
  },
  deleteFoodItem: baseFoodItemsApi.delete,

  uploadFoodItemImage: async (id: string, file: File): Promise<FoodItem> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post(`/menu/food-items/${id}/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  // Add-on Groups
  getAddOnGroups: async (pagination?: PaginationParams, branchId?: string, language?: string): Promise<AddOnGroup[] | PaginatedResponse<AddOnGroup>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    if (branchId) params.append('branchId', branchId);
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/add-on-groups${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getAddOnGroupById: async (id: string, language?: string): Promise<AddOnGroup> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/add-on-groups/${id}${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  createAddOnGroup: async (group: Partial<AddOnGroup>, branchId?: string): Promise<AddOnGroup> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const { data } = await apiClient.post(`/menu/add-on-groups${params}`, group);
    return data;
  },

  updateAddOnGroup: async (id: string, group: Partial<AddOnGroup>): Promise<AddOnGroup> => {
    const { data } = await apiClient.put(`/menu/add-on-groups/${id}`, group);
    return data;
  },

  deleteAddOnGroup: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/add-on-groups/${id}`);
  },

  // Add-ons
  getAddOns: async (addOnGroupId: string, language?: string): Promise<AddOn[]> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/add-on-groups/${addOnGroupId}/add-ons${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getAddOnById: async (addOnGroupId: string, id: string): Promise<AddOn> => {
    const { data } = await apiClient.get(`/menu/add-on-groups/${addOnGroupId}/add-ons/${id}`);
    return data;
  },

  createAddOn: async (addOnGroupId: string, addOn: Partial<AddOn>): Promise<AddOn> => {
    const { data } = await apiClient.post(`/menu/add-on-groups/${addOnGroupId}/add-ons`, addOn);
    return data;
  },

  updateAddOn: async (addOnGroupId: string, id: string, addOn: Partial<AddOn>): Promise<AddOn> => {
    const { data } = await apiClient.put(`/menu/add-on-groups/${addOnGroupId}/add-ons/${id}`, addOn);
    return data;
  },

  deleteAddOn: async (addOnGroupId: string, id: string): Promise<void> => {
    await apiClient.delete(`/menu/add-on-groups/${addOnGroupId}/add-ons/${id}`);
  },

  // Menus
  getMenus: async (pagination?: PaginationParams, branchId?: string, language?: string): Promise<any[] | PaginatedResponse<any>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    if (branchId) params.append('branchId', branchId);
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/menus${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getMenuItems: async (menuType: string): Promise<string[]> => {
    const { data } = await apiClient.get(`/menu/menus/${menuType}/items`);
    return data;
  },

  getMenuItemsForTypes: async (menuTypes: string[], branchId?: string): Promise<Record<string, string[]>> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const { data } = await apiClient.post(`/menu/menus/items/batch${params}`, { menuTypes });
    return data;
  },

  assignItemsToMenu: async (menuType: string, foodItemIds: string[]): Promise<any> => {
    const { data } = await apiClient.post(`/menu/menus/${menuType}/assign-items`, { foodItemIds });
    return data;
  },

  activateMenu: async (menuType: string, isActive: boolean): Promise<any> => {
    const { data } = await apiClient.put(`/menu/menus/${menuType}/activate`, { isActive });
    return data;
  },

  createMenu: async (menuData: { menuType: string; name?: string; foodItemIds?: string[]; isActive?: boolean }, branchId?: string): Promise<any> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const { data } = await apiClient.post(`/menu/menus${params}`, menuData);
    return data;
  },

  deleteMenu: async (menuType: string): Promise<void> => {
    await apiClient.delete(`/menu/menus/${menuType}`);
  },

  // Buffets
  getBuffets: async (pagination?: PaginationParams, branchId?: string, language?: string): Promise<Buffet[] | PaginatedResponse<Buffet>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    if (branchId) params.append('branchId', branchId);
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/buffets${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getBuffetById: async (id: string, language?: string): Promise<Buffet> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/buffets/${id}${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  createBuffet: async (buffet: Partial<Buffet>, branchId?: string): Promise<Buffet> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const { data } = await apiClient.post(`/menu/buffets${params}`, buffet);
    return data;
  },

  updateBuffet: async (id: string, buffet: Partial<Buffet>): Promise<Buffet> => {
    const { data } = await apiClient.put(`/menu/buffets/${id}`, buffet);
    return data;
  },

  deleteBuffet: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/buffets/${id}`);
  },

  uploadBuffetImage: async (id: string, file: File): Promise<Buffet> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post(`/menu/buffets/${id}/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  // Combo Meals
  getComboMeals: async (pagination?: PaginationParams, branchId?: string, language?: string): Promise<ComboMeal[] | PaginatedResponse<ComboMeal>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    if (branchId) params.append('branchId', branchId);
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/combo-meals${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getComboMealById: async (id: string, language?: string): Promise<ComboMeal> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/combo-meals/${id}${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  createComboMeal: async (comboMeal: Partial<ComboMeal>, branchId?: string): Promise<ComboMeal> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const { data } = await apiClient.post(`/menu/combo-meals${params}`, comboMeal);
    return data;
  },

  updateComboMeal: async (id: string, comboMeal: Partial<ComboMeal>): Promise<ComboMeal> => {
    const { data } = await apiClient.put(`/menu/combo-meals/${id}`, comboMeal);
    return data;
  },

  deleteComboMeal: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/combo-meals/${id}`);
  },

  uploadComboMealImage: async (id: string, file: File): Promise<ComboMeal> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post(`/menu/combo-meals/${id}/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  // Variation Groups
  getVariationGroups: async (pagination?: PaginationParams, branchId?: string, language?: string): Promise<VariationGroup[] | PaginatedResponse<VariationGroup>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    if (branchId) params.append('branchId', branchId);
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/variation-groups${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getVariationGroupById: async (id: string, language?: string): Promise<VariationGroup> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/variation-groups/${id}${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  createVariationGroup: async (group: Partial<VariationGroup>, branchId?: string): Promise<VariationGroup> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const { data } = await apiClient.post(`/menu/variation-groups${params}`, group);
    return data;
  },

  updateVariationGroup: async (id: string, group: Partial<VariationGroup>): Promise<VariationGroup> => {
    const { data } = await apiClient.put(`/menu/variation-groups/${id}`, group);
    return data;
  },

  deleteVariationGroup: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/variation-groups/${id}`);
  },

  // Variations
  getVariations: async (variationGroupId: string, language?: string): Promise<Variation[]> => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const { data } = await apiClient.get(`/menu/variation-groups/${variationGroupId}/variations${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getVariationById: async (variationGroupId: string, id: string): Promise<Variation> => {
    const { data } = await apiClient.get(`/menu/variation-groups/${variationGroupId}/variations/${id}`);
    return data;
  },

  createVariation: async (variationGroupId: string, variation: Partial<Variation>): Promise<Variation> => {
    const { data } = await apiClient.post(`/menu/variation-groups/${variationGroupId}/variations`, variation);
    return data;
  },

  updateVariation: async (variationGroupId: string, id: string, variation: Partial<Variation>): Promise<Variation> => {
    const { data } = await apiClient.put(`/menu/variation-groups/${variationGroupId}/variations/${id}`, variation);
    return data;
  },

  deleteVariation: async (variationGroupId: string, id: string): Promise<void> => {
    await apiClient.delete(`/menu/variation-groups/${variationGroupId}/variations/${id}`);
  },

  // Get food items with a specific variation group
  getFoodItemsWithVariationGroup: async (variationGroupId: string): Promise<FoodItem[]> => {
    const { data } = await apiClient.get(`/menu/variation-groups/${variationGroupId}/food-items`);
    return data;
  },
};



