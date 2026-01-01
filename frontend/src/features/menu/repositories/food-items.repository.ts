import { BaseRepository } from '@/shared/repositories/base.repository';
import { FoodItem } from '@/lib/indexeddb/database';
import { db } from '@/lib/indexeddb/database';

/**
 * Repository for FoodItem entities
 * 
 * Provides methods for querying and managing food items in IndexedDB.
 */
export class FoodItemsRepository extends BaseRepository<FoodItem> {
  constructor(tenantId: string) {
    super(db.foodItems, tenantId);
  }

  /**
   * Find all active food items
   * 
   * @param categoryId - Optional category ID filter
   * @returns Promise resolving to array of active food items
   */
  async findActive(categoryId?: string): Promise<FoodItem[]> {
    const filters: Partial<FoodItem> = { isActive: true };
    if (categoryId) {
      filters.categoryId = categoryId;
    }
    return this.findAll(filters);
  }

  /**
   * Find food items by category
   * 
   * @param categoryId - The category ID
   * @returns Promise resolving to array of food items
   */
  async findByCategory(categoryId: string): Promise<FoodItem[]> {
    return this.findAll({ categoryId });
  }

  /**
   * Find food items by menu type
   * 
   * @param menuType - The menu type (legacy field)
   * @returns Promise resolving to array of food items
   */
  async findByMenuType(menuType: string): Promise<FoodItem[]> {
    const collection = db.foodItems
      .where('tenantId')
      .equals(this.tenantId)
      .filter((item) => {
        if (item.deletedAt) return false;
        // Check legacy menuType field
        if (item.menuType === menuType) return true;
        // Check menuTypes array
        if (item.menuTypes && item.menuTypes.includes(menuType)) return true;
        return false;
      });
    
    return collection.toArray();
  }

  /**
   * Find food items by stock type
   * 
   * @param stockType - The stock type (e.g., 'unlimited', 'tracked')
   * @returns Promise resolving to array of food items
   */
  async findByStockType(stockType: string): Promise<FoodItem[]> {
    return this.findAll({ stockType });
  }

  /**
   * Find food items with low stock
   * 
   * @param threshold - Optional threshold (default: 0)
   * @returns Promise resolving to array of food items with low stock
   */
  async findLowStock(threshold: number = 0): Promise<FoodItem[]> {
    const collection = db.foodItems
      .where('tenantId')
      .equals(this.tenantId)
      .filter((item) => {
        if (item.deletedAt) return false;
        if (item.stockType !== 'tracked') return false;
        return item.stockQuantity <= threshold;
      });
    
    return collection.toArray();
  }

  /**
   * Update sync status after syncing with server
   * 
   * @param id - The food item ID
   * @param syncStatus - The sync status
   */
  async updateSyncStatus(
    id: string,
    syncStatus: 'pending' | 'synced' | 'conflict'
  ): Promise<void> {
    await this.update(id, {
      lastSynced: new Date().toISOString(),
      syncStatus,
    } as Partial<FoodItem>);
  }
}



