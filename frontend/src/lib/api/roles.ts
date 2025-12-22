import apiClient from './client';
import { API_BASE_URL } from '../constants/api';

export interface Role {
  id: string;
  name: string;
  displayNameEn: string;
  displayNameAr?: string;
  description?: string;
  isSystemRole: boolean;
  isActive: boolean;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  role?: Role;
  assignedAt: string;
  assignedBy?: string;
}

export const rolesApi = {
  getRoles: async (): Promise<Role[]> => {
    const response = await apiClient.get<Role[]>(`${API_BASE_URL}/roles`);
    return response.data;
  },

  getRoleById: async (id: string): Promise<Role> => {
    const response = await apiClient.get<Role>(`${API_BASE_URL}/roles/${id}`);
    return response.data;
  },

  getPermissions: async (): Promise<Permission[]> => {
    const response = await apiClient.get<Permission[]>(`${API_BASE_URL}/roles/permissions`);
    return response.data;
  },

  getUserRoles: async (userId: string): Promise<UserRole[]> => {
    const response = await apiClient.get<UserRole[]>(`${API_BASE_URL}/roles/user/${userId}`);
    return response.data;
  },

  getUserPermissions: async (userId: string): Promise<Permission[]> => {
    const response = await apiClient.get<Permission[]>(`${API_BASE_URL}/roles/user/${userId}/permissions`);
    return response.data;
  },
};


