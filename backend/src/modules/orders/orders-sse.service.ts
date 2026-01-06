import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface OrderUpdateEvent {
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_DELETED';
  tenantId: string;
  branchId?: string | null;
  orderId: string;
  order?: any;
}

/**
 * Service for managing Server-Sent Events (SSE) for order updates
 * Allows kitchen displays and other clients to receive real-time order updates
 */
@Injectable()
export class OrdersSseService {
  private orderUpdateSubject = new Subject<OrderUpdateEvent>();
  private orderUpdate$ = this.orderUpdateSubject.asObservable();

  /**
   * Get observable stream of order updates
   */
  getOrderUpdates(): Observable<OrderUpdateEvent> {
    return this.orderUpdate$;
  }

  /**
   * Emit order update event to all connected clients
   */
  emitOrderUpdate(event: OrderUpdateEvent): void {
    console.log(`📡 Emitting order update: ${event.type} for order ${event.orderId} (tenant: ${event.tenantId})`);
    this.orderUpdateSubject.next(event);
  }

  /**
   * Create SSE stream for a specific tenant and optionally branch
   * Filters events to only include updates for the given tenant and branch
   */
  createTenantStream(tenantId: string, branchId?: string | null): Observable<OrderUpdateEvent> {
    return new Observable((observer) => {
      const subscription = this.orderUpdate$.subscribe((event) => {
        // Only send events for this tenant
        if (event.tenantId !== tenantId) {
          return;
        }
        
        // If branchId is specified, filter by branch
        // If branchId is null/undefined, include events for all branches (null branchId matches)
        if (branchId !== undefined) {
          // Normalize null/undefined for comparison
          const eventBranchId = event.branchId ?? null;
          const filterBranchId = branchId ?? null;
          
          // Only send if branch matches (both null or both same value)
          if (eventBranchId !== filterBranchId) {
            return;
          }
        }
        
        observer.next(event);
      });

      // Cleanup on unsubscribe
      return () => {
        subscription.unsubscribe();
      };
    });
  }
}


