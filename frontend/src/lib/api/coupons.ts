import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';
import { createCrudApi, extendCrudApi } from '@/shared/services/api/factory';

// Types
export interface Coupon {
  id: string;
  code: string;
  discountType: 'fixed' | 'percentage';
  discountValue: number;
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  usageLimit?: number | null;
  usedCount: number;
  isActive: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponDto {
  code: string;
  discountType: 'fixed' | 'percentage';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  isActive?: boolean;
  validFrom?: string;
  validUntil?: string;
}

export interface UpdateCouponDto {
  code?: string;
  discountType?: 'fixed' | 'percentage';
  discountValue?: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  isActive?: boolean;
  validFrom?: string;
  validUntil?: string;
}

// Use factory for base CRUD operations on coupons
const baseCouponsApi = createCrudApi<Coupon>(API_ENDPOINTS.COUPONS.BASE);

export const couponsApi = {
  /**
   * Get all coupons - Using factory
   */
  async getCoupons(
    filters?: Record<string, any>,
    pagination?: PaginationParams,
    branchId?: string,
  ): Promise<PaginatedResponse<Coupon> | Coupon[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          params.append(key, filters[key].toString());
        }
      });
    }
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());
    if (branchId) params.append('branchId', branchId);
    
    const response = await apiClient.get(`${API_ENDPOINTS.COUPONS.BASE}${params.toString() ? `?${params.toString()}` : ''}`);
    return response.data;
  },

  /**
   * Get coupon by ID - Using factory
   */
  getCouponById: baseCouponsApi.getById,

  /**
   * Create coupon
   */
  createCoupon: async (data: CreateCouponDto, branchId?: string): Promise<Coupon> => {
    const params = branchId ? `?branchId=${branchId}` : '';
    const response = await apiClient.post(`${API_ENDPOINTS.COUPONS.BASE}${params}`, data);
    return response.data;
  },

  /**
   * Update coupon - Using factory
   */
  updateCoupon: baseCouponsApi.update,

  /**
   * Delete coupon - Using factory
   */
  deleteCoupon: baseCouponsApi.delete,

  /**
   * Validate coupon code
   */
  async validateCoupon(data: { code: string; subtotal: number; customerId?: string }, branchId?: string): Promise<{ discount: number; couponId: string }> {
    const params = branchId ? `?branchId=${branchId}` : '';
    const response = await apiClient.post(`${API_ENDPOINTS.COUPONS.VALIDATE}${params}`, data);
    return response.data;
  },
};





