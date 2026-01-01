import { BaseRepository } from '@/shared/repositories/base.repository';
import { Ingredient } from '@/lib/indexeddb/database';
import { db } from '@/lib/indexeddb/database';

/**
 * Repository for Ingredient entities
 * 
 * Provides methods for querying and managing ingredients in IndexedDB.
 */
export class IngredientsRepository extends BaseRepository<Ingredient> {
  constructor(tenantId: string) {
    super(db.ingredients, tenantId);
  }

  /**
   * Find all active ingredients
   * 
   * @param category - Optional category filter
   * @returns Promise resolving to array of active ingredients
   */
  async findActive(category?: string): Promise<Ingredient[]> {
    const filters: Partial<Ingredient> = { isActive: true };
    if (category) {
      filters.category = category;
    }
    return this.findAll(filters);
  }

  /**
   * Find ingredients by category
   * 
   * @param category - The ingredient category
   * @returns Promise resolving to array of ingredients
   */
  async findByCategory(category: string): Promise<Ingredient[]> {
    return this.findAll({ category });
  }

  /**
   * Find ingredients with low stock
   * 
   * @returns Promise resolving to array of ingredients with stock below minimum threshold
   */
  async findLowStock(): Promise<Ingredient[]> {
    const collection = db.ingredients
      .where('tenantId')
      .equals(this.tenantId)
      .filter((ingredient) => {
        if (ingredient.deletedAt || !ingredient.isActive) return false;
        return ingredient.currentStock <= ingredient.minimumThreshold;
      });
    
    return collection.toArray();
  }

  /**
   * Update sync status after syncing with server
   * 
   * @param id - The ingredient ID
   * @param syncStatus - The sync status
   */
  async updateSyncStatus(
    id: string,
    syncStatus: 'pending' | 'synced' | 'conflict'
  ): Promise<void> {
    await this.update(id, {
      lastSynced: new Date().toISOString(),
      syncStatus,
    } as Partial<Ingredient>);
  }
}



