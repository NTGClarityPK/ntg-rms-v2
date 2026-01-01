import { Table } from 'dexie';
import { PaginationParams } from '@/lib/types/pagination.types';
import { cacheService } from '../cache';

/**
 * Base Repository Pattern
 * 
 * Abstracts IndexedDB operations to provide a consistent data access layer.
 * All feature-specific repositories should extend this base class.
 * Includes built-in caching for improved performance.
 * 
 * @template T - The entity type stored in the table
 */
export abstract class BaseRepository<T extends { id: string; tenantId?: string }> {
  protected readonly tableName: string;
  protected readonly cacheEnabled: boolean;

  constructor(
    protected table: Table<T, string>,
    protected tenantId: string,
    options?: { cacheEnabled?: boolean }
  ) {
    this.tableName = table.name;
    this.cacheEnabled = options?.cacheEnabled !== false; // Default to enabled
  }

  /**
   * Generate cache key for a query
   */
  protected getCacheKey(operation: string, ...params: (string | number | boolean | object | undefined)[]): string {
    const paramsStr = params
      .map(p => {
        if (typeof p === 'object' && p !== null) {
          return JSON.stringify(p);
        }
        if (typeof p === 'boolean') {
          return p ? 'true' : 'false';
        }
        return String(p ?? '');
      })
      .join(':');
    return `${this.tableName}:${this.tenantId}:${operation}:${paramsStr}`;
  }

  /**
   * Invalidate cache for this table/tenant
   */
  protected invalidateCache(pattern?: string): void {
    const cachePattern = pattern 
      ? `${this.tableName}:${this.tenantId}:${pattern}`
      : `${this.tableName}:${this.tenantId}:*`;
    cacheService.deletePattern(cachePattern);
  }

  /**
   * Find all records matching the filters (excludes soft-deleted records)
   * 
   * @param filters - Optional filters to apply
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Promise resolving to array of matching records
   */
  async findAll(filters?: Partial<T>, includeDeleted: boolean = false): Promise<T[]> {
    const cacheKey = this.getCacheKey('findAll', filters, includeDeleted);
    
    // Check cache first
    if (this.cacheEnabled) {
      const cached = cacheService.get<T[]>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    let collection = this.table.where('tenantId').equals(this.tenantId);

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          collection = collection.filter((item: any) => item[key] === value);
        }
      });
    }

    if (!includeDeleted) {
      collection = collection.filter((item: any) => !item.deletedAt);
    }

    const result = await collection.toArray();
    
    // Cache the result
    if (this.cacheEnabled) {
      cacheService.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Find all records with pagination
   * 
   * @param pagination - Pagination parameters
   * @param filters - Optional filters to apply
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Promise resolving to paginated results
   */
  async findAllPaginated(
    pagination: PaginationParams,
    filters?: Partial<T>,
    includeDeleted: boolean = false
  ): Promise<{ data: T[]; total: number }> {
    const cacheKey = this.getCacheKey('findAllPaginated', pagination, filters, includeDeleted);
    
    // Check cache first
    if (this.cacheEnabled) {
      const cached = cacheService.get<{ data: T[]; total: number }>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    let collection = this.table.where('tenantId').equals(this.tenantId);

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          collection = collection.filter((item: any) => item[key] === value);
        }
      });
    }

    if (!includeDeleted) {
      collection = collection.filter((item: any) => !item.deletedAt);
    }

    const total = await collection.count();
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;
    const data = await collection
      .offset((page - 1) * limit)
      .limit(limit)
      .toArray();

    const result = { data, total };
    
    // Cache the result
    if (this.cacheEnabled) {
      cacheService.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Find a single record by ID
   * 
   * @param id - The record ID
   * @returns Promise resolving to the record or undefined if not found
   */
  async findById(id: string): Promise<T | undefined> {
    const cacheKey = this.getCacheKey('findById', id);
    
    // Check cache first
    if (this.cacheEnabled) {
      const cached = cacheService.get<T>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    const item = await this.table.get(id);
    
    // Verify tenant ownership
    if (item && (item as any).tenantId !== this.tenantId) {
      return undefined;
    }
    
    // Cache the result (even if undefined to avoid repeated queries)
    if (this.cacheEnabled) {
      cacheService.set(cacheKey, item, 2 * 60 * 1000); // 2 minutes for individual items
    }
    
    return item;
  }

  /**
   * Create a new record
   * 
   * @param data - The data to create (id must be provided for string IDs)
   * @returns Promise resolving to the created record
   */
  async create(data: Partial<T> & { tenantId?: string }): Promise<T> {
    if (!data.id) {
      throw new Error('ID is required for creating records');
    }

    const newItem: T = {
      ...data,
      id: data.id,
      tenantId: this.tenantId,
      createdAt: (data as any).createdAt || new Date().toISOString(),
      updatedAt: (data as any).updatedAt || new Date().toISOString(),
    } as unknown as T;

    await this.table.put(newItem);
    const created = (await this.table.get(data.id)) as T;

    // Invalidate cache
    if (this.cacheEnabled) {
      this.invalidateCache();
      // Cache the newly created item
      const cacheKey = this.getCacheKey('findById', data.id);
      cacheService.set(cacheKey, created, 2 * 60 * 1000);
    }

    return created;
  }

  /**
   * Update an existing record
   * 
   * @param id - The record ID
   * @param data - The data to update
   * @returns Promise resolving to the updated record
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Record with id ${id} not found`);
    }

    const updatedItem = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    } as T;

    await this.table.update(id, updatedItem);
    const updated = (await this.table.get(id)) as T;

    // Invalidate cache
    if (this.cacheEnabled) {
      this.invalidateCache();
      // Cache the updated item
      const cacheKey = this.getCacheKey('findById', id);
      cacheService.set(cacheKey, updated, 2 * 60 * 1000);
    }

    return updated;
  }

  /**
   * Delete a record (soft delete by setting deletedAt)
   * 
   * @param id - The record ID
   * @returns Promise resolving when the record is deleted
   */
  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Record with id ${id} not found`);
    }

    // Soft delete
    await this.table.update(id, {
      deletedAt: new Date().toISOString(),
    } as unknown as Partial<T>);

    // Invalidate cache
    if (this.cacheEnabled) {
      this.invalidateCache();
      const cacheKey = this.getCacheKey('findById', id);
      cacheService.delete(cacheKey);
    }
  }

  /**
   * Hard delete a record (permanently remove from database)
   * 
   * @param id - The record ID
   * @returns Promise resolving when the record is permanently deleted
   */
  async hardDelete(id: string): Promise<void> {
    await this.table.delete(id);

    // Invalidate cache
    if (this.cacheEnabled) {
      this.invalidateCache();
      const cacheKey = this.getCacheKey('findById', id);
      cacheService.delete(cacheKey);
    }
  }

  /**
   * Bulk insert or update records
   * 
   * @param items - Array of items to insert/update
   * @returns Promise resolving when all items are processed
   */
  async bulkPut(items: T[]): Promise<void> {
    // Ensure all items have tenantId
    const itemsWithTenant = items.map(item => ({
      ...item,
      tenantId: this.tenantId,
    }));

    await this.table.bulkPut(itemsWithTenant);

    // Invalidate cache after bulk operations
    if (this.cacheEnabled) {
      this.invalidateCache();
      // Cache individual items
      itemsWithTenant.forEach(item => {
        const cacheKey = this.getCacheKey('findById', item.id);
        cacheService.set(cacheKey, item, 2 * 60 * 1000);
      });
    }
  }

  /**
   * Count records matching filters
   * 
   * @param filters - Optional filters to apply
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Promise resolving to the count
   */
  async count(filters?: Partial<T>, includeDeleted: boolean = false): Promise<number> {
    let collection = this.table.where('tenantId').equals(this.tenantId);

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          collection = collection.filter((item: any) => item[key] === value);
        }
      });
    }

    if (!includeDeleted) {
      collection = collection.filter((item: any) => !item.deletedAt);
    }

    return collection.count();
  }

  /**
   * Check if a record exists
   * 
   * @param id - The record ID
   * @returns Promise resolving to true if the record exists, false otherwise
   */
  async exists(id: string): Promise<boolean> {
    const item = await this.findById(id);
    return item !== undefined;
  }

  /**
   * Clear all records for this tenant (soft delete)
   * 
   * @returns Promise resolving when all records are cleared
   */
  async clear(): Promise<void> {
    const items = await this.findAll();
    const updates = items.map(item => ({
      ...item,
      deletedAt: new Date().toISOString(),
    }));

    await this.bulkPut(updates as T[]);
  }
}

