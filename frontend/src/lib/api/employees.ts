import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';

export interface Employee {
  id: string;
  tenantId: string;
  supabaseAuthId?: string;
  email: string;
  nameEn: string;
  nameAr?: string;
  phone?: string;
  role: string;
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
    nameEn: string;
    nameAr?: string;
    code: string;
  }>;
}

export interface CreateEmployeeDto {
  email: string;
  nameEn: string;
  nameAr?: string;
  role: string;
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
  nameEn?: string;
  nameAr?: string;
  email?: string;
  phone?: string;
  role?: string;
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

export const employeesApi = {
  getEmployees: async (filters?: { branchId?: string; role?: string; status?: string }): Promise<Employee[]> => {
    const params = new URLSearchParams();
    if (filters?.branchId) params.append('branchId', filters.branchId);
    if (filters?.role) params.append('role', filters.role);
    if (filters?.status) params.append('status', filters.status);

    const response = await apiClient.get<Employee[]>(
      `${API_ENDPOINTS.EMPLOYEES}${params.toString() ? `?${params.toString()}` : ''}`,
    );
    return response.data;
  },

  getEmployeeById: async (id: string): Promise<Employee> => {
    const response = await apiClient.get<Employee>(`${API_ENDPOINTS.EMPLOYEES}/${id}`);
    return response.data;
  },

  createEmployee: async (data: CreateEmployeeDto): Promise<Employee> => {
    const response = await apiClient.post<Employee>(API_ENDPOINTS.EMPLOYEES, data);
    return response.data;
  },

  updateEmployee: async (id: string, data: UpdateEmployeeDto): Promise<Employee> => {
    const response = await apiClient.put<Employee>(`${API_ENDPOINTS.EMPLOYEES}/${id}`, data);
    return response.data;
  },

  deleteEmployee: async (id: string): Promise<void> => {
    await apiClient.delete(`${API_ENDPOINTS.EMPLOYEES}/${id}`);
  },
};

