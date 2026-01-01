import { Tax } from '@/lib/api/taxes';
import { CartItem } from '@/shared/types/cart.types';

export interface OrderCalculationResult {
  subtotal: number;
  discount: number;
  tax: number;
  deliveryCharge: number;
  serviceCharge: number;
  total: number;
  taxBreakdown: Array<{ name: string; rate: number; amount: number }>;
}

export interface DiscountComponents {
  manualDiscount: number;
  couponDiscount: number;
  loyaltyDiscount: number;
}

export interface LoyaltyTierDiscount {
  regular: number;
  silver: number;
  gold: number;
  platinum: number;
}

/**
 * Order Calculator Service
 * 
 * Extracts order calculation logic from components.
 * Handles calculations for subtotal, discounts, taxes, delivery charges, and totals.
 */
export class OrderCalculatorService {
  private readonly LOYALTY_TIER_DISCOUNTS: LoyaltyTierDiscount = {
    regular: 0,
    silver: 5,
    gold: 10,
    platinum: 15,
  };

  /**
   * Calculate subtotal from cart items
   * 
   * @param cartItems - Array of cart items
   * @returns Subtotal amount
   */
  calculateSubtotal(cartItems: CartItem[]): number {
    return cartItems.reduce((sum, item) => {
      const itemSubtotal = item.subtotal ?? (item.unitPrice ?? 0) * (item.quantity ?? 1);
      return sum + itemSubtotal;
    }, 0);
  }

  /**
   * Calculate loyalty tier discount
   * 
   * @param subtotal - Order subtotal
   * @param loyaltyTier - Customer loyalty tier
   * @returns Discount amount based on loyalty tier
   */
  calculateLoyaltyTierDiscount(
    subtotal: number,
    loyaltyTier?: 'regular' | 'silver' | 'gold' | 'platinum'
  ): number {
    if (!loyaltyTier) return 0;
    
    const discountPercent = this.LOYALTY_TIER_DISCOUNTS[loyaltyTier] || 0;
    if (discountPercent === 0) return 0;
    
    return (subtotal * discountPercent) / 100;
  }

  /**
   * Calculate total discount
   * 
   * @param subtotal - Order subtotal
   * @param discountComponents - Breakdown of discount components
   * @param loyaltyTier - Customer loyalty tier (optional)
   * @returns Total discount amount
   */
  calculateDiscount(
    subtotal: number,
    discountComponents: DiscountComponents,
    loyaltyTier?: 'regular' | 'silver' | 'gold' | 'platinum'
  ): number {
    const loyaltyDiscount = this.calculateLoyaltyTierDiscount(subtotal, loyaltyTier);
    return (
      discountComponents.manualDiscount +
      discountComponents.couponDiscount +
      loyaltyDiscount
    );
  }

  /**
   * Calculate delivery charge
   * 
   * @param orderType - Type of order (dine_in, takeaway, delivery)
   * @param deliveryCharge - Base delivery charge amount
   * @returns Delivery charge (0 if not delivery order)
   */
  calculateDeliveryCharge(
    orderType: 'dine_in' | 'takeaway' | 'delivery',
    deliveryCharge: number
  ): number {
    return orderType === 'delivery' ? deliveryCharge : 0;
  }

  /**
   * Calculate tax based on tax rules
   * 
   * @param taxableAmount - Amount to calculate tax on (subtotal - discount)
   * @param taxes - Array of tax rules to apply
   * @param orderItems - Order items with category information for category-based taxes
   * @param deliveryCharge - Delivery charge to include if appliesToDelivery is true
   * @param serviceCharge - Service charge to include if appliesToServiceCharge is true
   * @returns Object with total tax and breakdown
   */
  calculateTax(
    taxableAmount: number,
    taxes: Tax[],
    orderItems?: Array<{ categoryId?: string; foodItemId?: string; subtotal: number }>,
    deliveryCharge: number = 0,
    serviceCharge: number = 0
  ): { total: number; breakdown: Array<{ name: string; rate: number; amount: number }> } {
    if (!taxes || taxes.length === 0) {
      return { total: 0, breakdown: [] };
    }

    let totalTax = 0;
    const breakdown: Array<{ name: string; rate: number; amount: number }> = [];

    for (const tax of taxes) {
      let taxBaseAmount = 0;

      // Determine taxable amount based on appliesTo
      if (tax.appliesTo === 'order') {
        // Apply to entire order subtotal
        taxBaseAmount = taxableAmount;
      } else if (tax.appliesTo === 'category' && orderItems) {
        // Apply only to items in specified categories
        const categoryIds = tax.categoryIds || [];
        taxBaseAmount = orderItems
          .filter((item) => item.categoryId && categoryIds.includes(item.categoryId))
          .reduce((sum, item) => sum + (item.subtotal ?? 0), 0);
      } else if (tax.appliesTo === 'item' && orderItems) {
        // Apply only to specified food items
        const foodItemIds = tax.foodItemIds || [];
        taxBaseAmount = orderItems
          .filter((item) => item.foodItemId && foodItemIds.includes(item.foodItemId))
          .reduce((sum, item) => sum + (item.subtotal ?? 0), 0);
      }

      // Add delivery charge if applicable
      if (tax.appliesToDelivery && deliveryCharge > 0) {
        taxBaseAmount += deliveryCharge;
      }

      // Add service charge if applicable
      if (tax.appliesToServiceCharge && serviceCharge > 0) {
        taxBaseAmount += serviceCharge;
      }

      // Calculate tax amount
      if (taxBaseAmount > 0) {
        const taxAmount = (taxBaseAmount * tax.rate) / 100;
        const roundedTaxAmount = Math.round(taxAmount * 100) / 100;
        totalTax += roundedTaxAmount;

        breakdown.push({
          name: tax.name,
          rate: tax.rate,
          amount: roundedTaxAmount,
        });
      }
    }

    const roundedTotal = Math.round(totalTax * 100) / 100;
    return { total: roundedTotal, breakdown };
  }

  /**
   * Calculate complete order totals
   * 
   * @param cartItems - Array of cart items
   * @param orderType - Type of order
   * @param discountComponents - Breakdown of discount components
   * @param deliveryCharge - Base delivery charge
   * @param serviceCharge - Service charge (default: 0)
   * @param taxes - Array of tax rules (optional)
   * @param loyaltyTier - Customer loyalty tier (optional)
   * @param orderItemsForTax - Order items with category info for tax calculation (optional)
   * @returns Complete calculation result
   */
  calculateOrderTotal(
    cartItems: CartItem[],
    orderType: 'dine_in' | 'takeaway' | 'delivery',
    discountComponents: DiscountComponents,
    deliveryCharge: number,
    serviceCharge: number = 0,
    taxes?: Tax[],
    loyaltyTier?: 'regular' | 'silver' | 'gold' | 'platinum',
    orderItemsForTax?: Array<{ categoryId?: string; foodItemId?: string; subtotal: number }>
  ): OrderCalculationResult {
    // Calculate subtotal
    const subtotal = this.calculateSubtotal(cartItems);

    // Calculate discount
    const discount = this.calculateDiscount(subtotal, discountComponents, loyaltyTier);

    // Calculate taxable amount
    const taxableAmount = subtotal - discount;

    // Calculate tax
    const taxResult = taxes
      ? this.calculateTax(taxableAmount, taxes, orderItemsForTax, deliveryCharge, serviceCharge)
      : { total: 0, breakdown: [] };

    // Calculate delivery charge
    const delivery = this.calculateDeliveryCharge(orderType, deliveryCharge);

    // Calculate total
    const total = subtotal - discount + taxResult.total + delivery + serviceCharge;

    return {
      subtotal,
      discount,
      tax: taxResult.total,
      deliveryCharge: delivery,
      serviceCharge,
      total,
      taxBreakdown: taxResult.breakdown,
    };
  }
}

// Export singleton instance
export const orderCalculatorService = new OrderCalculatorService();

