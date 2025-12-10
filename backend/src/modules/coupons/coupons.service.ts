import { 
  Injectable, 
  NotFoundException, 
  BadRequestException 
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

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
}
