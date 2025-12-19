import apiClient from './client';

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
  stockQuantity?: number;
  displayOrder: number;
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

import { PaginationParams, PaginatedResponse, isPaginatedResponse } from '../types/pagination.types';

export const menuApi = {
  // Categories
  getCategories: async (pagination?: PaginationParams): Promise<Category[] | PaginatedResponse<Category>> => {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    const { data } = await apiClient.get(`/menu/categories${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getCategoryById: async (id: string): Promise<Category> => {
    const { data } = await apiClient.get(`/menu/categories/${id}`);
    return data;
  },

  createCategory: async (category: Partial<Category>): Promise<Category> => {
    const { data } = await apiClient.post('/menu/categories', category);
    return data;
  },

  updateCategory: async (id: string, category: Partial<Category>): Promise<Category> => {
    const { data } = await apiClient.put(`/menu/categories/${id}`, category);
    return data;
  },

  deleteCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/categories/${id}`);
  },

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

  // Food Items
  getFoodItems: async (categoryId?: string, pagination?: PaginationParams): Promise<FoodItem[] | PaginatedResponse<FoodItem>> => {
    const params = new URLSearchParams();
    if (categoryId) params.append('categoryId', categoryId);
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    const { data } = await apiClient.get(`/menu/food-items${params.toString() ? `?${params.toString()}` : ''}`);
    return data;
  },

  getFoodItemById: async (id: string): Promise<FoodItem> => {
    const { data } = await apiClient.get(`/menu/food-items/${id}`);
    return data;
  },

  createFoodItem: async (foodItem: Partial<FoodItem>): Promise<FoodItem> => {
    const { data } = await apiClient.post('/menu/food-items', foodItem);
    return data;
  },

  updateFoodItem: async (id: string, foodItem: Partial<FoodItem>): Promise<FoodItem> => {
    const { data } = await apiClient.put(`/menu/food-items/${id}`, foodItem);
    return data;
  },

  deleteFoodItem: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/food-items/${id}`);
  },

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
};



