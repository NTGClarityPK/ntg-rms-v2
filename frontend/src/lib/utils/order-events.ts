/**
 * Event system for order data updates
 * Allows components to listen for order changes and refresh accordingly
 */

export type OrderDataEventType = 
  | 'order-created'
  | 'order-updated'
  | 'order-status-changed';

/**
 * Dispatch an event to notify all order listeners that data has been updated
 */
export function notifyOrderUpdate(eventType: OrderDataEventType, orderId?: string) {
  window.dispatchEvent(new CustomEvent(eventType, { detail: { orderId } }));
}

/**
 * Subscribe to order data update events
 */
export function onOrderUpdate(
  eventType: OrderDataEventType,
  callback: (event: CustomEvent) => void
): () => void {
  window.addEventListener(eventType, callback as EventListener);
  
  // Return unsubscribe function
  return () => {
    window.removeEventListener(eventType, callback as EventListener);
  };
}

