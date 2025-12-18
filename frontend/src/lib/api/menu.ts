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

export const menuApi = {
  // Categories
  getCategories: async (): Promise<Category[]> => {
    const { data } = await apiClient.get('/menu/categories');
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
  getFoodItems: async (categoryId?: string): Promise<FoodItem[]> => {
    const params = categoryId ? { categoryId } : {};
    const { data } = await apiClient.get('/menu/food-items', { params });
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
  getAddOnGroups: async (): Promise<AddOnGroup[]> => {
    const { data } = await apiClient.get('/menu/add-on-groups');
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
  getMenus: async (): Promise<any[]> => {
    const { data } = await apiClient.get('/menu/menus');
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
};



