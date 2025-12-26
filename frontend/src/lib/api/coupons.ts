import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';

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

export const couponsApi = {
  /**
   * Get all coupons
   */
  async getCoupons(
    filters?: Record<string, any>,
    pagination?: PaginationParams,
  ): Promise<PaginatedResponse<Coupon> | Coupon[]> {
    const response = await apiClient.get(API_ENDPOINTS.COUPONS.BASE, {
      params: { ...filters, ...pagination },
    });
    return response.data;
  },

  /**
   * Get coupon by ID
   */
  async getCouponById(id: string): Promise<Coupon> {
    const response = await apiClient.get(`${API_ENDPOINTS.COUPONS.BASE}/${id}`);
    return response.data;
  },

  /**
   * Create coupon
   */
  async createCoupon(createDto: CreateCouponDto): Promise<Coupon> {
    const response = await apiClient.post(API_ENDPOINTS.COUPONS.BASE, createDto);
    return response.data;
  },

  /**
   * Update coupon
   */
  async updateCoupon(id: string, updateDto: UpdateCouponDto): Promise<Coupon> {
    const response = await apiClient.put(`${API_ENDPOINTS.COUPONS.BASE}/${id}`, updateDto);
    return response.data;
  },

  /**
   * Delete coupon
   */
  async deleteCoupon(id: string): Promise<void> {
    await apiClient.delete(`${API_ENDPOINTS.COUPONS.BASE}/${id}`);
  },

  /**
   * Validate coupon code
   */
  async validateCoupon(data: { code: string; subtotal: number; customerId?: string }): Promise<{ discount: number; couponId: string }> {
    const response = await apiClient.post(API_ENDPOINTS.COUPONS.VALIDATE, data);
    return response.data;
  },
};



