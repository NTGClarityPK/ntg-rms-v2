import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';

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

export const customersApi = {
  getCustomers: async (
    filters?: {
      search?: string;
      minOrders?: number;
      minSpent?: number;
    },
    pagination?: PaginationParams,
  ): Promise<Customer[] | PaginatedResponse<Customer>> => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.minOrders) params.append('minOrders', filters.minOrders.toString());
    if (filters?.minSpent) params.append('minSpent', filters.minSpent.toString());
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());

    const response = await apiClient.get<Customer[] | PaginatedResponse<Customer>>(
      `${API_ENDPOINTS.CUSTOMERS}${params.toString() ? `?${params.toString()}` : ''}`,
    );
    return response.data;
  },

  getCustomerById: async (id: string): Promise<Customer> => {
    const response = await apiClient.get<Customer>(`${API_ENDPOINTS.CUSTOMERS}/${id}`);
    return response.data;
  },

  createCustomer: async (data: CreateCustomerDto): Promise<Customer> => {
    const response = await apiClient.post<Customer>(API_ENDPOINTS.CUSTOMERS, data);
    return response.data;
  },

  updateCustomer: async (id: string, data: UpdateCustomerDto): Promise<Customer> => {
    const response = await apiClient.put<Customer>(`${API_ENDPOINTS.CUSTOMERS}/${id}`, data);
    return response.data;
  },

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

