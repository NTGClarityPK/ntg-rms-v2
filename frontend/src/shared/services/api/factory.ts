import { AxiosInstance } from 'axios';
import apiClient from '@/lib/api/client';
import { PaginationParams } from '@/lib/types/pagination.types';

/**
 * Generic CRUD API interface
 */
export interface CrudApi<T> {
  getAll: (filters?: any, pagination?: PaginationParams, search?: string) => Promise<T[] | any>;
  getById: (id: string) => Promise<T>;
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string, data: Partial<T>) => Promise<T>;
  delete: (id: string) => Promise<void>;
}

/**
 * Configuration for creating a CRUD API
 */
export interface CrudApiConfig {
  endpoint: string;
  client?: AxiosInstance;
}

/**
 * Create a generic CRUD API client for a given endpoint
 * This eliminates duplication across API modules
 * 
 * @example
 * ```typescript
 * export const inventoryApi = createCrudApi<Ingredient>('/inventory/ingredients');
 * 
 * // Usage
 * const ingredients = await inventoryApi.getAll();
 * const ingredient = await inventoryApi.getById('123');
 * await inventoryApi.create({ name: 'Tomato' });
 * await inventoryApi.update('123', { name: 'Red Tomato' });
 * await inventoryApi.delete('123');
 * ```
 */
export function createCrudApi<T>(config: CrudApiConfig | string): CrudApi<T> {
  const endpoint = typeof config === 'string' ? config : config.endpoint;
  const client = (typeof config === 'object' && config.client) || apiClient;

  return {
    /**
     * Get all items with optional filters and pagination
     */
    getAll: async (filters?: any, pagination?: PaginationParams, search?: string) => {
      const params: any = {};

      // Add filters
      if (filters) {
        Object.assign(params, filters);
      }

      // Add pagination
      if (pagination) {
        params.page = pagination.page;
        params.limit = pagination.limit;
      }

      // Add search
      if (search) {
        params.search = search;
      }

      const response = await client.get(endpoint, { params });
      return response.data;
    },

    /**
     * Get a single item by ID
     */
    getById: async (id: string): Promise<T> => {
      const response = await client.get(`${endpoint}/${id}`);
      return response.data;
    },

    /**
     * Create a new item
     */
    create: async (data: Partial<T>): Promise<T> => {
      const response = await client.post(endpoint, data);
      return response.data;
    },

    /**
     * Update an existing item
     */
    update: async (id: string, data: Partial<T>): Promise<T> => {
      const response = await client.put(`${endpoint}/${id}`, data);
      return response.data;
    },

    /**
     * Delete an item
     */
    delete: async (id: string): Promise<void> => {
      await client.delete(`${endpoint}/${id}`);
    },
  };
}

/**
 * Create a specialized API client with custom methods
 * Extends the base CRUD API with additional endpoints
 * 
 * @example
 * ```typescript
 * const menuApi = createCrudApi<FoodItem>('/menu/food-items');
 * 
 * // Add custom method
 * menuApi.uploadImage = async (id: string, file: File) => {
 *   const formData = new FormData();
 *   formData.append('image', file);
 *   const response = await apiClient.post(`${endpoint}/${id}/image`, formData);
 *   return response.data;
 * };
 * ```
 */
export function extendCrudApi<T>(
  baseApi: CrudApi<T>,
  customMethods: Record<string, (...args: any[]) => Promise<any>>,
): CrudApi<T> & typeof customMethods {
  return Object.assign(baseApi, customMethods);
}

