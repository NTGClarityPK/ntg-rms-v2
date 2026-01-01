import { BaseRepository } from '@/shared/repositories/base.repository';
import { Customer } from '@/lib/indexeddb/database';
import { db } from '@/lib/indexeddb/database';

/**
 * Repository for Customer entities
 * 
 * Provides methods for querying and managing customers in IndexedDB.
 */
export class CustomersRepository extends BaseRepository<Customer> {
  constructor(tenantId: string) {
    super(db.customers, tenantId);
  }

  /**
   * Find customer by phone number
   * 
   * @param phone - The customer phone number
   * @returns Promise resolving to the customer or undefined if not found
   */
  async findByPhone(phone: string): Promise<Customer | undefined> {
    const collection = db.customers
      .where('tenantId')
      .equals(this.tenantId)
      .filter((customer) => !customer.deletedAt && customer.phone === phone);
    
    const customers = await collection.toArray();
    return customers[0];
  }

  /**
   * Find customer by email
   * 
   * @param email - The customer email
   * @returns Promise resolving to the customer or undefined if not found
   */
  async findByEmail(email: string): Promise<Customer | undefined> {
    const collection = db.customers
      .where('tenantId')
      .equals(this.tenantId)
      .filter((customer) => !customer.deletedAt && customer.email === email);
    
    const customers = await collection.toArray();
    return customers[0];
  }

  /**
   * Find customers by loyalty tier
   * 
   * @param tier - The loyalty tier
   * @returns Promise resolving to array of customers
   */
  async findByLoyaltyTier(tier: 'regular' | 'silver' | 'gold' | 'platinum'): Promise<Customer[]> {
    return this.findAll({ loyaltyTier: tier });
  }

  /**
   * Find top customers by total spent
   * 
   * @param limit - Number of customers to return (default: 10)
   * @returns Promise resolving to array of top customers
   */
  async findTopCustomers(limit: number = 10): Promise<Customer[]> {
    const collection = db.customers
      .where('tenantId')
      .equals(this.tenantId)
      .filter((customer) => !customer.deletedAt);
    
    const customers = await collection.toArray();
    return customers
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);
  }

  /**
   * Update sync status after syncing with server
   * 
   * @param id - The customer ID
   * @param syncStatus - The sync status
   */
  async updateSyncStatus(
    id: string,
    syncStatus: 'pending' | 'synced' | 'conflict'
  ): Promise<void> {
    await this.update(id, {
      lastSynced: new Date().toISOString(),
      syncStatus,
    } as Partial<Customer>);
  }
}



