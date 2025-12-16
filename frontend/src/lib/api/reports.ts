import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';

export interface ReportQueryParams {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  groupBy?: 'day' | 'week' | 'month' | 'year';
  export?: 'csv' | 'excel';
  limit?: number;
}

export interface SalesReport {
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalTax: number;
    totalDiscounts: number;
    totalDeliveryCharges: number;
    avgOrderValue: number;
    dineInOrders: number;
    takeawayOrders: number;
    deliveryOrders: number;
  };
  breakdown: Array<{
    period: string;
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
  }>;
  period: string;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface OrderReport {
  totalOrders: number;
  statusBreakdown: Record<string, { count: number; revenue: number }>;
  typeBreakdown: Record<string, { count: number; revenue: number }>;
  paymentBreakdown: Record<string, { count: number; revenue: number }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    orderDate: string;
    customer: { name: string; phone: string } | null;
    branch: { name: string; code: string } | null;
    orderType: string;
    status: string;
    paymentStatus: string;
    totalAmount: number;
  }>;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface CustomerReport {
  summary: {
    totalCustomers: number;
    activeCustomers: number;
    totalRevenue: number;
    avgCustomerValue: number;
    loyaltyTierBreakdown: {
      regular: number;
      silver: number;
      gold: number;
      platinum: number;
    };
  };
  customers: Array<{
    id: string;
    name: string;
    phone: string;
    email?: string;
    totalOrders: number;
    totalSpent: number;
    avgOrderValue: number;
    loyaltyTier: string;
    lastOrderDate: string | null;
  }>;
  topCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    totalOrders: number;
    totalSpent: number;
    avgOrderValue: number;
    loyaltyTier: string;
  }>;
  dateRange: {
    start: string;
    end: string;
  } | null;
}

export interface InventoryReport {
  summary: {
    totalIngredients: number;
    lowStockItems: number;
    warningStockItems: number;
    totalInventoryValue: number;
    totalPurchases: number;
    totalUsage: number;
  };
  ingredients: Array<{
    id: string;
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    minimumThreshold: number;
    stockStatus: 'low' | 'warning' | 'ok';
    totalPurchased: number;
    totalUsed: number;
    totalCost: number;
    avgCostPerUnit: number;
    transactionCount: number;
  }>;
  lowStockItems: Array<{
    id: string;
    name: string;
    currentStock: number;
    minimumThreshold: number;
    stockStatus: 'low';
  }>;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface FinancialReport {
  revenue: {
    total: number;
    subtotal: number;
    tax: number;
    discounts: number;
    deliveryCharges: number;
  };
  costs: {
    costOfGoods: number;
  };
  profit: {
    gross: number;
    margin: number;
  };
  paymentMethods: Record<string, { count: number; amount: number }>;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface TaxReport {
  summary: {
    totalTax: number;
    taxableAmount: number;
    taxRate: number;
    totalOrders: number;
  };
  taxConfiguration: Array<{
    id: string;
    name: string;
    rate: number;
    code: string;
  }>;
  taxByType?: Array<{
    name: string;
    rate: number;
    estimatedAmount: number;
    code?: string;
  }>;
  taxByOrderType: Record<string, { count: number; tax: number; taxableAmount: number }>;
  taxBreakdown: Array<{
    period: string;
    tax: number;
    taxableAmount: number;
    count: number;
  }>;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface TopItemsReport {
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    revenue: number;
    orderCount: number;
  }>;
  dateRange: {
    start: string;
    end: string;
  };
}

export const reportsApi = {
  /**
   * Get sales report
   */
  getSalesReport: async (params: ReportQueryParams): Promise<SalesReport> => {
    const response = await apiClient.get(API_ENDPOINTS.REPORTS.SALES, { params });
    return response.data.data;
  },

  /**
   * Get orders report
   */
  getOrdersReport: async (params: ReportQueryParams): Promise<OrderReport> => {
    const response = await apiClient.get(API_ENDPOINTS.REPORTS.ORDERS, { params });
    return response.data.data;
  },

  /**
   * Get customers report
   */
  getCustomersReport: async (params: ReportQueryParams): Promise<CustomerReport> => {
    const response = await apiClient.get(API_ENDPOINTS.REPORTS.CUSTOMERS, { params });
    return response.data.data;
  },

  /**
   * Get inventory report
   */
  getInventoryReport: async (params: ReportQueryParams): Promise<InventoryReport> => {
    const response = await apiClient.get(API_ENDPOINTS.REPORTS.INVENTORY, { params });
    return response.data.data;
  },

  /**
   * Get financial report
   */
  getFinancialReport: async (params: ReportQueryParams): Promise<FinancialReport> => {
    const response = await apiClient.get(`${API_ENDPOINTS.REPORTS.FINANCIAL}`, { params });
    return response.data.data;
  },

  /**
   * Get tax report
   */
  getTaxReport: async (params: ReportQueryParams): Promise<TaxReport> => {
    const response = await apiClient.get('/reports/tax', { params });
    return response.data.data;
  },

  /**
   * Get top items report
   */
  getTopItemsReport: async (params: ReportQueryParams): Promise<TopItemsReport> => {
    const response = await apiClient.get('/reports/top-items', { params });
    return response.data.data;
  },

  /**
   * Export report (returns blob URL)
   */
  exportReport: async (endpoint: string, params: ReportQueryParams): Promise<string> => {
    try {
      const response = await apiClient.get(endpoint, {
        params: { ...params, export: params.export || 'csv' },
        responseType: 'blob',
      });
      
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      return url;
    } catch (error: any) {
      // If blob response contains error JSON, parse it
      if (error.response?.data instanceof Blob) {
        const text = await error.response.data.text();
        const json = JSON.parse(text);
        throw new Error(json.message || 'Export failed');
      }
      throw error;
    }
  },
};

