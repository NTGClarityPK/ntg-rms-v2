export interface Ingredient {
  id: string;
  currentStock: number;
  minimumThreshold: number;
  unit: string;
}

export interface StockCalculationResult {
  currentStock: number;
  minimumThreshold: number;
  availableStock: number;
  isLowStock: boolean;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}

/**
 * Inventory Calculator Service
 * 
 * Extracts inventory calculation logic from components.
 * Handles calculations for stock levels, low stock detection, and availability checks.
 */
export class InventoryCalculatorService {
  /**
   * Check if ingredient has low stock
   * 
   * @param ingredient - Ingredient with current stock and minimum threshold
   * @returns True if current stock is at or below minimum threshold
   */
  isLowStock(ingredient: Ingredient): boolean {
    return ingredient.currentStock <= ingredient.minimumThreshold;
  }

  /**
   * Check if ingredient is out of stock
   * 
   * @param ingredient - Ingredient with current stock
   * @returns True if current stock is 0 or less
   */
  isOutOfStock(ingredient: Ingredient): boolean {
    return ingredient.currentStock <= 0;
  }

  /**
   * Get stock status
   * 
   * @param ingredient - Ingredient with current stock and minimum threshold
   * @returns Stock status: 'in_stock', 'low_stock', or 'out_of_stock'
   */
  getStockStatus(ingredient: Ingredient): 'in_stock' | 'low_stock' | 'out_of_stock' {
    if (this.isOutOfStock(ingredient)) {
      return 'out_of_stock';
    }
    if (this.isLowStock(ingredient)) {
      return 'low_stock';
    }
    return 'in_stock';
  }

  /**
   * Calculate available stock (current stock minus reserved/allocated)
   * 
   * @param currentStock - Current stock level
   * @param reservedStock - Reserved/allocated stock (default: 0)
   * @returns Available stock for use
   */
  calculateAvailableStock(currentStock: number, reservedStock: number = 0): number {
    return Math.max(0, currentStock - reservedStock);
  }

  /**
   * Check if sufficient stock is available
   * 
   * @param ingredient - Ingredient with current stock
   * @param requiredQuantity - Quantity required
   * @param reservedStock - Reserved/allocated stock (default: 0)
   * @returns True if sufficient stock is available
   */
  hasSufficientStock(
    ingredient: Ingredient,
    requiredQuantity: number,
    reservedStock: number = 0
  ): boolean {
    const availableStock = this.calculateAvailableStock(ingredient.currentStock, reservedStock);
    return availableStock >= requiredQuantity;
  }

  /**
   * Calculate stock calculation result with all details
   * 
   * @param ingredient - Ingredient with current stock and minimum threshold
   * @param reservedStock - Reserved/allocated stock (default: 0)
   * @returns Complete stock calculation result
   */
  calculateStock(
    ingredient: Ingredient,
    reservedStock: number = 0
  ): StockCalculationResult {
    const availableStock = this.calculateAvailableStock(ingredient.currentStock, reservedStock);
    const isLowStock = this.isLowStock(ingredient);
    const stockStatus = this.getStockStatus(ingredient);

    return {
      currentStock: ingredient.currentStock,
      minimumThreshold: ingredient.minimumThreshold,
      availableStock,
      isLowStock,
      stockStatus,
    };
  }

  /**
   * Calculate stock percentage (current stock relative to minimum threshold)
   * 
   * @param ingredient - Ingredient with current stock and minimum threshold
   * @returns Stock percentage (0-100+), where 100% means at minimum threshold
   */
  calculateStockPercentage(ingredient: Ingredient): number {
    if (ingredient.minimumThreshold === 0) {
      return ingredient.currentStock > 0 ? 100 : 0;
    }
    return (ingredient.currentStock / ingredient.minimumThreshold) * 100;
  }

  /**
   * Calculate stock after transaction
   * 
   * @param currentStock - Current stock level
   * @param transactionQuantity - Transaction quantity (positive for add, negative for deduct)
   * @returns New stock level after transaction
   */
  calculateStockAfterTransaction(
    currentStock: number,
    transactionQuantity: number
  ): number {
    return Math.max(0, currentStock + transactionQuantity);
  }

  /**
   * Validate stock transaction
   * 
   * @param currentStock - Current stock level
   * @param transactionQuantity - Transaction quantity (positive for add, negative for deduct)
   * @returns Object with validation result and error message if invalid
   */
  validateStockTransaction(
    currentStock: number,
    transactionQuantity: number
  ): { isValid: boolean; errorMessage?: string } {
    if (transactionQuantity === 0) {
      return { isValid: false, errorMessage: 'Transaction quantity cannot be zero' };
    }

    // For deductions, check if sufficient stock is available
    if (transactionQuantity < 0) {
      const absoluteQuantity = Math.abs(transactionQuantity);
      if (currentStock < absoluteQuantity) {
        return {
          isValid: false,
          errorMessage: `Insufficient stock. Available: ${currentStock}, Required: ${absoluteQuantity}`,
        };
      }
    }

    return { isValid: true };
  }
}

// Export singleton instance
export const inventoryCalculatorService = new InventoryCalculatorService();










