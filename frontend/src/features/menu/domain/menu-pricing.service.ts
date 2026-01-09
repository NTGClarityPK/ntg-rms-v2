import { FoodItem } from '@/lib/api/menu';

export interface Variation {
  id: string;
  priceAdjustment?: number;
}

export interface AddOn {
  id: string;
  price: number;
}

export interface FoodItemDiscount {
  id: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
}

export interface PricingCalculationResult {
  basePrice: number;
  variationAdjustment: number;
  addOnsTotal: number;
  priceBeforeDiscount: number;
  discountAmount: number;
  finalPrice: number;
  appliedDiscount: FoodItemDiscount | null;
}

/**
 * Menu Pricing Service
 * 
 * Extracts menu pricing logic from components.
 * Handles calculations for base price, variations, add-ons, and discounts.
 */
export class MenuPricingService {
  /**
   * Calculate base price before discount
   * 
   * @param foodItem - Food item with base price
   * @param selectedVariation - Selected variation (optional)
   * @param selectedAddOns - Map of selected add-ons by group ID
   * @param addOnGroups - Array of add-on groups with their add-ons
   * @returns Base price including variation and add-on adjustments
   */
  calculateBasePrice(
    foodItem: FoodItem,
    selectedVariation?: Variation | null,
    selectedAddOns?: Record<string, string[]>,
    addOnGroups?: Array<{ id: string; addOns?: AddOn[] }>
  ): number {
    let price = foodItem.basePrice;

    // Add variation price adjustment
    if (selectedVariation?.priceAdjustment) {
      price += selectedVariation.priceAdjustment;
    }

    // Add add-on prices
    if (selectedAddOns && addOnGroups) {
      Object.values(selectedAddOns).forEach((addOnIds) => {
        addOnIds.forEach((addOnId) => {
          addOnGroups.forEach((group) => {
            const addOn = group.addOns?.find((a) => a.id === addOnId);
            if (addOn) {
              price += addOn.price;
            }
          });
        });
      });
    }

    return Math.max(0, price); // Ensure price is never negative
  }

  /**
   * Find the best discount from available discounts
   * 
   * @param basePrice - Base price before discount
   * @param discounts - Array of available discounts
   * @returns Best discount (gives lowest final price) or null
   */
  findBestDiscount(
    basePrice: number,
    discounts: FoodItemDiscount[]
  ): FoodItemDiscount | null {
    if (!discounts || discounts.length === 0) {
      return null;
    }

    // Filter active discounts (within date range)
    const now = new Date();
    const activeDiscounts = discounts.filter((discount) => {
      if (!discount.isActive) return false;

      const startDate = discount.startDate ? new Date(discount.startDate) : null;
      const endDate = discount.endDate ? new Date(discount.endDate) : null;

      if (startDate && endDate) {
        return now >= startDate && now <= endDate;
      } else if (startDate) {
        return now >= startDate;
      } else if (endDate) {
        return now <= endDate;
      }
      return true; // No date restrictions
    });

    if (activeDiscounts.length === 0) {
      return null;

    }

    let bestDiscount: FoodItemDiscount | null = null;
    let bestFinalPrice = basePrice;

    // Calculate final price for each discount and pick the best one
    for (const discount of activeDiscounts) {
      let discountedPrice = basePrice;

      if (discount.discountType === 'percentage') {
        discountedPrice = basePrice * (1 - discount.discountValue / 100);
      } else if (discount.discountType === 'fixed') {
        discountedPrice = Math.max(0, basePrice - discount.discountValue);
      }

      // Pick the discount that gives the lowest final price (best for customer)
      if (discountedPrice < bestFinalPrice) {
        bestFinalPrice = discountedPrice;
        bestDiscount = discount;
      }
    }

    return bestDiscount;
  }

  /**
   * Calculate final price with discount applied
   * 
   * @param basePrice - Base price before discount
   * @param discount - Discount to apply (optional)
   * @returns Final price after discount
   */
  calculateFinalPrice(
    basePrice: number,
    discount?: FoodItemDiscount | null
  ): number {
    if (!discount) {
      return Math.max(0, basePrice);
    }

    if (discount.discountType === 'percentage') {
      return Math.max(0, basePrice * (1 - discount.discountValue / 100));
    } else if (discount.discountType === 'fixed') {
      return Math.max(0, basePrice - discount.discountValue);
    }

    return Math.max(0, basePrice);
  }

  /**
   * Calculate complete pricing breakdown
   * 
   * @param foodItem - Food item with base price
   * @param selectedVariation - Selected variation (optional)
   * @param selectedAddOns - Map of selected add-ons by group ID
   * @param addOnGroups - Array of add-on groups with their add-ons
   * @param availableDiscounts - Array of available discounts
   * @returns Complete pricing calculation result
   */
  calculatePricing(
    foodItem: FoodItem,
    selectedVariation?: Variation | null,
    selectedAddOns?: Record<string, string[]>,
    addOnGroups?: Array<{ id: string; addOns?: AddOn[] }>,
    availableDiscounts?: FoodItemDiscount[]
  ): PricingCalculationResult {
    const basePrice = foodItem.basePrice;
    const variationAdjustment = selectedVariation?.priceAdjustment || 0;
    
    // Calculate add-ons total
    let addOnsTotal = 0;
    if (selectedAddOns && addOnGroups) {
      Object.values(selectedAddOns).forEach((addOnIds) => {
        addOnIds.forEach((addOnId) => {
          addOnGroups.forEach((group) => {
            const addOn = group.addOns?.find((a) => a.id === addOnId);
            if (addOn) {
              addOnsTotal += addOn.price;
            }
          });
        });
      });
    }

    const priceBeforeDiscount = basePrice + variationAdjustment + addOnsTotal;

    // Find and apply best discount
    const bestDiscount = availableDiscounts
      ? this.findBestDiscount(priceBeforeDiscount, availableDiscounts)
      : null;

    const finalPrice = this.calculateFinalPrice(priceBeforeDiscount, bestDiscount);
    const discountAmount = priceBeforeDiscount - finalPrice;

    return {
      basePrice,
      variationAdjustment,
      addOnsTotal,
      priceBeforeDiscount,
      discountAmount,
      finalPrice,
      appliedDiscount: bestDiscount,
    };
  }
}

// Export singleton instance
export const menuPricingService = new MenuPricingService();










