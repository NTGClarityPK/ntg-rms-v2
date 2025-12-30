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
    },
    pagination?: PaginationParams,
  ): Promise<Customer[] | PaginatedResponse<Customer>> => {
    // Use base API but add custom filter handling
    return baseCustomersApi.getAll(filters, pagination, filters?.search);
  },

  getCustomerById: baseCustomersApi.getById,
  createCustomer: baseCustomersApi.create,
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

