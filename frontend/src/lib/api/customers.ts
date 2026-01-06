import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';
import { createCrudApi, extendCrudApi } from '@/shared/services/api/factory';

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  preferredLanguage?: string;
  notes?: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate?: string;
  loyaltyTier: 'regular' | 'silver' | 'gold' | 'platinum';
  createdAt: string;
  updatedAt: string;
  addresses?: CustomerAddress[];
  orderHistory?: CustomerOrder[];
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  addressLabel?: string;
  address: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  orderDate: string;
  createdAt: string;
}

export interface CreateCustomerDto {
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  preferredLanguage?: string;
  notes?: string;
  address?: {
    label?: string;
    address: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
}

export interface UpdateCustomerDto {
  name?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  preferredLanguage?: string;
  notes?: string;
}

// Use factory for base CRUD operations on customers
const baseCustomersApi = createCrudApi<Customer>(API_ENDPOINTS.CUSTOMERS);

export const customersApi = {
  // Customers - Using factory for CRUD operations
  getCustomers: async (
    filters?: {
      search?: string;
      minOrders?: number;
      minSpent?: number;
      branchId?: string;
    },
    pagination?: PaginationParams,
  ): Promise<Customer[] | PaginatedResponse<Customer>> => {
    // Build query params
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.minOrders) params.append('minOrders', String(filters.minOrders));
    if (filters?.minSpent) params.append('minSpent', String(filters.minSpent));
    if (filters?.branchId) params.append('branchId', filters.branchId);
    if (pagination?.page) params.append('page', String(pagination.page));
    if (pagination?.limit) params.append('limit', String(pagination.limit));

    const response = await apiClient.get(`${API_ENDPOINTS.CUSTOMERS}?${params.toString()}`);
    return response.data;
  },

  getCustomerById: baseCustomersApi.getById,
  createCustomer: async (createDto: CreateCustomerDto, branchId?: string): Promise<Customer> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const response = await apiClient.post<Customer>(`${API_ENDPOINTS.CUSTOMERS}${params}`, createDto);
    return response.data;
  },
  updateCustomer: baseCustomersApi.update,

  createCustomerAddress: async (customerId: string, address: {
    label?: string;
    address: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<CustomerAddress> => {
    const response = await apiClient.post<CustomerAddress>(
      `${API_ENDPOINTS.CUSTOMERS}/${customerId}/addresses`,
      address
    );
    return response.data;
  },
};

