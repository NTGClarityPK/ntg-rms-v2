import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { getApiLanguage } from '../hooks/use-api-language';

export interface Tax {
  id: string;
  tenantId: string;
  name: string;
  taxCode?: string;
  rate: number;
  isActive: boolean;
  appliesTo: 'order' | 'category' | 'item';
  appliesToDelivery: boolean;
  appliesToServiceCharge: boolean;
  categoryIds?: string[];
  foodItemIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaxDto {
  name: string;
  taxCode?: string;
  rate: number;
  isActive?: boolean;
  appliesTo?: 'order' | 'category' | 'item';
  appliesToDelivery?: boolean;
  appliesToServiceCharge?: boolean;
  categoryIds?: string[];
  foodItemIds?: string[];
}

export interface UpdateTaxDto extends Partial<CreateTaxDto> {}

export const taxesApi = {
  /**
   * Get all taxes (optionally filtered by branch)
   */
  getTaxes: async (branchId?: string, language?: string): Promise<Tax[]> => {
    const lang = language || getApiLanguage();
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);
    params.append('language', lang);
    const response = await apiClient.get(`${API_ENDPOINTS.TAXES.BASE}?${params.toString()}`);
    return response.data;
  },

  /**
   * Get a tax by ID
   */
  getTaxById: async (id: string, language?: string): Promise<Tax> => {
    const lang = language || getApiLanguage();
    const response = await apiClient.get(`${API_ENDPOINTS.TAXES.BASE}/${id}?language=${lang}`);
    return response.data;
  },

  /**
   * Create a new tax
   */
  createTax: async (data: CreateTaxDto, branchId?: string): Promise<Tax> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const response = await apiClient.post(`${API_ENDPOINTS.TAXES.BASE}${params}`, data);
    return response.data;
  },

  /**
   * Update a tax
   */
  updateTax: async (id: string, data: UpdateTaxDto, language?: string): Promise<Tax> => {
    const lang = language || getApiLanguage();
    const response = await apiClient.put(`${API_ENDPOINTS.TAXES.BASE}/${id}?language=${lang}`, data);
    return response.data;
  },

  /**
   * Delete a tax
   */
  deleteTax: async (id: string): Promise<void> => {
    await apiClient.delete(`${API_ENDPOINTS.TAXES.BASE}/${id}`);
  },
};

