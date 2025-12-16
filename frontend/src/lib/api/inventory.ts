import apiClient from './client';

// Types
export interface Ingredient {
  id: string;
  tenantId: string;
  name: string;
  category?: string;
  unitOfMeasurement: string;
  currentStock: number;
  minimumThreshold: number;
  costPerUnit: number;
  storageLocation?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface StockTransaction {
  id: string;
  tenantId: string;
  branchId?: string;
  ingredientId: string;
  transactionType: string;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  reason?: string;
  supplierName?: string;
  invoiceNumber?: string;
  referenceId?: string;
  transactionDate: string;
  createdAt: string;
  createdBy?: string;
  ingredient?: Ingredient;
  branch?: {
    id: string;
    name: string;
  };
}

export interface Recipe {
  id: string;
  foodItemId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  foodItem?: {
    id: string;
    name: string;
  };
  ingredient?: Ingredient;
}

export interface CreateIngredientDto {
  name: string;
  category?: string;
  unitOfMeasurement: string;
  currentStock?: number;
  minimumThreshold?: number;
  costPerUnit?: number;
  storageLocation?: string;
  isActive?: boolean;
}

export interface UpdateIngredientDto {
  name?: string;
  category?: string;
  unitOfMeasurement?: string;
  currentStock?: number;
  minimumThreshold?: number;
  costPerUnit?: number;
  storageLocation?: string;
  isActive?: boolean;
}

export interface AddStockDto {
  ingredientId: string;
  quantity: number;
  unitCost: number;
  branchId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  reason?: string;
  transactionDate?: string;
}

export interface DeductStockDto {
  ingredientId: string;
  quantity: number;
  branchId?: string;
  reason: string;
  referenceId?: string;
  transactionDate?: string;
}

export interface AdjustStockDto {
  ingredientId: string;
  newQuantity: number;
  branchId?: string;
  reason: string;
  transactionDate?: string;
}

export interface TransferStockDto {
  ingredientId: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  reason?: string;
  transactionDate?: string;
}

export interface CreateRecipeDto {
  foodItemId: string;
  ingredients: {
    ingredientId: string;
    quantity: number;
    unit: string;
  }[];
}

// API Functions
export const inventoryApi = {
  // Ingredients
  getIngredients: async (filters?: { category?: string; isActive?: boolean }): Promise<Ingredient[]> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
    
    const response = await apiClient.get(`/inventory/ingredients?${params.toString()}`);
    return response.data;
  },

  getIngredientById: async (id: string): Promise<Ingredient> => {
    const response = await apiClient.get(`/inventory/ingredients/${id}`);
    return response.data;
  },

  createIngredient: async (data: CreateIngredientDto): Promise<Ingredient> => {
    const response = await apiClient.post('/inventory/ingredients', data);
    return response.data;
  },

  updateIngredient: async (id: string, data: UpdateIngredientDto): Promise<Ingredient> => {
    const response = await apiClient.put(`/inventory/ingredients/${id}`, data);
    return response.data;
  },

  deleteIngredient: async (id: string): Promise<void> => {
    await apiClient.delete(`/inventory/ingredients/${id}`);
  },

  // Stock Management
  addStock: async (data: AddStockDto): Promise<StockTransaction> => {
    const response = await apiClient.post('/inventory/stock/add', data);
    return response.data;
  },

  deductStock: async (data: DeductStockDto): Promise<StockTransaction> => {
    const response = await apiClient.post('/inventory/stock/deduct', data);
    return response.data;
  },

  adjustStock: async (data: AdjustStockDto): Promise<StockTransaction> => {
    const response = await apiClient.post('/inventory/stock/adjust', data);
    return response.data;
  },

  transferStock: async (data: TransferStockDto): Promise<{ transferOut: StockTransaction; transferIn: StockTransaction }> => {
    const response = await apiClient.post('/inventory/stock/transfer', data);
    return response.data;
  },

  getStockTransactions: async (filters?: {
    branchId?: string;
    ingredientId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<StockTransaction[]> => {
    const params = new URLSearchParams();
    if (filters?.branchId) params.append('branchId', filters.branchId);
    if (filters?.ingredientId) params.append('ingredientId', filters.ingredientId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    
    const response = await apiClient.get(`/inventory/stock/transactions?${params.toString()}`);
    return response.data;
  },

  // Recipes
  getRecipes: async (foodItemId?: string): Promise<Recipe[]> => {
    const params = foodItemId ? `?foodItemId=${foodItemId}` : '';
    const response = await apiClient.get(`/inventory/recipes${params}`);
    return response.data;
  },

  getRecipeByFoodItemId: async (foodItemId: string): Promise<Recipe[]> => {
    const response = await apiClient.get(`/inventory/recipes/food-item/${foodItemId}`);
    return response.data;
  },

  createOrUpdateRecipe: async (data: CreateRecipeDto): Promise<Recipe[]> => {
    const response = await apiClient.post('/inventory/recipes', data);
    return response.data;
  },

  deleteRecipe: async (foodItemId: string): Promise<void> => {
    await apiClient.delete(`/inventory/recipes/food-item/${foodItemId}`);
  },

  // Reports
  getCurrentStockReport: async (filters?: {
    category?: string;
    lowStockOnly?: boolean;
  }): Promise<any[]> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.lowStockOnly) params.append('lowStockOnly', 'true');
    
    const response = await apiClient.get(`/inventory/reports/current-stock?${params.toString()}`);
    return response.data;
  },

  getLowStockAlerts: async (): Promise<Ingredient[]> => {
    const response = await apiClient.get('/inventory/reports/low-stock-alerts');
    return response.data;
  },

  getStockMovementReport: async (filters?: {
    branchId?: string;
    ingredientId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<StockTransaction[]> => {
    const params = new URLSearchParams();
    if (filters?.branchId) params.append('branchId', filters.branchId);
    if (filters?.ingredientId) params.append('ingredientId', filters.ingredientId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    
    const response = await apiClient.get(`/inventory/reports/stock-movement?${params.toString()}`);
    return response.data;
  },
};

