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
  // Categories - Using factory for CRUD operations
  getCategories: baseCategoriesApi.getAll,
  getCategoryById: baseCategoriesApi.getById,
  createCategory: baseCategoriesApi.create,
  updateCategory: baseCategoriesApi.update,
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
  getFoodItems: async (categoryId?: string, pagination?: PaginationParams, search?: string, onlyActiveMenus?: boolean): Promise<FoodItem[] | PaginatedResponse<FoodItem>> => {
    // Use base API but add custom filter handling
    const filters: any = {};
    if (categoryId) filters.categoryId = categoryId;
    if (onlyActiveMenus) filters.onlyActiveMenus = true;
    return baseFoodItemsApi.getAll(filters, pagination, search);
  },

  getFoodItemById: baseFoodItemsApi.getById,
  createFoodItem: baseFoodItemsApi.create,
  updateFoodItem: baseFoodItemsApi.update,
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
  getAddOnGroups: async (pagination?: PaginationParams): Promise<AddOnGroup[] | PaginatedResponse<AddOnGroup>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    const { data } = await apiClient.get(`/menu/add-on-groups${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getAddOnGroupById: async (id: string): Promise<AddOnGroup> => {
    const { data } = await apiClient.get(`/menu/add-on-groups/${id}`);
    return data;
  },

  createAddOnGroup: async (group: Partial<AddOnGroup>): Promise<AddOnGroup> => {
    const { data } = await apiClient.post('/menu/add-on-groups', group);
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
  getAddOns: async (addOnGroupId: string): Promise<AddOn[]> => {
    const { data } = await apiClient.get(`/menu/add-on-groups/${addOnGroupId}/add-ons`);
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
  getMenus: async (pagination?: PaginationParams): Promise<any[] | PaginatedResponse<any>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    const { data } = await apiClient.get(`/menu/menus${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getMenuItems: async (menuType: string): Promise<string[]> => {
    const { data } = await apiClient.get(`/menu/menus/${menuType}/items`);
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

  createMenu: async (menuData: { menuType: string; name?: string; foodItemIds?: string[]; isActive?: boolean }): Promise<any> => {
    const { data } = await apiClient.post('/menu/menus', menuData);
    return data;
  },

  deleteMenu: async (menuType: string): Promise<void> => {
    await apiClient.delete(`/menu/menus/${menuType}`);
  },

  // Buffets
  getBuffets: async (pagination?: PaginationParams): Promise<Buffet[] | PaginatedResponse<Buffet>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    const { data } = await apiClient.get(`/menu/buffets${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getBuffetById: async (id: string): Promise<Buffet> => {
    const { data } = await apiClient.get(`/menu/buffets/${id}`);
    return data;
  },

  createBuffet: async (buffet: Partial<Buffet>): Promise<Buffet> => {
    const { data } = await apiClient.post('/menu/buffets', buffet);
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
  getComboMeals: async (pagination?: PaginationParams): Promise<ComboMeal[] | PaginatedResponse<ComboMeal>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    const { data } = await apiClient.get(`/menu/combo-meals${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getComboMealById: async (id: string): Promise<ComboMeal> => {
    const { data } = await apiClient.get(`/menu/combo-meals/${id}`);
    return data;
  },

  createComboMeal: async (comboMeal: Partial<ComboMeal>): Promise<ComboMeal> => {
    const { data } = await apiClient.post('/menu/combo-meals', comboMeal);
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
  getVariationGroups: async (pagination?: PaginationParams): Promise<VariationGroup[] | PaginatedResponse<VariationGroup>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    const { data } = await apiClient.get(`/menu/variation-groups${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getVariationGroupById: async (id: string): Promise<VariationGroup> => {
    const { data } = await apiClient.get(`/menu/variation-groups/${id}`);
    return data;
  },

  createVariationGroup: async (group: Partial<VariationGroup>): Promise<VariationGroup> => {
    const { data } = await apiClient.post('/menu/variation-groups', group);
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
  getVariations: async (variationGroupId: string): Promise<Variation[]> => {
    const { data } = await apiClient.get(`/menu/variation-groups/${variationGroupId}/variations`);
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



