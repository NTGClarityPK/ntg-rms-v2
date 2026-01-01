import { BaseRepository } from '@/shared/repositories/base.repository';
import { Category } from '@/lib/indexeddb/database';
import { db } from '@/lib/indexeddb/database';
import { cacheService } from '@/shared/cache';

/**
 * Repository for Category entities
 * 
 * Provides methods for querying and managing categories in IndexedDB.
 */
export class CategoriesRepository extends BaseRepository<Category> {
  constructor(tenantId: string) {
    super(db.categories, tenantId);
  }

  /**
   * Find all active categories
   * 
   * @param categoryType - Optional category type filter
   * @returns Promise resolving to array of active categories
   */
  async findActive(categoryType?: string): Promise<Category[]> {
    const filters: Partial<Category> = { isActive: true };
    if (categoryType) {
      filters.categoryType = categoryType;
    }
    return this.findAll(filters);
  }

  /**
   * Find categories by type
   * 
   * @param categoryType - The category type (e.g., 'food', 'beverage')
   * @returns Promise resolving to array of categories
   */
  async findByType(categoryType: string): Promise<Category[]> {
    return this.findAll({ categoryType });
  }

  /**
   * Find categories by parent ID (subcategories)
   * 
   * @param parentId - The parent category ID
   * @returns Promise resolving to array of subcategories
   */
  async findByParentId(parentId: string): Promise<Category[]> {
    return this.findAll({ parentId });
  }

  /**
   * Find top-level categories (no parent)
   * 
   * @returns Promise resolving to array of top-level categories
   */
  async findTopLevel(): Promise<Category[]> {
    const cacheKey = this.getCacheKey('findTopLevel');
    
    // Check cache first
    if (this.cacheEnabled) {
      const cached = cacheService.get<Category[]>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    const collection = db.categories
      .where('tenantId')
      .equals(this.tenantId)
      .filter((cat) => !cat.deletedAt && !cat.parentId);
    
    const result = await collection.toArray();
    
    // Cache the result
    if (this.cacheEnabled) {
      cacheService.set(cacheKey, result);
    }
    
    return result;
  }

  /**
   * Update sync status after syncing with server
   * 
   * @param id - The category ID
   * @param syncStatus - The sync status
   */
  async updateSyncStatus(
    id: string,
    syncStatus: 'pending' | 'synced' | 'conflict'
  ): Promise<void> {
    await this.update(id, {
      lastSynced: new Date().toISOString(),
      syncStatus,
    } as Partial<Category>);
  }
}

