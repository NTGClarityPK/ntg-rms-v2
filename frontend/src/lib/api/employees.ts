import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';
import { createCrudApi, extendCrudApi } from '@/shared/services/api/factory';

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
  ): Promise<Employee[] | PaginatedResponse<Employee>> => {
    // Use base API but add custom filter handling
    return baseEmployeesApi.getAll(filters, pagination);
  },

  getEmployeeById: baseEmployeesApi.getById,
  createEmployee: baseEmployeesApi.create,
  updateEmployee: baseEmployeesApi.update,
  deleteEmployee: baseEmployeesApi.delete,
};
