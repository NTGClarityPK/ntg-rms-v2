import { 
  Injectable, 
  NotFoundException, 
  BadRequestException,
  ConflictException
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { PaginationParams, PaginatedResponse, getPaginationParams, createPaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class CouponsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Validate and apply coupon code
   */
  async validateCoupon(
    tenantId: string,
    validateCouponDto: ValidateCouponDto,
  ): Promise<{ discount: number; couponId: string }> {
    const { code, subtotal, customerId } = validateCouponDto;

    // Find active coupon by code (case-insensitive search)
    const { data: coupon, error: couponError } = await this.supabaseService
      .getServiceRoleClient()
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenantId)
      .ilike('code', code.trim()) // Use ilike for case-insensitive matching
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();

    if (couponError || !coupon) {
      throw new NotFoundException('Invalid or expired coupon code');
    }

    // Check validity dates
    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      throw new BadRequestException('Coupon is not yet valid');
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      throw new BadRequestException('Coupon has expired');
    }

    // Check minimum order amount
    if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
      throw new BadRequestException(
        `Minimum order amount of ${coupon.min_order_amount} required for this coupon`,
      );
    }

    // Check if bill is less than coupon value (for fixed discount)
    if (coupon.discount_type === 'fixed' && subtotal < coupon.discount_value) {
      throw new BadRequestException(
        `Order total (${subtotal}) is less than coupon value (${coupon.discount_value}). Cannot apply coupon.`,
      );
    }

    // Check usage limit
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      throw new BadRequestException('Coupon usage limit has been reached');
    }

    // Check if customer has already used this coupon
    if (customerId) {
      const { data: usage, error: usageError } = await this.supabaseService
        .getServiceRoleClient()
        .from('coupon_usages')
        .select('id')
        .eq('coupon_id', coupon.id)
        .eq('customer_id', customerId)
        .maybeSingle();

      if (usage && !usageError) {
        throw new BadRequestException('This coupon has already been used by you');
      }
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discount_type === 'fixed') {
      discount = coupon.discount_value;
    } else if (coupon.discount_type === 'percentage') {
      discount = (subtotal * coupon.discount_value) / 100;
      // Apply max discount if set
      if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
        discount = coupon.max_discount_amount;
      }
    }

    return {
      discount: Number(discount.toFixed(2)),
      couponId: coupon.id,
    };
  }

  /**
   * Create default coupon code "5" with value 5 IQD
   */
  async createDefaultCoupon(tenantId: string): Promise<void> {
    // Check if default coupon already exists
    const { data: existing } = await this.supabaseService
      .getServiceRoleClient()
      .from('coupons')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('code', '5')
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      return; // Already exists
    }

    // Create default coupon
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('coupons')
      .insert({
        tenant_id: tenantId,
        code: '5',
        discount_type: 'fixed',
        discount_value: 5,
        min_order_amount: 5, // Minimum order must be at least 5 IQD
        is_active: true,
      });

    if (error) {
      console.error('Failed to create default coupon:', error);
    }
  }

  /**
   * Record coupon usage
   */
  async recordCouponUsage(
    tenantId: string,
    couponId: string,
    orderId: string,
    customerId?: string,
  ): Promise<void> {
    // Get current used count and increment
    const { data: coupon } = await this.supabaseService
      .getServiceRoleClient()
      .from('coupons')
      .select('used_count')
      .eq('id', couponId)
      .single();

    if (coupon) {
      await this.supabaseService
        .getServiceRoleClient()
        .from('coupons')
        .update({ used_count: (coupon.used_count || 0) + 1 })
        .eq('id', couponId);
    }

    // Record usage
    if (customerId) {
      await this.supabaseService
        .getServiceRoleClient()
        .from('coupon_usages')
        .insert({
          coupon_id: couponId,
          customer_id: customerId,
          order_id: orderId,
          tenant_id: tenantId,
        });
    }
  }

  /**
   * Get all coupons
   */
  async getCoupons(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('coupons')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    let query = supabase
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
    }

    const { data: coupons, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch coupons: ${error.message}`);
    }

    const formattedCoupons = coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount_value),
      minOrderAmount: coupon.min_order_amount ? parseFloat(coupon.min_order_amount) : null,
      maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
      usageLimit: coupon.usage_limit,
      usedCount: coupon.used_count || 0,
      isActive: coupon.is_active,
      validFrom: coupon.valid_from,
      validUntil: coupon.valid_until,
      createdAt: coupon.created_at,
      updatedAt: coupon.updated_at,
    }));

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(formattedCoupons, totalCount || 0, pagination.page, pagination.limit);
    }

    return formattedCoupons;
  }

  /**
   * Get coupon by ID
   */
  async getCouponById(tenantId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount_value),
      minOrderAmount: coupon.min_order_amount ? parseFloat(coupon.min_order_amount) : null,
      maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
      usageLimit: coupon.usage_limit,
      usedCount: coupon.used_count || 0,
      isActive: coupon.is_active,
      validFrom: coupon.valid_from,
      validUntil: coupon.valid_until,
      createdAt: coupon.created_at,
      updatedAt: coupon.updated_at,
    };
  }

  /**
   * Create coupon
   */
  async createCoupon(tenantId: string, createDto: CreateCouponDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if coupon code already exists
    const { data: existing } = await supabase
      .from('coupons')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('code', createDto.code.trim())
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('Coupon code already exists');
    }

    const { data: coupon, error } = await supabase
      .from('coupons')
      .insert({
        tenant_id: tenantId,
        code: createDto.code.trim().toUpperCase(),
        discount_type: createDto.discountType,
        discount_value: createDto.discountValue,
        min_order_amount: createDto.minOrderAmount || 0,
        max_discount_amount: createDto.maxDiscountAmount || null,
        usage_limit: createDto.usageLimit || null,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
        valid_from: createDto.validFrom || new Date().toISOString(),
        valid_until: createDto.validUntil || null,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create coupon: ${error.message}`);
    }

    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount_value),
      minOrderAmount: coupon.min_order_amount ? parseFloat(coupon.min_order_amount) : null,
      maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
      usageLimit: coupon.usage_limit,
      usedCount: coupon.used_count || 0,
      isActive: coupon.is_active,
      validFrom: coupon.valid_from,
      validUntil: coupon.valid_until,
      createdAt: coupon.created_at,
      updatedAt: coupon.updated_at,
    };
  }

  /**
   * Update coupon
   */
  async updateCoupon(tenantId: string, id: string, updateDto: UpdateCouponDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if coupon exists
    const { data: existing } = await supabase
      .from('coupons')
      .select('id, code')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Coupon not found');
    }

    // If code is being updated, check if new code already exists
    if (updateDto.code && updateDto.code.trim().toUpperCase() !== existing.code) {
      const { data: codeExists } = await supabase
        .from('coupons')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('code', updateDto.code.trim())
        .is('deleted_at', null)
        .neq('id', id)
        .maybeSingle();

      if (codeExists) {
        throw new ConflictException('Coupon code already exists');
      }
    }

    const updateData: any = {};
    if (updateDto.code !== undefined) updateData.code = updateDto.code.trim().toUpperCase();
    if (updateDto.discountType !== undefined) updateData.discount_type = updateDto.discountType;
    if (updateDto.discountValue !== undefined) updateData.discount_value = updateDto.discountValue;
    if (updateDto.minOrderAmount !== undefined) updateData.min_order_amount = updateDto.minOrderAmount;
    if (updateDto.maxDiscountAmount !== undefined) updateData.max_discount_amount = updateDto.maxDiscountAmount;
    if (updateDto.usageLimit !== undefined) updateData.usage_limit = updateDto.usageLimit;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    if (updateDto.validFrom !== undefined) updateData.valid_from = updateDto.validFrom;
    if (updateDto.validUntil !== undefined) updateData.valid_until = updateDto.validUntil;
    updateData.updated_at = new Date().toISOString();

    const { data: coupon, error } = await supabase
      .from('coupons')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update coupon: ${error.message}`);
    }

    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount_value),
      minOrderAmount: coupon.min_order_amount ? parseFloat(coupon.min_order_amount) : null,
      maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
      usageLimit: coupon.usage_limit,
      usedCount: coupon.used_count || 0,
      isActive: coupon.is_active,
      validFrom: coupon.valid_from,
      validUntil: coupon.valid_until,
      createdAt: coupon.created_at,
      updatedAt: coupon.updated_at,
    };
  }

  /**
   * Delete coupon (soft delete)
   */
  async deleteCoupon(tenantId: string, id: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if coupon exists
    const { data: existing } = await supabase
      .from('coupons')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundException('Coupon not found');
    }

    const { error } = await supabase
      .from('coupons')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`Failed to delete coupon: ${error.message}`);
    }

    return { message: 'Coupon deleted successfully' };
  }
}
