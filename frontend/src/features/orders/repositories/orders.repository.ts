import { BaseRepository } from '@/shared/repositories/base.repository';
import { Order } from '@/lib/indexeddb/database';
import { db } from '@/lib/indexeddb/database';

/**
 * Repository for Order entities
 * 
 * Provides methods for querying and managing orders in IndexedDB.
 */
export class OrdersRepository extends BaseRepository<Order> {
  constructor(tenantId: string) {
    super(db.orders, tenantId);
  }

  /**
   * Find orders by status
   * 
   * @param status - The order status
   * @returns Promise resolving to array of orders
   */
  async findByStatus(status: string): Promise<Order[]> {
    return this.findAll({ status });
  }

  /**
   * Find orders by payment status
   * 
   * @param paymentStatus - The payment status
   * @returns Promise resolving to array of orders
   */
  async findByPaymentStatus(paymentStatus: string): Promise<Order[]> {
    return this.findAll({ paymentStatus });
  }

  /**
   * Find orders by branch ID
   * 
   * @param branchId - The branch ID
   * @returns Promise resolving to array of orders
   */
  async findByBranchId(branchId: string): Promise<Order[]> {
    return this.findAll({ branchId });
  }

  /**
   * Find orders by customer ID
   * 
   * @param customerId - The customer ID
   * @returns Promise resolving to array of orders
   */
  async findByCustomerId(customerId: string): Promise<Order[]> {
    return this.findAll({ customerId });
  }

  /**
   * Find orders by order type
   * 
   * @param orderType - The order type (e.g., 'dine-in', 'takeaway', 'delivery')
   * @returns Promise resolving to array of orders
   */
  async findByOrderType(orderType: string): Promise<Order[]> {
    return this.findAll({ orderType });
  }

  /**
   * Find orders by date range
   * 
   * @param startDate - Start date (ISO string)
   * @param endDate - End date (ISO string)
   * @returns Promise resolving to array of orders
   */
  async findByDateRange(startDate: string, endDate: string): Promise<Order[]> {
    const collection = db.orders
      .where('tenantId')
      .equals(this.tenantId)
      .filter((order) => {
        if (order.deletedAt) return false;
        const orderDate = new Date(order.orderDate);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return orderDate >= start && orderDate <= end;
      });
    
    return collection.toArray();
  }

  /**
   * Find order by order number
   * 
   * @param orderNumber - The order number
   * @returns Promise resolving to the order or undefined if not found
   */
  async findByOrderNumber(orderNumber: string): Promise<Order | undefined> {
    const collection = db.orders
      .where('tenantId')
      .equals(this.tenantId)
      .filter((order) => !order.deletedAt && order.orderNumber === orderNumber);
    
    const orders = await collection.toArray();
    return orders[0];
  }

  /**
   * Update sync status after syncing with server
   * 
   * @param id - The order ID
   * @param syncStatus - The sync status
   */
  async updateSyncStatus(
    id: string,
    syncStatus: 'pending' | 'synced' | 'conflict'
  ): Promise<void> {
    await this.update(id, {
      lastSynced: new Date().toISOString(),
      syncStatus,
    } as Partial<Order>);
  }
}



