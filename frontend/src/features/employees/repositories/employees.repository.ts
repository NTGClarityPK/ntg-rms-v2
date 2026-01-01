import { BaseRepository } from '@/shared/repositories/base.repository';
import { Employee } from '@/lib/indexeddb/database';
import { db } from '@/lib/indexeddb/database';

/**
 * Repository for Employee entities
 * 
 * Provides methods for querying and managing employees in IndexedDB.
 */
export class EmployeesRepository extends BaseRepository<Employee> {
  constructor(tenantId: string) {
    super(db.employees, tenantId);
  }

  /**
   * Find all active employees
   * 
   * @param role - Optional role filter
   * @returns Promise resolving to array of active employees
   */
  async findActive(role?: string): Promise<Employee[]> {
    const filters: Partial<Employee> = { isActive: true };
    if (role) {
      filters.role = role;
    }
    return this.findAll(filters);
  }

  /**
   * Find employees by role
   * 
   * @param role - The employee role
   * @returns Promise resolving to array of employees
   */
  async findByRole(role: string): Promise<Employee[]> {
    return this.findAll({ role });
  }

  /**
   * Find employee by email
   * 
   * @param email - The employee email
   * @returns Promise resolving to the employee or undefined if not found
   */
  async findByEmail(email: string): Promise<Employee | undefined> {
    const collection = db.employees
      .where('tenantId')
      .equals(this.tenantId)
      .filter((emp) => !emp.deletedAt && emp.email === email);
    
    const employees = await collection.toArray();
    return employees[0];
  }

  /**
   * Find employee by employee ID
   * 
   * @param employeeId - The employee ID
   * @returns Promise resolving to the employee or undefined if not found
   */
  async findByEmployeeId(employeeId: string): Promise<Employee | undefined> {
    const collection = db.employees
      .where('tenantId')
      .equals(this.tenantId)
      .filter((emp) => !emp.deletedAt && emp.employeeId === employeeId);
    
    const employees = await collection.toArray();
    return employees[0];
  }

  /**
   * Update sync status after syncing with server
   * 
   * @param id - The employee ID
   * @param syncStatus - The sync status
   */
  async updateSyncStatus(
    id: string,
    syncStatus: 'pending' | 'synced' | 'conflict'
  ): Promise<void> {
    await this.update(id, {
      lastSynced: new Date().toISOString(),
      syncStatus,
    } as Partial<Employee>);
  }
}



