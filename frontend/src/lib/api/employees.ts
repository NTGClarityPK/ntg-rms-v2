import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';
import { createCrudApi, extendCrudApi } from '@/shared/services/api/factory';
import { getApiLanguage } from '../hooks/use-api-language';

export interface Role {
  id: string;
  name: string;
  displayNameEn: string;
  displayNameAr?: string;
}

export interface Employee {
  id: string;
  tenantId: string;
  supabaseAuthId?: string;
  email: string;
  name: string;
  phone?: string;
  role: string; // Keep for backward compatibility
  roles?: Role[]; // New: multiple roles
  employeeId?: string;
  photoUrl?: string;
  nationalId?: string;
  dateOfBirth?: string;
  employmentType?: string;
  joiningDate?: string;
  salary?: number;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  branches?: Array<{
    id: string;
    name: string;
    code: string;
  }>;
}

export interface CreateEmployeeDto {
  email: string;
  name: string;
  roleIds: string[]; // Array of role IDs
  phone?: string;
  employeeId?: string;
  photoUrl?: string;
  nationalId?: string;
  dateOfBirth?: string;
  employmentType?: string;
  joiningDate?: string;
  salary?: number;
  isActive?: boolean;
  branchIds?: string[];
  createAuthAccount?: boolean;
  password?: string;
}

export interface UpdateEmployeeDto {
  name?: string;
  email?: string;
  phone?: string;
  roleIds?: string[]; // Array of role IDs
  employeeId?: string;
  photoUrl?: string;
  nationalId?: string;
  dateOfBirth?: string;
  employmentType?: string;
  joiningDate?: string;
  salary?: number;
  isActive?: boolean;
  branchIds?: string[];
}

// Use factory for base CRUD operations on employees
const baseEmployeesApi = createCrudApi<Employee>(API_ENDPOINTS.EMPLOYEES);

export const employeesApi = {
  // Employees - Using factory for CRUD operations
  getEmployees: async (
    filters?: { branchId?: string; role?: string; status?: string },
    pagination?: PaginationParams,
    language?: string,
  ): Promise<Employee[] | PaginatedResponse<Employee>> => {
    const lang = language || getApiLanguage();
    const params: any = { language: lang, ...filters };
    if (pagination?.page) params.page = pagination.page;
    if (pagination?.limit) params.limit = pagination.limit;
    const response = await apiClient.get(API_ENDPOINTS.EMPLOYEES, { params });
    return response.data;
  },

  getEmployeeById: async (id: string, language?: string): Promise<Employee> => {
    const lang = language || getApiLanguage();
    const response = await apiClient.get(`${API_ENDPOINTS.EMPLOYEES}/${id}?language=${lang}`);
    return response.data;
  },
  createEmployee: baseEmployeesApi.create,
  updateEmployee: async (id: string, data: UpdateEmployeeDto, language?: string): Promise<Employee> => {
    const lang = language || getApiLanguage();
    const response = await apiClient.put(`${API_ENDPOINTS.EMPLOYEES}/${id}?language=${lang}`, data);
    return response.data;
  },
  deleteEmployee: baseEmployeesApi.delete,
};
