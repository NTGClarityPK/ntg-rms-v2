import { OrderItem } from '@/lib/indexeddb/database';
import { db } from '@/lib/indexeddb/database';

/**
 * Repository for OrderItem entities
 * 
 * Note: OrderItem doesn't have tenantId, so it doesn't extend BaseRepository.
 * OrderItems are scoped through their relationship with Orders which have tenantId.
 * 
 * Provides methods for querying and managing order items in IndexedDB.
 */
export class OrderItemsRepository {
  /**
   * Find order items by order ID
   * 
   * @param orderId - The order ID
   * @returns Promise resolving to array of order items
   */
  async findByOrderId(orderId: string): Promise<OrderItem[]> {
    return db.orderItems.where('orderId').equals(orderId).toArray();
  }

  /**
   * Find order items by food item ID
   * 
   * @param foodItemId - The food item ID
   * @returns Promise resolving to array of order items
   */
  async findByFoodItemId(foodItemId: string): Promise<OrderItem[]> {
    return db.orderItems.where('foodItemId').equals(foodItemId).toArray();
  }

  /**
   * Find an order item by ID
   * 
   * @param id - The order item ID
   * @returns Promise resolving to the order item or undefined if not found
   */
  async findById(id: string): Promise<OrderItem | undefined> {
    return db.orderItems.get(id);
  }

  /**
   * Create a new order item
   * 
   * @param data - The order item data
   * @returns Promise resolving to the created order item
   */
  async create(data: Partial<OrderItem> & { id: string }): Promise<OrderItem> {
    const newItem: OrderItem = {
      ...data,
      id: data.id,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    } as OrderItem;

    await db.orderItems.put(newItem);
    return (await db.orderItems.get(data.id)) as OrderItem;
  }

  /**
   * Update an existing order item
   * 
   * @param id - The order item ID
   * @param data - The data to update
   * @returns Promise resolving to the updated order item
   */
  async update(id: string, data: Partial<OrderItem>): Promise<OrderItem> {
    const existing = await db.orderItems.get(id);
    if (!existing) {
      throw new Error(`OrderItem with id ${id} not found`);
    }

    const updatedItem = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    } as OrderItem;

    await db.orderItems.update(id, updatedItem);
    return (await db.orderItems.get(id)) as OrderItem;
  }

  /**
   * Delete an order item
   * 
   * @param id - The order item ID
   * @returns Promise resolving when the order item is deleted
   */
  async delete(id: string): Promise<void> {
    await db.orderItems.delete(id);
  }

  /**
   * Bulk insert or update order items
   * 
   * @param items - Array of order items to insert/update
   * @returns Promise resolving when all items are processed
   */
  async bulkPut(items: OrderItem[]): Promise<void> {
    await db.orderItems.bulkPut(items);
  }

  /**
   * Update sync status after syncing with server
   * 
   * @param id - The order item ID
   * @param syncStatus - The sync status
   */
  async updateSyncStatus(
    id: string,
    syncStatus: 'pending' | 'synced' | 'conflict'
  ): Promise<void> {
    await this.update(id, {
      lastSynced: new Date().toISOString(),
      syncStatus,
    } as Partial<OrderItem>);
  }
}
