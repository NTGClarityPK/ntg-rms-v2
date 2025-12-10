import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';

export interface DashboardData {
  todaySales: number;
  todayOrders: {
    total: number;
    byType: Record<string, number>;
  };
  activeTables: number;
  pendingOrders: number;
  lowStockAlerts: Array<{
    id: string;
    nameEn: string;
    nameAr: string;
    currentStock: number;
    minimumThreshold: number;
  }>;
  popularItems: Array<{
    id: string;
    nameEn: string;
    nameAr: string;
    quantity: number;
  }>;
  revenueChart: Array<{
    date: string;
    revenue: number;
  }>;
}

export const dashboardApi = {
  getDashboard: async (branchId?: string): Promise<DashboardData> => {
    const params = branchId ? { branchId } : {};
    const response = await apiClient.get<DashboardData>(API_ENDPOINTS.DASHBOARD, { params });
    return response.data;
  },
};

