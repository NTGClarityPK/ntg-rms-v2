import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';

export interface RestaurantInfo {
  id: string;
  name: string;
  subdomain: string;
  email: string;
  phone?: string;
  logoUrl?: string;
  primaryColor?: string;
  defaultCurrency: string;
  timezone: string;
  fiscalYearStart?: string;
  vatNumber?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateRestaurantInfoDto {
  name?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  primaryColor?: string;
  defaultCurrency?: string;
  timezone?: string;
  fiscalYearStart?: string;
  vatNumber?: string;
  isActive?: boolean;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  managerId?: string;
  manager?: {
    id: string;
    name: string;
    email: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBranchDto {
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  managerId?: string;
}

export interface UpdateBranchDto {
  name?: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  managerId?: string;
  isActive?: boolean;
}

export interface Counter {
  id: string;
  branchId: string;
  branch?: {
    id: string;
    name: string;
    code: string;
  };
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCounterDto {
  name: string;
  code: string;
  branchId: string;
}

export interface UpdateCounterDto {
  name?: string;
  code?: string;
  isActive?: boolean;
}

export interface Table {
  id: string;
  branchId: string;
  branch?: {
    id: string;
    name: string;
    code: string;
  };
  tableNumber: string;
  seatingCapacity: number;
  tableType: 'regular' | 'vip' | 'outdoor';
  qrCode?: string;
  status: 'available' | 'occupied' | 'reserved' | 'out_of_service';
  createdAt: string;
  updatedAt: string;
}

export interface CreateTableDto {
  tableNumber: string;
  branchId: string;
  seatingCapacity?: number;
  tableType?: 'regular' | 'vip' | 'outdoor';
}

export interface UpdateTableDto {
  tableNumber?: string;
  seatingCapacity?: number;
  tableType?: 'regular' | 'vip' | 'outdoor';
  status?: 'available' | 'occupied' | 'reserved' | 'out_of_service';
  qrCode?: string;
}

export const restaurantApi = {
  // Business Information
  async getInfo(): Promise<RestaurantInfo> {
    const response = await apiClient.get(API_ENDPOINTS.RESTAURANT.INFO);
    return response.data;
  },

  async updateInfo(data: UpdateRestaurantInfoDto): Promise<RestaurantInfo> {
    const response = await apiClient.put(API_ENDPOINTS.RESTAURANT.INFO, data);
    return response.data;
  },

  async uploadLogo(file: File): Promise<RestaurantInfo> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`${API_ENDPOINTS.RESTAURANT.INFO}/upload-logo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Branches
  async getBranches(): Promise<Branch[]> {
    const response = await apiClient.get(API_ENDPOINTS.RESTAURANT.BRANCHES);
    return response.data;
  },

  async getBranch(id: string): Promise<Branch> {
    const response = await apiClient.get(`${API_ENDPOINTS.RESTAURANT.BRANCHES}/${id}`);
    return response.data;
  },

  async createBranch(data: CreateBranchDto): Promise<Branch> {
    const response = await apiClient.post(API_ENDPOINTS.RESTAURANT.BRANCHES, data);
    return response.data;
  },

  async updateBranch(id: string, data: UpdateBranchDto): Promise<Branch> {
    const response = await apiClient.put(`${API_ENDPOINTS.RESTAURANT.BRANCHES}/${id}`, data);
    return response.data;
  },

  async deleteBranch(id: string): Promise<void> {
    await apiClient.delete(`${API_ENDPOINTS.RESTAURANT.BRANCHES}/${id}`);
  },

  // Counters
  async getCounters(branchId?: string): Promise<Counter[]> {
    const params = branchId ? { branchId } : {};
    const response = await apiClient.get(API_ENDPOINTS.RESTAURANT.COUNTERS, { params });
    return response.data;
  },

  async getCounter(id: string): Promise<Counter> {
    const response = await apiClient.get(`${API_ENDPOINTS.RESTAURANT.COUNTERS}/${id}`);
    return response.data;
  },

  async createCounter(data: CreateCounterDto): Promise<Counter> {
    const response = await apiClient.post(API_ENDPOINTS.RESTAURANT.COUNTERS, data);
    return response.data;
  },

  async updateCounter(id: string, data: UpdateCounterDto): Promise<Counter> {
    const response = await apiClient.put(`${API_ENDPOINTS.RESTAURANT.COUNTERS}/${id}`, data);
    return response.data;
  },

  async deleteCounter(id: string): Promise<void> {
    await apiClient.delete(`${API_ENDPOINTS.RESTAURANT.COUNTERS}/${id}`);
  },

  // Tables
  async getTables(branchId?: string): Promise<Table[]> {
    const params = branchId ? { branchId } : {};
    const response = await apiClient.get(API_ENDPOINTS.RESTAURANT.TABLES, { params });
    return response.data;
  },

  async getTable(id: string): Promise<Table> {
    const response = await apiClient.get(`${API_ENDPOINTS.RESTAURANT.TABLES}/${id}`);
    return response.data;
  },

  async createTable(data: CreateTableDto): Promise<Table> {
    const response = await apiClient.post(API_ENDPOINTS.RESTAURANT.TABLES, data);
    return response.data;
  },

  async updateTable(id: string, data: UpdateTableDto): Promise<Table> {
    const response = await apiClient.put(`${API_ENDPOINTS.RESTAURANT.TABLES}/${id}`, data);
    return response.data;
  },

  async deleteTable(id: string): Promise<void> {
    await apiClient.delete(`${API_ENDPOINTS.RESTAURANT.TABLES}/${id}`);
  },
};

